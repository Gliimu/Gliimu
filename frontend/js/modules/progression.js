// ============================================
// GLIIMU PROGRESSION MODULE - COMPLETE
// Version: 2.0 (Stars, Promotions, Squad System)
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const PROGRESSION_CONFIG = {
    // 1/50 × GP = Progress %
    GP_TO_PROGRESS_RATIO: 1/50,
    MAX_PROGRESS: 100,
    MAX_GP_FOR_100_PERCENT: 5000,
    
    // Star conversion
    GP_PER_STAR: 1000,
    
    // Streak rewards
    STREAK_REWARDS: {
        7:  { bonus: 5,  label: '🔥 7-Day Streak' },
        14: { bonus: 15, label: '⚡ 14-Day Streak' },
        30: { bonus: 50, label: '🌟 30-Day Streak' },
        60: { bonus: 100, label: '💎 60-Day Streak' },
        90: { bonus: 200, label: '👑 90-Day Streak' }
    },
    
    // Badge levels
    BADGES: {
        starter: {
            name: 'Starter',
            icon: '🌱',
            color: '#10b981',
            minProgress: 0,
            maxProgress: 25,
            minGP: 0,
            maxGP: 1250
        },
        diploma: {
            name: 'Diploma',
            icon: '📜',
            color: '#3b82f6',
            minProgress: 26,
            maxProgress: 50,
            minGP: 1300,
            maxGP: 2500
        },
        advanced: {
            name: 'Advanced Diploma',
            icon: '🎓',
            color: '#8b5cf6',
            minProgress: 51,
            maxProgress: 75,
            minGP: 2550,
            maxGP: 3750
        },
        mastery: {
            name: 'Mastery',
            icon: '🏆',
            color: '#f59e0b',
            minProgress: 76,
            maxProgress: 99,
            minGP: 3800,
            maxGP: 4950
        },
        ambassador: {
            name: 'Ambassador',
            icon: '👑',
            color: '#ef4444',
            minProgress: 100,
            maxProgress: 100,
            minGP: 5000,
            maxGP: Infinity
        }
    },
    
    // Promotion costs (in stars)
    PROMOTIONS: {
        hub_featured: { stars: 0, duration: 24, unit: 'hours', requiresAmbassador: true, requiresStars: 5 },
        hub_sponsored: { stars: 1, duration: 3, unit: 'days' },
        partner_collab: { stars: 1, duration: 2, unit: 'days' },
        flier_design: { stars: 1, duration: 3, unit: 'days' },
        billboard: { stars: 2, duration: 7, unit: 'days' },
        event_ticket: { stars: 2, duration: 1, unit: 'event' },
        partnership_listing: { stars: 3, duration: 30, unit: 'days' }
    },
    
    // Discount system
    DISCOUNTS: {
        baseDiscount: 10,
        maxDiscount: 45,
        gpThreshold: 100,
        multiplier: 0.1
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getBadgeFromProgress(progress) {
    const badges = PROGRESSION_CONFIG.BADGES;
    if (progress >= 100) return badges.ambassador;
    if (progress >= 76) return badges.mastery;
    if (progress >= 51) return badges.advanced;
    if (progress >= 26) return badges.diploma;
    return badges.starter;
}

function getBadgeFromGP(gp) {
    const progress = calculateProgress(gp);
    return getBadgeFromProgress(progress);
}

function calculateProgress(gp) {
    const progress = gp * PROGRESSION_CONFIG.GP_TO_PROGRESS_RATIO;
    return Math.min(PROGRESSION_CONFIG.MAX_PROGRESS, progress);
}

function calculateGPForProgress(progress) {
    return Math.ceil(progress / PROGRESSION_CONFIG.GP_TO_PROGRESS_RATIO);
}

function getNextBadgeFunc(currentGP) {
    const progress = calculateProgress(currentGP);
    const badges = PROGRESSION_CONFIG.BADGES;
    
    if (progress < 26) return badges.diploma;
    if (progress < 51) return badges.advanced;
    if (progress < 76) return badges.mastery;
    if (progress < 100) return badges.ambassador;
    return null;
}

function getProgressToNextBadgeFunc(currentGP) {
    const progress = calculateProgress(currentGP);
    const nextBadge = getNextBadgeFunc(currentGP);
    
    if (!nextBadge) return 100;
    
    let currentMin, nextMax;
    if (progress < 26) { currentMin = 0; nextMax = 25; }
    else if (progress < 51) { currentMin = 26; nextMax = 50; }
    else if (progress < 76) { currentMin = 51; nextMax = 75; }
    else { currentMin = 76; nextMax = 99; }
    
    const progressInRange = progress - currentMin;
    const rangeSize = nextMax - currentMin;
    return Math.min(100, (progressInRange / rangeSize) * 100);
}

function getCurrentBadgeFunc(currentGP) {
    const progress = calculateProgress(currentGP);
    return getBadgeFromProgress(progress);
}

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function storeAlertLocal(alertData) {
    try {
        const key = 'alerts_' + alertData.user_id;
        let alerts = JSON.parse(localStorage.getItem(key) || '[]');
        alerts.unshift({
            id: 'alert_' + Date.now(),
            ...alertData,
            read: false,
            created_at: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(alerts));
    } catch (e) {
        console.warn('Could not store alert locally:', e);
    }
}

// ============================================
// USER DATA RETRIEVAL
// ============================================

async function getUserData(userId) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select(`
                id,
                name,
                role,
                wallet_balance,
                gp_points,
                total_stars,
                total_gp_earned_lifetime,
                total_gp_converted,
                login_streak,
                last_login_date,
                avatar_url
            `)
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
}

// ============================================
// EXPORTED FUNCTIONS
// ============================================

export async function getStudentProgress(studentId) {
    try {
        const { data, error } = await supabase
            .from('student_progress')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
            return {
                currentGP: 0,
                progress: 0,
                starsEarned: 0,
                currentBadge: { name: 'Starter', icon: '🌱', color: '#10b981' },
                nextBadge: { name: 'Diploma', icon: '📜', color: '#3b82f6' },
                progressToNext: 0
            };
        }

        const currentBadge = getCurrentBadgeFunc(data.current_gp || 0);
        const nextBadge = getNextBadgeFunc(data.current_gp || 0);
        const progressToNext = getProgressToNextBadgeFunc(data.current_gp || 0);

        return {
            currentGP: data.current_gp || 0,
            progress: data.progress || 0,
            totalStars: data.stars_earned || 0,
            currentBadge: currentBadge,
            nextBadge: nextBadge,
            progressToNext: progressToNext
        };

    } catch (error) {
        console.error('Error getting student progress:', error);
        return null;
    }
}

export async function getIndividualLeaderboard(limit = 5) {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select(`
                id,
                name,
                gp_points,
                total_stars,
                avatar_url,
                role
            `)
            .order('gp_points', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        
        return data.map(function(user) {
            return {
                ...user,
                progress: calculateProgress(user.gp_points || 0),
                badge: getBadgeFromProgress(calculateProgress(user.gp_points || 0))
            };
        });
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export async function earnGP(userId, activityType, gpAmount, referenceId) {
    try {
        const validActivities = ['read', 'comment', 'share', 'heart_received', 'submission_graded', 'streak_bonus'];
        if (!validActivities.includes(activityType)) {
            console.error('Invalid activity type:', activityType);
            return false;
        }
        
        const userData = await getUserData(userId);
        if (!userData) return false;
        
        const currentGP = userData.gp_points || 0;
        const newGP = currentGP + gpAmount;
        
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                gp_points: newGP,
                total_gp_earned_lifetime: (userData.total_gp_earned_lifetime || 0) + gpAmount,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (updateError) {
            console.error('Error updating GP:', updateError);
            return false;
        }
        
        // Record activity
        try {
            await supabase
                .from('user_activity')
                .insert([{
                    user_id: userId,
                    activity_type: activityType,
                    gp_earned: gpAmount,
                    reference_id: referenceId || null,
                    created_at: new Date().toISOString()
                }]);
        } catch (activityError) {
            console.warn('Error recording activity:', activityError);
        }
        
        // Check for star eligibility
        const newStars = Math.floor(newGP / PROGRESSION_CONFIG.GP_PER_STAR);
        const oldStars = Math.floor(currentGP / PROGRESSION_CONFIG.GP_PER_STAR);
        
        if (newStars > oldStars) {
            const earnedStars = newStars - oldStars;
            await addStars(userId, earnedStars);
        }
        
        return {
            success: true,
            previousGP: currentGP,
            newGP: newGP,
            gpEarned: gpAmount
        };
        
    } catch (error) {
        console.error('Error earning GP:', error);
        return false;
    }
}

export async function convertGPToStars(userId) {
    try {
        const userData = await getUserData(userId);
        if (!userData) {
            showToast('User not found', 'error');
            return false;
        }
        
        const currentGP = userData.gp_points || 0;
        
        if (currentGP < PROGRESSION_CONFIG.GP_PER_STAR) {
            showToast('Need ' + PROGRESSION_CONFIG.GP_PER_STAR + ' GP to convert to a star!', 'error');
            return false;
        }
        
        const newGP = currentGP - PROGRESSION_CONFIG.GP_PER_STAR;
        
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                gp_points: newGP,
                total_gp_converted: (userData.total_gp_converted || 0) + PROGRESSION_CONFIG.GP_PER_STAR,
                total_stars: (userData.total_stars || 0) + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (updateError) throw updateError;
        
        showToast('⭐ Converted ' + PROGRESSION_CONFIG.GP_PER_STAR + ' GP to 1 Star!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error converting GP to stars:', error);
        showToast('Failed to convert GP', 'error');
        return false;
    }
}

export async function addStars(userId, count) {
    try {
        const userData = await getUserData(userId);
        if (!userData) return false;
        
        const { error } = await supabase
            .from('user_profiles')
            .update({
                total_stars: (userData.total_stars || 0) + count
            })
            .eq('id', userId);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error adding stars:', error);
        return false;
    }
}

export async function getUsedStars(userId) {
    try {
        const { data, error } = await supabase
            .from('user_promotions')
            .select('stars_used')
            .eq('user_id', userId)
            .eq('status', 'active');
        
        if (error) {
            if (error.code === 'PGRST205') return 0;
            throw error;
        }
        
        return data.reduce(function(sum, item) {
            return sum + (item.stars_used || 0);
        }, 0);
    } catch (error) {
        console.error('Error getting used stars:', error);
        return 0;
    }
}

export async function getNextQuestion(studentId) {
    try {
        const { data: answered, error: answeredError } = await supabase
            .from('student_answers')
            .select('question_id')
            .eq('student_id', studentId);

        if (answeredError) throw answeredError;

        const answeredIds = answered.map(function(a) { return a.question_id; });

        let query = supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(1);

        if (answeredIds.length > 0) {
            query = query.not('id', 'in', '(' + answeredIds.join(',') + ')');
        }

        const { data, error } = await query;

        if (error) throw error;
        return data?.[0] || null;

    } catch (error) {
        console.error('Error getting next question:', error);
        return null;
    }
}

export async function submitAnswer(studentId, questionId, answer) {
    try {
        const { data: existing, error: checkError } = await supabase
            .from('student_answers')
            .select('id')
            .eq('student_id', studentId)
            .eq('question_id', questionId)
            .maybeSingle();

        if (existing) {
            showToast('You already answered this question', 'warning');
            return false;
        }

        const { data: question, error: questionError } = await supabase
            .from('questions')
            .select('gp_reward')
            .eq('id', questionId)
            .single();

        if (questionError) throw questionError;

        const gpReward = question?.gp_reward || 10;

        const { data, error } = await supabase
            .from('student_answers')
            .insert([{
                id: generateId(),
                student_id: studentId,
                question_id: questionId,
                answer: answer,
                status: 'pending',
                gp_earned: gpReward,
                answered_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;

        await updateStudentProgress(studentId, gpReward);

        await createUserAlert({
            user_id: studentId,
            icon: '⭐',
            message: 'You earned ' + gpReward + ' GP for answering a question!',
            type: 'success'
        });

        return true;

    } catch (error) {
        console.error('Error submitting answer:', error);
        return false;
    }
}

export async function updateStudentProgress(studentId, gpEarned) {
    try {
        const { data: current, error: getError } = await supabase
            .from('student_progress')
            .select('current_gp, progress, stars_earned')
            .eq('student_id', studentId)
            .single();

        if (getError && getError.code !== 'PGRST116') throw getError;

        let currentGP = current?.current_gp || 0;
        let currentProgress = current?.progress || 0;
        let starsEarned = current?.stars_earned || 0;

        const newGP = currentGP + gpEarned;
        const newProgress = Math.min(100, (newGP / 5000) * 100);
        const newStars = Math.floor(newGP / 1000);

        const newBadge = getCurrentBadgeFunc(newGP);

        const { error } = await supabase
            .from('student_progress')
            .upsert({
                student_id: studentId,
                current_gp: newGP,
                progress: newProgress,
                stars_earned: newStars,
                current_badge: newBadge.name,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;

        return { currentGP: newGP, progress: newProgress, starsEarned: newStars, badge: newBadge };

    } catch (error) {
        console.error('Error updating student progress:', error);
        return null;
    }
}

export async function getStudentPortfolio(studentId, isPublic) {
    try {
        let query = supabase
            .from('student_answers')
            .select(`
                *,
                questions(title, question)
            `)
            .eq('student_id', studentId);

        if (isPublic) {
            query = query.eq('status', 'graded');
        }

        const { data, error } = await query
            .order('answered_at', { ascending: false });

        if (error) throw error;

        return data.map(function(item) {
            return {
                id: item.id,
                title: item.questions?.title || 'Answer',
                description: item.questions?.question || item.answer?.substring(0, 100) || 'No description',
                type: 'answer',
                grade: item.grade,
                status: item.status,
                created_at: item.answered_at
            };
        });

    } catch (error) {
        console.error('Error getting student portfolio:', error);
        return [];
    }
}

// ============================================
// CREATE USER ALERT HELPER
// ============================================
async function createUserAlert(alertData) {
    try {
        const { error } = await supabase
            .from('user_alerts')
            .insert([{
                user_id: alertData.user_id,
                icon: alertData.icon || '📌',
                message: alertData.message,
                type: alertData.type || 'info',
                read: false,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205') {
                storeAlertLocal(alertData);
                return;
            }
            throw error;
        }
    } catch (error) {
        console.error('Error creating user alert:', error);
        storeAlertLocal(alertData);
    }
}

// ============================================
// EXPORT THE HELPER FUNCTIONS THAT ARE NEEDED
// ============================================
export function getCurrentBadge(gp) {
    return getCurrentBadgeFunc(gp);
}

export function getNextBadge(gp) {
    return getNextBadgeFunc(gp);
}

export function getProgressToNextBadge(gp) {
    return getProgressToNextBadgeFunc(gp);
}

// ============================================
// DEFAULT EXPORT
// ============================================
export default {
    getStudentProgress,
    getIndividualLeaderboard,
    earnGP,
    convertGPToStars,
    addStars,
    getUsedStars,
    getNextQuestion,
    submitAnswer,
    updateStudentProgress,
    getStudentPortfolio,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    PROGRESSION_CONFIG
};
