// ============================================
// ADMIN SHARED - Common functions & utilities
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';

// ============================================
// THEME MANAGEMENT
// ============================================

export function initTheme() {
    const savedTheme = localStorage.getItem('admin_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else if (systemPrefersDark) {
        document.body.classList.add('dark-mode');
    }
}

export function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('admin_theme', 'light');
        showToast('Light mode activated', 'info');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('admin_theme', 'dark');
        showToast('Dark mode activated', 'info');
    }
}

// ============================================
// DATA LOADING FUNCTIONS
// ============================================

export async function loadPayments() {
    try {
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

export async function loadAllUsers() {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

export async function loadStudents() {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('role', 'student')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading students:', error);
        return [];
    }
}

export async function loadInquiries() {
    try {
        const { data, error } = await supabase
            .from('inquiries')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading inquiries:', error);
        return [];
    }
}

export async function loadAllSubmissions() {
    try {
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading submissions:', error);
        return [];
    }
}

export async function loadApplications() {
    try {
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .order('submitted_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading applications:', error);
        return [];
    }
}

export async function loadContracts() {
    try {
        const { data, error } = await supabase
            .from('contracts')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading contracts:', error);
        return [];
    }
}

export async function loadJobs() {
    try {
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading jobs:', error);
        return [];
    }
}

export async function loadRecords() {
    try {
        const { data, error } = await supabase
            .from('records')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading records:', error);
        return [];
    }
}

export async function loadPartnerships() {
    try {
        const { data, error } = await supabase
            .from('partnerships')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading partnerships:', error);
        return [];
    }
}

export async function loadAdminLogs() {
    try {
        const { data, error } = await supabase
            .from('admin_activity_log')
            .select('*, user_profiles(name)')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data.map(log => ({
            ...log,
            admin_name: log.user_profiles?.name || 'Unknown'
        })) || [];
    } catch (error) {
        console.error('Error loading admin logs:', error);
        return [];
    }
}

export async function searchUsers(query) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .or(`name.ilike.%${query}%,email.ilike.%${query}%,username.ilike.%${query}%`)
            .limit(20);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderRecentPayments(payments) {
    if (!payments.length) return '<div class="empty-state">No payments yet</div>';
    return payments.map(p => `
        <div class="payment-item ${p.status}">
            <div class="payment-info">
                <div class="payment-amount">₦${p.amount.toLocaleString()}</div>
                <div class="payment-date">${new Date(p.submitted_at).toLocaleDateString()}</div>
                <div class="payment-ref">${p.user_name || p.user_email}</div>
            </div>
            <div class="payment-status ${p.status}">${p.status}</div>
        </div>
    `).join('');
}
