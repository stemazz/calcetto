// Client Supabase condiviso (la libreria è caricata da CDN in index.html)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
