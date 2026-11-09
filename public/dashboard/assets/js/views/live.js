import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from '../store.js?v=2';
import * as heartbeat from '../heartbeat.js?v=5';
import { uploadAttachment } from '../media.js?v=4';

const MAX_SESSION_DURATION = 60 * 60 * 1000; // 1 hour in ms

const ICONS = {
  video: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  videoOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  micOff: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  chat: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  screen: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
  flip: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
  userX: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>',
  flag: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
  more: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  message: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  minimize: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
  bolt: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  users: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  onAir: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path><circle cx="12" cy="12" r="2"></circle><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"></path></svg>',
  like: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"></path><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>',
  heart: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l8.84 8.84 8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path></svg>'
};


const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function initialsAvatar(name) {
  const n = String(name || '?').trim();
  const parts = n.split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : n.slice(0, 2).toUpperCase();
  const colors = ['#8b5cf6','#6366f1','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899'];
  const idx = n.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  const bg = colors[idx];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><text x="32" y="32" text-anchor="middle" dominant-baseline="central" fill="white" font-family="system-ui,sans-serif" font-size="22" font-weight="600">${initials}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
window._initialsAvatar = initialsAvatar;

// Ending a session must not depend on Daily deleting the room, so a failed
// delete is reported and ignored rather than allowed to abort the teardown.
async function deleteRoomQuietly(requestId, accessToken) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/daily/delete-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ requestId })
    });
    if (!res.ok) console.warn('Delete room skipped (non-critical).');
  } catch (e) {
    console.warn('Delete room unreachable (non-critical).');
  }
}

