import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Same Supabase project as the member app, deliberately a different origin:
// nothing in this bundle is ever downloaded by a regular Gliimait.
export const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_5csTtIuipKucVlYncRGG0Q_VrokRdoD';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
