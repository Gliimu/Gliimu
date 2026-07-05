// ============================================
// USER SETTINGS MODULE
// Path: /frontend/js/pages/user-settings.js
// Purpose: Handles all user settings functionality
// Shared across all roles (General, Student, Instructor)
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';
import { updateUserProfile, getUserProfile } from '../modules/supabase.js';
import { signOutUser } from '../modules/auth.js';

// ============================================
// SETTINGS MANAGER CLASS
// ============================================

class SettingsManager {
    constructor() {
        this.userId = null;
        this.currentProfile = null;
        this.currentUser = null;
        this.usernameValid = true;
        this.avatarFile = null;
    }

    // ============================================
    // INITIALIZE SETTINGS
    // ============================================
    initialize(userId, user, profile) {
        this.userId = userId;
        this.currentUser = user;
        this.currentProfile = profile;
        return this;
    }

    // ============================================
    // RENDER SETTINGS UI
    // ============================================
    render(container) {
        if (!container) return;

        const profile = this.currentProfile;
        const user = this.currentUser;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const currentTheme = isDarkMode ? 'dark' : 'light';

        container.innerHTML = `
            <div class="settings-container">
                <div class="settings-header">
                    <h1>Settings</h1>
                    <p>Manage your account preferences</p>
                </div>

                <!-- Profile Section -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-user-circle"></i>
                        <div>
                            <h3>Profile</h3>
                            <p>Update your personal information</p>
                        </div>
                    </div>
                    
                    <div class="settings-row">
                        <div class="settings-avatar">
                            <img id="profileAvatarPreview" src="${profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'User')}&background=fbb040&color=fff&size=200`}" alt="Profile">
                            <div class="avatar-actions">
                                <input type="file" id="avatarUpload" accept="image/*" style="display: none;">
                                <button id="uploadAvatarBtn" class="btn-secondary" title="Upload new photo">
                                    <i class="fas fa-camera"></i>
                                </button>
                                <button id="removeAvatarBtn" class="btn-secondary danger" title="Remove photo">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="settings-form">
                            <div class="form-group">
                                <label>Full Name</label>
                                <input type="text" id="fullName" value="${profile?.name || ''}" placeholder="Your full name">
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" value="${user?.email || ''}" disabled>
                                <small>Email cannot be changed</small>
                            </div>
                            <div class="form-group">
                                <label>Username</label>
                                <div class="username-input">
                                    <span>${window.location.origin}/u/</span>
                                    <input type="text" id="username" value="${profile?.username || ''}" placeholder="username">
                                </div>
                                <small id="usernameFeedback" class="feedback">Choose a unique username for your portfolio</small>
                            </div>
                            <div class="form-group">
                                <label>Bio</label>
                                <textarea id="bio" rows="2" placeholder="Tell us about yourself...">${profile?.bio || ''}</textarea>
                                <small>This appears under your profile picture</small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-actions">
                        <button id="saveProfileBtn" class="btn-primary"><i class="fas fa-save"></i> Save Changes</button>
                    </div>
                </div>

                <!-- Appearance Section -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-palette"></i>
                        <div>
                            <h3>Appearance</h3>
                            <p>Choose your preferred theme</p>
                        </div>
                    </div>
                    
                    <div class="theme-options">
                        <button class="theme-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                            <i class="fas fa-sun"></i>
                            <span>Light</span>
                        </button>
                        <button class="theme-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                            <i class="fas fa-moon"></i>
                            <span>Dark</span>
                        </button>
                        <button class="theme-card" data-theme="system">
                            <i class="fas fa-desktop"></i>
                            <span>System</span>
                        </button>
                    </div>
                </div>

                <!-- Account Section -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <i class="fas fa-shield-alt"></i>
                        <div>
                            <h3>Account</h3>
                            <p>Manage your account security</p>
                        </div>
                    </div>
                    
