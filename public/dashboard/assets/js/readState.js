// Receivers cannot write read_at under the current RLS policies, so unread
// state for incoming messages is tracked locally per user instead.
const storageKey = (userId) => `gliimu_read_map_${userId}`;

export function getReadMap(userId) {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}'); } catch { return {}; }
}

export function markChatRead(userId, contactId) {
  const map = getReadMap(userId);
  map[contactId] = Date.now();
  localStorage.setItem(storageKey(userId), JSON.stringify(map));
}

export function computeUnread(userId, receivedMsgs) {
  const map = getReadMap(userId);
  const unreadMap = {};
  let total = 0;
  (receivedMsgs || []).forEach(m => {
    if (m.read_at) return;
    const lastRead = map[m.sender_id] || 0;
    if (new Date(m.created_at).getTime() > lastRead) {
      unreadMap[m.sender_id] = (unreadMap[m.sender_id] || 0) + 1;
      total++;
    }
  });
  return { unreadMap, total };
}
