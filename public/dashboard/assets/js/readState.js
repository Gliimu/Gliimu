// Receivers cannot write read_at under the current RLS policies, so unread
// state for incoming messages is tracked locally per user instead.
const storageKey = (userId) => `gliimu_read_map_${userId}`;

export function getReadMap(userId) {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}'); } catch { return {}; }
}

// Ping is member-to-member only. Anything that came from the admin desk
// lives in the Support thread, so it never counts as an incoming ping.
export function isIncomingDm(userId, message) {
  return message.receiver_id === userId && !message.room && !message.is_ai
    && !message.is_admin && message.sender_id !== userId;
}

export function markChatRead(userId, contactId, through = Date.now()) {
  const map = getReadMap(userId);
  map[contactId] = Math.max(map[contactId] || 0, through);
  localStorage.setItem(storageKey(userId), JSON.stringify(map));
  window.dispatchEvent(new Event('gliimu-chat-read'));
}

export function computeUnread(userId, receivedMsgs) {
  const map = getReadMap(userId);
  const unreadMap = {};
  let total = 0;
  (receivedMsgs || []).forEach(m => {
    if (m.read_at || !isIncomingDm(userId, m)) return;
    const lastRead = map[m.sender_id] || 0;
    if (new Date(m.created_at).getTime() > lastRead) {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
      total++;
    }
  });
  return { unreadMap, total };
}

// The newest message the reader has not seen yet — the one worth alerting on.
export function latestIncomingUnread(userId, receivedMsgs) {
  const map = getReadMap(userId);
  let best = null;
  let bestTime = 0;
  (receivedMsgs || []).forEach(m => {
    if (m.read_at || !isIncomingDm(userId, m)) return;
    const time = new Date(m.created_at).getTime();
    if (time <= (map[m.sender_id] || 0)) return;
    if (time > bestTime) { best = m; bestTime = time; }
  });
  return best;
}
