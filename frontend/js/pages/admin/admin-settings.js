// ============================================
// ADMIN SETTINGS - Shared across all roles
// ============================================

import { showToast } from '../../modules/toast.js';
import { loadAllUsers, loadPayments, escapeHtml } from './admin-shared.js';

let currentUser = null;
let currentRole = null;

export function initSettings(user, role) {
    currentUser = user;
    currentRole = role;
}

export async function renderSettings(container) {
    if (!container) return;
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const currentTheme = isDarkMode ? 'dark' : 'light';
    
    container.innerHTML = `
        <div class="tab-header">
            <h2><i class="fas fa-cog"></i> Settings</h2>
            <p>Manage your dashboard preferences</p>
        </div>
        <div class="settings-grid">
            <div class="settings-card">
                <h3><i class="fas fa-palette"></i> Appearance</h3>
                <div class="form-group">
                    <label>Theme Preference</label>
                    <div class="theme-selector">
                        <button class="theme-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                            <i class="fas fa-sun"></i> Light
                        </button>
                        <button class="theme-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                            <i class="fas fa-moon"></i> Dark
                        </button>
                        <button class="theme-option" data-theme="system">
                            <i class="fas fa-desktop"></i> System
                        </button>
                    </div>
                </div>
            </div>
            <div class="settings-card">
                <h3><i class="fas fa-bell"></i> Notifications</h3>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="emailNotifications" ${localStorage.getItem('admin_email_notifications') !== 'false' ? 'checked' : ''}>
                        Email notifications
                    </label>
                </div>
            </div>
            <div class="settings-card">
                <h3><i class="fas fa-user-shield"></i> Account</h3>
                <div class="form-group">
                    <label>Role</label>
                    <input type="text" value="${currentRole?.toUpperCase() || 'ADMIN'}" disabled>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" value="${currentUser?.email || ''}" disabled>
                </div>
            </div>
            <div class="settings-card">
                <h3><i class="fas fa-database"></i> Data</h3>
                <button id="exportDataBtn" class="btn-outline"><i class="fas fa-download"></i> Export CSV</button>
                <button id="clearCacheBtn" class="btn-outline" style="margin-top:8px;"><i class="fas fa-broom"></i> Clear Cache</button>
            </div>
        </div>
        <div class="settings-actions">
            <button id="saveSettingsBtn" class="btn-primary"><i class="fas fa-save"></i> Save Preferences</button>
        </div>
    `;
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            if (theme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.body.classList.toggle('dark-mode', systemPrefersDark);
                localStorage.setItem('admin_theme', 'system');
            } else if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                localStorage.setItem('admin_theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('admin_theme', 'light');
            }
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`, 'success');
        });
    });
    
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const emailNotifications = document.getElementById('emailNotifications')?.checked;
        localStorage.setItem('admin_email_notifications', emailNotifications);
        showToast('Settings saved!', 'success');
    });
    
    document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
        const [payments, users] = await Promise.all([loadPayments(), loadAllUsers()]);
        let csv = "Type,ID,Name,Amount,Status,Date\n";
        payments.forEach(p => {
            csv += `Payment,${p.id},${p.user_name},${p.amount},${p.status},${new Date(p.submitted_at).toLocaleDateString()}\n`;
        });
        users.forEach(u => {
            csv += `User,${u.id},${u.name},${u.wallet_balance},${u.role},${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported!', 'success');
    });
    
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        localStorage.removeItem('admin_payments_cache');
        localStorage.removeItem('admin_students_cache');
        showToast('Cache cleared!', 'success');
        setTimeout(() => window.location.reload(), 1000);
    });
}
