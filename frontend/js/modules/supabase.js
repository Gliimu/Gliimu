// Supabase Client Configuration
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// Replace with your actual Supabase credentials
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper functions
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
    return data;
}

export async function updateUserProfile(updates) {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('users')
        .update({ ...updates, updated_at: new Date() })
        .eq('id', user.id)
        .select()
        .single();
    
    if (error) {
        console.error('Error updating user profile:', error);
        return null;
    }
    return data;
}

// Real-time subscription for payments
export function subscribeToPayments(userId, callback) {
    return supabase
        .channel('payments_changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments', filter: `user_id=eq.${userId}` },
            callback
        )
        .subscribe();
}

// Real-time subscription for admin payments
export function subscribeToAllPayments(callback) {
    return supabase
        .channel('all_payments_changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'payments' },
            callback
        )
        .subscribe();
}
