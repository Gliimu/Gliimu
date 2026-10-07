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

      if (tx.metadata && tx.metadata.kind === 'bill' && tx.metadata.cycle_id && tx.reference) {
        const result = await settleBillCycle(tx.metadata.cycle_id, tx.reference);
        console.log('Paystack webhook bill settle:', tx.reference, JSON.stringify(result));
        if (result && result.ok && !result.dedupe && userId) {
          await sendAiNotice(userId, `Payment received — your Use n' Pay bill of ₦${Number(result.total || 0).toLocaleString()} is settled. Your access is renewed with 30 days plus the 3 free days.`);
        }
      } else if (userId && amountNaira >= 100 && tx.reference) {
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

// billing_settle_cycle() is idempotent per cycle (status flips to 'paid'),
// so the client verify call and the webhook can both fire safely.
async function settleBillCycle(cycleId, reference) {
  const { data, error } = await supabaseAdmin.rpc('billing_settle_cycle', {
    p_cycle: Number(cycleId),
    p_reference: reference
  });
  if (error) throw new Error(`billing_settle_cycle failed: ${error.message}`);
  return data;
}

// Billing notices land in each user's Gliim-PA thread.
async function sendAiNotice(userId, content) {
  const { error } = await supabaseAdmin.from('messages').insert({
    sender_id: userId,
    is_ai: true,
    content
  });
  if (error) console.error('sendAiNotice failed:', error.message);
}

const APP_URL = (process.env.APP_URL || 'https://gliimu.com').replace(/\/+$/, '');

async function initPaystackTransaction({ email, amountNaira, reference, callbackUrl, metadata }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`
    },
    body: JSON.stringify({
      email,
      amount: amountNaira * 100, // Paystack expects kobo
      reference,
      callback_url: callbackUrl,
      metadata
    })
  });
  const data = await response.json();
  if (!response.ok || !data.status || !data.data) {
    console.error('Paystack init rejected:', data);
    return { ok: false };
  }
  return { ok: true, authorization_url: data.data.authorization_url, reference: data.data.reference };
}

function billReference() {
  return `GLI-BILL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
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

    // Use n' Pay bill payment — settle the billing cycle, no wallet credit.
    if (tx.metadata && tx.metadata.kind === 'bill' && tx.metadata.cycle_id) {
      const result = await settleBillCycle(tx.metadata.cycle_id, tx.reference || reference);
      return res.json({
        settled: !!(result && result.ok),
        dedupe: !!(result && result.dedupe),
        total: (result && result.total) || 0,
        amount: amountNaira
      });
    }

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
// BILLING — USE N' PAY BILL CHECKOUT
// ==========================================
// The signed-in user pays their bill from the Billing page. Identity comes
// from the Supabase access token, never from the request body.
app.post('/api/billing/pay-bill', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Paystack is not configured yet.' });

    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user || !authData.user.email) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const userId = authData.user.id;

    let cycleQuery = supabaseAdmin.from('billing_cycles')
      .select('id, user_id, status, total_amount')
      .eq('user_id', userId)
      .in('status', ['processing', 'defaulted'])
      .gt('total_amount', 0)
      .order('id', { ascending: false })
      .limit(1);

    const { cycleId } = req.body || {};
    if (cycleId) cycleQuery = cycleQuery.eq('id', Number(cycleId));

    const { data: cycle, error: cycleError } = await cycleQuery.maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle || !cycle.total_amount || cycle.total_amount <= 0) {
      return res.json({ ok: false, code: 'NOTHING_DUE' });
    }

    const total = cycle.total_amount;
    const init = await initPaystackTransaction({
      email: authData.user.email,
      amountNaira: total,
      reference: billReference(),
      callbackUrl: `${APP_URL}/dashboard/#/wallet`,
      metadata: { kind: 'bill', user_id: userId, cycle_id: cycle.id }
    });
    if (!init.ok) return res.status(502).json({ error: 'Paystack could not start the checkout.' });

    await supabaseAdmin.rpc('billing_mark_processing', {
      p_cycle: cycle.id,
      p_reference: init.reference,
      p_url: init.authorization_url
    });

    res.json({ ok: true, authorization_url: init.authorization_url, reference: init.reference, total });
  } catch (error) {
    console.error('Billing pay-bill error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// MEDIA UPLOADS — CLOUDFLARE R2 (presigned PUT)
// ==========================================
// The browser uploads straight to R2 and this server only signs the URL, so
// no file bytes ever pass through Render. The access token decides the key
// prefix — a caller can never write into someone else's folder. When R2 is
// not configured the endpoint says so and the client falls back to Supabase
// Storage, so nothing breaks before the bucket exists.
const R2 = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  keyId: process.env.R2_ACCESS_KEY_ID || '',
  secret: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || 'gliimu',
  publicBase: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
};

const r2Ready = () => Boolean(R2.accountId && R2.keyId && R2.secret && R2.publicBase);

let r2Client = null;
function r2S3() {
  if (!r2Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2.keyId, secretAccessKey: R2.secret }
    });
  }
  return r2Client;
}

