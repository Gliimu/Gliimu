// ============================================
// SUPABASE CLIENT CONFIGURATION
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

const SUPABASE_URL = 'https://vsgvscemqtqgolrindcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ3ZzY2VtcXRxZ29scmluZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTk1NDksImV4cCI6MjA5NjM3NTU0OX0.IUNvIleBOKGTIjTg-vx-v0wNLZEk9IVWGouvVIDlo40';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client initialized');

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

export * from './auth.js';
