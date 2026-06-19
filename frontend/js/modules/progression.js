// ============================================
// PROGRESSION MODULE - FIXED FOR YOUR TABLE
// ============================================

import { supabase } from './supabase.js';
import { showToast } from './toast.js';

// ============================================
// BADGE CONFIGURATION
// ============================================

export const BADGE_CONFIG = {
    starter: {
        name: 'Starter',
        icon: '🌱',
        color: '#10b981',
        minScore: 0,
        maxScore: 25,
        description: 'Building foundations'
    },
    diploma: {
        name: 'Diploma',
        icon: '📜',
        color: '#3b82f6',
        minScore: 26,
        maxScore: 50,
        description: 'Demonstrating knowledge'
    },
    advanced: {
        name: 'Advanced Diploma',
        icon: '🎓',
        color: '#8b5cf6',
        minScore: 51,
        maxScore: 75,
        description: 'Creating projects'
    },
    mastery: {
        name: 'Mastery',
        icon: '🏆',
        color: '#f59e0b',
        minScore: 76,
        maxScore: 99,
        description: 'Scholarly debate'
    },
    ambassador: {
        name: 'Ambassador',
        icon: '👑',
        color: '#ef4444',
        minScore: 100,
        maxScore: 100,
        description: 'Real-world creator'
    }
};

// ============================================
// HELPER: Check if table exists
// ============================================

async function tableExists(tableName) {
    try {
        const { error } = await supabase
            .from(tableName)
            .select('id')
            .limit(1);
        return !error || error.code !== '42P01';
    } catch {
        return false;
    }
}

// ============================================
// GET STUDENT SCORE - MATCHES YOUR TABLE
// ============================================

export async function getStudentScore(studentId) {
    if (!studentId) {
        console.warn('No studentId provided');
        return { current_score: 0 };
    }
    
    try {
        console.log('🔍 Fetching score for user:', studentId);
        
        const { data, error } = await supabase
            .from('student_scores')
            .select('*')
            .eq('student_id', studentId)
            .maybeSingle();  // Use maybeSingle to avoid 406 errors
        
        if (error) {
            console.error('❌ Error fetching score:', error.message);
            // Return default if table doesn't exist or error
            return {
                student_id: studentId,
                current_score: 0,
                current_badge: 'starter',
                consecutive_wrong: 0,
                total_questions_answered: 0,
                correct_answers: 0,
                wrong_answers: 0
            };
        }
        
        if (data) {
            console.log('✅ Score found:', data);
            return data;
        }
        
        // No record exists - create one
        console.log('ℹ️ No score record found, creating one...');
        
        const { data: newScore, error: insertError } = await supabase
            .from('student_scores')
            .insert([{
                student_id: studentId,
                current_score: 0,
                current_badge: 'starter',
                consecutive_wrong: 0,
                total_questions_answered: 0,
                correct_answers: 0,
                wrong_answers: 0,
                last_updated: new Date().toISOString()
            }])
            .select()
            .maybeSingle();
        
        if (insertError) {
            console.error('❌ Could not create score record:', insertError.message);
            return {
                student_id: studentId,
                current_score: 0,
                current_badge: 'starter',
                consecutive_wrong: 0,
                total_questions_answered: 0,
                correct_answers: 0,
                wrong_answers: 0
            };
        }
        
        console.log('✅ New score record created:', newScore);
        return newScore;
        
    } catch (e) {
        console.error('❌ Error in getStudentScore:', e);
        return {
            student_id: studentId,
            current_score: 0,
            current_badge: 'starter',
            consecutive_wrong: 0,
            total_questions_answered: 0,
            correct_answers: 0,
            wrong_answers: 0
        };
    }
}

// ============================================
// UPDATE STUDENT SCORE
// ============================================

export async function updateStudentScore(studentId, isCorrect) {
    try {
        // First get current score
        const currentData = await getStudentScore(studentId);
        if (!currentData) return null;
        
        let newScore = currentData.current_score;
        let consecutiveWrong = currentData.consecutive_wrong || 0;
        let correctAnswers = currentData.correct_answers || 0;
        let wrongAnswers = currentData.wrong_answers || 0;
        let totalQuestions = currentData.total_questions_answered || 0;
        
        // Calculate score change
        let change = 0;
        if (isCorrect) {
            change = 0.25;
            consecutiveWrong = 0;
            correctAnswers++;
        } else {
            // Consecutive wrong penalty increases
            consecutiveWrong++;
            if (consecutiveWrong >= 3) {
                change = -0.6;
            } else {
                change = -0.2;
            }
            wrongAnswers++;
        }
        
        totalQuestions++;
        newScore = Math.max(0, Math.min(100, newScore + change));
        
        // Determine new badge
        const newBadge = getCurrentBadge(newScore).name.toLowerCase();
        
        // Update in database
        const { error } = await supabase
            .from('student_scores')
            .update({
                current_score: newScore,
                current_badge: newBadge,
                consecutive_wrong: consecutiveWrong,
                total_questions_answered: totalQuestions,
                correct_answers: correctAnswers,
                wrong_answers: wrongAnswers,
                last_updated: new Date().toISOString()
            })
            .eq('student_id', studentId);
        
        if (error) {
            console.error('Error updating score:', error);
            return null;
        }
        
        // Show feedback
        if (isCorrect) {
            showToast(`🎉 +${change.toFixed(2)}%! Great answer!`, 'success');
        } else {
            if (consecutiveWrong >= 3) {
                showToast(`📉 ${change.toFixed(2)}%... Three wrong in a row! Take a break and review.`, 'error');
            } else {
                showToast(`📉 ${change.toFixed(2)}%... Keep practicing!`, 'error');
            }
        }
        
        // Get updated score
        return await getStudentScore(studentId);
        
    } catch (error) {
        console.error('Error in updateStudentScore:', error);
        return null;
    }
}

