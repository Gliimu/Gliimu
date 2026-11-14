require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://www.gliimu.com', 'https://gliimu.com', 'https://admin.gliimu.com'],
  credentials: true
}));

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
    if (event.event === 'charge.success' && event.data) {
      const tx = event.data;
      const userId = tx.metadata && tx.metadata.user_id;
      const amountNaira = Math.round((tx.amount || 0) / 100);

      if (tx.metadata && tx.metadata.kind === 'gliits_topup' && userId) {
        const gliitsAmount = tx.metadata.gliits_amount || amountNaira;
        const result = await topupGliitsWallet(userId, gliitsAmount, tx.reference);
        console.log('Paystack webhook gliits topup:', tx.reference, JSON.stringify(result));
        if (result && result.ok && userId) {
          await sendAiNotice(userId, `Wallet credited with G${Number(gliitsAmount).toLocaleString()}. Happy browsing!`);
        }
      } else if (userId && amountNaira >= 100 && tx.reference) {
        const result = await topupGliitsWallet(userId, amountNaira, tx.reference);
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

// Direct wallet credit via service role — webhooks have no auth context,
// so the gliits_topup_wallet RPC (which uses auth.uid()) can't be called here.
async function topupGliitsWallet(userId, amountGliits, reference) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error(`profile lookup failed: ${profileError.message}`);
  if (!profile) throw new Error(`user ${userId} not found`);

  const newBalance = Number(profile.wallet_balance || 0) + Number(amountGliits);

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ wallet_balance: newBalance })
    .eq('id', userId);
  if (updateError) throw new Error(`wallet update failed: ${updateError.message}`);

  const { error: logError } = await supabaseAdmin
    .from('gliits_topups')
    .insert({ user_id: userId, amount_gliits: amountGliits, payment_reference: reference, payment_status: 'success' });
  if (logError) console.warn('gliits_topups log failed:', logError.message);

  return { ok: true, balance: newBalance, credited: amountGliits };
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

    if (tx.metadata && tx.metadata.kind === 'gliits_topup' && userId) {
      const gliitsAmount = tx.metadata.gliits_amount || amountNaira;
      const result = await topupGliitsWallet(userId, gliitsAmount, tx.reference || reference);
      return res.json({ credited: !!(result && result.ok), amount: gliitsAmount, gliits: gliitsAmount });
    }

    if (!userId || amountNaira < 100) {
      return res.status(400).json({ error: 'Payment metadata is incomplete.' });
    }

    const result = await topupGliitsWallet(userId, amountNaira, tx.reference || reference);
    res.json({
      credited: !!(result && result.ok),
      amount: amountNaira
    });
  } catch (error) {
    console.error('Paystack verify error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// GLIITS — HEARTBEAT (per-minute usage tracking)
// ==========================================
// The client sends a heartbeat every minute while the user is active.
// For payngo users, this deducts G3 and credits the creator (if viewing a post).
// For monthly/yearly users, it just logs usage and credits the creator.
app.post('/api/gliits/heartbeat', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { postId } = req.body || {};
    // gliits_heartbeat reads auth.uid() internally, so it must be called with
    // the user's JWT — the service-role client has no user context.
    const userClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    );
    const { data, error } = await userClient.rpc('gliits_heartbeat', {
      p_post_id: postId || null
    });
    if (error) {
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return res.json({ ok: false, code: 'INSUFFICIENT_BALANCE' });
      }
      if (error.message === 'NO_ACTIVE_PLAN') {
        return res.json({ ok: false, code: 'NO_ACTIVE_PLAN' });
      }
      throw error;
    }

    res.json({ ok: true, ...data });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// GLIITS — TOP-UP INIT (Paystack checkout)
// ==========================================
// Client sends the Gliits amount they want to buy; server calculates the
// Naira equivalent using the exchange rate and starts a Paystack transaction.
app.post('/api/gliits/topup-init', async (req, res) => {
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

    const { gliitsAmount, callbackUrl } = req.body || {};
    const amount = Math.round(Number(gliitsAmount));
    if (!Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({ error: 'Invalid top-up amount.' });
    }

    const { data: config } = await supabaseAdmin
      .from('gliits_config')
      .select('exchange_rate_naira_to_gliits, min_topup_gliits')
      .eq('id', 1)
      .maybeSingle();

    const minTopup = (config && config.min_topup_gliits) || 100;
    if (amount < minTopup) {
      return res.status(400).json({ error: `Minimum top-up is G${minTopup}.` });
    }

    const rate = (config && config.exchange_rate_naira_to_gliits) || 1;
    const amountNaira = Math.ceil(amount * rate);

    const reference = `GLI-TOP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const init = await initPaystackTransaction({
      email: authData.user.email,
      amountNaira,
      reference,
      callbackUrl: typeof callbackUrl === 'string' && /^https?:\/\//.test(callbackUrl) ? callbackUrl : `${APP_URL}/dashboard/#/wallet`,
      metadata: { kind: 'gliits_topup', user_id: userId, gliits_amount: amount }
    });
    if (!init.ok) return res.status(502).json({ error: 'Paystack could not start the checkout.' });

    res.json({ authorization_url: init.authorization_url, reference: init.reference, amountNaira, gliitsAmount: amount });
  } catch (error) {
    console.error('Topup init error:', error);
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
      credentials: { accessKeyId: R2.keyId, secretAccessKey: R2.secret },
      // The SDK computes a CRC32 over the request body, but a presigned PUT has
      // no body here — the browser supplies it later — so it stamps the checksum
      // of an empty string and R2 rejects every upload. R2's rejection carries no
      // CORS headers, so the browser blames CORS instead of the checksum.
      requestChecksumCalculation: 'WHEN_REQUIRED'
    });
  }
  return r2Client;
}