const liveView = {
  // State
  activeSession: null,
  sessionRole: null, // 'host' | 'participant'
  joiningSession: false, // Guard against rapid join attempts
  goingOnAir: false,    // Guard against double-tapping "Go on air"
  creatingSession: false, // Guard against double-tapping "Create Session"
  publicSessions: [],    // The Live page landing list
  
  // Daily.co
  callObject: null,
  meetingToken: null,
  participantTiles: new Map(),
  participantsMap: new Map(),
  focusedSessionId: null,

  // UI state
  chatOpen: false,
  minimized: false,
  chatMessages: [],
  chatPollInterval: null,
  chatErrorCount: 0,

  // Session controls
  screenSharing: false,
  
  // Session timer
  sessionTimerInterval: null,
  sessionStartTime: null,
  liveSecs: 0,
  
  // Realtime
  sessionChannel: null,

  template: `
    <div id="live-container">
      <div id="live-landing"></div>
      <div id="live-session-view" style="display:none;"></div>
    </div>
  `,

  // The chat panel and tile menus are inline-onclick driven, so the bridge has
  // to exist even when the session was opened from a card, not the Live page.
  _exposeInstance() {
    window.liveInstance = {
      joinSession: (id) => this.joinSession(id),
      leaveSession: () => this.leaveSession(),
      endSession: () => this.endSession(),
      toggleCamera: () => this.toggleCamera(),
      toggleMic: () => this.toggleMic(),
      toggleChat: () => this.toggleChat(),
      sendChatMessage: () => this.sendChatMessage(),
      handleChatFile: (ev) => this.handleChatFile(ev),
      clearAttachmentPreview: () => this.clearAttachmentPreview(),
      muteParticipant: (sessionId) => this.muteParticipant(sessionId),
      kickParticipant: (sessionId) => this.kickParticipant(sessionId),
      reportLiveSession: () => this.reportLiveSession(),
      toggleScreenShare: () => this.toggleScreenShare(),
      shareSession: () => this.shareSession(),
      tapSupport: () => this.tapSupport(),
      tapReact: () => this.tapReact(),
      minimizeStudio: () => this.minimizeStudio(),
      restoreStudio: () => this.restoreStudio(),
      isLiveActive: () => !!this.activeSession,
      isMinimized: () => this.minimized,
      endLive: () => this.forceEndLive(),
      // Live page landing
      loadPublicSessions: () => this.loadPublicSessions(),
      openHostModal: () => this.openHostModal(),
      closeHostModal: () => this.closeHostModal(),
      createSession: () => this.createSession(),
      goOnAir: (id) => this.goOnAir(id),
      resumeSession: (id) => this.resumeSession(id),
      cancelSession: (id) => this.cancelSession(id)
    };
  },

  async init() {
    this._exposeInstance();

    // If returning to Live page with an active minimized session, restore directly
    if (this.activeSession && this.minimized) {
      this._restoreFromNavigation();
      return;
    }

    const params = new URLSearchParams(window.gliimRoute.query());
    const joinId = params.get('join');
    if (joinId) {
      await this.joinSession(joinId);
      return;
    }

    // Attempt to recover session after refresh/network issue (only if not joining via link)
    if (!(await this._recoverSession())) this.showLanding();
  },

  // The Live page opens on the session list: host your own, or join somebody
  // else's. It also stands in behind the minimized tile so the page is never
  // blank while a session keeps running in the corner.
  showLanding() {
    const container = document.getElementById('live-container');
    if (!container) return;

    const sessionView = document.getElementById('live-session-view');
    if (sessionView) sessionView.style.display = 'none';

    const landing = document.getElementById('live-landing');
    if (!landing) return;
    landing.style.display = 'block';
    this.loadPublicSessions();
  },

  hideLanding() {
    const landing = document.getElementById('live-landing');
    if (landing) landing.style.display = 'none';
    const sessionView = document.getElementById('live-session-view');
    if (sessionView) sessionView.style.display = 'block';
  },

  // ============================================
  // LANDING PAGE - session list + host modal
  // ============================================

  async loadPublicSessions() {
    const landing = document.getElementById('live-landing');
    if (!landing) return;

    landing.innerHTML = '<div class="live-loading">Loading sessions...</div>';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        landing.innerHTML = '<div class="live-empty">Please sign in to see live sessions.</div>';
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/live/public-sessions`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The sessions could not be loaded.');

      this.publicSessions = result.sessions || [];
      this.renderLanding();
    } catch (error) {
      console.error('Load sessions error:', error);
      landing.innerHTML = `<div class="live-error">Failed to load sessions: ${esc(error.message)}</div>`;
    }
  },

  renderLanding() {
    const landing = document.getElementById('live-landing');
    if (!landing) return;

    let html = `
      <div class="live-header">
        <h2>Live Sessions</h2>
        <button class="btn-primary" onclick="liveInstance.openHostModal()">${ICONS.plus} Host Session</button>
      </div>
    `;

    if (!this.publicSessions.length) {
      html += '<div class="live-empty">Nobody is live right now. Host a session and it will show up here.</div>';
    } else {
      html += '<div class="live-sessions-grid">';
      for (const session of this.publicSessions) {
        const onAir = session.status === 'active';
        let action;
        if (session.is_mine && !onAir) {
          action = `<button class="btn-primary live-session-card-join" onclick="liveInstance.goOnAir('${session.id}')">${ICONS.onAir} Go on air</button>
            <button class="btn-secondary live-session-card-cancel" onclick="liveInstance.cancelSession('${session.id}')">Cancel</button>`;
        } else if (session.is_mine) {
          action = `<button class="btn-primary live-session-card-join" onclick="liveInstance.resumeSession('${session.id}')">Back to your session</button>`;
        } else {
          action = `<button class="btn-primary live-session-card-join" onclick="liveInstance.joinSession('${session.id}')">Join Session</button>`;
        }

        html += `
          <div class="live-session-card">
            <div class="live-session-card-header">
              <h3>${esc(session.title)}</h3>
              ${onAir ? '<span class="live-session-card-onair">LIVE</span>' : ''}
            </div>
            ${session.description ? `<p class="live-session-card-desc">${esc(session.description)}</p>` : ''}
            <div class="live-session-card-meta">
              ${session.host_name ? `<span class="live-session-card-host">${esc(session.host_name)}</span>` : ''}
              <span class="live-session-card-participants">${ICONS.users} ${Number(session.participant_count) || 0}</span>
            </div>
            <div class="live-session-card-actions">${action}</div>
          </div>
        `;
      }
      html += '</div>';
    }

    landing.innerHTML = html;
  },

  openHostModal() {
    if (document.getElementById('live-host-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'live-host-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" onclick="liveInstance.closeHostModal()">${ICONS.close}</button>
        <h3>Host a Live Session</h3>
        <div class="form-group">
          <label>Session Title</label>
          <input type="text" id="live-host-title" class="input" maxlength="60" placeholder="e.g. UI Design Workshop">
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="live-host-desc" class="input" rows="3" maxlength="200" placeholder="What will you cover?"></textarea>
        </div>
        <button class="btn-primary live-host-submit" onclick="liveInstance.createSession()">Create Session</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('live-host-title')?.focus();
  },

  closeHostModal() {
    document.getElementById('live-host-modal')?.remove();
  },

  // Creating here mints the session and takes the host straight on air, so the
  // clock and the Daily room are both stamped by the same paths the rest of the
  // app uses (start_live_session + the idempotent create-room).
  async createSession() {
    if (this.creatingSession) return;
    const title = document.getElementById('live-host-title')?.value?.trim();
    const description = document.getElementById('live-host-desc')?.value?.trim();

    if (!title) {
      appAlert('Please enter a session title.');
      return;
    }

    this.creatingSession = true;
    try {
      const request = await this.createSessionShell(title, description);
      this.closeHostModal();
      if (!(await this.goOnAir(request.id))) await this.cancelSession(request.id);
    } catch (error) {
      console.error('Create session error:', error);
      appAlert(error.message || 'Your session could not be created.');
    } finally {
      this.creatingSession = false;
    }
  },

  // A session the host never went on air with, dropped from their own list.
  async cancelSession(sessionId) {
    if (!sessionId) return;
    try {
      await this.endSessionShell(sessionId);
      this.loadPublicSessions();
    } catch (error) {
      console.error('Cancel session error:', error);
      appAlert(error.message || 'The session could not be cancelled.');
    }
  },

  // Getting back into a session the host already started: the minimized tile
  // only needs its stage put back, anything else goes through the normal join.
  async resumeSession(sessionId) {
    if (this.minimized) {
      this.restoreStudio();
      return;
    }
    if (this.activeSession && this.activeSession.id === sessionId) {
      this.hideLanding();
      return;
    }
    try {
      await this.ensureSessionRoom(sessionId);
    } catch (error) {
      console.error('Resume session error:', error);
      appAlert(error.message || 'The studio room could not be opened.');
      return;
    }
    await this.joinSession(sessionId);
  },

  async _recoverSession() {
    try {
      const saved = sessionStorage.getItem('liveSession');
      if (!saved) return false;

      const { sessionId, role, timestamp } = JSON.parse(saved);
      // Only recover if saved within last 2 hours (session max is 1 hour)
      if (Date.now() - timestamp > 2 * 60 * 60 * 1000) {
        sessionStorage.removeItem('liveSession');
        return false;
      }

      // Fetch session details
      const { data: session, error } = await supabase
        .from('live_requests')
        .select('*')
        .eq('id', sessionId)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !session) {
        sessionStorage.removeItem('liveSession');
        return false;
      }

      // Rejoin the session
      this.activeSession = session;
      this.sessionRole = role;
      this.enterSession();
      return true;
    } catch (e) {
      console.warn('Session recovery failed:', e);
      sessionStorage.removeItem('liveSession');
      return false;
    }
  },

  destroy() {
    this.chatOpen = false;
    this._closeChatOverlay();

    // If minimized, preserve the session — only clean up DOM artifacts
    if (this.minimized) {
      document.body.classList.remove('live-studio-active');
      document.querySelectorAll('.live-tile-menu-overlay').forEach(o => o.remove());
      return;
    }

    document.body.classList.remove('live-studio-active');
    document.querySelectorAll('.live-tile-menu-overlay').forEach(o => o.remove());
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }
    this.stopChatPolling();
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    this.participantTiles.clear();
    this.participantsMap.clear();
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
  },

  // ============================================
  // SESSION SHELLS
  // ============================================

  // Announce a session without going on air: no Daily room and no started_at
  // yet, because the clock and the room only exist once the host goes on air.
  async createSessionShell(title, description) {
    const { data: request, error } = await supabase
      .from('live_requests')
      .insert({
        user_id: store.user.id,
        title: String(title || '').slice(0, 60),
        description: String(description || '').slice(0, 500) || null,
        status: 'open'
      })
      .select()
      .single();

    if (error) throw error;
    return request;
  },

  // Undo a createSessionShell() that never went on air. There is no room to
  // tear down yet, so this is only a status flip.
  async endSessionShell(sessionId) {
    if (!sessionId) return;
    try {
      const now = new Date().toISOString();
      await supabase
        .from('live_requests')
        .update({
          status: 'cancelled',
          completed_by: store.user.id,
          completed_at: now,
          ended_at: now
        })
        .eq('id', sessionId);
    } catch (err) {
      console.warn('Could not clean up the unpublished session:', err.message);
    }
  },

  // create-room is idempotent server-side: it returns the existing room when
  // the session already has one, so re-going-on-air never leaks a second room.
  async ensureSessionRoom(sessionId) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${API_BASE_URL}/api/daily/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ requestId: sessionId })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The studio room could not be opened.');
    return result;
  },

  // "Go on air", from the host's own session row: stamp the broadcast clock,
  // open the room, then let the studio join it like anybody else.
  async goOnAir(sessionId) {
    if (!sessionId || this.goingOnAir) return false;
    this.goingOnAir = true;

    try {
      const { error } = await supabase.rpc('start_live_session', { p_session_id: sessionId });
      if (error) throw new Error(error.message);

      await this.ensureSessionRoom(sessionId);

      if (window.gliimRoute.path() === '/live') {
        await this.joinSession(sessionId);
      } else {
        window.location.hash = `/live?join=${sessionId}`;
      }
      return true;
    } catch (err) {
      console.error('Go on air failed:', err);
      appAlert(err.message || 'Your session could not start.');
      return false;
    } finally {
      this.goingOnAir = false;
    }
  },

  async joinSession(sessionId) {
    if (this.joiningSession) return;
    this.joiningSession = true;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Check kick status first via server
      const kickCheck = await fetch(`${API_BASE_URL}/api/live/join-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ requestId: sessionId, checkOnly: true })
      });

      if (kickCheck.status === 403) {
        const errData = await kickCheck.json().catch(() => ({}));
        if (errData.kicked) {
          alert('You were kicked out of this session.');
          this.joiningSession = false;
          return;
        }
      }

      const { data: request, error } = await supabase
        .from('live_requests')
        .select('*')
        .eq('id', sessionId)
        .eq('status', 'active')
        .single();

      if (error || !request) {
        alert('Session not found or no longer active.');
        this.joiningSession = false;
        return;
      }

      // Increment participant count. The RPC refuses once the session has
      // ended or filled up while this tab was still showing it.
      const { error: countError } = await supabase.rpc('increment_participant_count', { p_request_id: request.id });
      if (countError) {
        appAlert('That session just ended or is full.');
        this.joiningSession = false;
        return;
      }

      this.activeSession = request;
      this.sessionRole = (request.user_id === store.user.id) ? 'host' : 'participant';

      // Everyone in the call carries a token: the host gets owner rights so
      // mute and remove work mid-call, participants get a plain one.
      if (request.room_id) await this._fetchMeetingToken(request.room_id);

      this.enterSession();

    } catch (error) {
      console.error('Join session error:', error);
      alert('Failed to join session.');
    } finally {
      this.joiningSession = false;
    }
  },

  async _fetchMeetingToken(roomId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const res = await fetch(`${API_BASE_URL}/api/daily/meeting-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ roomId })
      });
      if (!res.ok) {
        console.warn('Meeting token refused:', await res.text());
        return null;
      }
      const data = await res.json();
      this.meetingToken = data.token || null;
      return this.meetingToken;
    } catch (e) {
      console.warn('Meeting token fetch failed:', e);
      return null;
    }
  },

  // ============================================
  // SESSION UI
  // ============================================

  enterSession() {
    if (!this.activeSession) return;

    // Persist session for recovery on refresh/network issues
    try {
      sessionStorage.setItem('liveSession', JSON.stringify({
        sessionId: this.activeSession.id,
        role: this.sessionRole,
        timestamp: Date.now()
      }));
    } catch (e) { console.warn('Failed to save session to storage:', e); }

    this.hideLanding();

    this.sessionStartTime = Date.now();
    this.liveSecs = 0;
    this.chatMessages = [];
    this.chatOpen = false;
    this.focusedSessionId = null;

    if (this.minimized) {
      const staleTile = document.getElementById('live-minimized-tile');
      if (staleTile) {
        staleTile._dragCleanup?.();
        staleTile.remove();
      }
      this.minimized = false;
    }

    document.body.classList.add('live-studio-active');
    this.renderSessionUI();
    this.joinDailyCall(this.activeSession.room_url);
    this.startChatPolling(this.activeSession.id);
    this.setupSessionRealtime(this.activeSession.id);
    this.startSessionTimer();

    heartbeat.setCurrentPost(null);
    heartbeat.start();
  },

  renderSessionUI(mountEl) {
    const sessionView = mountEl || document.getElementById('live-session-view');
    if (!sessionView) return;

    const isHost = this.sessionRole === 'host';
    const s = this.activeSession;
    const mobile = window.innerWidth <= 768;

    sessionView.innerHTML = `
      <div class="live-studio-container">
        <div class="live-session-header">
          <h3>${esc(s.title)}</h3>
          <div class="live-session-meta">
            <span id="live-session-timer">60:00</span>
          </div>
        </div>

        <div class="live-studio-top">
          <div class="live-video-area">
            <div class="live-stage">
              <video id="live-stage-video" autoplay playsinline muted></video>
              <div class="live-stage-empty" id="live-stage-empty">Waiting for video&hellip;</div>
              <div class="live-stage-info" id="live-stage-info"></div>
            </div>
            <div class="live-participant-rail" id="live-participant-rail"></div>
          </div>

          <div class="live-controls-bar">
            <button class="live-ctrl-btn" id="live-camera-btn" title="Toggle camera">${ICONS.video}</button>
            <button class="live-ctrl-btn" id="live-mic-btn" title="Toggle mic">${ICONS.mic}</button>
            ${mobile
              ? `<button class="live-ctrl-btn" id="live-flip-btn" title="Switch camera">${ICONS.flip}</button>`
              : `<button class="live-ctrl-btn" id="live-screen-btn" title="Share screen">${ICONS.screen}</button>`}
            <button class="live-ctrl-btn" id="live-chat-btn" title="Toggle chat">${ICONS.chat}</button>
            ${isHost ? '' : `<button class="live-ctrl-btn" id="live-react-btn" title="React">${ICONS.like}</button>`}
            ${isHost ? '' : `<button class="live-ctrl-btn live-support-btn" id="live-support-btn" title="Support G10">${ICONS.bolt}</button>`}
            ${isHost ? `<button class="live-ctrl-btn" id="live-share-btn" title="Share session">${ICONS.share}</button>` : ''}
            <button class="live-ctrl-btn" id="live-minimize-btn" title="Minimize">${ICONS.minimize}</button>
            <button class="live-ctrl-btn danger" id="live-leave-btn" title="${isHost ? 'End session' : 'Leave'}">${ICONS.close}</button>
          </div>
        </div>

        ${this.chatPanelHtml(true)}
      </div>
    `;

    // Attach event listeners
    document.getElementById('live-camera-btn')?.addEventListener('click', () => this.toggleCamera());
    document.getElementById('live-mic-btn')?.addEventListener('click', () => this.toggleMic());
    document.getElementById('live-screen-btn')?.addEventListener('click', () => this.toggleScreenShare());
    document.getElementById('live-flip-btn')?.addEventListener('click', () => this.flipCamera());
    document.getElementById('live-chat-btn')?.addEventListener('click', () => this.toggleChat());
    document.getElementById('live-react-btn')?.addEventListener('click', () => this.tapReact());
    document.getElementById('live-support-btn')?.addEventListener('click', () => this.tapSupport());
    document.getElementById('live-share-btn')?.addEventListener('click', () => this.shareSession());
    document.getElementById('live-minimize-btn')?.addEventListener('click', () => this.minimizeStudio());
    document.getElementById('live-leave-btn')?.addEventListener('click', () => isHost ? this.endSession() : this.leaveSession());
  },

  // The chat panel ids are fixed so the polling code always finds them.
  chatPanelHtml(hidden = false) {
    return `
      <div id="live-chat-panel" class="live-chat-panel"${hidden ? ' style="display:none;"' : ''}>
        <div class="live-chat-header">
          <h4>Chat</h4>
          <button class="live-chat-close" onclick="liveInstance.toggleChat()" title="Close chat" aria-label="Close chat">${ICONS.close}</button>
        </div>
        <div id="live-chat-messages" class="live-chat-messages"></div>
        <div class="live-chat-input">
          <input type="file" id="live-chat-file" style="display:none" accept="image/*,.pdf,.epub,.doc,.docx" onchange="liveInstance.handleChatFile(event)">
          <button class="live-chat-attach-btn" onclick="document.getElementById('live-chat-file').click()" title="Attach file">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          <input type="text" id="live-chat-input" placeholder="Type a message..." maxlength="500" onkeypress="if(event.key==='Enter')liveInstance.sendChatMessage()">
          <button id="live-chat-send" onclick="liveInstance.sendChatMessage()">Send</button>
        </div>
      </div>
    `;
  },


  // The tiles hold DOM nodes that died with the old page, so rebuild them from
  // the call object and re-attach every track that is still publishing.
  _rebuildTiles() {
    if (!this.callObject) return;
    this.participantTiles.clear();
    this.participantsMap.clear();
    this.focusedSessionId = null;

    const participants = this.callObject.participants() || {};
    for (const p of Object.values(participants)) {
      if (!p) continue;
      this.addParticipantTile(p);
      const tracks = p.tracks || {};
      if (tracks.video?.persistentTrack) this.attachTrack(p.session_id, tracks.video.persistentTrack);
      if (tracks.audio?.persistentTrack) this.attachTrack(p.session_id, tracks.audio.persistentTrack);
      if (tracks.screenVideo?.persistentTrack) this.attachTrack(p.session_id, tracks.screenVideo.persistentTrack);
      if (tracks.screenAudio?.persistentTrack) this.attachTrack(p.session_id, tracks.screenAudio.persistentTrack);
    }
    this.pickNextFocus();
  },

  // ============================================
  // Daily.co Integration
  // ============================================

  async joinDailyCall(roomUrl) {
    if (this.callObject) {
      await this.callObject.destroy();
      this.callObject = null;
    }

    // Everyone joins as a publisher: camera and mic live from the start.
    this.callObject = window.DailyIframe.createCallObject({
      url: roomUrl,
      userName: store.profile?.full_name || 'User',
      userData: { user_id: store.user.id }
    });

    this.callObject
      .on('joined-meeting', () => {
        const local = this.callObject.participants().local;
        if (local) {
          this.addParticipantTile(local);
          // Explicitly attach local video track if available
          if (local.tracks?.video?.persistentTrack) {
            this.attachTrack(local.session_id, local.tracks.video.persistentTrack);
          }
        }
      })
      .on('participant-joined', (e) => {
        if (e.participant) {
          this.addParticipantTile(e.participant);
          if (this.sessionRole === 'host' && !e.participant.local) {
            const name = e.participant.user_name || 'Someone';
            this._showJoinToast(name);
          }
        }
      })
      .on('participant-left', (e) => {
        if (e.participant) this.removeParticipantTile(e.participant.session_id);
      })
      .on('track-started', (e) => {
        if (e.track && e.participant) this.attachTrack(e.participant.session_id, e.track);
      })
      .on('track-stopped', (e) => {
        if (e.track && e.participant) this.detachTrack(e.participant.session_id, e.track.kind);
      })
      .on('active-speaker-change', (e) => {
        if (e.participant) this.setActiveSpeaker(e.participant.session_id);
        else this.setActiveSpeaker(null);
      })
      .on('left-meeting', () => {
        this.cleanupSession();
      })
      .on('error', (e) => {
        console.error('Daily.co error:', e);
      });

    try {
      if (this.sessionRole === 'host') await this.callObject.startCamera();
      const joinOptions = this.meetingToken ? { token: this.meetingToken } : {};
      await this.callObject.join(joinOptions);
    } catch (error) {
      console.error('Failed to join call:', error);
      appAlert('Could not connect to this session.');
    }
  },

  addParticipantTile(p) {
    const rail = document.getElementById('live-participant-rail');
    if (!rail) return;

    const sessionId = p.session_id;
    if (this.participantTiles.has(sessionId)) return;

    this.participantsMap.set(sessionId, p);

    const hostId = this.activeSession?.user_id;
    const isHost = !!(p.user_data?.user_id && hostId && p.user_data.user_id === hostId);
    const name = p.user_name || (p.local ? 'You' : 'Participant');

    const tile = document.createElement('div');
    tile.className = `live-participant-tile${p.local ? ' local' : ''}${isHost ? ' host' : ''}`;
    tile.dataset.sessionId = sessionId;
    if (p.user_data?.user_id) tile.dataset.userId = p.user_data.user_id;
    tile.title = name;
    tile.addEventListener('click', () => this.setFocus(sessionId));

    const video = document.createElement('video');
    video.id = `video-${sessionId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    // Separate audio element: video is always muted so its audio track never
    // plays through it, and remote audio is routed here instead.
    const audio = document.createElement('audio');
    audio.id = `audio-${sessionId}`;
    audio.autoplay = true;
    if (p.local) audio.muted = true;

    const info = document.createElement('div');
    info.className = 'live-participant-info';
    info.innerHTML = `<span>${esc(name)}${p.local ? ' (You)' : ''}</span>`;

    tile.appendChild(video);
    tile.appendChild(audio);
    tile.appendChild(info);

    if (isHost) {
      const badge = document.createElement('div');
      badge.className = 'live-host-badge';
      badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span>Host</span>';
      tile.appendChild(badge);
    }

    // '...' button on remote tiles for menu actions
    if (!p.local) {
      const menuBtn = document.createElement('button');
      menuBtn.className = 'live-tile-menu-btn';
      menuBtn.innerHTML = ICONS.more;
      menuBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const rect = menuBtn.getBoundingClientRect();
        this.showTileMenu(sessionId, rect.right - 160, rect.bottom + 4);
      });
      tile.appendChild(menuBtn);
    }

    rail.appendChild(tile);

    this.participantTiles.set(sessionId, {
      tile, video, audio, info,
      local: !!p.local, isHost, name,
      videoTrack: null, audioTrack: null
    });

    // Default the stage to the host; otherwise focus the first tile we get.
    if (!this.focusedSessionId || isHost) {
      this.setFocus(sessionId);
    }
  },

  removeParticipantTile(sessionId) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    entry.tile.remove();
    this.participantTiles.delete(sessionId);
    this.participantsMap.delete(sessionId);

    if (this.focusedSessionId === sessionId) {
      this.focusedSessionId = null;
      this.pickNextFocus();
    }
  },

  pickNextFocus() {
    if (this.participantTiles.size === 0) {
      this.updateStage();
      return;
    }
    // Prefer the host, then the local user, then anyone.
    let next = null;
    for (const [id, e] of this.participantTiles) {
      if (e.isHost) { next = id; break; }
      if (e.local && !next) next = id;
    }
    if (!next) next = this.participantTiles.keys().next().value;
    this.setFocus(next);
  },

  setFocus(sessionId) {
    if (!this.participantTiles.has(sessionId)) return;
    this.focusedSessionId = sessionId;
    for (const [id, e] of this.participantTiles) {
      e.tile.classList.toggle('focused', id === sessionId);
    }
    this.updateStage();
  },

  updateStage() {
    const stageVideo = document.getElementById('live-stage-video');
    const stageInfo = document.getElementById('live-stage-info');
    const stageEmpty = document.getElementById('live-stage-empty');
    if (!stageVideo) return;

    const entry = this.focusedSessionId ? this.participantTiles.get(this.focusedSessionId) : null;
    if (entry && entry.videoTrack) {
      stageVideo.srcObject = new MediaStream([entry.videoTrack]);
      stageVideo.play?.().catch(() => {});
      if (stageEmpty) stageEmpty.style.display = 'none';
      stageVideo.classList.toggle('speaking', entry.tile.classList.contains('speaking'));
    } else {
      stageVideo.srcObject = null;
      if (stageEmpty) stageEmpty.style.display = 'flex';
    }
    if (stageInfo) {
      stageInfo.textContent = entry ? entry.name : '';
      stageInfo.style.display = entry ? 'flex' : 'none';
    }
  },

  setActiveSpeaker(sessionId) {
    for (const [id, e] of this.participantTiles) {
      e.tile.classList.toggle('speaking', id === sessionId);
    }
    const stageVideo = document.getElementById('live-stage-video');
    if (stageVideo) {
      stageVideo.classList.toggle('speaking', sessionId === this.focusedSessionId);
    }
  },

  attachTrack(sessionId, track) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (track.kind === 'video') {
      entry.videoTrack = track;
      try {
        entry.video.srcObject = new MediaStream([track]);
        entry.video.play?.().catch(() => {});
      } catch (err) {
        console.error('Attach video failed:', err);
      }
      if (sessionId === this.focusedSessionId) this.updateStage();
    } else if (track.kind === 'audio') {
      // Skip our own audio to avoid echo/feedback.
      if (entry.local) return;
      entry.audioTrack = track;
      try {
        entry.audio.srcObject = new MediaStream([track]);
        entry.audio.muted = false;
        const pr = entry.audio.play?.();
        if (pr && pr.catch) pr.catch((err) => console.warn('Audio autoplay blocked:', err));
      } catch (err) {
        console.error('Attach audio failed:', err);
      }
    }
  },

  detachTrack(sessionId, kind) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;

    if (kind === 'video') {
      entry.videoTrack = null;
      entry.video.srcObject = null;
      if (sessionId === this.focusedSessionId) this.updateStage();
    } else if (kind === 'audio') {
      entry.audioTrack = null;
      entry.audio.srcObject = null;
    }
  },

  // ============================================
  // Controls
  // ============================================

  toggleCamera() {
    if (!this.callObject) return;
    // Check if host has muted this participant
    const localEntry = Array.from(this.participantTiles.values()).find(e => e.local);
    if (localEntry?._hostMuted) {
      alert('The host has muted your camera. You cannot unmute yourself.');
      return;
    }
    const current = this.callObject.localVideo();
    this.callObject.setLocalVideo(!current);
    const btn = document.getElementById('live-camera-btn');
    if (btn) {
      btn.innerHTML = !current ? ICONS.video : ICONS.videoOff;
      btn.classList.toggle('active', current);
    }
  },

  toggleMic() {
    if (!this.callObject) return;
    // Check if host has muted this participant
    const localEntry = Array.from(this.participantTiles.values()).find(e => e.local);
    if (localEntry?._hostMuted) {
      alert('The host has muted your microphone. You cannot unmute yourself.');
      return;
    }
    const current = this.callObject.localAudio();
    this.callObject.setLocalAudio(!current);
    const btn = document.getElementById('live-mic-btn');
    if (btn) {
      btn.innerHTML = !current ? ICONS.mic : ICONS.micOff;
      btn.classList.toggle('active', current);
    }
  },

  toggleChat() {
    this.chatOpen = !this.chatOpen;
    const panel = document.getElementById('live-chat-panel');
    if (!panel) return;
    panel.style.display = this.chatOpen ? 'flex' : 'none';

    if (this.chatOpen && window.innerWidth <= 768) {
      document.body.classList.add('live-chat-modal-open');
      if (!this._chatBackdrop) {
        this._chatBackdrop = document.createElement('div');
        this._chatBackdrop.className = 'live-chat-backdrop';
        this._chatBackdrop.addEventListener('click', () => this.toggleChat());
        document.body.appendChild(this._chatBackdrop);
      }
    } else {
      this._closeChatOverlay();
    }
  },

  _closeChatOverlay() {
    document.body.classList.remove('live-chat-modal-open');
    if (this._chatBackdrop) {
      this._chatBackdrop.remove();
      this._chatBackdrop = null;
    }
  },

  muteParticipant(sessionId) {
    if (this.sessionRole !== 'host' || !this.callObject) return;
    try {
      this.callObject.updateParticipant(sessionId, { setAudio: false, setVideo: false });
      const entry = this.participantTiles.get(sessionId);
      if (entry) entry._hostMuted = true;
    } catch (error) {
      console.error('Mute participant failed:', error);
    }
  },

  async kickParticipant(sessionId) {
    if (this.sessionRole !== 'host' || !this.callObject) return;
    const entry = this.participantTiles.get(sessionId);
    const targetUserId = entry?.tile?.dataset?.userId;

    // Record kick on server to prevent rejoin
    if (targetUserId && this.activeSession) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${API_BASE_URL}/api/live/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ sessionId: this.activeSession.id, targetUserId })
          });
        }
      } catch (e) { console.warn('Failed to record kick:', e); }
    }

    try {
      this.callObject.updateParticipant(sessionId, { eject: true });
    } catch (error) {
      console.error('Kick participant failed:', error);
    }
  },

  showTileMenu(sessionId, x, y) {
    const entry = this.participantTiles.get(sessionId);
    if (!entry) return;
    const viewerIsHost = this.sessionRole === 'host';
    const tileIsHost = entry.isHost;

    document.querySelectorAll('.live-tile-menu-overlay').forEach(o => o.remove());

    const overlay = document.createElement('div');
    overlay.className = 'live-tile-menu-overlay';
    overlay.addEventListener('click', () => overlay.remove());

    const menu = document.createElement('div');
    menu.className = 'live-tile-menu';
    menu.addEventListener('click', (ev) => ev.stopPropagation());

    const items = [];
    if (viewerIsHost && !entry.local) {
      items.push({
        icon: ICONS.micOff,
        label: 'Mute',
        action: () => { this.muteParticipant(sessionId); overlay.remove(); }
      });
      items.push({
        icon: ICONS.userX,
        label: 'Kick out',
        danger: true,
        action: () => { this.kickParticipant(sessionId); overlay.remove(); }
      });
    }
    if (!viewerIsHost && tileIsHost) {
      items.push({
        icon: ICONS.message,
        label: 'Chat me up',
        action: () => { overlay.remove(); this.chatMeUp(); }
      });
    }
    items.push({
      icon: ICONS.flag,
      label: 'Report',
      action: () => { overlay.remove(); this.reportLiveSession(); }
    });

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'live-tile-menu-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = `${item.icon} <span>${item.label}</span>`;
      btn.addEventListener('click', item.action);
      menu.appendChild(btn);
    }

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(x, vw - rect.width - 12);
    let top = Math.min(y, vh - rect.height - 12);
    left = Math.max(12, left);
    top = Math.max(12, top);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  },

  chatMeUp() {
    if (!this.activeSession) return;
    const hostId = this.activeSession.user_id;
    if (!hostId) return;
    window.location.hash = `/ping?u=${hostId}`;
  },

  minimizeStudio() {
    if (!this.activeSession || this.minimized) return;
    this.minimized = true;

    document.body.classList.remove('live-studio-active');
    this._closeChatOverlay();
    const studio = document.querySelector('.live-studio-container');
    if (studio) studio.style.display = 'none';

    // The session list stands in behind the floating tile so the page is not
    // blank.
    this.showLanding();

    const tile = document.createElement('div');
    tile.className = 'live-minimized-tile';
    tile.id = 'live-minimized-tile';
    tile.innerHTML = `
      <div class="live-minimized-video">
        <video id="live-mini-video" autoplay playsinline muted></video>
        <div class="live-mini-overlay">
          <span class="live-mini-live">LIVE</span>
        </div>
      </div>
      <div class="live-minimized-info">
        <span class="live-minimized-title">${esc(this.activeSession.title)}</span>
        <button class="live-minimized-close" title="Close">${ICONS.close}</button>
      </div>
    `;
    document.body.appendChild(tile);

    // Try to clone the stage video into the mini tile
    const stageVideo = document.getElementById('live-stage-video');
    const miniVideo = document.getElementById('live-mini-video');
    if (stageVideo && stageVideo.srcObject && miniVideo) {
      miniVideo.srcObject = stageVideo.srcObject;
      miniVideo.play().catch(() => {});
    }

    // Position at bottom-right
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    tile.style.left = (vw - 220) + 'px';
    tile.style.top = (vh - 180) + 'px';

    // Drag support
    this._initMiniDrag(tile);

    // Click to restore (but not on close button or after drag)
    tile.addEventListener('click', (ev) => {
      if (ev.target.closest('.live-minimized-close')) return;
      if (tile._wasDragged && tile._wasDragged()) return;

      if (window.gliimRoute.path() !== '/live') {
        window.location.hash = '/live';
        const waitForRestore = () => {
          if (document.querySelector('.live-studio-container')) {
            this.restoreStudio();
          } else {
            requestAnimationFrame(waitForRestore);
          }
        };
        waitForRestore();
      } else {
        this.restoreStudio();
      }
    });

    // Close button = leave session
    tile.querySelector('.live-minimized-close')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const isHost = this.sessionRole === 'host';
      if (isHost) this.endSession();
      else this.leaveSession();
    });
  },

  _initMiniDrag(tile) {
    let dragging = false;
    let moved = false;
    let startX, startY, origX, origY;
    const DRAG_THRESHOLD = 8;

    const onDown = (ev) => {
      if (ev.target.closest('.live-minimized-close')) return;
      const touch = ev.touches ? ev.touches[0] : ev;
      startX = touch.clientX;
      startY = touch.clientY;
      origX = tile.offsetLeft;
      origY = tile.offsetTop;
      dragging = true;
      moved = false;
    };

    const onMove = (ev) => {
      if (!dragging) return;
      const touch = ev.touches ? ev.touches[0] : ev;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      moved = true;
      ev.preventDefault();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let newX = origX + dx;
      let newY = origY + dy;
      newX = Math.max(0, Math.min(newX, vw - tile.offsetWidth));
      newY = Math.max(0, Math.min(newY, vh - tile.offsetHeight));
      tile.style.left = newX + 'px';
      tile.style.top = newY + 'px';
    };

    const onUp = () => { dragging = false; };

    tile.addEventListener('mousedown', onDown);
    tile.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    tile._wasDragged = () => moved;
    tile._dragCleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    };
  },

  restoreStudio() {
    if (!this.minimized) return;
    this.minimized = false;

    const tile = document.getElementById('live-minimized-tile');
    if (tile) {
      if (tile._dragCleanup) tile._dragCleanup();
      tile.remove();
    }

    document.body.classList.add('live-studio-active');
    this.hideLanding();
    const studio = document.querySelector('.live-studio-container');
    if (studio) studio.style.display = '';

    // Re-attach the video stream back to the stage
    const stageVideo = document.getElementById('live-stage-video');
    const miniVideo = document.getElementById('live-mini-video');
    if (stageVideo && miniVideo && miniVideo.srcObject) {
      stageVideo.srcObject = miniVideo.srcObject;
      stageVideo.play().catch(() => {});
    }
  },

  _restoreFromNavigation() {
    this.minimized = false;

    const tile = document.getElementById('live-minimized-tile');
    if (tile) {
      if (tile._dragCleanup) tile._dragCleanup();
      tile.remove();
    }

    this.hideLanding();

    document.body.classList.add('live-studio-active');
    this.renderSessionUI();

    // Every tile and every track lived in the DOM that just went away, so
    // rebuild them from the call object that is still running.
    this._rebuildTiles();

    this.startChatPolling(this.activeSession.id);
    heartbeat.setCurrentPost(null);
    heartbeat.start();
  },

  _showJoinToast(name) {
    const existing = document.getElementById('live-join-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'live-join-toast';
    toast.className = 'live-join-toast';
    toast.innerHTML = `<span class="live-toast-dot"></span><span>${esc(name)} joined</span>`;
    const studio = document.querySelector('.live-studio-container');
    if (studio) studio.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  reportLiveSession() {
    if (!this.activeSession) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 440px;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        <h2 style="margin-bottom: 8px;">Report Session</h2>
        <p class="text-muted" style="margin-bottom: 16px;">State your reason for reporting this live session. It will be reviewed by the team.</p>
        <textarea id="live-report-reason" class="input" rows="4" placeholder="Reason for reporting..." style="width:100%;box-sizing:border-box;"></textarea>
        <button class="btn-primary" id="live-report-submit" style="width:100%;margin-top:16px;">Submit Report</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('live-report-submit').addEventListener('click', async () => {
      const reason = document.getElementById('live-report-reason').value.trim();
      if (reason.length < 5) return appAlert('Please state a reason (at least 5 characters).');

      const btn = document.getElementById('live-report-submit');
      btn.disabled = true;
      btn.innerText = 'Submitting...';

      const { error } = await supabase.from('reports').insert({
        reporter_id: store.user.id,
        target_type: 'live_session',
        target_id: this.activeSession.id,
        reason
      });

      if (error) {
        btn.disabled = false;
        btn.innerText = 'Submit Report';
        return appAlert('Report failed: ' + error.message);
      }

      overlay.remove();
      appAlert('Thank you. Your report has been submitted for review.');
    });
  },

  async toggleScreenShare() {
    if (!this.callObject) return;
    
    // Track screen share state locally since call object API doesn't expose localScreen()
    if (this.screenSharing) {
      this.callObject.stopScreenShare();
      this.screenSharing = false;
      const btn = document.getElementById('live-screen-btn');
      if (btn) btn.classList.remove('active');
    } else {
      try {
        await this.callObject.startScreenShare();
        this.screenSharing = true;
        const btn = document.getElementById('live-screen-btn');
        if (btn) btn.classList.add('active');
      } catch (error) {
        console.error('Screen share error:', error);
      }
    }
  },

  flipCamera() {
    if (!this.callObject) return;
    try {
      const result = this.callObject.cycleCamera();
      if (result && result.catch) result.catch((err) => console.warn('Camera swap failed:', err));
    } catch (error) {
      console.warn('Camera swap failed:', error);
    }
  },

  // One tap takes G10 out of the wallet with no confirmation screen. A short
  // wallet is the only case that asks, and then it can only offer what it holds.
  async tapSupport() {
    if (!this.activeSession || this.sessionRole === 'host') return;
    if (this._supportBusy) return;

    const COST = 10;
    const balance = Number(store.profile?.wallet_balance || 0);
    let partial = false;

    if (balance <= 0) {
      appAlert(`Supporting costs G${COST} and your wallet is empty. Top up from Billing.`);
      return;
    }
    if (balance < COST) {
      const ok = await appConfirm(
        `Your wallet is low - it holds G${balance}. Supporting this session costs G${COST}. Send the G${balance} you have instead? The host keeps 70% of it.`,
        { okText: `Send G${balance}` }
      );
      if (!ok) return;
      partial = true;
    }

    this._supportBusy = true;
    const btn = document.getElementById('live-support-btn');
    if (btn) btn.classList.add('is-busy');
    try {
      const { data, error } = await supabase.rpc('support_live_session', {
        p_request: this.activeSession.id,
        p_accept_partial: partial,
      });

      if (error) {
        const msg = String(error.message || '');
        if (msg.includes('INSUFFICIENT_FUNDS')) appAlert('Your wallet is too low to support. Top up from Billing.');
        else if (msg.includes('SESSION_NOT_ACTIVE')) appAlert('This session is no longer live.');
        else if (msg.includes('SESSION_NOT_FOUND')) appAlert('This session could not be found.');
        else if (msg.includes('NOT_AUTHENTICATED')) appAlert('Please sign in again.');
        else if (msg.includes('CANNOT_SUPPORT_SELF')) appAlert('You cannot support your own session.');
        else appAlert('Support failed: ' + (msg || 'unknown error'));
        return;
      }

      const spent = Number(data?.cost || (partial ? balance : COST));
      if (store.profile) store.profile.wallet_balance = Math.max(0, balance - spent);
      this._flashSupport(spent);
    } finally {
      if (btn) btn.classList.remove('is-busy');
      this._supportBusy = false;
    }
  },

  // The database owns the like -> heart -> bolt maths; this only mirrors the
  // emoji onto the button. The floating reaction itself arrives over realtime,
  // which reaches the tapper too, so nothing is drawn twice here.
  async tapReact() {
    if (!this.activeSession || this.sessionRole === 'host') return;
    const { data, error } = await supabase.rpc('react_live_session', { p_request: this.activeSession.id });
    if (error || !data?.ok) return;
    this._setReactIcon(data.emoji);
  },

  _setReactIcon(emoji) {
    const btn = document.getElementById('live-react-btn');
    if (!btn || !ICONS[emoji]) return;
    btn.innerHTML = ICONS[emoji];
    btn.classList.toggle('is-bolt', emoji === 'bolt');
  },

  // Reaction rows carry the tapper's name and avatar because Daily participant
  // ids do not map to Gliimu ids, and a second query per tap is not worth it.
  _spawnReaction(row) {
    const stage = document.querySelector('.live-video-area');
    if (!stage || !row || !ICONS[row.emoji]) return;
    const fly = document.createElement('div');
    fly.className = 'live-react-fly emoji-' + row.emoji;
    fly.style.left = (6 + Math.random() * 58).toFixed(1) + '%';
    const pic = row.avatar_url ? esc(row.avatar_url) : esc(initialsAvatar(row.user_name));
    const gp = Number(row.gp_awarded || 0);
    fly.innerHTML = `
      <img class="live-react-avatar" src="${pic}" alt="">
      <span class="live-react-ico">${ICONS[row.emoji]}</span>
      ${row.user_name ? `<span class="live-react-name">${esc(row.user_name)}</span>` : ''}
      ${gp > 0 ? `<span class="live-react-gp">+${gp} GP${Number(row.cycle) > 1 ? ' &middot; cycle ' + Number(row.cycle) : ''}</span>` : ''}
    `;
    stage.appendChild(fly);
    setTimeout(() => fly.remove(), 2400);
  },

  _flashSupport(amount) {
    const stage = document.querySelector('.live-video-area') || document.querySelector('.live-studio-container');
    if (!stage) return;
    const fly = document.createElement('div');
    fly.className = 'live-support-fly';
    fly.innerHTML = `${ICONS.bolt}<span>G${amount}</span>`;
    stage.appendChild(fly);
    setTimeout(() => fly.remove(), 1500);
  },

  shareSession() {
    if (!this.activeSession) return;

    const joinUrl = `${window.location.origin}${window.location.pathname}#/live?join=${this.activeSession.id}`;
    const sessionTitle = this.activeSession.title || 'Live Session';

    navigator.clipboard.writeText(joinUrl).catch(() => {});

    this._openShareChatPicker(sessionTitle, joinUrl);
  },

  async _openShareChatPicker(sessionTitle, joinUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 420px; max-height: 80vh; display: flex; flex-direction: column;">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        <h2 style="margin-bottom: 4px;">Share Session</h2>
        <p class="text-muted" style="margin-bottom: 12px; font-size: 13px;">Link copied. Choose where to share.</p>

        <div id="share-select-all-row" style="display:flex;align-items:center;gap:10px;padding:6px 12px;margin-bottom:4px;">
          <input type="checkbox" id="share-select-all-cb" style="width:16px;height:16px;accent-color:var(--brand-primary);cursor:pointer;flex-shrink:0;">
          <span style="font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;" id="share-select-all-label">Select all chats</span>
        </div>

        <div id="share-chat-list" style="flex: 1; overflow-y: auto; min-height: 0;">
          <p class="text-muted" style="text-align: center; padding: 20px;">Loading chats...</p>
        </div>
        <button class="btn-primary" id="share-done-btn" style="width: 100%; margin-top: 12px; flex-shrink: 0;" disabled>Share</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });

    const listEl = overlay.querySelector('#share-chat-list');
    const doneBtn = overlay.querySelector('#share-done-btn');
    const selectAllCb = overlay.querySelector('#share-select-all-cb');
    const selectAllLabel = overlay.querySelector('#share-select-all-label');

    const toggleAll = () => {
      selectAllCb.checked = !selectAllCb.checked;
      listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = selectAllCb.checked; });
      updateBtn();
    };
    selectAllCb.addEventListener('change', () => {
      listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = selectAllCb.checked; });
      updateBtn();
    });
    selectAllLabel.addEventListener('click', toggleAll);

    try {
      const contacts = await this._fetchChatContacts();
      if (contacts.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">No chats yet. Start a conversation in Ping first.</p>';
      } else {
        listEl.innerHTML = contacts.map(c => `
          <label class="share-chat-item" data-contact-id="${c.id}">
            <input type="checkbox" value="${c.id}">
            <img src="${c.avatar_url ? esc(c.avatar_url) : initialsAvatar(c.full_name)}" alt="" class="share-chat-avatar" onerror="this.src=window._initialsAvatar('${esc(c.full_name).replace(/'/g, "\\'")}')">
            <span class="share-chat-name">${esc(c.full_name)}</span>
          </label>
        `).join('');
      }

      const updateBtn = () => {
        const chatChecked = listEl.querySelectorAll('input:checked').length;
        doneBtn.disabled = chatChecked === 0;
        doneBtn.textContent = chatChecked === 0
          ? 'Share'
          : `Share to ${chatChecked} chat${chatChecked > 1 ? 's' : ''}`;
      };

      listEl.addEventListener('change', updateBtn);
      updateBtn();

      doneBtn.addEventListener('click', async () => {
        const selectedIds = [...listEl.querySelectorAll('input:checked')].map(cb => cb.value);

        doneBtn.disabled = true;
        doneBtn.textContent = 'Sharing...';

        for (const contactId of selectedIds) {
          await supabase.from('messages').insert({
            sender_id: store.user.id,
            receiver_id: contactId,
            content: sessionTitle,
            attachment_url: joinUrl,
            attachment_type: 'live_invite',
            is_ai: false
          });
        }

        overlay.remove();
        if (selectedIds.length > 0) {
          appAlert(`Shared to ${selectedIds.length} chat${selectedIds.length > 1 ? 's' : ''}.`);
        }
      });

    } catch (err) {
      console.error('Failed to load chats:', err);
      listEl.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Could not load chats.</p>';
    }
  },

  async _fetchChatContacts() {
    const { data: received } = await supabase
      .from('messages')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${store.user.id},receiver_id.eq.${store.user.id}`)
      .is('room', null)
      .is('is_ai', false)
      .is('is_admin', false);

    if (!received || received.length === 0) return [];

    const contactIds = new Set();
    for (const m of received) {
      const other = m.sender_id === store.user.id ? m.receiver_id : m.sender_id;
      if (other && other !== store.user.id) contactIds.add(other);
    }

    if (contactIds.size === 0) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', [...contactIds]);

    return profiles || [];
  },

  // ============================================
  // Chat
  // ============================================

  async sendChatMessage() {
    const input = document.getElementById('live-chat-input');
    if (!input) return;
    const chatSession = this.activeSession;
    const content = input.value.trim();
    if ((!content && !this._pendingAttachment) || !chatSession) return;
    if (this._sendingChat) return;

    const attachment = this._pendingAttachment;
    this._sendingChat = true;
    const sendBtn = document.getElementById('live-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body = { roomId: chatSession.id };
      if (content) body.content = content.slice(0, 1000);
      if (attachment) {
        body.attachment_url = attachment.url;
        body.attachment_type = attachment.type;
      }

      const response = await fetch(`${API_BASE_URL}/api/live/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `Server rejected the message (${response.status})`);
      }

      input.value = '';
      this._pendingAttachment = null;
      this.clearAttachmentPreview();
      await this.loadChatMessages(chatSession.id);
    } catch (error) {
      console.error('Send chat error:', error);
      appAlert('Message not sent: ' + (error?.message || 'unknown error'));
    } finally {
      this._sendingChat = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  },

  async handleChatFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    try {
      const uploaded = await uploadAttachment(file);
      this._pendingAttachment = uploaded;
      this.showAttachmentPreview(uploaded, file.name);
    } catch (err) {
      console.error('File upload failed:', err);
      const msg = err?.message || '';
      if (msg.includes('session') || msg.includes('sign in')) {
        appAlert('Your session has expired. Please refresh the page and sign in again.');
      } else {
        appAlert('Upload failed: ' + msg);
      }
    }
  },

  showAttachmentPreview(attachment, fileName) {
    this.clearAttachmentPreview();
    const inputRow = document.querySelector('.live-chat-input');
    if (!inputRow) return;

    const preview = document.createElement('div');
    preview.className = 'live-chat-attachment-preview';
    preview.id = 'live-attach-preview';

    const isImage = attachment.type === 'image';
    if (isImage) {
      preview.innerHTML = `
        <img src="${esc(attachment.url)}" alt="">
        <span>${esc(fileName)}</span>
        <button class="live-attach-remove" onclick="liveInstance.clearAttachmentPreview()">&times;</button>
      `;
    } else {
      const ext = fileName.split('.').pop().toUpperCase();
      preview.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span>${esc(fileName)} (${ext})</span>
        <button class="live-attach-remove" onclick="liveInstance.clearAttachmentPreview()">&times;</button>
      `;
    }

    inputRow.parentNode.insertBefore(preview, inputRow);
  },

  clearAttachmentPreview() {
    this._pendingAttachment = null;
    const el = document.getElementById('live-attach-preview');
    if (el) el.remove();
  },

  async loadChatMessages(requestId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${API_BASE_URL}/api/live/chat/${requestId}?limit=50`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        this.chatErrorCount++;
        if (this.chatErrorCount >= 3) {
          console.warn('Chat polling stopped after 3 consecutive errors');
          this.stopChatPolling();
        }
        return;
      }

      this.chatErrorCount = 0;
      const result = await response.json();
      this.chatMessages = result.messages || [];
      this.renderChatMessages();
    } catch (error) {
      console.error('Load chat error:', error);
      this.chatErrorCount++;
      if (this.chatErrorCount >= 3) {
        console.warn('Chat polling stopped after 3 consecutive errors');
        this.stopChatPolling();
      }
    }
  },

  startChatPolling(requestId) {
    if (this.chatPollInterval) clearInterval(this.chatPollInterval);
    this.chatErrorCount = 0;
    this.chatPollInterval = setInterval(() => this.loadChatMessages(requestId), 3000);
  },

  stopChatPolling() {
    if (this.chatPollInterval) {
      clearInterval(this.chatPollInterval);
      this.chatPollInterval = null;
    }
  },

  renderChatMessages() {
    const container = document.getElementById('live-chat-messages');
    if (!container) return;

    container.innerHTML = this.chatMessages.map(msg => {
      const isOwn = msg.user_id === store.user.id;
      const name = msg.profiles?.full_name || 'Participant';
      const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let attachmentHtml = '';
      if (msg.attachment_url) {
        if (msg.attachment_type === 'image') {
          attachmentHtml = `<div class="live-chat-attachment"><img src="${esc(msg.attachment_url)}" alt="Shared image" loading="lazy"></div>`;
        } else {
          const label = msg.content || 'Download file';
          attachmentHtml = `<div class="live-chat-attachment"><a href="${esc(msg.attachment_url)}" target="_blank" class="live-chat-file-link"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${esc(label)}</a></div>`;
        }
      }

      const contentHtml = msg.content ? `<div class="live-chat-message-content">${esc(msg.content)}</div>` : '';

      return `
        <div class="live-chat-message ${isOwn ? 'own' : ''}" id="chat-msg-${esc(msg.id)}">
          <div class="live-chat-message-header">
            <strong>${esc(name)}</strong>
            <span class="live-chat-message-time">${time}</span>
          </div>
          ${contentHtml}
          ${attachmentHtml}
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  },

  // ============================================
  // Session Timer
  // ============================================

  startSessionTimer() {
    if (this.sessionTimerInterval) return;

    const tick = () => {
      if (!this.sessionStartTime) return;

      // The hour runs from go-on-air, not from this viewer's arrival, so a late
      // joiner and a refresh see the same clock the sweep uses.
      const broadcast = this.activeSession && this.activeSession.started_at
        ? new Date(this.activeSession.started_at).getTime()
        : this.sessionStartTime;
      const elapsed = Date.now() - broadcast;
      const remaining = MAX_SESSION_DURATION - elapsed;

      if (remaining <= 0) {
        alert('Session duration limit reached (1 hour). Session ending now.');
        if (this.sessionRole === 'host') {
          this.endSession();
        } else {
          this.leaveSession();
        }
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const timerEl = document.getElementById('live-session-timer');
      if (timerEl) timerEl.textContent = label;

      this.liveSecs = Math.floor(elapsed / 1000);
    };

    tick();
    this.sessionTimerInterval = setInterval(tick, 1000);
  },

  // ============================================
  // Realtime
  // ============================================

  setupSessionRealtime(id) {
    if (this.sessionChannel) supabase.removeChannel(this.sessionChannel);
    
    this.sessionChannel = supabase.channel('live-session-' + id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_requests',
        filter: 'id=eq.' + id
      }, (payload) => {
        const next = payload.new;
        if (!next) return;

        // Host ended (or cancelled) the session: everyone leaves.
        if (next.status === 'completed' || next.status === 'cancelled') {
          if (!this.activeSession) return; // already torn down locally
          const wasHost = this.sessionRole === 'host';
          this.cleanupSession();
          if (!wasHost) {
            appConfirm('The host ended this session.', { okText: 'OK' });
          }
          return;
        }

        console.log('Session updated:', next);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'live_reactions',
        filter: 'room_id=eq.' + id
      }, (payload) => this._spawnReaction(payload.new))
      .subscribe();
  },

  // ============================================
  // Leave / End Session
  // ============================================

  async leaveSession() {
    const confirm = await appConfirm('Leave this session?', { okText: 'Leave', danger: true });
    if (!confirm) return;

    try {
      await supabase.rpc('decrement_participant_count', { p_request_id: this.activeSession.id });

      if (this.callObject) await this.callObject.leave();
      this.cleanupSession();
    } catch (error) {
      console.error('Leave session error:', error);
    }
  },

  async endSession() {
    if (!this.activeSession) {
      console.warn('No active session to end');
      this.cleanupSession();
      return;
    }

    const confirm = await appConfirm('End this session for everyone?', { okText: 'End', danger: true });
    if (!confirm) return;

    const sessionId = this.activeSession.id;
    const roomId = this.activeSession.room_id;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      await supabase
        .from('live_requests')
        .update({
          status: 'completed',
          completed_by: store.user.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      // Leave the call before deleting the room: Daily refuses to delete a
      // room that still has participants in it.
      if (this.callObject) await this.callObject.leave();

      if (roomId) {
        await deleteRoomQuietly(sessionId, session.access_token);
      }

      this.cleanupSession();
    } catch (error) {
      console.error('End session error:', error);
    }
  },

  async forceEndLive() {
    if (!this.activeSession) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const roomId = this.sessionRole === 'host' ? this.activeSession.room_id : null;
      const sessionId = this.activeSession.id;

      if (this.sessionRole === 'host') {
        await supabase
          .from('live_requests')
          .update({
            status: 'completed',
            completed_by: store.user.id,
            completed_at: new Date().toISOString()
          })
          .eq('id', sessionId);
      } else {
        await supabase.rpc('decrement_participant_count', { p_request_id: sessionId });
      }

      if (this.callObject) await this.callObject.leave();

      if (roomId) await deleteRoomQuietly(sessionId, session.access_token);

      this.cleanupSession();
    } catch (error) {
      console.error('Force end live error:', error);
      this.cleanupSession();
    }
  },

  cleanupSession() {
    // Clear persisted session
    try { sessionStorage.removeItem('liveSession'); } catch (e) {}

    this.chatOpen = false;
    this._closeChatOverlay();
    document.body.classList.remove('live-studio-active');
    document.querySelectorAll('.live-tile-menu-overlay').forEach(o => o.remove());
    const miniTile = document.getElementById('live-minimized-tile');
    if (miniTile) {
      if (miniTile._dragCleanup) miniTile._dragCleanup();
      miniTile.remove();
    }
    this.minimized = false;
    heartbeat.stop();
    heartbeat.setCurrentPost(null);

    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    this.stopChatPolling();
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
    if (this.sessionChannel) {
      supabase.removeChannel(this.sessionChannel);
      this.sessionChannel = null;
    }

    this.participantTiles.clear();
    this.participantsMap.clear();
    this.chatMessages = [];
    this.activeSession = null;
    this.sessionRole = null;
    this.meetingToken = null;
    this.screenSharing = false;
    this.focusedSessionId = null;

    // Back on the Live page with no session left: show the session list again.
    if (document.getElementById('live-container')) this.showLanding();
  }
};

export default liveView;
