const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

// In-memory state
const users = new Map();      // userId -> ws
const callRooms = new Map();  // callId -> { caller: userId, receiver: userId }
const missTimers = new Map(); // callId -> timeout

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const RING_TIMEOUT_MS = 30000; // 30 seconds

function initSignaling(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/call-signaling' });

  console.log('[WebRTC] Signaling server initialized');

  wss.on('connection', (ws) => {
    ws.userId = null;
    ws.isAlive = true;
    ws.authTimer = null;
    console.log('[WebRTC] New WebSocket connection established');

    // Must authenticate within 10 seconds
    ws.authTimer = setTimeout(() => {
      if (!ws.userId) {
        console.log('[WebRTC] Closing unauthenticated connection after 10s');
        ws.close(4001, 'Authentication required');
      }
    }, 10000);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(ws, msg, wss);
      } catch (err) {
        console.error('[WebRTC] Message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      if (ws.authTimer) clearTimeout(ws.authTimer);
      if (ws.userId) {
        console.log('[WebRTC] User disconnected:', ws.userId);
        users.delete(ws.userId);
        console.log('[WebRTC] Users map size after disconnect:', users.size);
        // Clean up any active calls for this user
        cleanupUserCalls(ws.userId, wss);
      }
    });

    ws.on('error', (err) => {
      console.error('[WebRTC] WebSocket error:', err.message);
    });
  });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log('[WebRTC] Terminating dead connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

async function handleMessage(ws, msg, wss) {
  // Authentication
  if (msg.type === 'auth') {
    const token = msg.token;
    if (!token) {
      ws.send(JSON.stringify({ type: 'auth-error', message: 'No token provided' }));
      return;
    }

    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        ws.send(JSON.stringify({ type: 'auth-error', message: 'Invalid token' }));
        ws.close(4001, 'Invalid token');
        return;
      }

      ws.userId = user.id;
      if (ws.authTimer) clearTimeout(ws.authTimer);
      users.set(ws.userId, ws);
      console.log('[WebRTC] User authenticated:', ws.userId);
      ws.send(JSON.stringify({ type: 'auth-success', userId: ws.userId }));
    } catch (err) {
      console.error('[WebRTC] Auth error:', err.message);
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Auth failed' }));
      ws.close(4001, 'Auth failed');
    }
    return;
  }

  // All other messages require authentication
  if (!ws.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  // Call signaling messages
  switch (msg.type) {
    case 'call-initiate':
      await handleCallInitiate(ws, msg, wss);
      break;
    case 'call-offer':
      await handleCallOffer(ws, msg, wss);
      break;
    case 'call-answer':
      await handleCallAnswer(ws, msg, wss);
      break;
    case 'ice-candidate':
      await handleIceCandidate(ws, msg, wss);
      break;
    case 'call-reject':
      await handleCallReject(ws, msg, wss);
      break;
    case 'call-end':
      await handleCallEnd(ws, msg, wss);
      break;
    case 'call-cancel':
      await handleCallCancel(ws, msg, wss);
      break;
    case 'video-toggle':
      await handleVideoToggle(ws, msg, wss);
      break;
    default:
      console.log('[WebRTC] Unknown message type:', msg.type);
  }
}

async function handleCallInitiate(ws, msg, wss) {
  const { callId, receiverId, callType } = msg;
  if (!callId || !receiverId) return;

  // Register the call room
  callRooms.set(callId, { caller: ws.userId, receiver: receiverId });

  // Start miss timer
  const timer = setTimeout(async () => {
    if (callRooms.has(callId)) {
      const room = callRooms.get(callId);
      // Update call status to missed
      await supabaseAdmin
        .from('ping_calls')
        .update({ status: 'missed', ended_at: new Date().toISOString() })
        .eq('id', callId);

      // Notify caller
      const callerWs = users.get(room.caller);
      if (callerWs && callerWs.readyState === WebSocket.OPEN) {
        callerWs.send(JSON.stringify({ type: 'call-missed', callId }));
      }

      // Notify receiver (in case they come online later)
      const receiverWs = users.get(room.receiver);
      if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
        receiverWs.send(JSON.stringify({ type: 'call-missed', callId }));
      }

      callRooms.delete(callId);
      missTimers.delete(callId);
    }
  }, RING_TIMEOUT_MS);

  missTimers.set(callId, timer);

  // Forward to receiver
  const receiverWs = users.get(receiverId);
  console.log('[WebRTC] Call initiate:', { 
    callId, 
    caller: ws.userId, 
    receiver: receiverId, 
    receiverConnected: !!receiverWs, 
    receiverState: receiverWs?.readyState,
    totalUsersOnline: users.size,
    onlineUserIds: Array.from(users.keys())
  });
  
  if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
    // Get caller profile
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', ws.userId)
      .single();

    receiverWs.send(JSON.stringify({
      type: 'call-incoming',
      callId,
      callType,
      caller: callerProfile
    }));
  } else {
    // Receiver offline — cancel immediately
    ws.send(JSON.stringify({ type: 'call-offline', callId }));
    clearTimeout(timer);
    missTimers.delete(callId);
    callRooms.delete(callId);

    await supabaseAdmin
      .from('ping_calls')
      .update({ status: 'missed', ended_at: new Date().toISOString() })
      .eq('id', callId);
  }
}

