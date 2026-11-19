require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// CORS_EXTRA_ORIGINS is only for local development (e.g. a dev origin testing
// uploads against a locally-run server). Render has no such variable, so
// production behaviour is unchanged.
const ALLOWED_ORIGINS = [
  'https://www.gliimu.com',
  'https://gliimu.com',
  'https://dashboard.gliimu.com',
  'https://admin.gliimu.com',
  ...String(process.env.CORS_EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
];

app.use(cors({
  origin: ALLOWED_ORIGINS,
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
        const result = await creditTopupOnce(userId, gliitsAmount, tx.reference);
        console.log('Paystack webhook gliits topup:', tx.reference, JSON.stringify(result));
        if (result.reason === 'retry') return res.status(500).json({ error: 'Credit not applied yet.' });
        // Only the arrival that actually moved money gets to tell the member.
        if (result.credited) {
          await sendAiNotice(userId, `Wallet credited with G${Number(gliitsAmount).toLocaleString()}. Happy browsing!`);
        }
      } else if (userId && amountNaira >= 100 && tx.reference) {
        const result = await creditTopupOnce(userId, amountNaira, tx.reference);
        console.log('Paystack webhook credit:', tx.reference, JSON.stringify(result));
        if (result.reason === 'retry') return res.status(500).json({ error: 'Credit not applied yet.' });
      }
    }

    // Payouts settle on their own timeline, sometimes minutes later, so the
    // Send button only reports "accepted". These events close the row: paid,
    // or failed with the Gliims returned to the member's wallet. The payout
    // reference is ours (glw…), passed to Paystack when the transfer began.
    if (event.event === 'transfer.success' || event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
      const tx = event.data || {};
      const reference = String(tx.reference || '');
      if (reference.startsWith('glw')) {
        const result = await supabaseAdmin.rpc('settle_withdrawal', {
          p_reference: reference,
          p_status: event.event === 'transfer.success' ? 'paid' : 'failed',
          p_transfer_code: tx.transfer_code || tx.transfer_reference || null,
          p_reason: event.event === 'transfer.success' ? null
            : (event.event === 'transfer.reversed' ? 'The bank reversed the transfer.' : null)
        });
        console.log('Paystack webhook transfer:', event.event, reference, JSON.stringify(result.data || result.error));
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

// Exactly-once wallet credit, claimed by the database.
//
// Paystack delivers every successful charge twice: this server verifies the
// reference when the browser comes back from checkout, and the charge.success
// webhook lands seconds later for the same payment. The old helper read
// profiles.wallet_balance, added the amount in JavaScript and wrote the total
// back, so whichever arrival lost the race still saw the pre-payment balance
// and added the money a second time. ₦100 became G200.
//
// credit_wallet_topup takes an advisory lock on the reference, refuses one that
// already produced a successful top-up row, and does the addition in SQL.
async function creditTopupOnce(userId, amountGliits, reference) {
  const { data, error } = await supabaseAdmin.rpc('credit_wallet_topup', {
    p_user: userId,
    // gliits_amount arrives inside metadata a client built, so it can be a
    // string or a float; the column and the parameter are both integers.
    p_amount: Math.round(Number(amountGliits) || 0),
    p_reference: reference
  });
  if (error) {
    console.error('credit_wallet_topup rejected:', reference, error.message);
    // A rejected argument will never succeed on retry. Anything else is a
    // database blip, and answering the webhook with 5xx makes Paystack send it
    // again — safe now because the reference can only ever be credited once.
    const permanent = /INVALID_(AMOUNT|REFERENCE|USER)/.test(error.message || '');
    return { credited: false, reason: permanent ? 'rejected' : 'retry' };
  }
  return data || { credited: false, reason: 'retry' };
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
      const result = await creditTopupOnce(userId, gliitsAmount, tx.reference || reference);
      if (result.reason === 'retry') {
        return res.json({ credited: false, reason: 'retry' });
      }
      return res.json({
        credited: !!result.credited,
        amount: gliitsAmount,
        gliits: gliitsAmount,
        reason: result.credited ? null : (result.reason || 'not_credited'),
        balance: result.balance ?? null
      });
    }

    if (!userId || amountNaira < 100) {
      return res.status(400).json({ error: 'Payment metadata is incomplete.' });
    }

    const result = await creditTopupOnce(userId, amountNaira, tx.reference || reference);
    res.json({
      credited: !!result.credited,
      amount: amountNaira,
      reason: result.credited ? null : (result.reason || 'not_credited'),
      balance: result.balance ?? null
    });
  } catch (error) {
    console.error('Paystack verify error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// GLIITS — HEARTBEAT (per-minute usage tracking)
// ==========================================
// The client sends a heartbeat every minute while the user is active, naming
// the one thing they are consuming: the live session they are in, or the
// gliim they are reading. Both are billed at the same config rate.
// The meter itself decides what is chargeable — an idle minute, a finished
// session and a taken-down gliim all cost nothing.
app.post('/api/gliits/heartbeat', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Missing access token.' });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData || !authData.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    const { postId, sessionId } = req.body || {};
    // gliits_heartbeat reads auth.uid() internally, so it must be called with
    // the user's JWT — the service-role client has no user context.
    const { data, error } = await asUser(token).rpc('gliits_heartbeat', {
      p_post_id: postId || null,
      p_session_id: sessionId || null
    });
    if (error) {
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return res.json({ ok: false, code: 'INSUFFICIENT_BALANCE' });
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
// Client sends the token amount they want to buy; server calculates the
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

    const { data: config, error: configError } = await supabaseAdmin
      .from('gliits_config')
      .select('exchange_rate_naira_to_gliits, min_topup_gliits')
      .eq('id', 1)
      .maybeSingle();

    // Pricing must never fall back to a guess: ₦1 = G1 is a silent 10x
    // discount at the current rate, so an unreadable config stops the charge.
    if (configError || !config) {
      if (configError) console.error('gliits_config read failed:', configError.message);
      return res.status(503).json({ error: 'Pricing is unavailable right now. Please try again in a moment.' });
    }

    const minTopup = Number(config.min_topup_gliits) || 100;
    if (amount < minTopup) {
      return res.status(400).json({ error: `Minimum top-up is G${minTopup}.` });
    }

    const rate = Number(config.exchange_rate_naira_to_gliits);
    if (!Number.isFinite(rate) || rate <= 0) {
      console.error('gliits_config exchange rate is unusable:', config.exchange_rate_naira_to_gliits);
      return res.status(503).json({ error: 'Pricing is unavailable right now. Please try again in a moment.' });
    }
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
// PAYOUTS — PAYSTACK TRANSFERS
// ==========================================
// Money leaves the platform in exactly one direction: a member asks for a
// payout, a registrar presses Send, and only this server talks to Paystack.
// The account holder's name is never typed by a member — it is read back from
// the bank here and stored, so a payout can only be sent to an account whose
// name the bank agrees with. Transfers run off the Paystack balance.

const asUser = (token) => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

async function payoutUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return { token, userId: data.user.id };
}

async function paystack(path, { method = 'GET', body } = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { http: 0, ok: false, data: null, meta: null, message: 'Paystack is not configured.' };

  const response = await fetch(`${PAYSTACK_API}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const out = await response.json().catch(() => ({}));
  return {
    http: response.status,
    ok: Boolean(out.status),
    data: out.data || null,
    meta: out.meta || null,
    message: String(out.message || '')
  };
}

const sameName = (a, b) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim()
  === String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Paystack bank codes are three characters ("044" for Access Bank) but the
// column is an integer, so the leading zero is gone by the time we read it
// back. Every call out to Paystack has to put it back on.
const paystackBankCode = (code) => String(code || '').padStart(3, '0');

let bankList = { rows: [], at: 0 };

// Paystack pages its bank list, so walk the cursors and cache the result —
// the list changes about as often as banks do.
async function listBanks() {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const query = `?perPage=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const out = await paystack(`/bank${query}`);
    if (!out.ok) return null;
    for (const bank of out.data || []) {
      if (bank && bank.code && bank.name && bank.active !== false) {
        rows.push({ code: String(bank.code), name: String(bank.name) });
      }
    }
    if (!out.meta || !out.meta.has_more || !out.meta.next_cursor) break;
    cursor = out.meta.next_cursor;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

app.get('/api/payout/banks', async (req, res) => {
  try {
    if (!await payoutUser(req)) return res.status(401).json({ error: 'Missing access token.' });
    if (bankList.rows.length && Date.now() - bankList.at < 6 * 60 * 60 * 1000) {
      return res.json({ banks: bankList.rows });
    }
    const rows = await listBanks();
    if (!rows) return res.status(502).json({ error: 'Paystack did not return a bank list.' });
    bankList = { rows, at: Date.now() };
    res.json({ banks: rows });
  } catch (error) {
    console.error('Payout bank list error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Confirm the account the member saved and record whose name the bank has
// for it. Nothing is returned that lets a caller probe arbitrary accounts —
// this only ever resolves the row the caller owns.
app.post('/api/payout/resolve', async (req, res) => {
  try {
    const caller = await payoutUser(req);
    if (!caller) return res.status(401).json({ error: 'Missing access token.' });

    const { data: saved } = await supabaseAdmin
      .from('payout_details')
      .select('bank_code, account_number, full_name')
      .eq('user_id', caller.userId)
      .maybeSingle();
    if (!saved) return res.json({ ok: false, code: 'NO_PAYOUT_DETAILS' });

    const out = await paystack(
      `/bank/resolve?account_number=${encodeURIComponent(saved.account_number)}&bank_code=${encodeURIComponent(paystackBankCode(saved.bank_code))}`
    );
    if (!out.ok || !out.data || !out.data.account_name) {
      return res.json({
        ok: false,
        code: 'NOT_RESOLVED',
        error: out.message || 'The bank did not answer for that account number.'
      });
    }

    const accountName = String(out.data.account_name);
    const bankName = String(out.data.bank_name || '');
    const { error: saveError } = await supabaseAdmin
      .from('payout_details')
      .update({ account_name: accountName, bank_name: bankName, updated_at: new Date().toISOString() })
      .eq('user_id', caller.userId);
    if (saveError) {
      console.error('Payout resolve save error:', saveError.message);
      return res.status(500).json({ error: 'Could not store the bank answer.' });
    }

    res.json({
      ok: true,
      account_name: accountName,
      bank_name: bankName,
      name_match: sameName(accountName, saved.full_name)
    });
  } catch (error) {
    console.error('Payout resolve error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// The only path that moves real money. registrar_begin_payout is what
// enforces the role, the name match and the anti-fraud hold, so it runs with
// the staff JWT — never with the service role.
app.post('/api/payout/disburse', async (req, res) => {
  try {
    const caller = await payoutUser(req);
    if (!caller) return res.status(401).json({ error: 'Missing access token.' });
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack is not configured yet.' });
    }

    const id = String((req.body || {}).id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Unknown payout.' });
    }

    const { data: began, error: beginError } = await asUser(caller.token)
      .rpc('registrar_begin_payout', { p_id: id });
    if (beginError) {
      return res.json({ ok: false, code: beginError.code || 'SEND_FAILED', error: beginError.message });
    }
    if (!began || began.ok !== true) {
      return res.json(began || { ok: false, code: 'SEND_FAILED' });
    }

    const payout = began.withdrawal;
    const amountKobo = Math.round(Number(payout.amount_naira) * 100);
    const settle = (status, extra) => supabaseAdmin.rpc('settle_withdrawal', {
      p_reference: payout.reference,
      p_status: status,
      p_transfer_code: (extra && extra.transfer_code) || null,
      p_recipient_code: (extra && extra.recipient_code) || null,
      p_reason: (extra && extra.reason) || null
    });

    let recipient = payout.recipient_code || null;
    if (!recipient) {
      const made = await paystack('/transferrecipient', {
        method: 'POST',
        body: {
          type: 'nuban',
          name: payout.account_name,
          description: `Gliimu payout ${payout.reference}`,
          account_number: payout.account_number,
          bank_code: paystackBankCode(payout.bank_code),
          currency: 'NGN'
        }
      });
      if (!made.ok || !made.data || !made.data.recipient_code) {
        await settle('failed', { reason: made.message || 'Paystack refused that bank account.' });
        return res.json({ ok: false, code: 'RECIPIENT_FAILED', error: made.message || 'Paystack refused that bank account.' });
      }
      recipient = made.data.recipient_code;
      await settle('processing', { recipient_code: recipient });
    }

    const sent = await paystack('/transfer', {
      method: 'POST',
      body: { amount: amountKobo, recipient, reference: payout.reference, source: 'balance' }
    });

    if (!sent.ok || !sent.data || !sent.data.transfer_code) {
      // A clear rejection means nothing was created, so the Gliims go back.
      if ([400, 401, 403, 404, 422].includes(sent.http)) {
        await settle('failed', { reason: sent.message || 'Paystack rejected the transfer.' });
        return res.json({ ok: false, code: 'TRANSFER_REJECTED', error: sent.message || 'Paystack rejected the transfer.' });
      }
      // Ambiguous — the transfer may exist. Leave it in flight so nobody can
      // press Send twice, and make the operator check Paystack first.
      return res.json({
        ok: false,
        code: 'SEND_UNCONFIRMED',
        error: 'Paystack did not answer. This payout stays marked in-flight so it cannot be sent twice — check the Paystack transfers list before trying again.'
      });
    }

    const transferCode = String(sent.data.transfer_code || sent.data.id || '');
    const status = String(sent.data.status || 'pending');

    if (status === 'success') {
      await settle('paid', { transfer_code: transferCode });
      return res.json({ ok: true, paid: true, status, transfer_code: transferCode, amount_naira: Number(payout.amount_naira) });
    }

    await settle('pending', { transfer_code: transferCode });
    res.json({ ok: true, paid: false, status, transfer_code: transferCode, amount_naira: Number(payout.amount_naira) });
  } catch (error) {
    console.error('Payout disburse error:', error);
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

// Signing a URL happens entirely in this process, so a 200 presign proves
// nothing about the token. A dead token only fails in the browser's PUT, and
// R2 sends no CORS headers with a rejection, so Chrome reports it as a CORS
// error. Probe once with an authenticated call to get the honest reason.
// Only 401-class errors count: a write-only token legitimately gets 403 on a
// bucket-level read, and uploads must not be blocked on that.
let r2AuthOk = null;
let r2AuthCheckedAt = 0;

async function r2CredentialsWork() {
  if (r2AuthOk === true) return true;
  if (r2AuthOk === false && Date.now() - r2AuthCheckedAt < 60_000) return false;
  const { HeadBucketCommand } = require('@aws-sdk/client-s3');
  try {
    await r2S3().send(new HeadBucketCommand({ Bucket: R2.bucket }));
    r2AuthOk = true;
    return true;
  } catch (error) {
    const status = error && error.$metadata ? error.$metadata.httpStatusCode : undefined;
    const name = String((error && error.name) || '');
    if (status === 401 || name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch') {
      r2AuthOk = false;
      r2AuthCheckedAt = Date.now();
      console.error('R2 credentials rejected:', status, name);
      return false;
    }
    console.error('R2 credential probe inconclusive:', status, name, error && error.message);
    return true;
  }
}

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
// A chat attachment is the only member-uploaded file the app opens inside
// itself, so its type set stays narrow on purpose: no /^text\// (that let an
// .html file through), no svg (browsers render it, so a shared .svg would run
// its script from the CDN origin) and no spreadsheets or slide decks, which
// nothing in the app can preview.
const CHAT_IMAGE_TYPES = /^image\/(p?jpeg|png|gif|webp|bmp|heic|heif|avif)$/;
const CHAT_DOC_TYPES = /^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
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
  // 5MB and documents limited to PDF/Word, which is what the Live forum and
  // Ping can open. Video and audio stay allowed because Ping records voice
  // notes and sends clips through this same kind — cutting them here would
  // break a working feature, and a 60-second voice note is nowhere near 5MB.
  chat:    { prefix: 'chat_attachments/', maxBytes: 5 * MB,  types: allows(CHAT_IMAGE_TYPES, /^(video|audio)\//, CHAT_DOC_TYPES) },
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
    if (!await r2CredentialsWork()) {
      return res.status(503).json({ error: "Uploads are blocked: the server's Cloudflare R2 key was rejected by Cloudflare. The R2 API token on Render needs renewing." });
    }
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
// LIVE SESSION — entry check
// ==========================================

// Two things stop a member from sitting in a room: the host kicked them out,
// and an empty wallet. A live session now costs the same per minute as a gliim,
// so letting a member in with nothing to pay with would be unpaid viewing.
// The rule itself lives in the database (gliits_live_entry_check); this route
// only relays it.
app.post('/api/live/join-session', async (req, res) => {
  try {
    const token = bearerToken(req);
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

    // gliits_live_entry_check reads auth.uid(), so it needs the member's JWT.
    const { data: entry, error: entryError } = await asUser(token)
      .rpc('gliits_live_entry_check', { p_session_id: requestId });

    if (entryError) {
      // Never let an unreadable verdict open the door for free.
      console.error('Live entry check failed:', entryError.message);
      return res.status(503).json({ error: 'Could not check your balance. Please try again.' });
    }

    if (entry && entry.allowed !== true && entry.reason === 'INSUFFICIENT_BALANCE') {
      return res.status(402).json({
        error: 'Your balance is too low to join this session.',
        code: 'INSUFFICIENT_BALANCE',
        rate: entry.rate,
        balance: entry.balance
      });
    }

    // Other "not allowed" verdicts (a room that is not on air, a room that is
    // gone) are left to the caller, which already reads live_requests.status.
    res.json({ ok: true, entry: entry || {} });
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
// Which viewer a shared attachment needs. Keyed on the extension the upload
// endpoint put into the R2 key, so nothing the client claims can change it.
const CHAT_KIND_BY_EXT = {
  jpg: 'image', jpeg: 'image', jpe: 'image', png: 'image', gif: 'image',
  webp: 'image', bmp: 'image', heic: 'image', heif: 'image', avif: 'image',
  pdf: 'pdf', docx: 'docx', doc: 'doc',
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio',
  aac: 'audio', opus: 'audio'
};

// A presigned key is always <ms>_<8 hex>_<sanitised name>, so the first two
// segments are fixed and everything after the second underscore is the
// sender's own filename, underscores included.
const STORED_NAME_PREFIX = /^\d+_[0-9a-f]{8}_/;

// Turns the attachment fields of a chat request into the three columns to
// store, or null when they do not describe this caller's own upload. The kind
// and the fallback name are read back out of the key rather than taken from
// the body, so a message can never claim to be an image while pointing
// somewhere else.
function readChatAttachment(rawUrl, rawName, userId) {
  if (!R2.publicBase) return null;
  const url = String(rawUrl || '');
  const ownPrefix = R2.publicBase + '/chat_attachments/' + userId + '/';
  if (!url.startsWith(ownPrefix) || url.length > 600) return null;

  const key = url.slice(ownPrefix.length).split('?')[0].split('#')[0];
  const ext = key.includes('.') ? key.split('.').pop().toLowerCase() : '';
  const type = CHAT_KIND_BY_EXT[ext];
  if (!type) return null;

  // Control characters and path separators go; spaces stay, because the point
  // of keeping a name is that it reads like the file the sender chose.
  const stored = key.replace(STORED_NAME_PREFIX, '') || key;
  let given = '';
  for (const ch of String(rawName || '')) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127 || ch === '/' || ch === '\\') continue;
    given += ch;
  }
  given = given.replace(/\s+/g, ' ').trim().slice(0, 120);

  return { url, type, name: given || stored };
}

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

    const { roomId, content, attachment_url, attachment_name } = req.body || {};
    if (!roomId || (!content && !attachment_url)) return res.status(400).json({ error: 'Missing roomId or content/attachment.' });

    // An attachment is only accepted when it is a file this same member just
    // uploaded through /api/upload/presign. The key is minted under
    // chat_attachments/<their own id>/, so requiring that prefix means a room
    // message can never point at another member's private object, an outside
    // host, or a javascript: URL the forum would then hand to a viewer.
    let attachment = null;
    if (attachment_url) {
      attachment = readChatAttachment(attachment_url, attachment_name, authData.user.id);
      if (!attachment) return res.status(400).json({ error: 'That attachment is not a file you uploaded.' });
    }

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
      attachment_url: attachment ? attachment.url : null,
      attachment_type: attachment ? attachment.type : null,
      attachment_name: attachment ? attachment.name : null
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
