// ============================================
// PROGRESSION MODULE
// Student scoring, badge calculation, and progression engine
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
        questionTypes: ['mcq'],
        description: 'Building foundations with multiple choice questions'
    },
    diploma: {
        name: 'Diploma',
        icon: '📜',
        color: '#3b82f6',
        minScore: 26,
        maxScore: 50,
        questionTypes: ['typed'],
        description: 'Demonstrating knowledge through written answers'
    },
    advanced: {
        name: 'Advanced Diploma',
        icon: '🎓',
        color: '#8b5cf6',
        minScore: 51,
        maxScore: 75,
        questionTypes: ['file'],
        description: 'Creating projects and submitting work'
    },
    mastery: {
        name: 'Mastery',
        icon: '🏆',
        color: '#f59e0b',
        minScore: 76,
        maxScore: 99,
        questionTypes: ['debate'],
        description: 'Engaging in scholarly debate and research'
    },
    ambassador: {
        name: 'Ambassador',
        icon: '👑',
        color: '#ef4444',
        minScore: 100,
        maxScore: 100,
        questionTypes: ['mvp'],
        description: 'Real-world project creator and platform contributor'
    }
};

// ============================================
// SCORING CONSTANTS
// ============================================

export const SCORING = {
    CORRECT: 0.25,
    WRONG_SINGLE: -0.2,
    WRONG_CONSECUTIVE: -0.6,
    MIN_SCORE: 0,
    MAX_SCORE: 100
};

// ============================================
// GET STUDENT SCORE
// ============================================

export async function getStudentScore(studentId) {
    try {
        const { data, error } = await supabase
            .from('student_scores')
            .select('*')
            .eq('student_id', studentId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching score:', error);
            return null;
        }
        
        if (!data) {
            // Create new score record
            const { data: newScore, error: insertError } = await supabase
                .from('student_scores')
                .insert([{
                    student_id: studentId,
                    current_score: 0,
                    current_badge: 'starter',
                    consecutive_wrong: 0,
                    total_questions_answered: 0,
                    correct_answers: 0,
                    wrong_answers: 0
                }])
                .select()
                .single();
            
            if (insertError) {
                console.error('Error creating score record:', insertError);
                return null;
            }
            
            return newScore;
        }
        
        return data;
        
    } catch (error) {
        console.error('Error in getStudentScore:', error);
        return null;
    }
}

// ============================================
// UPDATE STUDENT SCORE
// ============================================

export async function updateStudentScore(studentId, isCorrect) {
    try {
        // Call the database function
        const { data, error } = await supabase
            .rpc('update_student_score', {
                p_student_id: studentId,
                p_is_correct: isCorrect
            });
        
        if (error) {
            console.error('Error updating score:', error);
            return null;
        }
        
        // Get updated score
        const updatedScore = await getStudentScore(studentId);
        
        // Show toast notification for score change
        if (data > 0) {
            showToast(`🎉 +${data}%! Great answer!`, 'success');
        } else if (data < 0) {
            showToast(`📉 ${data}%... Keep practicing!`, 'error');
        }
        
        return updatedScore;
        
    } catch (error) {
        console.error('Error in updateStudentScore:', error);
        return null;
    }
}

// ============================================
// GET CURRENT BADGE
// ============================================

export function getCurrentBadge(score) {
    if (score >= 100) return BADGE_CONFIG.ambassador;
    if (score >= 76) return BADGE_CONFIG.mastery;
    if (score >= 51) return BADGE_CONFIG.advanced;
    if (score >= 26) return BADGE_CONFIG.diploma;
    return BADGE_CONFIG.starter;
}

// ============================================
// GET NEXT BADGE
// ============================================

export function getNextBadge(currentScore) {
    if (currentScore < 26) return BADGE_CONFIG.diploma;
    if (currentScore < 51) return BADGE_CONFIG.advanced;
    if (currentScore < 76) return BADGE_CONFIG.mastery;
    if (currentScore < 100) return BADGE_CONFIG.ambassador;
    return null;
}

// ============================================
// CALCULATE PROGRESS TO NEXT BADGE
// ============================================

export function getProgressToNextBadge(currentScore) {
    const nextBadge = getNextBadge(currentScore);
    if (!nextBadge) return 100;
    
    let startRange, endRange;
    
    if (currentScore < 26) {
        startRange = 0;
        endRange = 25;
    } else if (currentScore < 51) {
        startRange = 26;
        endRange = 50;
    } else if (currentScore < 76) {
        startRange = 51;
        endRange = 75;
    } else {
        startRange = 76;
        endRange = 99;
    }
    
    const progress = ((currentScore - startRange) / (endRange - startRange)) * 100;
    return Math.min(100, Math.max(0, progress));
}