                    <div class="account-actions">
                        <button id="signOutBtn" class="btn-danger"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
                    </div>
                </div>
            </div>
        `;

        // Bind events
        this.bindEvents();
    }

    // ============================================
    // BIND EVENTS
    // ============================================
    bindEvents() {
        // Avatar upload
        document.getElementById('uploadAvatarBtn')?.addEventListener('click', () => {
            document.getElementById('avatarUpload')?.click();
        });

        document.getElementById('avatarUpload')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.uploadAvatar(file);
            }
        });

        document.getElementById('removeAvatarBtn')?.addEventListener('click', async () => {
            if (confirm('Remove your profile picture?')) {
                await this.removeAvatar();
            }
        });

        // Username validation (real-time)
        document.getElementById('username')?.addEventListener('input', (e) => {
            this.validateUsername(e.target.value);
        });

        // Theme selector
        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.getAttribute('data-theme');
                this.applyTheme(theme);
            });
        });

        // Save profile
        document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
            await this.updateProfile();
        });

        // Sign out
        document.getElementById('signOutBtn')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to sign out?')) {
                await signOutUser();
                window.location.href = '/signin.html';
            }
        });
    }

    // ============================================
    // UPDATE PROFILE
    // ============================================
    async updateProfile() {
        try {
            const fullName = document.getElementById('fullName')?.value.trim();
            const bio = document.getElementById('bio')?.value.trim();
            
            if (!this.usernameValid) {
                showToast('Please choose a valid username', 'error');
                return;
            }
            
            const username = document.getElementById('username')?.value.trim();
            
            if (!fullName) {
                showToast('Full name is required', 'error');
                return;
            }

            const updateData = {
                name: fullName,
                bio: bio || '',
                updated_at: new Date().toISOString()
            };
            
            if (username && username !== this.currentProfile?.username) {
                updateData.username = username;
            }

            const result = await updateUserProfile(updateData);

            if (!result) {
                throw new Error('Failed to update profile');
            }

            // Update auth metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { 
                    name: fullName,
                    full_name: fullName
                }
            });

            if (authError) throw authError;

            // Update local profile
            this.currentProfile = { ...this.currentProfile, ...updateData };
            if (username) this.currentProfile.username = username;

            showToast('Profile updated successfully!', 'success');
            
            // Return updated profile for parent to refresh
            return this.currentProfile;
            
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('Failed to update profile: ' + error.message, 'error');
            throw error;
        }
    }

    // ============================================
    // VALIDATE USERNAME
    // ============================================
    async validateUsername(username) {
        const feedback = document.getElementById('usernameFeedback');
        if (!feedback || !username) {
            this.usernameValid = username ? false : true;
            return;
        }

        // Check if username is taken (excluding current user)
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('username', username)
                .neq('id', this.userId)
                .single();

            const usernameInput = document.getElementById('username');
            
            if (error && error.code !== 'PGRST116') {
                // Error other than "not found"
                console.error('Username validation error:', error);
                return;
            }

            if (data) {
                // Username taken - suggest alternatives
                feedback.className = 'feedback error';
                feedback.textContent = `❌ Username "${username}" is taken. Try: ${username}${Math.floor(Math.random() * 100)}`;
                usernameInput.style.borderColor = '#ef4444';
                this.usernameValid = false;
            } else if (username.length < 3) {
                feedback.className = 'feedback error';
                feedback.textContent = '❌ Username must be at least 3 characters';
                usernameInput.style.borderColor = '#ef4444';
                this.usernameValid = false;
            } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                feedback.className = 'feedback error';
                feedback.textContent = '❌ Only letters, numbers, underscores, and hyphens allowed';
                usernameInput.style.borderColor = '#ef4444';
                this.usernameValid = false;
            } else {
                feedback.className = 'feedback success';
                feedback.textContent = `✅ "${username}" is available! Your portfolio: ${window.location.origin}/u/${username}`;
                usernameInput.style.borderColor = '#10b981';
                this.usernameValid = true;
            }
        } catch (error) {
            console.error('Username validation error:', error);
            this.usernameValid = false;
        }
    }

    // ============================================
    // UPLOAD AVATAR
    // ============================================
    async uploadAvatar(file) {
        try {
            if (!file.type.startsWith('image/')) {
                showToast('Please select an image file', 'error');
                return;
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `${this.userId}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                // If bucket doesn't exist, try to create it or use fallback
                console.error('Upload error:', uploadError);
                showToast('Failed to upload avatar. Please try again.', 'error');
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const avatarUrl = urlData.publicUrl;