async function handleCallOffer(ws, msg, wss) {
  const { callId, sdp } = msg;
  if (!callId || !sdp) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Forward offer to receiver
  const receiverWs = users.get(room.receiver);
  if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
    receiverWs.send(JSON.stringify({ type: 'call-offer', callId, sdp }));
  }
}

async function handleCallAnswer(ws, msg, wss) {
  const { callId, sdp } = msg;
  if (!callId || !sdp) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Clear miss timer — call is being accepted
  const timer = missTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    missTimers.delete(callId);
  }

  // Update call status to accepted
  await supabaseAdmin
    .from('ping_calls')
    .update({ status: 'accepted' })
    .eq('id', callId);

  // Forward answer to caller
  const callerWs = users.get(room.caller);
  if (callerWs && callerWs.readyState === WebSocket.OPEN) {
    callerWs.send(JSON.stringify({ type: 'call-answer', callId, sdp }));
  }
}

async function handleIceCandidate(ws, msg, wss) {
  const { callId, candidate } = msg;
  if (!callId || !candidate) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Forward to the other peer
  const targetId = ws.userId === room.caller ? room.receiver : room.caller;
  const targetWs = users.get(targetId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({ type: 'ice-candidate', callId, candidate }));
  }
}

async function handleCallReject(ws, msg, wss) {
  const { callId } = msg;
  if (!callId) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Clear miss timer
  const timer = missTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    missTimers.delete(callId);
  }

  // Update call status
  await supabaseAdmin
    .from('ping_calls')
    .update({ status: 'rejected', ended_at: new Date().toISOString() })
    .eq('id', callId);

  // Notify caller
  const callerWs = users.get(room.caller);
  if (callerWs && callerWs.readyState === WebSocket.OPEN) {
    callerWs.send(JSON.stringify({ type: 'call-rejected', callId }));
  }

  callRooms.delete(callId);
}

async function handleCallEnd(ws, msg, wss) {
  const { callId, durationSecs } = msg;
  if (!callId) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Clear miss timer
  const timer = missTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    missTimers.delete(callId);
  }

  // Update call status
  await supabaseAdmin
    .from('ping_calls')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      duration_secs: durationSecs || 0
    })
    .eq('id', callId);

  // Notify the other peer
  const targetId = ws.userId === room.caller ? room.receiver : room.caller;
  const targetWs = users.get(targetId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({ type: 'call-ended', callId }));
  }

  callRooms.delete(callId);
}

async function handleCallCancel(ws, msg, wss) {
  const { callId } = msg;
  if (!callId) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Clear miss timer
  const timer = missTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    missTimers.delete(callId);
  }

  // Update call status
  await supabaseAdmin
    .from('ping_calls')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', callId);

  // Notify receiver
  const receiverWs = users.get(room.receiver);
  if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
    receiverWs.send(JSON.stringify({ type: 'call-cancelled', callId }));
  }

  callRooms.delete(callId);
}

async function handleVideoToggle(ws, msg, wss) {
  const { callId, videoEnabled } = msg;
  if (!callId) return;

  const room = callRooms.get(callId);
  if (!room) return;

  // Forward to the other peer
  const targetId = ws.userId === room.caller ? room.receiver : room.caller;
  const targetWs = users.get(targetId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({ type: 'video-toggled', callId, videoEnabled }));
  }
}

async function cleanupUserCalls(userId, wss) {
  // Find any active calls involving this user
  for (const [callId, room] of callRooms.entries()) {
    if (room.caller === userId || room.receiver === userId) {
      const otherUserId = room.caller === userId ? room.receiver : room.caller;

      // Update call status
      await supabaseAdmin
        .from('ping_calls')
        .update({ status: 'failed', ended_at: new Date().toISOString() })
        .eq('id', callId);

      // Notify the other peer
      const otherWs = users.get(otherUserId);
      if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(JSON.stringify({ type: 'call-failed', callId }));
      }

      // Clean up timer
      const timer = missTimers.get(callId);
      if (timer) {
        clearTimeout(timer);
        missTimers.delete(callId);
      }

      callRooms.delete(callId);
    }
  }
}

module.exports = { initSignaling };
