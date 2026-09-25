// Initialize and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);// Supabase and API endpoints
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';

export const SUPABASE_ANON_KEY = 'sb_publishable_5csTtIuipKucVlYncRGG0Q_VrokRdoD';

// NEW: Your Node.js Backend URL (Render)
export const API_BASE_URL = 'https://gliimu-server.onrender.com';

// Initialize and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