// ============================================
// GET QUESTIONS FOR CURRENT BADGE LEVEL
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
            console.error('Error fetching questions:', error);
            return [];
        }
        
        return data;
        
    } catch (error) {
        console.error('Error in getQuestionsForBadge:', error);
        return [];
    }
}

// ============================================
// GET NEXT QUESTION
// ============================================

export async function getNextQuestion(studentId) {
    try {
        // Get student's current score and badge
        const scoreData = await getStudentScore(studentId);
        if (!scoreData) return null;
        
        const currentBadge = scoreData.current_badge;
        
        // Get questions for this badge level
        const questions = await getQuestionsForBadge(currentBadge, 20);
        
        // Get already answered questions
        const { data: answered, error: answeredError } = await supabase
            .from('student_answers')
            .select('question_id')
            .eq('student_id', studentId);
        
        if (answeredError) {
            console.error('Error fetching answered questions:', answeredError);
        }
        
        const answeredIds = new Set(answered?.map(a => a.question_id) || []);
        
        // Filter unanswered questions
        const unanswered = questions.filter(q => !answeredIds.has(q.id));
        
        if (unanswered.length === 0) {
            showToast('You\'ve completed all questions at this level! Try the next badge.', 'info');
            return null;
        }
        
        // Return random unanswered question
        const randomIndex = Math.floor(Math.random() * unanswered.length);
        return unanswered[randomIndex];
        
    } catch (error) {
        console.error('Error in getNextQuestion:', error);
        return null;
    }
}

// ============================================
// SUBMIT ANSWER
// ============================================

