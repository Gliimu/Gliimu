require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Paystack webhook — needs the RAW body for HMAC signature verification,
// so it must be registered before express.json() consumes the stream.
app.post('/api/paystack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.error('Paystack webhook: PAYSTACK_SECRET_KEY missing.');
      return res.sendStatus(500);
    }

    const signature = String(req.headers['x-paystack-signature'] || '');
    const expected = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.error('Paystack webhook: invalid signature.');
      return res.sendStatus(401);
    }

    const event = JSON.parse(req.body.toString('utf8'));
    if (event && event.event === 'charge.success' && event.data) {
      const tx = event.data;
      const userId = tx.metadata && tx.metadata.user_id;
      const amountNaira = Math.round((tx.amount || 0) / 100);
      if (userId && amountNaira >= 100 && tx.reference) {
        const result = await creditWalletFromPaystack(userId, amountNaira, tx.reference, 'paystack');
        console.log('Paystack webhook credit:', tx.reference, JSON.stringify(result));
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.sendStatus(500);
  }
});

app.use(express.json());

// Simple root route to test if server is alive
app.get('/', (req, res) => {
  res.send('Gliimu Server is running!');
});

// Initialize Supabase Admin Client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================================
// PAYSTACK WALLET FUNDING
// ==========================================
const PAYSTACK_API = 'https://api.paystack.co';

// credit_wallet_topup() is idempotent per reference, so the client verify
// call and the webhook can both fire without double-crediting.
async function creditWalletFromPaystack(userId, amountNaira, reference, provider) {
  const { data, error } = await supabaseAdmin.rpc('credit_wallet_topup', {
    p_user: userId,
    p_amount: amountNaira,
    p_reference: reference,
    p_provider: provider || 'paystack'
  });
  if (error) throw new Error(`credit_wallet_topup failed: ${error.message}`);
  return data;
}

// Client asks for a checkout URL; the user pays on Paystack's page.
app.post('/api/paystack/init', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Paystack is not configured yet.' });

    const { userId, amount, callbackUrl } = req.body || {};
    const amountNaira = Math.round(Number(amount));
    if (!userId || !Number.isFinite(amountNaira) || amountNaira < 100) {
      return res.status(400).json({ error: 'Invalid funding request.' });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData || !userData.user || !userData.user.email) {
      return res.status(400).json({ error: 'Could not resolve your account email.' });
    }

    const reference = `GLI-PS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify({
        email: userData.user.email,
        amount: amountNaira * 100, // Paystack expects kobo
        reference,
        callback_url: typeof callbackUrl === 'string' && /^https?:\/\//.test(callbackUrl) ? callbackUrl : undefined,
        metadata: { user_id: userId }
      })
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data) {
      console.error('Paystack init rejected:', data);
      return res.status(502).json({ error: 'Paystack could not start the checkout.' });
    }

    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch (error) {
    console.error('Paystack init error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Client-side confirmation right after the redirect back; webhook stays the fallback.
app.post('/api/paystack/verify', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Paystack is not configured yet.' });

    const { reference } = req.body || {};
    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Missing reference.' });
    }

    const response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { 'Authorization': `Bearer ${secret}` }
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data) {
      return res.status(502).json({ error: 'Paystack verification failed.' });
    }

    const tx = data.data;
    if (tx.status !== 'success') {
      return res.json({ credited: false, reason: tx.status || 'not_successful' });
    }

    const userId = tx.metadata && tx.metadata.user_id;
    const amountNaira = Math.round((tx.amount || 0) / 100);
    if (!userId || amountNaira < 100) {
      return res.status(400).json({ error: 'Payment metadata is incomplete.' });
    }

    const result = await creditWalletFromPaystack(userId, amountNaira, tx.reference || reference, 'paystack');
    res.json({
      credited: !!(result && result.credited),
      amount: amountNaira,
      reason: (result && result.reason) || null
    });
  } catch (error) {
    console.error('Paystack verify error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// GLIIM-PA AI CHAT ROUTE
// ==========================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      console.error("Missing DEEPSEEK_API_KEY in Render Environment Variables.");
      return res.status(500).json({ error: 'Server missing API Key.' });
    }

    const systemPrompt = {
      role: 'system',
      content: 'You are Gliim-PA, an elite personal assistant for the Gliimu EdTech platform. Your users are "Gliimaits" training to become Full Stack Media Architects. Keep responses concise, professional, and action-oriented.'
    };

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...messages],
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Rejected:', errorText);
      return res.status(500).json({ error: `DeepSeek Error: ${errorText}` });
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      const aiReply = data.choices[0].message.content;
      res.json({ reply: aiReply });
    } else {
      console.error('Unexpected DeepSeek Response:', data);
      res.status(500).json({ error: 'AI returned no choices.' });
    }

  } catch (error) {
    console.error('Server Crash:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// SECURE PASSWORD RESET ROUTE
// ==========================================
app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, recoveryPhrase, newPassword } = req.body;

    // 1. Fetch user by username to verify recovery phrase
    const { data: userData, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('id, recovery_phrase, username')
      .ilike('username', username) // Use ilike for case-insensitive matching
      .maybeSingle();

    if (fetchError) {
      console.error("Database fetch error:", fetchError);
      // Send the EXACT error message back to the frontend so we can see it
      return res.status(500).json({ error: `DB Error: ${fetchError.message}` });
    }

    if (!userData) {
      return res.status(404).json({ error: 'User not found. Check your username.' });
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

// Start Server
app.listen(PORT, () => {
  console.log(`Gliimu Server running on port ${PORT}`);
});
