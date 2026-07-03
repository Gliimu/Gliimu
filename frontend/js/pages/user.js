// ============================================
// PAGE: USER PROFILE
// Path: /frontend/js/pages/user.js
// Purpose: Handles user profile page and dashboard
// ============================================

import { auth } from '../modules/auth.js';
import { supabase, getUserProfile, updateUserProfile } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

export class UserPage {
    constructor() {
        this.userInfoDiv = document.getElementById('userInfo');
        this.profileForm = document.getElementById('profileForm');
        this.loadingDiv = document.getElementById('loading');
        this.walletDisplay = document.getElementById('walletBalance');
        this.gpDisplay = document.getElementById('gpPoints');
        
        this.init();
    }

    async init() {
        await this.loadUserData();
        this.setupEventListeners();
        this.setupWalletSubscription();
    }

    async loadUserData() {
        try {
            this.showLoading(true);
            
            // Get current user from auth
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            
            if (userError || !user) {
                this.showError('User not authenticated');
                window.location.href = '/signin.html';
                return;
            }

            // Get user profile from CLEAN table
            const profile = await getUserProfile(user.id);
            
            if (!profile) {
                this.showError('User profile not found');
                return;
            }

            // Display user info
            this.displayUserInfo(user, profile);
            
            // Populate form with profile data
            this.populateProfileForm(profile);
            
            // Update wallet and GP display
            this.updateWalletDisplay(profile.wallet_balance);
            this.updateGpDisplay(profile.gp_points);
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Failed to load user data');
            this.showLoading(false);
        }
    }

    displayUserInfo(user, profile) {
        if (!this.userInfoDiv) return;
        
        const avatarUrl = profile.avatar_url || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'User')}&background=fbb040&color=fff&size=128`;
        
        this.userInfoDiv.innerHTML = `
            <div class="bg-white shadow rounded-lg p-6">
                <div class="flex items-center space-x-4">
                    <img src="${avatarUrl}" alt="${profile.name}" class="w-16 h-16 rounded-full object-cover">
                    <div>
                        <h2 class="text-2xl font-bold">${profile.name || 'User'}</h2>
                        <p class="text-gray-600">${user.email}</p>
                        <p class="text-sm text-gray-500">Role: ${profile.role || 'user'}</p>
                        <p class="text-sm text-gray-500">Username: ${profile.username || 'N/A'}</p>
                        <p class="text-xs text-gray-400">Member since: ${new Date(user.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-4">
                    <div class="bg-green-50 p-3 rounded-lg">
                        <p class="text-sm text-gray-600">Wallet Balance</p>
                        <p class="text-xl font-bold text-green-600" id="walletDisplay">₦${(profile.wallet_balance || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-purple-50 p-3 rounded-lg">
                        <p class="text-sm text-gray-600">GP Points</p>
                        <p class="text-xl font-bold text-purple-600" id="gpDisplay">${(profile.gp_points || 0).toLocaleString()}</p>
                    </div>
                </div>
                ${profile.application_status === 'pending' ? `
                    <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p class="text-yellow-700 text-sm">⏳ Application pending review for role: ${profile.applied_role || 'N/A'}</p>
                    </div>
                ` : ''}
                ${profile.application_status === 'approved' ? `
                    <div class="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p class="text-green-700 text-sm">✅ Application approved! You are now a ${profile.role}</p>
                    </div>
                ` : ''}
                ${profile.application_status === 'rejected' ? `
                    <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p class="text-red-700 text-sm">❌ Application rejected</p>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Update references
        this.walletDisplay = document.getElementById('walletDisplay');
        this.gpDisplay = document.getElementById('gpDisplay');
    }

    populateProfileForm(profile) {
        if (!this.profileForm) return;
        
        document.getElementById('fullName').value = profile?.name || '';
        document.getElementById('email').value = profile?.email || '';
        document.getElementById('username').value = profile?.username || '';
        document.getElementById('role').value = profile?.role || 'user';
        document.getElementById('address').value = profile?.address || '';
        document.getElementById('birthDay').value = profile?.birth_day || '';
        document.getElementById('birthMonth').value = profile?.birth_month || '';
    }

    setupEventListeners() {
        // Profile form submission
        this.profileForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateProfile();
        });

        // Apply for role buttons
        document.querySelectorAll('.apply-role-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const role = e.target.dataset.role;
                await this.applyForRole(role);
            });
        });
    }

    setupWalletSubscription() {
        const user = supabase.auth.getUser();
        if (!user) return;
        
        supabase
            .channel('wallet_updates')
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'user_profiles',
                    filter: `id=eq.${user.id}` 
                },
                (payload) => {
                    if (payload.new) {
                        this.updateWalletDisplay(payload.new.wallet_balance);
                        this.updateGpDisplay(payload.new.gp_points);
                    }
                }
            )
            .subscribe();
    }

    updateWalletDisplay(balance) {
        if (this.walletDisplay) {
            this.walletDisplay.textContent = `₦${(balance || 0).toLocaleString()}`;
        }
    }

    updateGpDisplay(points) {
        if (this.gpDisplay) {
            this.gpDisplay.textContent = (points || 0).toLocaleString();
        }
    }

    async updateProfile() {
        try {
            const fullName = document.getElementById('fullName').value.trim();
            const address = document.getElementById('address').value.trim();
            const birthDay = document.getElementById('birthDay').value;
            const birthMonth = document.getElementById('birthMonth').value;
            
            const user = await supabase.auth.getUser();
            if (!user) {
                this.showError('Not authenticated');
                return;
            }

            // Update user_profiles table
            const result = await updateUserProfile({
                name: fullName,
                address: address,
                birth_day: birthDay || null,
                birth_month: birthMonth || null,
                updated_at: new Date().toISOString()
            });

            if (!result) {
                throw new Error('Failed to update profile');
            }

            // Also update auth user metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { 
                    name: fullName,
                    full_name: fullName
                }
            });

            if (authError) throw authError;

            showToast('Profile updated successfully!', 'success');
            await this.loadUserData(); // Refresh display
        } catch (error) {
            console.error('Error updating profile:', error);
            this.showError('Failed to update profile: ' + error.message);
        }
    }

    async applyForRole(role) {
        try {
            const result = await submitRoleApplication(role);
            
            if (result.success) {
                showToast(`Application for ${role} submitted successfully!`, 'success');
                await this.loadUserData();
            } else {
                showToast(result.error || 'Failed to submit application', 'error');
            }
        } catch (error) {
            console.error('Error applying for role:', error);
            showToast('Failed to submit application', 'error');
        }
    }

    showLoading(show) {
        if (this.loadingDiv) {
            this.loadingDiv.classList.toggle('hidden', !show);
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
            setTimeout(() => errorDiv.classList.add('hidden'), 5000);
        }
        showToast(message, 'error');
    }

    showSuccess(message) {
        const successDiv = document.getElementById('successMessage');
        if (successDiv) {
            successDiv.textContent = message;
            successDiv.classList.remove('hidden');
            setTimeout(() => successDiv.classList.add('hidden'), 5000);
        }
        showToast(message, 'success');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new UserPage();
});