            // Update profile
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', this.userId);

            if (updateError) throw updateError;

            // Update UI
            document.getElementById('profileAvatarPreview').src = avatarUrl;
            // Also update sidebar avatar if exists
            const sidebarAvatar = document.getElementById('userAvatarImg');
            if (sidebarAvatar) sidebarAvatar.src = avatarUrl;
            
            showToast('Profile picture updated!', 'success');
            
            // Return new avatar URL
            return avatarUrl;

        } catch (error) {
            console.error('Avatar upload error:', error);
            showToast('Failed to upload avatar', 'error');
            throw error;
        }
    }

    // ============================================
    // REMOVE AVATAR
    // ============================================
    async removeAvatar() {
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({ avatar_url: null })
                .eq('id', this.userId);

            if (error) throw error;

            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentProfile?.name || 'User')}&background=fbb040&color=fff&size=200`;
            document.getElementById('profileAvatarPreview').src = defaultAvatar;
            
            const sidebarAvatar = document.getElementById('userAvatarImg');
            if (sidebarAvatar) sidebarAvatar.src = defaultAvatar;
            
            showToast('Profile picture removed', 'success');
            return null;

        } catch (error) {
            console.error('Avatar removal error:', error);
            showToast('Failed to remove avatar', 'error');
            throw error;
        }
    }

    // ============================================
    // APPLY THEME
    // ============================================
    applyTheme(theme) {
        // Use the global theme manager if available
        try {
            const { applyTheme } = await import('./user-theme.js');
            applyTheme(theme);
        } catch (e) {
            // Fallback: manual theme toggle
            if (theme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemPrefersDark) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
                localStorage.setItem('theme', 'system');
            } else if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('theme', 'light');
            }
        }

        // Update active state
        document.querySelectorAll('.theme-card').forEach(b => b.classList.remove('active'));
        document.querySelector(`.theme-card[data-theme="${theme}"]`)?.classList.add('active');
        
        showToast(`${theme.charAt(0).toUpperCase() + theme.slice(1)} mode activated`, 'success');
    }

    // ============================================
    // GET CURRENT SETTINGS
    // ============================================
    getSettings() {
        return {
            profile: this.currentProfile,
            usernameValid: this.usernameValid
        };
    }

    // ============================================
    // REFRESH PROFILE DATA
    // ============================================
    async refreshProfile() {
        const profile = await getUserProfile(this.userId);
        if (profile) {
            this.currentProfile = profile;
        }
        return this.currentProfile;
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================

const settingsManager = new SettingsManager();

// ============================================
// EXPORT FUNCTIONS
// ============================================

export function initSettings(userId, user, profile) {
    settingsManager.initialize(userId, user, profile);
    return settingsManager;
}

export function renderSettings(container) {
    settingsManager.render(container);
}

export async function updateProfile() {
    return await settingsManager.updateProfile();
}

export async function uploadAvatar(file) {
    return await settingsManager.uploadAvatar(file);
}

export async function removeAvatar() {
    return await settingsManager.removeAvatar();
}

export function applyTheme(theme) {
    settingsManager.applyTheme(theme);
}

export function validateUsername(username) {
    return settingsManager.validateUsername(username);
}

export { settingsManager };

export default {
    initSettings,
    renderSettings,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    applyTheme,
    validateUsername,
    settingsManager
};
