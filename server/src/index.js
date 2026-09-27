require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('Gliimu Server is running!'));

// Initialize Supabase Admin Client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================================
// SECURE PASSWORD RESET ROUTE
// ==========================================
app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, recoveryPhrase, newPassword } = req.body;
    const fakeEmail = `${username}@gliimu.app`;

    // 1. Fetch user by email to verify recovery phrase
    const { data: userData, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, recovery_phrase')
      .eq('username', username)
      .single();

    if (fetchError || !userData) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // 2. Verify Phrase
    if (userData.recovery_phrase !== recoveryPhrase) {
      return res.status(403).json({ error: 'Invalid recovery phrase.' });
    }

    // 3. Update Password in Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userData.id,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update password.' });
    }

    // 4. Generate New Recovery Phrase
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let newPhrase = [];
    for (let i = 0; i < 4; i++) {
      let block = '';
      for (let j = 0; j < 4; j++) {
        block += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      newPhrase.push(block);
    }
    const newRecoveryPhrase = newPhrase.join('-');

    // 5. Save New Phrase to Database
    await supabaseAdmin
      .from('profiles')
      .update({ recovery_phrase: newRecoveryPhrase })
      .eq('id', userData.id);

    // 6. Return new phrase to user
    res.json({ success: true, newRecoveryPhrase });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DeepSeek Chat Route (Keep your existing one if you have it)
app.post('/api/chat', async (req, res) => {
  // ... (your existing Gliim-PA code)
});

app.listen(PORT, () => console.log(`Gliimu Server running on port ${PORT}`));
