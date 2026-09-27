// Test autonomo per l'algoritmo di generazione squadre bilanciate N-team.
// Replica in JS la logica della funzione SQL public.genera_squadre_bilate
// (migration 2026-09-27.sql) per poterla testare senza Supabase.

function generaSquadre(giocatori, nSquadre, maxPerSquadra) {
  const letters = ['A','B','C','D'];
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  const sums = { A: 0, B: 0, C: 0, D: 0 };
  const out = [];
  // ordina per rating discendente
  const ordinati = [...giocatori].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
  for (const g of ordinati) {
    let best = 'A'; let bestCnt = counts.A;
    let bestAvg = counts.A === 0 ? 0 : sums.A / counts.A;
    if (nSquadre >= 2 && (counts.B < bestCnt ||
        (counts.B === bestCnt && (counts.B === 0 ? 0 : sums.B / counts.B) < bestAvg))) {
      best = 'B'; bestCnt = counts.B;
      bestAvg = counts.B === 0 ? 0 : sums.B / counts.B;
    }
    if (nSquadre >= 3 && (counts.C < bestCnt ||
        (counts.C === bestCnt && (counts.C === 0 ? 0 : sums.C / counts.C) < bestAvg))) {
      best = 'C'; bestCnt = counts.C;
      bestAvg = counts.C === 0 ? 0 : sums.C / counts.C;
    }
    if (nSquadre >= 4 && (counts.D < bestCnt ||
        (counts.D === bestCnt && (counts.D === 0 ? 0 : sums.D / counts.D) < bestAvg))) {
      best = 'D'; bestCnt = counts.D;
      bestAvg = counts.D === 0 ? 0 : sums.D / counts.D;
    }
    if (bestCnt >= maxPerSquadra) {
      best = (counts.A <= counts.B && counts.A <= counts.C && counts.A <= counts.D) ? 'A'
           : (counts.B <= counts.C && counts.B <= counts.D) ? 'B'
           : (counts.C <= counts.D) ? 'C' : 'D';
    }
    out.push({ id: g.id, squadra: best, rating: g.rating });
    counts[best] += 1;
    sums[best] += g.rating;
  }
  return { out, counts, sums };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✔ ${name}`);
    pass++;
  } catch (e) {
    console.log(`✘ ${name}: ${e.message}`);
    fail++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function media(arr) { return arr.reduce((a,b)=>a+(b.rating||0),0) / arr.length; }
function range(a) { return Math.max(...a) - Math.min(...a); }

// TC1: 2 squadre di 5
test('TC1: 10 giocatori → 2 squadre da 5, medie vicine', () => {
  const players = Array.from({length:10}, (_,i)=>({id:`p${i}`, rating: 5 + i*0.3}));
  const { counts, sums } = generaSquadre(players, 2, 5);
  assert(counts.A === 5 && counts.B === 5, `A=${counts.A} B=${counts.B}`);
  const avgA = sums.A / counts.A, avgB = sums.B / counts.B;
  assert(Math.abs(avgA - avgB) < 0.5, `diff medie ${(avgA-avgB).toFixed(2)}`);
});

// TC2: 3 squadre di 4
test('TC2: 12 giocatori → 3 squadre da 4, distribuzione equilibrata', () => {
  const players = Array.from({length:12}, (_,i)=>({id:`p${i}`, rating: 6 + (i%3)}));
  const { counts, sums } = generaSquadre(players, 3, 4);
  assert(counts.A === 4 && counts.B === 4 && counts.C === 4, `cnt ${JSON.stringify(counts)}`);
  const medie = [sums.A/counts.A, sums.B/counts.B, sums.C/counts.C];
  assert(range(medie) < 1.0, `range medie ${range(medie).toFixed(2)}`);
});

// TC3: 4 squadre di 6
test('TC3: 24 giocatori → 4 squadre da 6', () => {
  const players = Array.from({length:24}, (_,i)=>({id:`p${i}`, rating: 4 + (i%5)*0.7 + (i/24)*2}));
  const { counts } = generaSquadre(players, 4, 6);
  assert(counts.A === 6 && counts.B === 6 && counts.C === 6 && counts.D === 6, JSON.stringify(counts));
});

// TC4: capacità >5 giocatori per squadra (max=10)
test('TC4: max_per_squadra = 10 con 2 squadre', () => {
  const players = Array.from({length:15}, (_,i)=>({id:`p${i}`, rating: 6}));
  const { counts } = generaSquadre(players, 2, 10);
  assert(counts.A + counts.B === 15, `totale ${counts.A + counts.B}`);
  assert(counts.A === 8 && counts.B === 7 || counts.A === 7 && counts.B === 8,
    `devono essere (7/8) per max 10: ${JSON.stringify(counts)}`);
});

// TC5: idempotenza ordini diversi non cambia i set
test('TC5: ordini permutati danno distribuzione simile', () => {
  const a = Array.from({length:20}, (_,i)=>({id:`p${i}`, rating: 5 + (i%4)}));
  const { counts: c1 } = generaSquadre(a, 4, 5);
  const b = [...a].reverse();
  const { counts: c2 } = generaSquadre(b, 4, 5);
  assert(JSON.stringify(c1) === JSON.stringify(c2), `${JSON.stringify(c1)} vs ${JSON.stringify(c2)}`);
});

// TC6: nessuna squadra vuota
test('TC6: 8 giocatori → 2 squadre piene', () => {
  const players = Array.from({length:8}, (_,i)=>({id:`p${i}`, rating: 7}));
  const { counts } = generaSquadre(players, 2, 5);
  assert(counts.A === 4 && counts.B === 4, '4+4');
});

console.log(`\nRisultato: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