const MB = 1024 * 1024;
const MEDIA_TYPES = /^(image|video|audio)\//;
// Chat and library items have always accepted documents as well as media.
const DOC_TYPES = /^application\/(pdf|zip|x-zip-compressed|rtf|msword|epub\+zip|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.+-]+)$/;
const allows = (...patterns) => (type) => patterns.some(re => re.test(type));

// Some browsers report `application/octet-stream` for documents and archives,
// so the extension decides whenever the declared type says nothing.
const EXT_TYPES = {
  pdf: 'application/pdf', zip: 'application/zip', epub: 'application/epub+zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', md: 'text/markdown', rtf: 'application/rtf',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
};

function resolveContentType(body) {
  const declared = String((body && body.contentType) || '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const name = String((body && body.filename) || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXT_TYPES[ext] || '';
}

// Only the content type is signed: adding Content-Length to the signature
// breaks browser uploads, so `size` is the client's declaration and the cap
// is a guardrail, not a hard limit. R2 rejects anything over 5GB per PUT.
const UPLOAD_KINDS = {
  avatar:  { prefix: 'avatars/',          maxBytes: 10 * MB,  types: allows(/^image\//) },
  media:   { prefix: 'media/',            maxBytes: 500 * MB, types: allows(MEDIA_TYPES) },
  library: { prefix: 'library/',          maxBytes: 500 * MB, types: allows(MEDIA_TYPES, /^text\//, DOC_TYPES) },
  chat:    { prefix: 'chat_attachments/', maxBytes: 25 * MB,  types: allows(MEDIA_TYPES, /^text\//, DOC_TYPES) },
  deal:    { prefix: 'deal_logos/',       maxBytes: 10 * MB,  types: allows(/^image\//) },
  site:    { prefix: 'site_assets/',      maxBytes: 25 * MB,  types: allows(/^(image|video)\//), adminOnly: true }
};

app.post('/api/upload/presign', async (req, res) => {
  try {
    if (!r2Ready()) return res.json({ ok: false, code: 'R2_NOT_CONFIGURED' });

    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const userId = authData.user.id;

    const { kind, size, filename } = req.body || {};
    const spec = UPLOAD_KINDS[kind];
    if (!spec) return res.status(400).json({ error: 'Unknown upload kind.' });

    const type = resolveContentType(req.body);
    if (!type) return res.status(400).json({ error: 'Missing content type.' });
    if (!spec.types(type)) return res.status(400).json({ error: 'That file type is not allowed here.' });

    const bytes = Number(size);
    if (!Number.isFinite(bytes) || bytes <= 0) return res.status(400).json({ error: 'Missing file size.' });
    if (bytes > spec.maxBytes) {
      return res.status(413).json({ error: `That file is over the ${Math.round(spec.maxBytes / MB)}MB limit.` });
    }

    if (spec.adminOnly) {
      const { data: profile } = await supabaseAdmin.from('profiles')
        .select('is_admin').eq('id', userId).maybeSingle();
      if (!profile || !profile.is_admin) return res.status(403).json({ error: 'Admins only.' });
    }

    const safeName = String(filename || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(-60) || 'file';
    const key = `${spec.prefix}${userId}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const url = await getSignedUrl(r2S3(), new PutObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      ContentType: type
    }), { expiresIn: 900 });

    res.json({ ok: true, url, key, contentType: type, publicUrl: `${R2.publicBase}/${key}` });
  } catch (error) {
    console.error('R2 presign error:', error);
    res.status(500).json({ error: 'Could not start the upload.' });
  }
});

// ==========================================
// BILLING — DAILY RUNNER (external cron)
// ==========================================
// Point a cron service at this once a day (Render free tier sleeps, so an
// external scheduler is required). Auth: x-billing-secret header or ?secret=.
app.all('/api/billing/run', async (req, res) => {
  try {
    const secret = process.env.BILLING_CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'BILLING_CRON_SECRET is not configured.' });

    const provided = String(req.get('x-billing-secret') || req.query.secret || '');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const summary = { closed: null, links: [], enforced: null, errors: [] };

    const { data: closed, error: closeError } = await supabaseAdmin.rpc('billing_close_due_cycles');
    if (closeError) throw closeError;
    summary.closed = closed;

    // Due bills: mint a Paystack link, store it, and DM the payer.
    for (const due of (closed && closed.due) || []) {
      try {
        const { data: cycle } = await supabaseAdmin.from('billing_cycles')
          .select('id, payment_url')
          .eq('id', due.cycle_id)
          .maybeSingle();
        if (!cycle || cycle.payment_url) continue;

        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(due.user_id);
        if (!userData || !userData.user || !userData.user.email) {
          summary.errors.push(`no email for user ${due.user_id}`);
          continue;
        }

        const init = await initPaystackTransaction({
          email: userData.user.email,
          amountNaira: due.total,
          reference: billReference(),
          callbackUrl: `${APP_URL}/dashboard/#/wallet`,
          metadata: { kind: 'bill', user_id: due.user_id, cycle_id: due.cycle_id }
        });
        if (!init.ok) {
          summary.errors.push(`paystack init failed for cycle ${due.cycle_id}`);
          continue;
        }

        await supabaseAdmin.rpc('billing_mark_processing', {
          p_cycle: due.cycle_id,
          p_reference: init.reference,
          p_url: init.authorization_url
        });
        summary.links.push({ cycle_id: due.cycle_id, user_id: due.user_id });

        await sendAiNotice(due.user_id,
          `Your Use n' Pay bill of ₦${Number(due.total).toLocaleString()} is ready. Pay within 3 days right here: ${init.authorization_url} — or tap Pay Bill on the Billing page.`);
      } catch (e) {
        summary.errors.push(`cycle ${due.cycle_id}: ${e.message}`);
      }
    }

    for (const t of (closed && closed.converted_trials) || []) {
      await sendAiNotice(t.user_id,
        `Your 3-day free trial has ended — welcome to Use n' Pay! Based on your trial activity, a full month would run about ₦${Number(t.preview || 0).toLocaleString()}. You're only billed at month's end for what you actually use.`);
    }

    for (const p of (closed && closed.downgraded_pro) || []) {
      await sendAiNotice(p.user_id,
        `Your Pro year has ended, so the account moved to Pay n' Go — every open is now charged straight from your wallet. Top up, switch to Use n' Pay, or go Pro again any time from the Billing page.`);
    }

    for (const rn of (closed && closed.renewed_free) || []) {
      await sendAiNotice(rn.user_id,
        `Your Use n' Pay month renewed with ₦0 usage — no bill. Enjoy the new month!`);
    }

    const { data: enforced, error: enforceError } = await supabaseAdmin.rpc('billing_enforce_deadlines');
    if (enforceError) console.error('billing_enforce_deadlines failed:', enforceError.message);
    summary.enforced = enforced || null;

    for (const d of (enforced && enforced.defaulted) || []) {
      await sendAiNotice(d.user_id,
        `Your Use n' Pay bill is past its 3-day grace window and the account is paused on Pay n' Go. Settle it from Billing → Pay Bill to restore full access.`);
    }

    res.json({ ok: true, ...summary });
  } catch (error) {
    console.error('Billing run error:', error);
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