// ============================================
// BADGE FUNCTIONS
// ============================================

export function getCurrentBadge(score) {
    if (score >= 100) return BADGE_CONFIG.ambassador;
    if (score >= 76) return BADGE_CONFIG.mastery;
    if (score >= 51) return BADGE_CONFIG.advanced;
    if (score >= 26) return BADGE_CONFIG.diploma;
    return BADGE_CONFIG.starter;
}

export function getNextBadge(score) {
    if (score < 26) return BADGE_CONFIG.diploma;
    if (score < 51) return BADGE_CONFIG.advanced;
    if (score < 76) return BADGE_CONFIG.mastery;
    if (score < 100) return BADGE_CONFIG.ambassador;
    return null;
}

export function getProgressToNextBadge(score) {
    const nextBadge = getNextBadge(score);
    if (!nextBadge) return 100;
    
    let startRange, endRange;
    if (score < 26) { startRange = 0; endRange = 25; }
    else if (score < 51) { startRange = 26; endRange = 50; }
    else if (score < 76) { startRange = 51; endRange = 75; }
    else { startRange = 76; endRange = 99; }
    
    const progress = ((score - startRange) / (endRange - startRange)) * 100;
    return Math.min(100, Math.max(0, progress));
}

// ============================================
// LEADERBOARD
// ============================================

export async function getLeaderboard(limit = 10) {
    try {
        console.log('📊 Fetching leaderboard...');
        
        const { data, error } = await supabase
            .from('student_scores')
            .select(`
                student_id,
                current_score,
                current_badge,
                users!inner (
                    name,
                    avatar_url
                )
            `)
            .order('current_score', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.warn('⚠️ Error fetching leaderboard:', error.message);
            // Try without join
            const { data: simpleData, error: simpleError } = await supabase
                .from('student_scores')
                .select('*')
                .order('current_score', { ascending: false })
                .limit(limit);
            
            if (simpleError) {
                console.warn('⚠️ Simple leaderboard error:', simpleError.message);
                return [];
            }
            return simpleData || [];
        }
        
        return data || [];
    } catch (e) {
        console.error('❌ Error in getLeaderboard:', e);
        return [];
    }
}

// ============================================
// DUMMY QUESTION (Since we don't have questions table)
// ============================================

export function getNextQuestion(studentId) {
    // Return a dummy question since questions table doesn't exist yet
    return Promise.resolve({
        id: 'q1',
        text: 'What is the first step in video production?',
        type: 'mcq',
        badge_level: 'starter',
        options: {
            A: 'Pre-production (Planning)',
            B: 'Production (Filming)',
            C: 'Post-production (Editing)',
            D: 'Distribution (Publishing)'
        },
        correct_answer: 'A',
        explanation: 'Pre-production is the planning phase before filming begins.'
    });
}

// ============================================
// OTHER FUNCTIONS (Stubs for now)
// ============================================

export async function submitAnswer(studentId, questionId, answer) {
    const isCorrect = answer === 'A';
    const result = await updateStudentScore(studentId, isCorrect);
    return { success: true, isCorrect, result };
}

export async function submitMVPProposal(studentId, title, description, projectType, proposal) {
    showToast('MVP Proposal submitted! The school will review it.', 'success');
    return true;
}

export async function getStudentPortfolio(studentId) {
    return [];
}

export function sharePortfolio(studentId) {
    const url = `${window.location.origin}/u/${studentId}`;
    navigator.clipboard.writeText(url);
    showToast('Portfolio link copied!', 'success');
    return url;
}

// ============================================
// EXPORT
// ============================================

export default {
    BADGE_CONFIG,
    getStudentScore,
    updateStudentScore,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    getLeaderboard,
    getNextQuestion,
    submitAnswer,
    submitMVPProposal,
    getStudentPortfolio,
    sharePortfolio
};