export async function submitAnswer(studentId, questionId, answer, fileUrl = null) {
    try {
        // Get question details
        const { data: question, error: qError } = await supabase
            .from('questions')
            .select('*')
            .eq('id', questionId)
            .single();
        
        if (qError) throw qError;
        
        let isCorrect = null;
        let status = 'pending';
        
        // For MCQ, auto-grade
        if (question.type === 'mcq') {
            isCorrect = (answer === question.correct_answer);
            status = 'graded';
            
            // Update score
            await updateStudentScore(studentId, isCorrect);
        }
        
        // Save answer
        const { data: answerData, error: aError } = await supabase
            .from('student_answers')
            .insert([{
                student_id: studentId,
                question_id: questionId,
                answer: answer,
                file_url: fileUrl,
                is_correct: isCorrect,
                status: status,
                submitted_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (aError) throw aError;
        
        // If typed answer, add to assignments for grading
        if (question.type === 'typed' || question.type === 'file') {
            showToast('Answer submitted! Awaiting instructor review.', 'info');
        } else if (question.type === 'mcq') {
            if (isCorrect) {
                showToast('✅ Correct! +0.25%', 'success');
            } else {
                const explanation = question.explanation || 'Keep practicing!';
                showToast(`❌ Incorrect. ${explanation}`, 'error');
            }
        }
        
        return { success: true, answer: answerData, isCorrect };
        
    } catch (error) {
        console.error('Error submitting answer:', error);
        showToast('Failed to submit answer. Please try again.', 'error');
        return { success: false, error: error.message };
    }
}

// ============================================
// GET PENDING SUBMISSIONS (for grading)
// ============================================

export async function getPendingSubmissions(instructorId) {
    try {
        const { data, error } = await supabase
            .from('student_answers')
            .select('*, questions(*), users(name, email)')
            .eq('status', 'pending')
            .order('submitted_at', { ascending: true });
        
        if (error) throw error;
        return data;
        
    } catch (error) {
        console.error('Error fetching pending submissions:', error);
        return [];
    }
}

// ============================================
// GRADE SUBMISSION (Instructor)
// ============================================

export async function gradeSubmission(submissionId, grade, feedback, isCorrect) {
    try {
        const { data: submission, error: fetchError } = await supabase
            .from('student_answers')
            .select('student_id, question_id')
            .eq('id', submissionId)
            .single();
        
        if (fetchError) throw fetchError;
        
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
        
        // Add to portfolio if graded well
        if (grade >= 70) {
            const { data: question } = await supabase
                .from('questions')
                .select('text')
                .eq('id', submission.question_id)
                .single();
            
            await supabase
                .from('portfolio_items')
                .insert([{
                    student_id: submission.student_id,
                    title: question?.text || 'Graded Submission',
                    description: feedback,
                    type: 'answer',
                    content: submission.answer,
                    grade: grade,
                    created_at: new Date().toISOString()
                }]);
        }
        
        showToast('Submission graded successfully!', 'success');
        return true;
        
    } catch (error) {
        console.error('Error grading submission:', error);
        showToast('Failed to grade submission', 'error');
        return false;
    }
}

// ============================================
// REPORT QUESTION
// ============================================

export async function reportQuestion(questionId, studentId, reason, details) {
    try {
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
        
        if (error) throw error;
        
        // Increment report count on question
        await supabase.rpc('increment_question_report_count', { q_id: questionId });
        
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
        const { data: question } = await supabase
            .from('questions')
            .select('text')
            .eq('id', questionId)
            .single();
        
        const { error } = await supabase
            .from('debate_matches')
            .insert([{
                motion: question.text,
                student_a_id: studentId,
                status: 'pending',
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
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
        const updates = {};
        
        // Determine which student is submitting
        const { data: debate } = await supabase
            .from('debate_matches')
            .select('student_a_id, student_b_id')
            .eq('id', debateId)
            .single();
        
        if (debate.student_a_id === studentId) {
            updates.student_a_submission = argument;
        } else {
            updates.student_b_submission = argument;
        }
        
        const { error } = await supabase
            .from('debate_matches')
            .update(updates)
            .eq('id', debateId);
        
        if (error) throw error;
        
        showToast('Argument submitted! Waiting for opponent.', 'success');
        return true;
        
    } catch (error) {
        console.error('Error submitting debate argument:', error);
        showToast('Failed to submit argument', 'error');
        return false;
    }
}

// ============================================
// SUBMIT MVP PROPOSAL
// ============================================

export async function submitMVPProposal(studentId, title, description, projectType, proposal) {
    try {
        const { error } = await supabase
            .from('mvp_proposals')
            .insert([{
                student_id: studentId,
                title: title,
                description: description,
                project_type: projectType,
                proposal: proposal,
                status: 'pending',
                submitted_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        showToast('MVP proposal submitted! The school will review and reach out.', 'success');
        return true;
        
    } catch (error) {
        console.error('Error submitting MVP proposal:', error);
        showToast('Failed to submit proposal', 'error');
        return false;
    }
}

// ============================================
// GET STUDENT PORTFOLIO
// ============================================

export async function getStudentPortfolio(studentId, publicView = false) {
    try {
        let query = supabase
            .from('portfolio_items')
            .select('*')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false });
        
        if (publicView) {
            query = query.eq('is_public', true);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        return data;
        
    } catch (error) {
        console.error('Error fetching portfolio:', error);
        return [];
    }
}

// ============================================
// GET STUDENT LEADERBOARD
// ============================================

export async function getLeaderboard(limit = 20) {
    try {
        const { data, error } = await supabase
            .from('student_scores')
            .select('student_id, current_score, current_badge, users(name, avatar_url)')
            .order('current_score', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data;
        
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}

// ============================================
// GET PUBLIC PORTFOLIO URL
// ============================================

export function getPublicPortfolioUrl(username) {
    return `${window.location.origin}/portfolio/${encodeURIComponent(username)}`;
}

// ============================================
// SHARE PORTFOLIO
// ============================================

export async function sharePortfolio(studentId) {
    try {
        const { data: student } = await supabase
            .from('users')
            .select('name')
            .eq('id', studentId)
            .single();
        
        const username = student.name.toLowerCase().replace(/\s+/g, '-');
        const url = getPublicPortfolioUrl(username);
        
        await navigator.clipboard.writeText(url);
        showToast('Portfolio link copied to clipboard!', 'success');
        return url;
        
    } catch (error) {
        console.error('Error sharing portfolio:', error);
        showToast('Failed to copy link', 'error');
        return null;
    }
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

export default {
    BADGE_CONFIG,
    SCORING,
    getStudentScore,
    updateStudentScore,
    getCurrentBadge,
    getNextBadge,
    getProgressToNextBadge,
    getQuestionsForBadge,
    getNextQuestion,
    submitAnswer,
    getPendingSubmissions,
    gradeSubmission,
    reportQuestion,
    requestDebateMatch,
    submitDebateArgument,
    submitMVPProposal,
    getStudentPortfolio,
    getLeaderboard,
    sharePortfolio,
    getPublicPortfolioUrl
};