const MB = 1024 * 1024;
const MEDIA_TYPES = /^(image|video|audio)\//;
// Chat and library items have always accepted documents as well as media.
const DOC_TYPES = /^application\/(pdf|zip|x-zip-compressed|rtf|msword|epub\+zip|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[\w.+-]+)$/;
// Desktop and mobile installers. Deliberately narrow: nothing here is a type a
// browser will render, so an uploaded build can never execute on the CDN origin.
const APP_TYPES = /^application\/(octet-stream|vnd\.microsoft\.portable-executable|x-msdownload|x-apple-diskimage|vnd\.apple\.installer\+xml|vnd\.android\.package-archive|vnd\.debian\.binary-package|x-rpm|x-tar|gzip|x-7z-compressed|zip|x-zip-compressed)$/;
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
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  // App installers. Every one of these is a type no browser will render, so
  // serving them from the CDN downloads the file instead of opening it.
  exe: 'application/vnd.microsoft.portable-executable', msi: 'application/x-msdownload',
  dmg: 'application/x-apple-diskimage', pkg: 'application/vnd.apple.installer+xml',
  apk: 'application/vnd.android.package-archive', aab: 'application/octet-stream',
  ipa: 'application/octet-stream', appimage: 'application/octet-stream',
  deb: 'application/vnd.debian.binary-package', rpm: 'application/x-rpm',
  tar: 'application/x-tar', gz: 'application/gzip', tgz: 'application/gzip', '7z': 'application/x-7z-compressed'
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
  // Landing page media. Gated on the admin app's role
  // system, not the legacy profiles.is_admin flag; 'super' implies it.
  site:    { prefix: 'site_assets/',      maxBytes: 50 * MB,  types: allows(/^(image|video)\//), adminRole: 'operations' },
  // Installers behind the landing page's download buttons. The bytes go
  // browser → R2, so the cap only guards against a mistaken huge file; R2
  // itself refuses a single PUT over 5GB.
  app:     { prefix: 'app_builds/',       maxBytes: 2048 * MB, types: allows(APP_TYPES), adminRole: 'operations' }
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

    let type = resolveContentType(req.body);
    if (!type) return res.status(400).json({ error: 'Missing content type.' });
    if (!spec.types(type)) {
      // Browsers disagree about installer types — a .dmg arrives as
      // application/x-apple-diskimage from Safari and as octet-stream from
      // Chrome — so fall back to what the extension says when that is allowed.
      const name = String(filename || '');
      const byExt = EXT_TYPES[name.includes('.') ? name.split('.').pop().toLowerCase() : ''] || '';
      if (!byExt || !spec.types(byExt)) return res.status(400).json({ error: 'That file type is not allowed here.' });
      type = byExt;
    }

    const bytes = Number(size);
    if (!Number.isFinite(bytes) || bytes <= 0) return res.status(400).json({ error: 'Missing file size.' });
    if (bytes > spec.maxBytes) {
      return res.status(413).json({ error: `That file is over the ${Math.round(spec.maxBytes / MB)}MB limit.` });
    }

    if (spec.adminRole) {
      // Fails closed: if admin_has_role() is missing or errors, the upload
      // is refused rather than allowed.
      const { data: allowed } = await supabaseAdmin.rpc('admin_has_role', {
        p_user: userId,
        p_role: spec.adminRole
      });
      if (allowed !== true) return res.status(403).json({ error: 'Admins only.' });
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

// ==========================================
// CONTENT DELETION — DB + R2 CLEANUP
// ==========================================
// One endpoint for member and admin deletes. Collects every R2 URL attached to
// the gliim (cover, media, block images), removes the objects from the bucket,
// then wipes the DB rows.
//
// Auth: Bearer token. Ownership check for members; admin_has_role('crm') for
// admins.

function extractR2Keys(urls) {
  if (!r2Ready()) return [];
  const base = R2.publicBase;
  const keys = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    if (raw.startsWith(base + '/')) {
      keys.push(raw.slice(base.length + 1));
    } else if (raw.startsWith('http')) {
      try {
        const u = new URL(raw);
        if (u.hostname === new URL(base).hostname) {
          keys.push(u.pathname.replace(/^\//, ''));
        }
      } catch (_) { /* skip malformed */ }
    }
  }
  return [...new Set(keys)];
}

function collectUrlsFromBlocks(blocks) {
  const urls = [];
  if (!Array.isArray(blocks)) return urls;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.url) urls.push(b.url);
    if (b.content && typeof b.content === 'string' && /^https?:\/\//.test(b.content)) urls.push(b.content);
    if (b.src) urls.push(b.src);
  }
  return urls;
}

function collectUrlsFromFiles(files) {
  const urls = [];
  if (!Array.isArray(files)) return urls;
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    if (f.url) urls.push(f.url);
    if (f.file_url) urls.push(f.file_url);
  }
  return urls;
}

async function deleteR2Objects(keys) {
  if (!keys.length || !r2Ready()) return { deleted: 0, failed: 0 };
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = r2S3();
  let deleted = 0, failed = 0;
  for (const key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: R2.bucket, Key: key }));
      deleted++;
    } catch (err) {
      console.warn(`R2 delete failed for ${key}:`, err.message);
      failed++;
    }
  }
  return { deleted, failed };
}

