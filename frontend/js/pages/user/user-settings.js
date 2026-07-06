// ============================================
// USER SETTINGS - Settings Logic
// Path: /frontend/js/pages/user/user-settings.js
// Purpose: Handle user settings (profile, avatar, theme, etc.)
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';
import { getTheme, applyTheme, toggleTheme } from './user-theme.js';

// ============================================
// SETTINGS MANAGER CLASS
// ============================================
export class SettingsManager {
    constructor(userId, user, profile) {
        this.userId = userId;
        this.user = user;
        this.profile = profile;
        this.container = null;
        this.isSaving = false;
    }

    // ============================================
    // RENDER SETTINGS
    // ============================================
    render(container) {
        this.container = container;
        if (!this.container) return;

        var currentTheme = getTheme() || 'light';
        var isDarkMode = document.body.classList.contains('dark-mode');

        this.container.innerHTML = `
            <div class="dashboard-header">
                <h1><i class="fas fa-cog"></i> Settings</h1>
                <p>Manage your account preferences</p>
            </div>

            <div class="settings-container">
                <!-- Profile Settings -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-user-circle"></i>
                        <div>
                            <h3>Profile Information</h3>
                            <p>Update your personal details</p>
                        </div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-avatar">
                            <img id="settingsAvatar" src="${this.profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(this.profile?.name || 'User')}&background=fbb040&color=fff&size=128`}" alt="Avatar">
                            <div class="avatar-actions">
                                <button id="uploadAvatarBtn" class="btn-outline" style="font-size: 0.75rem; padding: 4px 12px;">
                                    <i class="fas fa-camera"></i> Change
                                </button>
                                <input type="file" id="avatarFileInput" accept="image/*" style="display:none;">
                            </div>
                        </div>
                        <div class="settings-form">
                            <div class="form-group">
                                <label>Full Name</label>
                                <input type="text" id="settingsName" value="${this.profile?.name || ''}" placeholder="Enter your full name">
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" id="settingsEmail" value="${this.user?.email || ''}" disabled>
                            </div>
                            <div class="form-group">
                                <label>Username</label>
                                <div class="username-input">
                                    <span>@</span>
                                    <input type="text" id="settingsUsername" value="${this.profile?.username || ''}" placeholder="username">
                                </div>
                                <small class="hint">Your unique identifier for your portfolio URL</small>
                            </div>
                            <div class="form-group">
                                <label>Bio</label>
                                <textarea id="settingsBio" rows="3" placeholder="Tell us about yourself...">${this.profile?.bio || ''}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Appearance Settings -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-palette"></i>
                        <div>
                            <h3>Appearance</h3>
                            <p>Customize your dashboard look</p>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Theme Preference</label>
                        <div class="theme-options">
                            <button class="theme-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                                <i class="fas fa-sun"></i>
                                <span>Light</span>
                            </button>
                            <button class="theme-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                                <i class="fas fa-moon"></i>
                                <span>Dark</span>
                            </button>
                            <button class="theme-card ${currentTheme === 'system' ? 'active' : ''}" data-theme="system">
                                <i class="fas fa-desktop"></i>
                                <span>System</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Notification Settings -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-bell"></i>
                        <div>
                            <h3>Notifications</h3>
                            <p>Manage your notification preferences</p>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="settingsEmailNotifications" ${localStorage.getItem('user_email_notifications') !== 'false' ? 'checked' : ''}>
                            Email notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="settingsPushNotifications" ${localStorage.getItem('user_push_notifications') !== 'false' ? 'checked' : ''}>
                            Push notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="settingsSoundAlerts" ${localStorage.getItem('user_sound_alerts') !== 'false' ? 'checked' : ''}>
                            Sound alerts
                        </label>
                    </div>
                </div>

                <!-- Account Settings -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-user-shield"></i>
                        <div>
                            <h3>Account</h3>
                            <p>Manage your account security</p>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <input type="text" value="${this.profile?.role?.toUpperCase() || 'USER'}" disabled>
                    </div>
                    <div class="form-group">
                        <label>Account Status</label>
                        <input type="text" value="${this.profile?.status || 'Active'}" disabled>
                    </div>
                    <div class="form-group">
                        <label>Member Since</label>
                        <input type="text" value="${this.profile?.created_at ? new Date(this.profile.created_at).toLocaleDateString() : 'N/A'}" disabled>
                    </div>
                    <div class="account-actions">
                        <button id="changePasswordBtn" class="btn-outline">
                            <i class="fas fa-key"></i> Change Password
                        </button>
                        <button id="logoutBtn" class="btn-outline danger">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </div>

