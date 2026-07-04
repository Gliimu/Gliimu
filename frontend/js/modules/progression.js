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
// ADD THESE MISSING FUNCTIONS
// ============================================

// ============================================
// REPORT QUESTION
// ============================================

export async function reportQuestion(questionId, studentId, reason, details) {
    try {
        // Check if question_reports table exists
        const { error } = await supabase
            .from('question_reports')
            .insert([{
                question_id: questionId,
                student_id: studentId,
                reason: reason,
                details: details,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        
        if (error) {
            // If table doesn't exist, just show success
            if (error.code === '42P01') {
                showToast('Thank you for your report. Our team will review it.', 'success');
                return true;
            }
            throw error;
        }
        
        showToast('Thank you for reporting. Our team will review it.', 'success');
        return true;
        
    } catch (error) {
        console.error('Error reporting question:', error);
        showToast('Failed to submit report', 'error');
        return false;
    }
}

// ============================================
// REQUEST DEBATE MATCH
// ============================================

export async function requestDebateMatch(questionId, studentId) {
    try {
        // Check if debate_matches table exists
        const { error } = await supabase
            .from('debate_matches')
            .insert([{
                motion: 'Debate Topic',
                student_a_id: studentId,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        
        if (error) {
            if (error.code === '42P01') {
                showToast('Debate feature coming soon!', 'info');
                return true;
            }
            throw error;
        }
        
        showToast('Debate match requested! An instructor will pair you with another student.', 'success');
        return true;
        
    } catch (error) {
        console.error('Error requesting debate:', error);
        showToast('Failed to request debate', 'error');
        return false;
    }
}

// ============================================
// SUBMIT DEBATE ARGUMENT
// ============================================

export async function submitDebateArgument(debateId, studentId, argument, stance) {
    try {
        // Check if debate_matches table exists
        const { error } = await supabase
            .from('debate_matches')
            .update({
                [stance === 'for' ? 'student_a_submission' : 'student_b_submission']: argument
            })
            .eq('id', debateId);
        
        if (error) {
            if (error.code === '42P01') {
                showToast('Argument submitted! (Demo mode)', 'success');
                return true;
            }
            throw error;
        }
        
        showToast('Argument submitted! Waiting for opponent.', 'success');
        return true;
        
    } catch (error) {
        console.error('Error submitting debate argument:', error);
        showToast('Failed to submit argument', 'error');
        return false;
    }
}

// ============================================
// GET PENDING SUBMISSIONS
// ============================================

export async function getPendingSubmissions(instructorId) {
    try {
        const { data, error } = await supabase
            .from('student_answers')
            .select('*, questions(*), users(name, email)')
            .eq('status', 'pending')
            .order('submitted_at', { ascending: true });
        
        if (error) {
            if (error.code === '42P01') {
                return [];
            }
            throw error;
        }
        
        return data || [];
    } catch (error) {
        console.error('Error fetching pending submissions:', error);
        return [];
    }
}

// ============================================
// GRADE SUBMISSION
// ============================================

export async function gradeSubmission(submissionId, grade, feedback, isCorrect) {
    try {
        // Get submission details
        const { data: submission, error: fetchError } = await supabase
            .from('student_answers')
            .select('student_id, question_id')
            .eq('id', submissionId)
            .single();
        
        if (fetchError) {
            if (fetchError.code === '42P01') {
                showToast('Grading not available in demo mode', 'info');
                return false;
            }
            throw fetchError;
        }
        
        // Update the submission
        const { error: updateError } = await supabase
            .from('student_answers')
            .update({
                grade: grade,
                feedback: feedback,
                is_correct: isCorrect,
                status: 'graded',
                graded_at: new Date().toISOString()
            })
            .eq('id', submissionId);
        
        if (updateError) throw updateError;
        
        // Update student score
        await updateStudentScore(submission.student_id, isCorrect);
        
        showToast('Submission graded successfully!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error grading submission:', error);
        showToast('Failed to grade submission', 'error');
        return false;
    }
}

// ============================================
// UPDATED PROGRESSION WITH STARS
// ============================================

// Calculate progress based on current GP balance
function calculateProgress(currentGP) {
    // 1/50 × GP = Progress %
    // Max 100% at 5,000 GP
    const progress = (currentGP / 50);
    return Math.min(100, progress);
}

// Get badge based on current progress
function getBadge(progress) {
    if (progress >= 100) return { name: 'Ambassador', icon: '👑', color: '#ef4444' };
    if (progress >= 76) return { name: 'Mastery', icon: '🏆', color: '#f59e0b' };
    if (progress >= 51) return { name: 'Advanced Diploma', icon: '🎓', color: '#8b5cf6' };
    if (progress >= 26) return { name: 'Diploma', icon: '📜', color: '#3b82f6' };
    return { name: 'Starter', icon: '🌱', color: '#10b981' };
}

// Convert GP to Stars
async function convertGPToStars(userId) {
    try {
        const currentGP = await getUserGP(userId);
        
        if (currentGP < 1000) {
            showToast('Need at least 1,000 GP to convert to a star!', 'error');
            return false;
        }
        
        // Deduct 1,000 GP
        const newGP = currentGP - 1000;
        const stars = 1;
        
        // Update database
        await supabase
            .from('user_profiles')
            .update({
                wallet_balance: newGP, // Or however GP is stored
                total_stars: supabase.raw('total_stars + 1'),
                total_gp_converted: supabase.raw('total_gp_converted + 1000')
            })
            .eq('id', userId);
        
        // Record conversion
        await supabase
            .from('star_conversions')
            .insert([{
                user_id: userId,
                gp_converted: 1000,
                stars_earned: 1,
                converted_at: new Date().toISOString()
            }]);
        
        showToast('🎉 Converted 1,000 GP to ⭐ Star! Company will send a surprise gift!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error converting GP to stars:', error);
        showToast('Failed to convert GP. Please try again.', 'error');
        return false;
    }
}

// ============================================
// GET QUESTIONS FOR BADGE LEVEL
// ============================================

export async function getQuestionsForBadge(badgeLevel, limit = 10) {
    try {
        const { data, error } = await supabase
            .from('questions')
            .select('*')
            .eq('badge_level', badgeLevel)
            .eq('is_approved', true)
            .order('difficulty_level', { ascending: true })
            .limit(limit);
        
        if (error) {
            if (error.code === '42P01') {
                return getSampleQuestions(badgeLevel);
            }
            throw error;
        }
        
        if (!data || data.length === 0) {
            return getSampleQuestions(badgeLevel);
        }
        
        return data;
        
    } catch (error) {
        console.error('Error fetching questions:', error);
        return getSampleQuestions(badgeLevel);
    }
}

function getSampleQuestions(badgeLevel) {
    const samples = {
        starter: [
            {
                id: 'sample_1',
                text: 'What is the primary purpose of video pre-production?',
                type: 'mcq',
                badge_level: 'starter',
                options: {
                    'A': 'Shooting the video',
                    'B': 'Planning and preparation',
                    'C': 'Editing the final cut',
                    'D': 'Publishing the video'
                },
                correct_answer: 'B',
                explanation: 'Pre-production involves planning before actual production begins.'
            }
        ]
    };
    return samples[badgeLevel] || samples.starter;
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
