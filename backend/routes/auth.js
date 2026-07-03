const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase.js');

// ============================================
// HELPER: Generate Recovery Phrase
// ============================================
function generateRecoveryPhrase() {
    const words = [
        'blue', 'ocean', 'golden', 'sunset', 'brave', 'tiger', 'swift', 'eagle',
        'calm', 'river', 'mountain', 'forest', 'storm', 'thunder', 'peace', 'light',
        'shadow', 'dream', 'wonder', 'magic', 'silent', 'wisdom', 'courage', 'honor'
    ];
    
    const phrase = [];
    for (let i = 0; i < 6; i++) {
        phrase.push(words[Math.floor(Math.random() * words.length)]);
    }
    return phrase.join('-');
}

// ============================================
// REGISTER - Create new user (Supabase)
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { fullName, birthDay, birthMonth, password } = req.body;

        if (!fullName || !birthDay || !birthMonth || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Generate username and email
        const username = fullName.toLowerCase().replace(/\s/g, '') + Math.floor(Math.random() * 10000);
        const email = `${username}@gliimu.com`;
        const recoveryPhrase = generateRecoveryPhrase();

        // 1. Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                name: fullName,
                username: username
            }
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({
                success: false,
                message: authError.message || 'Failed to create user'
            });
        }

        // 2. Create user profile
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: authData.user.id,
                name: fullName,
                username: username,
                email: email,
                role: 'user',
                plan: 'basic',
                wallet_balance: 25000,
                gp_points: 0,
                status: 'active',
                application_status: 'none',
                birth_day: parseInt(birthDay),
                birth_month: parseInt(birthMonth),
                recovery_phrase: recoveryPhrase,
                referral_code: `GLM-${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            });

        if (profileError) {
            console.error('Profile error:', profileError);
            // Rollback: Delete the auth user
            await supabase.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({
                success: false,
                message: 'Failed to create user profile'
            });
        }

        // 3. Return success with credentials
        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: {
                username: username,
                email: email,
                recoveryPhrase: recoveryPhrase,
                fullName: fullName
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ============================================
// LOGIN (Supabase)
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Find user in profiles
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, username, email, name, role, wallet_balance, gp_points, plan, recovery_phrase, avatar_url')
            .eq('username', username.toLowerCase())
            .maybeSingle();

        if (profileError || !profile) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password: password
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Return user data
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: profile.id,
                username: profile.username,
                name: profile.name,
                email: profile.email,
                role: profile.role || 'user',
                plan: profile.plan || 'basic',
                walletBalance: profile.wallet_balance || 25000,
                gpPoints: profile.gp_points || 0,
                recoveryPhrase: profile.recovery_phrase,
                avatar: profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=fbb040&color=fff`
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ============================================
// RESET PASSWORD - With Recovery + DOB
// ============================================
router.post('/reset-password', async (req, res) => {
    try {
        const { username, recoveryPhrase, birthDay, birthMonth, newPassword } = req.body;

        // Validate input
        if (!username || !recoveryPhrase || !birthDay || !birthMonth || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }

        // 1. Find user
        const { data: user, error: userError } = await supabase
            .from('user_profiles')
            .select('id, username, email, recovery_phrase, birth_day, birth_month')
            .eq('username', username.toLowerCase())
            .maybeSingle();

        if (userError || !user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // 2. Verify recovery phrase
        if (!user.recovery_phrase) {
            return res.status(400).json({
                success: false,
                message: 'No recovery phrase set for this account'
            });
        }

        if (user.recovery_phrase.toLowerCase().trim() !== recoveryPhrase.toLowerCase().trim()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid recovery phrase'
            });
        }

        // 3. Verify date of birth
        if (Number(user.birth_day) !== Number(birthDay) ||
            Number(user.birth_month) !== Number(birthMonth)) {
            return res.status(400).json({
                success: false,
                message: 'Date of birth does not match our records'
            });
        }

        // 4. Generate new recovery phrase
        const newRecoveryPhrase = generateRecoveryPhrase();

        // 5. Update password using Supabase Admin API
        const { error: authError } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );

        if (authError) {
            console.error('Auth update error:', authError);
            return res.status(500).json({
                success: false,
                message: 'Failed to update password. Please try again.'
            });
        }

        // 6. Update recovery phrase in profile
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                recovery_phrase: newRecoveryPhrase,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (profileError) {
            console.error('Profile update error:', profileError);
            // Auth password is already updated, but log the error
            // We'll still return success since password is updated
        }

        // 7. Return new credentials
        res.json({
            success: true,
            message: 'Password reset successfully',
            data: {
                username: user.username,
                newPassword: newPassword,
                newRecoveryPhrase: newRecoveryPhrase
            }
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.'
        });
    }
});

// ============================================
// GET USER BY USERNAME (Helper)
// ============================================
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const { data: user, error } = await supabase
            .from('user_profiles')
            .select('id, username, name, email, role, wallet_balance, gp_points, plan, recovery_phrase, avatar_url')
            .eq('username', username.toLowerCase())
            .maybeSingle();

        if (error || !user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: user
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