app.delete('/api/content/:id', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const callerId = authData.user.id;
    const itemId = req.params.id;

    // Finalising a deletion is an Operations action. admin_has_role returns
    // true for any role when the caller is a super admin, so one check covers
    // both. Members trash their own work through the gliim_trash RPC instead.
    const { data: isOps } = await supabaseAdmin.rpc('admin_has_role', {
      p_user: callerId, p_role: 'operations'
    });
    if (isOps !== true) return res.status(403).json({ error: 'Operations only.' });

    const { data: gliim } = await supabaseAdmin
      .from('feed_gliims')
      .select('id, user_id, title, cover_url, media_url, deleted_at')
      .eq('id', itemId).maybeSingle();
    if (!gliim) return res.status(404).json({ error: 'Item not found.' });
    // The 30-day window is only skippable by Operations, and only from inside
    // the Trash queue — nothing gets destroyed that was never moved there.
    if (!gliim.deleted_at) {
      return res.status(400).json({ error: 'Move the Gliim to the Trash first.' });
    }

    const allUrls = [gliim.cover_url, gliim.media_url];
    const { data: gc } = await supabaseAdmin
      .from('feed_gliim_contents').select('blocks').eq('post_id', itemId).maybeSingle();
    if (gc?.blocks) {
      allUrls.push(...collectUrlsFromBlocks(gc.blocks));
    }

    const r2Keys = extractR2Keys(allUrls.filter(Boolean));
    const r2Result = await deleteR2Objects(r2Keys);

    await supabaseAdmin.from('feed_interactions').delete().eq('post_id', itemId);
    await supabaseAdmin.from('reports').delete().eq('target_type', 'post').eq('target_id', itemId);
    await supabaseAdmin.from('feed_gliim_contents').delete().eq('post_id', itemId);
    await supabaseAdmin.from('feed_gliims').delete().eq('id', itemId);

    // link_post cascades off the post row, so the notice is written after the
    // deletion and points at nothing.
    if (gliim.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: gliim.user_id,
        actor_id: callerId,
        kind: 'review',
        title: gliim.title
          ? `"${gliim.title}" was permanently deleted by Operations.`
          : 'One of your Gliims was permanently deleted by Operations.'
      });
    }

    res.json({
      deleted: true,
      type: 'feed_gliim',
      r2_deleted: r2Result.deleted,
      r2_failed: r2Result.failed
    });
  } catch (error) {
    console.error('Content delete error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// R2 ORPHAN SWEEP — Find and delete files in R2 with no DB references
// POST /api/r2-sweep  { dryRun: true }  — list orphans without deleting
// POST /api/r2-sweep  { dryRun: false } — delete orphans
app.post('/api/r2-sweep', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const callerId = authData.user.id;

    // Operations runs the sweep from the Deleted queue once a day; super
    // admins pass because admin_has_role accepts any role for them.
    const { data: isOps } = await supabaseAdmin.rpc('admin_has_role', {
      p_user: callerId, p_role: 'operations'
    });
    if (!isOps) return res.status(403).json({ error: 'Operations only.' });

    if (!r2Ready()) return res.json({ error: 'R2_NOT_CONFIGURED' });

    const dryRun = req.body.dryRun !== false;
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const s3 = r2S3();

    // 1. List all R2 objects
    let allR2Keys = [];
    let continuationToken;
    do {
      const cmd = { Bucket: R2.bucket };
      if (continuationToken) cmd.ContinuationToken = continuationToken;
      const result = await s3.send(new ListObjectsV2Command(cmd));
      if (result.Contents) {
        allR2Keys.push(...result.Contents.map(obj => obj.Key));
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : null;
    } while (continuationToken);

    // 2. Collect all referenced URLs from DB
    const referencedUrls = new Set();

    // feed_gliims: cover_url, media_url
    // Trashed rows are included on purpose — their media must survive until
    // restore or the 30-day purge, otherwise restore would revive dead files.
    const { data: feedGliims } = await supabaseAdmin.from('feed_gliims').select('cover_url, media_url');
    feedGliims?.forEach(g => {
      if (g.cover_url) referencedUrls.add(g.cover_url);
      if (g.media_url) referencedUrls.add(g.media_url);
    });

    // feed_gliim_contents: blocks (JSON with URLs)
    const { data: gliimContents } = await supabaseAdmin.from('feed_gliim_contents').select('blocks');
    gliimContents?.forEach(gc => {
      if (gc.blocks) collectUrlsFromBlocks(gc.blocks).forEach(u => referencedUrls.add(u));
    });

    // profiles: avatar_url, portfolio_image_url
    const { data: profiles } = await supabaseAdmin.from('profiles').select('avatar_url, portfolio_image_url');
    profiles?.forEach(p => {
      if (p.avatar_url) referencedUrls.add(p.avatar_url);
      if (p.portfolio_image_url) referencedUrls.add(p.portfolio_image_url);
    });

    // site_settings: various URL columns
    const { data: settings } = await supabaseAdmin.from('site_settings').select(`
      hero_video_url, hero_mobile_video_url, hero_fallback_image_url,
      app_download_bg_url, app_windows_url, app_mac_url, app_linux_url,
      app_android_url, app_ios_url
    `);
    settings?.forEach(s => {
      Object.values(s).forEach(val => {
        if (val && typeof val === 'string' && val.startsWith(R2.publicBase)) {
          referencedUrls.add(val);
        }
      });
    });

    // 3. Convert referenced URLs to R2 keys
    const referencedKeys = new Set();
    referencedUrls.forEach(url => {
      if (url && url.startsWith(R2.publicBase)) {
        const key = url.substring(R2.publicBase.length + 1);
        referencedKeys.add(key);
      }
    });

    // 4. Find orphans
    const orphans = allR2Keys.filter(key => !referencedKeys.has(key));

    // 5. Delete if not dry run
    let deleted = 0, failed = 0;
    if (!dryRun && orphans.length > 0) {
      const result = await deleteR2Objects(orphans);
      deleted = result.deleted;
      failed = result.failed;
    }

    res.json({
      ok: true,
      dryRun,
      totalR2Files: allR2Keys.length,
      referencedFiles: referencedKeys.size,
      orphans: orphans.length,
      deleted,
      failed,
      orphanKeys: dryRun ? orphans : undefined
    });
  } catch (error) {
    console.error('R2 sweep error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// DAILY.CO — ROOM MANAGEMENT
// ==========================================
const DAILY_API = 'https://api.daily.co/v1';

async function dailyRequest(method, path, body = null) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) throw new Error('DAILY_API_KEY not configured');

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${DAILY_API}${path}`, opts);
  // Daily answers some requests (DELETE room) with 204 and no body at all, so
  // the payload has to be read as text and only then parsed.
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  if (!res.ok) {
    console.error('Daily.co API error:', method, path, JSON.stringify(data));
    const error = new Error((data && (data.error || data.message)) || `Daily.co request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Create a daily.co room for a live session
app.post('/api/daily/create-room', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: 'Missing requestId.' });

    // Verify user owns this request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('live_requests')
      .select('id, user_id, room_id, room_url')
      .eq('id', requestId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (reqError || !request) {
      return res.status(404).json({ error: 'Request not found or access denied.' });
    }

    // A session can ask to go on air more than once; never mint a second room.
    if (request.room_id && request.room_url) {
      return res.json({
        room_url: request.room_url,
        room_id: request.room_id,
        created: false
      });
    }

    // Create room via daily.co API
    const roomProps = {
      enable_chat: true,
      enable_screenshare: true,
      enable_prejoin_ui: false,
      start_video_off: false,
      start_audio_off: false
    };
    const room = await dailyRequest('POST', '/rooms', {
      name: `gliimu-${requestId}`,
      properties: roomProps
    });

    // Store room info in database
    const { error: updateError } = await supabaseAdmin
      .from('live_requests')
      .update({
        room_id: room.id,
        room_url: room.url
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to store room info:', updateError);
      await dailyRequest('DELETE', `/rooms/${room.id}`).catch(() => {});
      return res.status(500).json({ error: 'Failed to store room info.' });
    }

    res.json({ room_url: room.url, room_id: room.id, created: true });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// Generate a Daily.co meeting token for one member of a live session.
// Everyone in the call gets a token: the host gets owner privileges so
// mute/remove work mid-call, and participants get a plain token so there is
// a per-person identity those permission changes can act on.
app.post('/api/daily/meeting-token', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { roomId } = req.body || {};
    if (!roomId) return res.status(400).json({ error: 'Missing roomId.' });

    const { data: request } = await supabaseAdmin
      .from('live_requests')
      .select('id, user_id, status')
      .eq('room_id', roomId)
      .maybeSingle();

    if (!request) return res.status(404).json({ error: 'No session found for this room.' });
    if (request.status !== 'active') {
      return res.status(409).json({ error: 'This session is not on air.' });
    }

    const isOwner = request.user_id === authData.user.id;

    if (!isOwner) {
      const { data: kicked } = await supabaseAdmin
        .from('live_kicked_users')
        .select('id')
        .eq('session_id', request.id)
        .eq('user_id', authData.user.id)
        .maybeSingle();
      if (kicked) {
        return res.status(403).json({ error: 'You were removed from this session.', kicked: true });
      }
    }

    const meetingToken = await dailyRequest('POST', '/meeting-tokens', {
      properties: {
        room_name: `gliimu-${request.id}`,
        is_owner: isOwner,
        exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60
      }
    });

    res.json({ token: meetingToken.token, is_owner: isOwner });
  } catch (error) {
    console.error('Meeting token error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// The Live page list: sessions that are on air right now, plus the caller's
// own sessions that are still waiting for the host to go on air.
app.get('/api/live/public-sessions', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const callerId = authData.user.id;

    await supabaseAdmin.rpc('end_stale_live_sessions');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: active, error: activeError } = await supabaseAdmin
      .from('live_requests')
      .select('id, title, description, status, participant_count, started_at, created_at, user_id')
      .eq('status', 'active')
      .gt('started_at', oneHourAgo)
      .order('started_at', { ascending: false });

    if (activeError) {
      console.error('Public sessions query error:', activeError);
      return res.status(500).json({ error: 'Failed to fetch sessions: ' + activeError.message });
    }

    const { data: mine, error: mineError } = await supabaseAdmin
      .from('live_requests')
      .select('id, title, description, status, participant_count, started_at, created_at, user_id')
      .eq('status', 'open')
      .eq('user_id', callerId)
      .order('created_at', { ascending: false });

    if (mineError) console.error('Own open sessions query error:', mineError);

    const rows = [...(mine || []), ...(active || [])];
    const userIds = [...new Set(rows.map(s => s.user_id))];
    let profilesMap = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, verification_badge')
        .in('id', userIds);

      if (profiles) profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }

    res.json({
      sessions: rows.map(s => {
        const profile = profilesMap[s.user_id] || {};
        return {
          id: s.id,
          title: s.title,
          description: s.description,
          status: s.status,
          is_mine: s.user_id === callerId,
          participant_count: s.participant_count || 0,
          started_at: s.started_at,
          created_at: s.created_at,
          host_name: profile.full_name || 'Unknown',
          host_avatar: profile.avatar_url || null,
          host_verified: !!profile.verification_badge
        };
      })
    });
  } catch (error) {
    console.error('Public sessions error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// Delete a daily.co room when session ends
app.post('/api/daily/delete-room', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: 'Missing requestId.' });

    // Verify user owns this request
    const { data: request, error: reqError } = await supabaseAdmin
      .from('live_requests')
      .select('id, user_id, room_id')
      .eq('id', requestId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (reqError || !request || !request.room_id) {
      return res.status(404).json({ error: 'Request not found or no room to delete.' });
    }

    // Delete room via daily.co API. A room that is already gone is the outcome
    // we wanted, so 404 is not a failure here. Any other Daily error is a soft
    // one: this is teardown, and a 500 would only add noise to the console.
    // The room_id stays in the row so a later end can retry the delete.
    try {
      await dailyRequest('DELETE', `/rooms/${request.room_id}`);
    } catch (err) {
      if (err.status !== 404) {
        console.warn('Daily room delete failed, keeping room_id for retry:', err.message);
        return res.json({ ok: false, error: 'Could not delete the Daily room.' });
      }
    }

    // Clear room info from database
    await supabaseAdmin
      .from('live_requests')
      .update({ room_id: null, room_url: null })
      .eq('id', requestId);

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// ==========================================
// LIVE SESSION — Kick check
// ==========================================

// Check if user has been kicked from a session
app.post('/api/live/join-session', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: 'Missing requestId.' });

    // Check if user has been kicked from this session
    const { data: kicked } = await supabaseAdmin
      .from('live_kicked_users')
      .select('id')
      .eq('session_id', requestId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (kicked) {
      return res.status(403).json({ error: 'You were kicked out of this session.', kicked: true });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Join session check error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// Record a kicked user (host-only, prevents rejoin)
app.post('/api/live/kick', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { sessionId, targetUserId } = req.body || {};
    if (!sessionId || !targetUserId) return res.status(400).json({ error: 'Missing sessionId or targetUserId.' });

    // Verify caller is the host
    const { data: session } = await supabaseAdmin
      .from('live_requests')
      .select('user_id, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session || session.user_id !== authData.user.id) {
      return res.status(403).json({ error: 'Only the host can kick participants.' });
    }

    // Insert kick record (ignore if already exists)
    await supabaseAdmin
      .from('live_kicked_users')
      .upsert({ session_id: sessionId, user_id: targetUserId }, { onConflict: 'session_id,user_id' });

    res.json({ ok: true });
  } catch (error) {
    console.error('Kick error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// ==========================================
// LIVE CHAT — In-session messaging
// ==========================================
// Send a chat message in a live room
app.post('/api/live/chat', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { roomId, content, attachment_url, attachment_type } = req.body || {};
    if (!roomId || (!content && !attachment_url)) return res.status(400).json({ error: 'Missing roomId or content/attachment.' });

    // Verify room exists and is open for conversation (announced or on air)
    const { data: room, error: roomError } = await supabaseAdmin
      .from('live_requests')
      .select('id, status')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError || !room || (room.status !== 'active' && room.status !== 'open')) {
      return res.status(404).json({ error: 'Room not found or not open for chat.' });
    }

    // Insert message
    const insertRow = {
      room_id: roomId,
      user_id: authData.user.id,
      content: content ? content.slice(0, 1000) : null,
      attachment_url: attachment_url || null,
      attachment_type: attachment_type || null
    };
    const { data: message, error: insertError } = await supabaseAdmin
      .from('live_chat_messages')
      .insert(insertRow)
      .select()
      .single();

    if (insertError) {
      console.error('Chat insert error:', insertError);
      return res.status(500).json({ error: 'Failed to send message.' });
    }

    // Fetch profile separately
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', authData.user.id)
      .maybeSingle();

    res.json({ ok: true, message: { ...message, profiles: profile } });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// Get chat messages for a room
app.get('/api/live/chat/:roomId', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { roomId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Verify room exists
    const { data: room, error: roomError } = await supabaseAdmin
      .from('live_requests')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    // Fetch messages
    const { data: messages, error: fetchError } = await supabaseAdmin
      .from('live_chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('Chat fetch error:', fetchError);
      return res.status(500).json({ error: 'Failed to load messages.' });
    }

    // Fetch profiles for all unique user_ids
    const userIds = [...new Set((messages || []).map(m => m.user_id))];
    let profiles = [];
    if (userIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds);
      profiles = profileData || [];
    }

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const enriched = (messages || []).map(m => ({
      ...m,
      profiles: profileMap.get(m.user_id) || null
    }));

    res.json({ messages: enriched });
  } catch (error) {
    console.error('Chat fetch error:', error);
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// Start Server
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Gliimu Server running on port ${PORT}`);
});
