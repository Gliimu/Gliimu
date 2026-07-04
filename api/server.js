// api/server.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase Admin Client with Service Role Key
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Health check endpoint (for Render)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Secure API is running!',
    timestamp: new Date().toISOString()
  });
});

// Password Reset Endpoint
app.post('/api/reset-password', async (req, res) => {
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

  try {
    // 1. Find user by username
    const { data: user, error: userError } = await supabaseAdmin
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
    if (user.recovery_phrase?.toLowerCase() !== recoveryPhrase.toLowerCase()) {
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
    const words = [
      'blue', 'ocean', 'golden', 'sunset', 'brave', 'tiger', 'swift', 'eagle',
      'calm', 'river', 'mountain', 'forest', 'storm', 'thunder', 'peace', 'light',
      'shadow', 'dream', 'wonder', 'magic', 'silent', 'wisdom', 'courage', 'honor'
    ];
    
    const newRecoveryPhrase = Array.from({ length: 6 }, () => 
      words[Math.floor(Math.random() * words.length)]
    ).join('-');

    // 5. Update password using Admin API
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (authError) {
      console.error('Auth update error:', authError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update password' 
      });
    }

    // 6. Update recovery phrase in profile
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        recovery_phrase: newRecoveryPhrase,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Don't return error - password is already updated
    }

    // 7. Return success with new credentials
    res.json({
      success: true,
      message: 'Password reset successfully!',
      data: {
        username: user.username,
        newPassword: newPassword,
        newRecoveryPhrase: newRecoveryPhrase
      }
    });

  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An internal error occurred' 
    });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`🚀 Secure API running on port ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/api/health`);
});