                <!-- Data Management -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-database"></i>
                        <div>
                            <h3>Data Management</h3>
                            <p>Export or clear your data</p>
                        </div>
                    </div>
                    <div class="account-actions">
                        <button id="exportDataBtn" class="btn-outline">
                            <i class="fas fa-download"></i> Export Data (CSV)
                        </button>
                        <button id="clearCacheBtn" class="btn-outline danger">
                            <i class="fas fa-broom"></i> Clear Cache
                        </button>
                    </div>
                </div>

                <div class="settings-actions">
                    <button id="saveSettingsBtn" class="btn-primary">
                        <i class="fas fa-save"></i> Save All Changes
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    // ============================================
    // BIND EVENTS
    // ============================================
    bindEvents() {
        // Theme options
        document.querySelectorAll('.theme-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var theme = this.dataset.theme;
                document.querySelectorAll('.theme-card').forEach(function(c) {
                    c.classList.remove('active');
                });
                this.classList.add('active');
                applyTheme(theme);
                showToast('Theme updated to ' + theme.charAt(0).toUpperCase() + theme.slice(1), 'success');
            });
        });

        // Upload avatar
        document.getElementById('uploadAvatarBtn')?.addEventListener('click', function() {
            document.getElementById('avatarFileInput').click();
        });

        document.getElementById('avatarFileInput')?.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) {
                this.uploadAvatar(file);
            }
        }.bind(this));

        // Save settings
        document.getElementById('saveSettingsBtn')?.addEventListener('click', function() {
            this.saveSettings();
        }.bind(this));

        // Change password
        document.getElementById('changePasswordBtn')?.addEventListener('click', function() {
            this.showChangePasswordModal();
        }.bind(this));

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', function() {
            this.handleLogout();
        }.bind(this));

        // Export data
        document.getElementById('exportDataBtn')?.addEventListener('click', function() {
            this.exportData();
        }.bind(this));

        // Clear cache
        document.getElementById('clearCacheBtn')?.addEventListener('click', function() {
            this.clearCache();
        }.bind(this));

        // Enter key support for settings form
        document.querySelectorAll('#settingsName, #settingsUsername, #settingsBio').forEach(function(input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    document.getElementById('saveSettingsBtn')?.click();
                }
            });
        });
    }

    // ============================================
    // UPLOAD AVATAR
    // ============================================
    async uploadAvatar(file) {
        if (!file) return;

        var validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Please select a valid image file', 'error');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast('Image must be less than 2MB', 'error');
            return;
        }

        try {
            showToast('Uploading avatar...', 'info');

            var fileExt = file.name.split('.').pop();
            var fileName = 'avatar_' + this.userId + '_' + Date.now() + '.' + fileExt;
            var path = 'avatars/' + fileName;

            var { data, error } = await supabase.storage
                .from('user_content')
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) throw error;

            var { data: urlData } = supabase.storage
                .from('user_content')
                .getPublicUrl(path);

            var avatarUrl = urlData.publicUrl;

            var { error: updateError } = await supabase
                .from('user_profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', this.userId);

            if (updateError) throw updateError;

            // Update UI
            var avatarImg = document.getElementById('settingsAvatar');
            if (avatarImg) {
                avatarImg.src = avatarUrl;
            }
            
            // Update sidebar avatar
            var sidebarAvatar = document.getElementById('userAvatarImg');
            if (sidebarAvatar) {
                sidebarAvatar.src = avatarUrl;
            }

            // Update profile object
            this.profile.avatar_url = avatarUrl;

            showToast('✅ Avatar updated successfully!', 'success');

        } catch (error) {
            console.error('Avatar upload error:', error);
            showToast('Failed to upload avatar: ' + error.message, 'error');
        }
    }

    // ============================================
    // SAVE SETTINGS
    // ============================================
    async saveSettings() {
        if (this.isSaving) return;
        this.isSaving = true;

        var btn = document.getElementById('saveSettingsBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        try {
            var name = document.getElementById('settingsName').value.trim();
            var username = document.getElementById('settingsUsername').value.trim();
            var bio = document.getElementById('settingsBio').value.trim();
            var emailNotifications = document.getElementById('settingsEmailNotifications').checked;
            var pushNotifications = document.getElementById('settingsPushNotifications').checked;
            var soundAlerts = document.getElementById('settingsSoundAlerts').checked;

            if (!name) {
                showToast('Name is required', 'error');
                return;
            }

            if (!username) {
                showToast('Username is required', 'error');
                return;
            }

            // Check if username is taken (if changed)
            if (username !== this.profile.username) {
                var { data: existing, error: checkError } = await supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('username', username)
                    .neq('id', this.userId)
                    .maybeSingle();

                if (existing) {
                    showToast('Username is already taken', 'error');
                    return;
                }
            }

            var { error } = await supabase
                .from('user_profiles')
                .update({
                    name: name,
                    username: username,
                    bio: bio,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.userId);

            if (error) throw error;

            // Save preferences
            localStorage.setItem('user_email_notifications', emailNotifications);
            localStorage.setItem('user_push_notifications', pushNotifications);
            localStorage.setItem('user_sound_alerts', soundAlerts);

            // Update profile object
            this.profile.name = name;
            this.profile.username = username;
            this.profile.bio = bio;

            // Update UI
            var userNameEl = document.getElementById('userName');
            if (userNameEl) {
                userNameEl.textContent = name;
            }

            showToast('✅ Settings saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Failed to save settings: ' + error.message, 'error');
        } finally {
            this.isSaving = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes';
            }
        }
    }

    // ============================================
    // SHOW CHANGE PASSWORD MODAL
    // ============================================
    showChangePasswordModal() {
        var modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h2><i class="fas fa-key"></i> Change Password</h2>
                    <button class="modal-close" id="closePasswordModal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="changePasswordForm">
                        <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" id="currentPassword" required placeholder="Enter current password">
                        </div>
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="newPassword" required placeholder="Enter new password" minlength="6">
                        </div>
                        <div class="form-group">
                            <label>Confirm New Password</label>
                            <input type="password" id="confirmPassword" required placeholder="Confirm new password">
                        </div>
                        <button type="submit" class="btn-primary" style="width: 100%;">
                            <i class="fas fa-save"></i> Update Password
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        document.getElementById('closePasswordModal').addEventListener('click', function() {
            modal.remove();
            document.body.style.overflow = '';
        });

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
                document.body.style.overflow = '';
            }
        });

        document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            var currentPassword = document.getElementById('currentPassword').value;
            var newPassword = document.getElementById('newPassword').value;
            var confirmPassword = document.getElementById('confirmPassword').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                showToast('Please fill in all fields', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }

            var btn = this.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

            try {
                var { error } = await supabase.auth.updateUser({
                    password: newPassword
                });

                if (error) throw error;

                showToast('✅ Password updated successfully!', 'success');
                modal.remove();
                document.body.style.overflow = '';

            } catch (error) {
                console.error('Password update error:', error);
                showToast('Failed to update password: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Update Password';
            }
        });
    }

    // ============================================
    // HANDLE LOGOUT
    // ============================================
    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            import('../../modules/auth.js').then(function(module) {
                module.signOutUser().then(function(success) {
                    if (success) {
                        window.location.href = '/signin.html';
                    } else {
                        showToast('Failed to logout', 'error');
                    }
                });
            });
        }
    }

    // ============================================
    // EXPORT DATA
    // ============================================
    async exportData() {
        try {
            var { data: profile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', this.userId)
                .single();

            var { data: transactions } = await supabase
                .from('transactions')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false });

            var { data: applications } = await supabase
                .from('applications')
                .select('*')
                .eq('user_id', this.userId)
                .order('submitted_at', { ascending: false });

            var csv = "Data Export - " + new Date().toISOString() + "\n\n";
            csv += "=== PROFILE ===\n";
            csv += "Name,Email,Username,Role,Wallet Balance,GP Points,Joined\n";
            csv += `"${profile?.name || ''}","${profile?.email || ''}","${profile?.username || ''}","${profile?.role || ''}","${profile?.wallet_balance || 0}","${profile?.gp_points || 0}","${profile?.created_at || ''}"\n\n`;

            csv += "=== TRANSACTIONS ===\n";
            csv += "Date,Type,Amount,Description,Status\n";
            transactions?.forEach(function(t) {
                csv += `"${t.created_at || ''}","${t.type || ''}","${t.amount || 0}","${t.description || ''}","${t.status || ''}"\n`;
            });

            csv += "\n=== APPLICATIONS ===\n";
            csv += "Date,Role,Status\n";
            applications?.forEach(function(a) {
                csv += `"${a.submitted_at || ''}","${a.role || ''}","${a.status || ''}"\n`;
            });

            var blob = new Blob([csv], { type: 'text/csv' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'user_data_export_' + new Date().toISOString().split('T')[0] + '.csv';
            a.click();
            URL.revokeObjectURL(url);

            showToast('📥 Data exported successfully!', 'success');

        } catch (error) {
            console.error('Export error:', error);
            showToast('Failed to export data', 'error');
        }
    }

    // ============================================
    // CLEAR CACHE
    // ============================================
    clearCache() {
        if (confirm('Clear all cached data? This will not delete your account data.')) {
            localStorage.removeItem('glimu_user');
            localStorage.removeItem('user_email_notifications');
            localStorage.removeItem('user_push_notifications');
            localStorage.removeItem('user_sound_alerts');
            showToast('🧹 Cache cleared! Refreshing...', 'success');
            setTimeout(function() {
                window.location.reload();
            }, 1000);
        }
    }
}

// ============================================
// INIT SETTINGS (for router)
// ============================================
export function initSettings(userId, user, profile) {
    var manager = new SettingsManager(userId, user, profile);
    return manager;
}

export default SettingsManager;
