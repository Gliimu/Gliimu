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
    MAX_GP_FOR_100_PERCENT: 5000, // 5000 / 50 = 100%
    
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
        multiplier: 0.1 // 10% + (GP_Spent × 0.1)
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

function getNextBadge(currentGP) {
    const progress = calculateProgress(currentGP);
    const badges = PROGRESSION_CONFIG.BADGES;
    
    if (progress < 26) return badges.diploma;
    if (progress < 51) return badges.advanced;
    if (progress < 76) return badges.mastery;
    if (progress < 100) return badges.ambassador;
    return null;
}

function getProgressToNextBadge(currentGP) {
    const progress = calculateProgress(currentGP);
    const nextBadge = getNextBadge(currentGP);
    
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
// CORE PROGRESSION FUNCTIONS
// ============================================

export async function getStudentProgress(userId) {
    try {
        const userData = await getUserData(userId);
        if (!userData) return null;
        
        const currentGP = userData.gp_points || 0;
        const progress = calculateProgress(currentGP);
        const currentBadge = getBadgeFromProgress(progress);
        const nextBadge = getNextBadge(currentGP);
        const progressToNext = getProgressToNextBadge(currentGP);
        const totalStars = userData.total_stars || 0;
        
        // Get available stars (total - used)
        const usedStars = await getUsedStars(userId);
        const availableStars = totalStars - usedStars;
        
        return {
            userId: userData.id,
            name: userData.name,
            role: userData.role,
            currentGP: currentGP,
            progress: progress,
            currentBadge: currentBadge,
            nextBadge: nextBadge,
            progressToNext: progressToNext,
            totalStars: totalStars,
            availableStars: availableStars,
            usedStars: usedStars,
            streak: userData.login_streak || 0,
            lifetimeGPEarned: userData.total_gp_earned_lifetime || 0,
            gpConverted: userData.total_gp_converted || 0
        };
    } catch (error) {
        console.error('Error getting student progress:', error);
        return null;
    }
}

// ============================================
// GP EARNING FUNCTIONS
// ============================================

export async function earnGP(userId, activityType, gpAmount, referenceId = null) {
    try {
        // Validate activity type
        const validActivities = ['read', 'comment', 'share', 'heart_received', 'submission_graded', 'streak_bonus'];
        if (!validActivities.includes(activityType)) {
            console.error('Invalid activity type:', activityType);
            return false;
        }
        
        // Get current user data
        const userData = await getUserData(userId);
        if (!userData) return false;
        
        // Calculate new GP
        const currentGP = userData.gp_points || 0;
        const newGP = currentGP + gpAmount;
        
        // Update user profile
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
        const { error: activityError } = await supabase
            .from('user_activity')
            .insert([{
                user_id: userId,
                activity_type: activityType,
                gp_earned: gpAmount,
                reference_id: referenceId,
                created_at: new Date().toISOString()
            }]);
        
        if (activityError) {
            console.error('Error recording activity:', activityError);
            // Don't fail the whole operation, just log
        }
        
        // Check for badge upgrade
        const oldBadge = getBadgeFromProgress(calculateProgress(currentGP));
        const newBadge = getBadgeFromProgress(calculateProgress(newGP));
        
        if (newBadge.name !== oldBadge.name) {
            showToast(`🎉 LEVEL UP! You're now a ${newBadge.icon} ${newBadge.name}!`, 'success');
        }
        
        // Check for star eligibility (every 1000 GP)
        const newStars = Math.floor(newGP / PROGRESSION_CONFIG.GP_PER_STAR);
        const oldStars = Math.floor(currentGP / PROGRESSION_CONFIG.GP_PER_STAR);
        
        if (newStars > oldStars) {
            const earnedStars = newStars - oldStars;
            await addStars(userId, earnedStars);
            showToast(`⭐ CONGRATULATIONS! You earned ${earnedStars} star${earnedStars > 1 ? 's' : ''}!`, 'success');
        }
        
        return {
            success: true,
            previousGP: currentGP,
            newGP: newGP,
            gpEarned: gpAmount,
            newBadge: newBadge,
            newStars: newStars
        };
        
    } catch (error) {
        console.error('Error earning GP:', error);
        return false;
    }
}

// ============================================
// STAR MANAGEMENT
// ============================================

export async function addStars(userId, count) {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({
                total_stars: supabase.raw(`total_stars + ${count}`)
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
            // If table doesn't exist, return 0
            if (error.code === 'PGRST205') {
                return 0;
            }
            throw error;
        }
        
        const usedStars = data.reduce((sum, item) => sum + (item.stars_used || 0), 0);
        return usedStars;
    } catch (error) {
        console.error('Error getting used stars:', error);
        return 0; // Return 0 on error so dashboard doesn't break
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
            showToast(`Need ${PROGRESSION_CONFIG.GP_PER_STAR} GP to convert to a star!`, 'error');
            return false;
        }
        
        // Deduct GP and add star
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
        
        // Record conversion
        const { error: conversionError } = await supabase
            .from('star_conversions')
            .insert([{
                user_id: userId,
                gp_converted: PROGRESSION_CONFIG.GP_PER_STAR,
                stars_earned: 1,
                converted_at: new Date().toISOString()
            }]);
        
        if (conversionError) {
            console.error('Error recording conversion:', conversionError);
        }
        
        showToast(`⭐ Converted ${PROGRESSION_CONFIG.GP_PER_STAR} GP to 1 Star! Company will send a surprise gift!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Error converting GP to stars:', error);
        showToast('Failed to convert GP. Please try again.', 'error');
        return false;
    }
}

// ============================================
// PROMOTION SYSTEM
// ============================================

export async function activatePromotion(userId, promotionType) {
    try {
        const userData = await getUserData(userId);
        if (!userData) {
            showToast('User not found', 'error');
            return false;
        }
        
        const promotion = PROGRESSION_CONFIG.PROMOTIONS[promotionType];
        if (!promotion) {
            showToast('Invalid promotion type', 'error');
            return false;
        }
        
        // Check ambassador requirement
        if (promotion.requiresAmbassador) {
            const progress = calculateProgress(userData.gp_points || 0);
            if (progress < 100) {
                showToast('Need Ambassador status for this promotion!', 'error');
                return false;
            }
            
            const stars = userData.total_stars || 0;
            if (promotion.requiresStars && stars < promotion.requiresStars) {
                showToast(`Need ${promotion.requiresStars} stars for free promotion!`, 'error');
                return false;
            }
        }
        
        // Check if user has enough stars
        const availableStars = (userData.total_stars || 0) - (await getUsedStars(userId));
        if (promotion.stars > 0 && availableStars < promotion.stars) {
            showToast(`Need ${promotion.stars} stars for this promotion!`, 'error');
            return false;
        }
        
        // Create promotion record
        const { data, error } = await supabase
            .from('user_promotions')
            .insert([{
                user_id: userId,
                promotion_type: promotionType,
                stars_used: promotion.stars,
                duration: promotion.duration,
                duration_unit: promotion.unit,
                status: 'active',
                started_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + (promotion.duration * 24 * 60 * 60 * 1000)).toISOString()
            }])
            .select()
            .single();
        
        if (error) throw error;
        
        showToast(`✅ ${promotionType.replace('_', ' ').toUpperCase()} activated!`, 'success');
        return data;
        
    } catch (error) {
        console.error('Error activating promotion:', error);
        showToast('Failed to activate promotion', 'error');
        return false;
    }
}

export async function getActivePromotions(userId) {
    try {
        const { data, error } = await supabase
            .from('user_promotions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .order('started_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting promotions:', error);
        return [];
    }
}

// ============================================
// STREAK SYSTEM
// ============================================

export async function checkAndUpdateStreak(userId) {
    try {
        const userData = await getUserData(userId);
        if (!userData) return null;
        
        const today = new Date().toISOString().split('T')[0];
        const lastLogin = userData.last_login_date;
        
        // If already logged in today, just return current streak
        if (lastLogin === today) {
            return userData.login_streak || 0;
        }
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        let newStreak = 0;
        let bonusEarned = 0;
        
        if (lastLogin === yesterdayStr) {
            // Consecutive day - increase streak
            newStreak = (userData.login_streak || 0) + 1;
        } else {
            // Streak broken
            newStreak = 1;
        }
        
        // Check for streak rewards
        const streakRewards = PROGRESSION_CONFIG.STREAK_REWARDS;
        if (streakRewards[newStreak]) {
            bonusEarned = streakRewards[newStreak].bonus;
            
            // Award bonus GP
            await earnGP(userId, 'streak_bonus', bonusEarned, null);
            
            showToast(`🔥 ${streakRewards[newStreak].label}! You earned ${bonusEarned} bonus GP!`, 'success');
        }
        
        // Update user profile
        const { error } = await supabase
            .from('user_profiles')
            .update({
                login_streak: newStreak,
                last_login_date: today,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
        
        return { streak: newStreak, bonusEarned: bonusEarned };
        
    } catch (error) {
        console.error('Error updating streak:', error);
        return null;
    }
}

// ============================================
// DISCOUNT SYSTEM
// ============================================

export async function calculateDiscount(userId, gpToSpend) {
    try {
        const userData = await getUserData(userId);
        if (!userData) return 0;
        
        const currentGP = userData.gp_points || 0;
        
        if (gpToSpend < PROGRESSION_CONFIG.DISCOUNTS.gpThreshold) {
            showToast(`Need at least ${PROGRESSION_CONFIG.DISCOUNTS.gpThreshold} GP for a discount`, 'error');
            return 0;
        }
        
        if (gpToSpend > currentGP) {
            showToast(`Not enough GP. You have ${currentGP} GP`, 'error');
            return 0;
        }
        
        // Base discount + bonus based on GP spent
        const baseDiscount = PROGRESSION_CONFIG.DISCOUNTS.baseDiscount;
        const bonusMultiplier = PROGRESSION_CONFIG.DISCOUNTS.multiplier;
        let discount = baseDiscount + (gpToSpend * bonusMultiplier);
        
        // Cap at max discount
        const maxDiscount = PROGRESSION_CONFIG.DISCOUNTS.maxDiscount;
        discount = Math.min(maxDiscount, discount);
        
        // Apply progress level bonus
        const progress = calculateProgress(currentGP);
        if (progress >= 76) {
            discount = Math.min(maxDiscount, discount + 10); // Mastery+ get extra 10%
        } else if (progress >= 51) {
            discount = Math.min(maxDiscount, discount + 5); // Advanced get extra 5%
        }
        
        return Math.floor(discount);
        
    } catch (error) {
        console.error('Error calculating discount:', error);
        return 0;
    }
}

export async function redeemDiscount(userId, itemId, itemType, gpSpent) {
    try {
        const discount = await calculateDiscount(userId, gpSpent);
        if (discount === 0) {
            showToast('No discount available', 'error');
            return false;
        }
        
        // Deduct GP from user
        const userData = await getUserData(userId);
        if (!userData) return false;
        
        const newGP = (userData.gp_points || 0) - gpSpent;
        
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                gp_points: newGP,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (updateError) throw updateError;
        
        // Record discount redemption
        const { error: redemptionError } = await supabase
            .from('discount_redemptions')
            .insert([{
                user_id: userId,
                discount_percentage: discount,
                gp_spent: gpSpent,
                item_id: itemId,
                item_type: itemType,
                redeemed_at: new Date().toISOString()
            }]);
        
        if (redemptionError) {
            console.error('Error recording redemption:', redemptionError);
        }
        
        showToast(`✅ ${discount}% discount applied! ${gpSpent} GP spent.`, 'success');
        return { success: true, discount: discount };
        
    } catch (error) {
        console.error('Error redeeming discount:', error);
        showToast('Failed to redeem discount', 'error');
        return false;
    }
}

// ============================================
// LEADERBOARD FUNCTIONS
// ============================================

export async function getIndividualLeaderboard(limit = 10) {
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
            .neq('role', 'admin')
            .order('gp_points', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        
        return data.map(user => ({
            ...user,
            progress: calculateProgress(user.gp_points || 0),
            badge: getBadgeFromProgress(calculateProgress(user.gp_points || 0))
        }));
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

export async function getSquadLeaderboard(squadId) {
    try {
        // Get all members of the squad
        const { data: squadMembers, error: membersError } = await supabase
            .from('squad_members')
            .select('user_id')
            .eq('squad_id', squadId);
        
        if (membersError) throw membersError;
        
        const userIds = squadMembers.map(m => m.user_id);
        
        if (userIds.length === 0) return null;
        
        // Get total GP for the squad
        const { data, error } = await supabase
            .from('user_profiles')
            .select('gp_points')
            .in('id', userIds);
        
        if (error) throw error;
        
        const totalGP = data.reduce((sum, user) => sum + (user.gp_points || 0), 0);
        const averageGP = totalGP / userIds.length;
        const progress = calculateProgress(averageGP);
        
        return {
            squadId: squadId,
            memberCount: userIds.length,
            totalGP: totalGP,
            averageGP: averageGP,
            progress: progress,
            badge: getBadgeFromProgress(progress)
        };
    } catch (error) {
        console.error('Error getting squad leaderboard:', error);
        return null;
    }
}

export async function getCohortLeaderboard(cohortId) {
    try {
        // Get all squads in cohort
        const { data: squads, error: squadsError } = await supabase
            .from('squads')
            .select('id')
            .eq('cohort_id', cohortId);
        
        if (squadsError) throw squadsError;
        
        const squadLeaderboards = await Promise.all(
            squads.map(squad => getSquadLeaderboard(squad.id))
        );
        
        // Sort by total GP
        return squadLeaderboards
            .filter(s => s !== null)
            .sort((a, b) => b.totalGP - a.totalGP);
    } catch (error) {
        console.error('Error getting cohort leaderboard:', error);
        return [];
    }
}

// ============================================
// HEART SYSTEM (Content Quality)
// ============================================

export async function addHeart(contentId, contentType, userId) {
    try {
        // Check if user already hearted
        const { data: existing, error: checkError } = await supabase
            .from('hearts')
            .select('id')
            .eq('content_id', contentId)
            .eq('user_id', userId)
            .single();
        
        if (existing) {
            showToast('Already hearted this content!', 'info');
            return false;
        }
        
        // Add heart
        const { error: heartError } = await supabase
            .from('hearts')
            .insert([{
                content_id: contentId,
                content_type: contentType,
                user_id: userId,
                created_at: new Date().toISOString()
            }]);
        
        if (heartError) throw heartError;
        
        // Count total hearts for this content
        const { data: heartCount, error: countError } = await supabase
            .from('hearts')
            .select('id', { count: 'exact' })
            .eq('content_id', contentId);
        
        if (countError) throw countError;
        
        // If 12 hearts reached, award GP to content creator
        if (heartCount.length === 12) {
            // Get content creator
            const { data: content, error: contentError } = await supabase
                .from(contentType === 'post' ? 'posts' : 'hub_contents')
                .select('created_by')
                .eq('id', contentId)
                .single();
            
            if (!contentError && content) {
                await earnGP(content.created_by, 'heart_received', 5, contentId);
                showToast(`🎉 Content reached 12 hearts! Creator earned 5 GP!`, 'success');
            }
        }
        
        showToast('❤️ Heart added!', 'success');
        return { success: true, totalHearts: heartCount.length };
        
    } catch (error) {
        console.error('Error adding heart:', error);
        showToast('Failed to add heart', 'error');
        return false;
    }
}

// ============================================
// PORTFOLIO & PROMOTION FUNCTIONS
// ============================================

export async function getPortfolioStatus(userId) {
    try {
        const userData = await getUserData(userId);
        if (!userData) return null;
        
        const progress = calculateProgress(userData.gp_points || 0);
        const isAmbassador = progress >= 100;
        const hasFiveStars = (userData.total_stars || 0) >= 5;
        
        // Check if currently promoted
        const { data: promotions, error: promoError } = await supabase
            .from('user_promotions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .eq('promotion_type', 'hub_featured')
            .gt('expires_at', new Date().toISOString());
        
        if (promoError) throw promoError;
        
        const isCurrentlyPromoted = promotions && promotions.length > 0;
        
        return {
            isAmbassador: isAmbassador,
            hasFiveStars: hasFiveStars,
            isCurrentlyPromoted: isCurrentlyPromoted,
            qualifiesForFreePromotion: isAmbassador && hasFiveStars && !isCurrentlyPromoted,
            promotionExpiry: isCurrentlyPromoted ? promotions[0].expires_at : null
        };
    } catch (error) {
        console.error('Error getting portfolio status:', error);
        return null;
    }
}

export async function requestFreePortfolioPromotion(userId) {
    try {
        const status = await getPortfolioStatus(userId);
        if (!status) return false;
        
        if (!status.qualifiesForFreePromotion) {
            showToast('Must be Ambassador with 5+ stars for free promotion!', 'error');
            return false;
        }
        
        return await activatePromotion(userId, 'hub_featured');
    } catch (error) {
        console.error('Error requesting portfolio promotion:', error);
        showToast('Failed to activate promotion', 'error');
        return false;
    }
}

// ============================================
// SQUAD FUNCTIONS
// ============================================

export async function joinSquad(userId, squadId) {
    try {
        // Check if squad is full
        const { data: squad, error: squadError } = await supabase
            .from('squads')
            .select('member_count, max_members')
            .eq('id', squadId)
            .single();
        
        if (squadError) throw squadError;
        
        if (squad.member_count >= squad.max_members) {
            showToast('This squad is full!', 'error');
            return false;
        }
        
        // Add user to squad
        const { error: joinError } = await supabase
            .from('squad_members')
            .insert([{
                squad_id: squadId,
                user_id: userId,
                joined_at: new Date().toISOString()
            }]);
        
        if (joinError) throw joinError;
        
        // Update squad member count
        const { error: updateError } = await supabase
            .from('squads')
            .update({
                member_count: squad.member_count + 1,
                is_full: squad.member_count + 1 >= squad.max_members
            })
            .eq('id', squadId);
        
        if (updateError) throw updateError;
        
        showToast('✅ Joined squad successfully!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error joining squad:', error);
        showToast('Failed to join squad', 'error');
        return false;
    }
}

// ============================================
// ADMIN FUNCTIONS (Question Management)
// ============================================

export async function addQuestionToPool(questionData) {
    try {
        const { error } = await supabase
            .from('questions')
            .insert([{
                text: questionData.text,
                type: questionData.type || 'mcq',
                badge_level: questionData.badge_level || 'starter',
                options: questionData.options || null,
                correct_answer: questionData.correct_answer,
                explanation: questionData.explanation || null,
                difficulty_level: questionData.difficulty_level || 1,
                category: questionData.category || null,
                source_type: questionData.source_type || null,
                source_title: questionData.source_title || null,
                source_author: questionData.source_author || null,
                requires_creation: questionData.requires_creation || false,
                created_by: questionData.created_by,
                is_approved: true,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        showToast('✅ Question added successfully!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error adding question:', error);
        showToast('Failed to add question', 'error');
        return false;
    }
}

export async function getQuestionsForSquad(squadId, badgeLevel = null) {
    try {
        // Get squad members to determine their level
        const { data: members, error: membersError } = await supabase
            .from('squad_members')
            .select('user_id')
            .eq('squad_id', squadId);
        
        if (membersError) throw membersError;
        
        // Get average GP of squad
        const { data: users, error: usersError } = await supabase
            .from('user_profiles')
            .select('gp_points')
            .in('id', members.map(m => m.user_id));
        
        if (usersError) throw usersError;
        
        const avgGP = users.reduce((sum, u) => sum + (u.gp_points || 0), 0) / users.length;
        const avgProgress = calculateProgress(avgGP);
        const avgBadge = getBadgeFromProgress(avgProgress);
        
        // Get questions matching the squad's level
        let query = supabase
            .from('questions')
            .select('*')
            .eq('is_approved', true);
        
        if (badgeLevel) {
            query = query.eq('badge_level', badgeLevel);
        } else {
            // Get questions at or below squad's average level
            const badgeLevels = ['starter', 'diploma', 'advanced', 'mastery', 'ambassador'];
            const currentIndex = badgeLevels.indexOf(avgBadge.name.toLowerCase());
            const allowedLevels = badgeLevels.slice(0, currentIndex + 1);
            query = query.in('badge_level', allowedLevels);
        }
        
        const { data, error } = await query
            .order('difficulty_level', { ascending: true })
            .limit(5); // Show 5 questions at a time
        
        if (error) throw error;
        
        return data || [];
        
    } catch (error) {
        console.error('Error getting squad questions:', error);
        return [];
    }
}

// ============================================
// COMPLETED FUNCTIONS
// ============================================

export default {
    // Core
    getStudentProgress,
    earnGP,
    
    // Stars
    convertGPToStars,
    addStars,
    getUsedStars,
    
    // Promotions
    activatePromotion,
    getActivePromotions,
    getPortfolioStatus,
    requestFreePortfolioPromotion,
    
    // Streaks
    checkAndUpdateStreak,
    
    // Discounts
    calculateDiscount,
    redeemDiscount,
    
    // Leaderboards
    getIndividualLeaderboard,
    getSquadLeaderboard,
    getCohortLeaderboard,
    
    // Hearts
    addHeart,
    
    // Squads
    joinSquad,
    
    // Admin
    addQuestionToPool,
    getQuestionsForSquad,
    
    // Constants
    PROGRESSION_CONFIG
};
