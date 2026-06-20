// ============================================
// USER COURSE MODULE - Dashboard Integration
// This extends the course.js functionality for dashboard embedding
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// STATE
// ============================================
let isEmbedded = false;
let currentUser = null;

// ============================================
// CHECK IF EMBEDDED IN DASHBOARD
// ============================================
export function checkIfEmbedded() {
    isEmbedded = window.parent !== window;
    return isEmbedded;
}

// ============================================
// NOTIFY PARENT DASHBOARD
// ============================================
export function notifyParent(event, data) {
    if (isEmbedded) {
        try {
            window.parent.postMessage({ type: event, ...data }, '*');
        } catch (e) {
            console.warn('Could not send message to parent:', e);
        }
    }
}

// ============================================
// GET USER STATS FOR DASHBOARD
// ============================================
export async function getUserStatsForDashboard(userId) {
    try {
        const { data, error } = await supabase
            .from('user_stats')
            .select('*')
            .eq('user_id', userId)
            .single();
        
        if (error) {
            console.warn('Error fetching user stats:', error);
            return {
                total_gp: 0,
                current_streak: 0,
                modules_completed: 0,
                phases_completed: 0
            };
        }
        
        return data || {
            total_gp: 0,
            current_streak: 0,
            modules_completed: 0,
            phases_completed: 0
        };
    } catch (e) {
        console.error('Error in getUserStatsForDashboard:', e);
        return {
            total_gp: 0,
            current_streak: 0,
            modules_completed: 0,
            phases_completed: 0
        };
    }
}

// ============================================
// UPDATE USER STATS
// ============================================
export async function updateUserStats(userId, updates) {
    try {
        const { error } = await supabase
            .from('user_stats')
            .upsert({
                user_id: userId,
                ...updates,
                updated_at: new Date().toISOString()
            });
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('Error updating user stats:', e);
        return false;
    }
}

// ============================================
// GET MODULE PROGRESS
// ============================================
export async function getModuleProgress(userId) {
    try {
        const { data, error } = await supabase
            .from('module_progress')
            .select('*')
            .eq('user_id', userId);
        
        if (error) {
            console.warn('Error fetching module progress:', error);
            return [];
        }
        
        return data || [];
    } catch (e) {
        console.error('Error in getModuleProgress:', e);
        return [];
    }
}

// ============================================
// MARK MODULE COMPLETE (with GP)
// ============================================
export async function markModuleComplete(userId, moduleId, moduleName, gpEarned) {
    try {
        // Check if already completed
        const { data: existing } = await supabase
            .from('module_progress')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', moduleId)
            .single();
        
        if (existing) {
            return { success: false, message: 'Already completed' };
        }
        
        // Insert progress
        const { error } = await supabase
            .from('module_progress')
            .insert({
                user_id: userId,
                module_id: moduleId,
                module_name: moduleName,
                completed: true,
                completed_at: new Date().toISOString(),
                xp_earned: gpEarned
            });
        
        if (error) throw error;
        
        // Update user stats
        const { data: stats } = await supabase
            .from('user_stats')
            .select('total_gp, modules_completed')
            .eq('user_id', userId)
            .single();
        
        const newTotalGP = (stats?.total_gp || 0) + gpEarned;
        const newModulesCompleted = (stats?.modules_completed || 0) + 1;
        
        await supabase
            .from('user_stats')
            .upsert({
                user_id: userId,
                total_gp: newTotalGP,
                modules_completed: newModulesCompleted,
                last_active: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        
        // Notify parent if embedded
        notifyParent('moduleCompleted', {
            moduleId,
            moduleName,
            gpEarned,
            newTotalGP
        });
        
        return { 
            success: true, 
            newTotalGP,
            gpEarned
        };
        
    } catch (e) {
        console.error('Error in markModuleComplete:', e);
        return { success: false, error: e.message };
    }
}

// ============================================
// GET ACHIEVEMENTS
// ============================================
export async function getUserAchievements(userId) {
    try {
        const { data, error } = await supabase
            .from('user_achievements')
            .select('*')
            .eq('user_id', userId);
        
        if (error) {
            console.warn('Error fetching achievements:', error);
            return [];
        }
        
        return data || [];
    } catch (e) {
        console.error('Error in getUserAchievements:', e);
        return [];
    }
}

// ============================================
// UNLOCK ACHIEVEMENT
// ============================================
export async function unlockAchievement(userId, achievementId) {
    try {
        // Check if already unlocked
        const { data: existing } = await supabase
            .from('user_achievements')
            .select('id')
            .eq('user_id', userId)
            .eq('achievement_id', achievementId)
            .single();
        
        if (existing) return { success: false, message: 'Already unlocked' };
        
        const { error } = await supabase
            .from('user_achievements')
            .insert({
                user_id: userId,
                achievement_id: achievementId,
                unlocked_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        return { success: true };
        
    } catch (e) {
        console.error('Error in unlockAchievement:', e);
        return { success: false, error: e.message };
    }
}

// ============================================
// EXPORT
// ============================================
export default {
    checkIfEmbedded,
    notifyParent,
    getUserStatsForDashboard,
    updateUserStats,
    getModuleProgress,
    markModuleComplete,
    getUserAchievements,
    unlockAchievement
};
