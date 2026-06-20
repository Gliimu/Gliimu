// ============================================
// LOAD USER STATS - FIXED
// ============================================

async function loadUserStats() {
    try {
        // Calculate GP from progress
        userGP = userProgress.reduce((total, p) => {
            if (p.completed) {
                for (const phase of curriculumData) {
                    const module = phase.modules.find(m => m.id === parseInt(p.module_id) || m.name === p.module_name);
                    if (module) {
                        return total + module.gp;
                    }
                }
            }
            return total;
        }, 0);
        
        userStreak = parseInt(localStorage.getItem(`course_streak_${currentUser.id}`)) || 0;
        
        document.getElementById('gpPoints').textContent = userGP;
        document.getElementById('streakDays').textContent = userStreak;
        
        // Save stats - try update first, then insert
        try {
            // Check if record exists
            const { data: existing, error: checkError } = await supabase
                .from('user_stats')
                .select('user_id')
                .eq('user_id', currentUser.id)
                .maybeSingle();
            
            if (checkError) {
                console.warn('Stats check warning:', checkError.message);
            }
            
            if (existing) {
                // Update existing record
                const { error: updateError } = await supabase
                    .from('user_stats')
                    .update({
                        total_gp: userGP,
                        current_streak: userStreak,
                        modules_completed: userProgress.filter(p => p.completed).length,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', currentUser.id);
                
                if (updateError) {
                    console.warn('Stats update warning:', updateError.message);
                }
            } else {
                // Insert new record
                const { error: insertError } = await supabase
                    .from('user_stats')
                    .insert({
                        user_id: currentUser.id,
                        total_gp: userGP,
                        current_streak: userStreak,
                        modules_completed: userProgress.filter(p => p.completed).length,
                        updated_at: new Date().toISOString()
                    });
                
                if (insertError && insertError.code !== '23505') {
                    console.warn('Stats insert warning:', insertError.message);
                }
            }
        } catch (statsError) {
            console.warn('Stats operation warning:', statsError);
        }
        
    } catch (error) {
        console.error('Error loading stats:', error);
        userGP = 0;
        userStreak = 0;
    }
}

// ============================================
// COMPLETE MODULE - FIXED STATS UPDATE
// ============================================

async function completeModule(moduleId) {
    let module = null;
    for (const phase of curriculumData) {
        const found = phase.modules.find(m => m.id === moduleId);
        if (found) {
            module = found;
            break;
        }
    }
    
    if (!module) return;
    
    const alreadyCompleted = userProgress.some(p => 
        (p.module_id === moduleId.toString() || p.module_name === module.name) && p.completed
    );
    
    if (alreadyCompleted) {
        showToast('Module already completed!', 'info');
        return;
    }
    
    showToast(`Completing "${module.name}"...`, 'info');
    
    try {
        // Save to module_progress
        const { error } = await supabase
            .from('module_progress')
            .insert({
                user_id: currentUser.id,
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true,
                completed_at: new Date().toISOString(),
                xp_earned: module.gp
            });
        
        if (error) {
            console.warn('DB error:', error.message);
            userProgress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true
            });
            saveProgressToLocalStorage();
        } else {
            userProgress.push({
                module_id: moduleId.toString(),
                module_name: module.name,
                completed: true
            });
            saveProgressToLocalStorage();
        }
        
        // Update GP
        userGP += module.gp;
        document.getElementById('gpPoints').textContent = userGP;
        
        // Update streak
        userStreak = Math.min(userStreak + 1, 30);
        localStorage.setItem(`course_streak_${currentUser.id}`, userStreak.toString());
        document.getElementById('streakDays').textContent = userStreak;
        
        // Update stats - try update first, then insert
        try {
            // Check if record exists
            const { data: existing, error: checkError } = await supabase
                .from('user_stats')
                .select('user_id')
                .eq('user_id', currentUser.id)
                .maybeSingle();
            
            if (!checkError) {
                if (existing) {
                    // Update existing
                    await supabase
                        .from('user_stats')
                        .update({
                            total_gp: userGP,
                            current_streak: userStreak,
                            modules_completed: userProgress.filter(p => p.completed).length,
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', currentUser.id);
                } else {
                    // Insert new
                    await supabase
                        .from('user_stats')
                        .insert({
                            user_id: currentUser.id,
                            total_gp: userGP,
                            current_streak: userStreak,
                            modules_completed: userProgress.filter(p => p.completed).length,
                            updated_at: new Date().toISOString()
                        });
                }
            }
        } catch (statsError) {
            // Silently fail - stats are optional
        }
        
        notifyParent('moduleCompleted', {
            moduleId: module.id,
            moduleName: module.name,
            gpEarned: module.gp,
            newTotalGP: userGP
        });
        
        celebrateCompletion(module);
        renderCurriculum();
        updateOverallStats();
        await checkAchievements();
        renderAchievements();
        await loadLeaderboard();
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Failed to mark module complete', 'error');
    }
}
