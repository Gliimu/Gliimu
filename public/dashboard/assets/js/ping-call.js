import { supabase, API_BASE_URL } from '/shared/js/config.js';
import { store } from './store.js?v=2';

const WS_URL = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/call-signaling';
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

const HEARTBEAT_INTERVAL_MS = 60000; // 60 seconds

const ICONS = {
  phone: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
  video: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  mic: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  micOff: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>',
  videoOff: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
  end: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>',
  accept: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  reject: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
};

const CallManager = {
  ws: null,
  currentCall: null,
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  heartbeatTimer: null,
  callTimer: null,
  callStartTime: null,
  isMuted: false,
  isVideoOff: false,
  pendingOffer: null,
  pendingCandidates: [],

  async init() {
    if (this.ws) return;
    await this._connectWebSocket();
  },

  async _connectWebSocket() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[PingCall] No session available');
      return;
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[PingCall] WebSocket connected');
      this.ws.send(JSON.stringify({ type: 'auth', token: session.access_token }));
    };

    this.ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      await this._handleSignalingMessage(msg);
    };

    this.ws.onerror = (error) => {
      console.error('[PingCall] WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('[PingCall] WebSocket closed');
      this.ws = null;
      // Always auto-reconnect after 3 seconds to maintain connection
      setTimeout(() => {
        if (!this.ws) {
          console.log('[PingCall] Attempting to reconnect...');
          this._connectWebSocket();
        }
      }, 3000);
    };
  },

  async _handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'auth-success':
        console.log('[PingCall] Authenticated');
        break;
      case 'auth-error':
        console.error('[PingCall] Auth failed:', msg.message);
        break;
      case 'call-incoming':
        await this._handleIncomingCall(msg);
        break;
      case 'call-offer':
        await this._handleCallOffer(msg);
        break;
      case 'call-answer':
        await this._handleCallAnswer(msg);
        break;
      case 'ice-candidate':
        await this._handleIceCandidate(msg);
        break;
      case 'call-rejected':
        this._handleCallRejected(msg.callId);
        break;
      case 'call-missed':
        this._handleCallMissed(msg.callId);
        break;
      case 'call-cancelled':
        this._handleCallCancelled(msg.callId);
        break;
      case 'call-ended':
        this._handleCallEnded(msg.callId);
        break;
      case 'call-failed':
        this._handleCallFailed(msg.callId);
        break;
      case 'call-offline':
        this._handleCallOffline(msg.callId);
        break;
      case 'video-toggled':
        this._handleVideoToggled(msg);
        break;
    }
  },

  async startCall(contactId, callType = 'voice') {
    if (this.currentCall) {
      alert('You are already in a call.');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      alert('Connection not ready. Please try again.');
      return;
    }

    try {
      // Create call record via API
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/calls/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ receiver_id: contactId, call_type: callType })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to initiate call.');
        return;
      }

      this.currentCall = {
        id: data.callId,
        contactId,
        callType: data.callType,
        role: 'caller',
        status: 'initiating'
      };

      // Get media stream
      await this._getMediaStream(callType);

      // Create peer connection
      this._createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer via signaling
      this.ws.send(JSON.stringify({
        type: 'call-initiate',
        callId: this.currentCall.id,
        receiverId: contactId,
        callType: data.callType
      }));

      this.ws.send(JSON.stringify({
        type: 'call-offer',
        callId: this.currentCall.id,
        sdp: offer
      }));

      // Show calling UI
      this._showCallingUI(contactId, callType);

    } catch (error) {
      console.error('[PingCall] Start call error:', error);
      alert('Failed to start call: ' + error.message);
      this._cleanup();
    }
  },

  async _handleIncomingCall(msg) {
    const { callId, callType, caller } = msg;

    this.currentCall = {
      id: callId,
      contactId: caller.id,
      contactName: caller.full_name,
      contactAvatar: caller.avatar_url,
      callType,
      role: 'receiver',
      status: 'ringing'
    };

    this._showIncomingCallModal(caller, callType);
  },

  async acceptCall() {
    if (!this.currentCall || this.currentCall.role !== 'receiver') return;

    try {
      // Get media stream
      await this._getMediaStream(this.currentCall.callType);

      // Create peer connection
      this._createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Apply buffered offer from caller
      if (this.pendingOffer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
        this.pendingOffer = null;
      } else {
        console.error('[PingCall] No offer available when accepting');
        throw new Error('Call offer not received yet. Please try again.');
      }

      // Create and send answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.ws.send(JSON.stringify({
        type: 'call-answer',
        callId: this.currentCall.id,
        sdp: answer
      }));

      // Apply any buffered ICE candidates
      for (const candidate of this.pendingCandidates) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[PingCall] Buffered ICE candidate failed:', e);
        }
      }
      this.pendingCandidates = [];

      this.currentCall.status = 'connecting';
      this._showCallConnectingUI();

    } catch (error) {
      console.error('[PingCall] Accept call error:', error);
      alert('Failed to accept call: ' + error.message);
      this.rejectCall();
    }
  },

  rejectCall() {
    if (!this.currentCall) return;

    this.ws.send(JSON.stringify({
      type: 'call-reject',
      callId: this.currentCall.id
    }));

    this._cleanup();
  },

  async _handleCallOffer(msg) {
    if (!this.currentCall || this.currentCall.role !== 'receiver') return;

    const { sdp } = msg;
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    } else {
      this.pendingOffer = sdp;
      console.log('[PingCall] Buffered offer (peer connection not ready yet)');
    }
  },

  async _handleCallAnswer(msg) {
    if (!this.currentCall || this.currentCall.role !== 'caller') return;

    const { sdp } = msg;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  },

  async _handleIceCandidate(msg) {
    if (!this.currentCall) return;

    const { candidate } = msg;
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[PingCall] Add ICE candidate error:', error);
      }
    } else {
      this.pendingCandidates.push(candidate);
    }
  },

  _handleCallRejected(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      alert('Call rejected.');
      this._cleanup();
    }
  },

  _handleCallMissed(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      alert('Call missed.');
      this._cleanup();
    }
  },

  _handleCallCancelled(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      this._cleanup();
    }
  },

  _handleCallEnded(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      this._cleanup();
    }
  },

  _handleCallFailed(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      alert('Call failed. The other party disconnected.');
      this._cleanup();
    }
  },

  _handleCallOffline(callId) {
    if (this.currentCall && this.currentCall.id === callId) {
      alert('User is offline.');
      this._cleanup();
    }
  },

  _handleVideoToggled(msg) {
    // Update UI to show remote video state
    const remoteVideo = document.getElementById('ping-call-remote-video');
    if (remoteVideo) {
      if (!msg.videoEnabled) {
        remoteVideo.style.display = 'none';
        // Show avatar placeholder
      } else {
        remoteVideo.style.display = '';
      }
    }
  },

  _createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          callId: this.currentCall.id,
          candidate: event.candidate
        }));
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[PingCall] Remote track received');
      this.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('ping-call-remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[PingCall] ICE state:', this.peerConnection.iceConnectionState);
      if (this.peerConnection.iceConnectionState === 'connected') {
        this._onCallConnected();
      } else if (this.peerConnection.iceConnectionState === 'failed' || 
                 this.peerConnection.iceConnectionState === 'disconnected') {
        // Try to reconnect for 15 seconds
        setTimeout(() => {
          if (this.peerConnection && 
              this.peerConnection.iceConnectionState !== 'connected' &&
              this.peerConnection.iceConnectionState !== 'closed') {
            this.endCall();
          }
        }, 15000);
      }
    };
  },

  async _getMediaStream(callType) {
    const constraints = {
      audio: true,
      video: callType === 'video'
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const localVideo = document.getElementById('ping-call-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }
    } catch (error) {
      console.error('[PingCall] Get media error:', error);
      throw new Error('Camera/microphone access denied. Please allow access in browser settings.');
    }
  },

  _onCallConnected() {
    if (this.currentCall.status === 'active') return;

    this.currentCall.status = 'active';
    this.callStartTime = Date.now();

    // Update call status in DB
    supabase.from('ping_calls').update({
      status: 'active',
      started_at: new Date().toISOString()
    }).eq('id', this.currentCall.id);

    // Start billing heartbeat (caller pays)
    if (this.currentCall.role === 'caller') {
      this._startHeartbeat();
    }

    // Start call timer
    this._startCallTimer();

    // Show active call UI
    this._showActiveCallUI();
  },

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.currentCall || this.currentCall.status !== 'active') return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_BASE_URL}/api/calls/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ call_id: this.currentCall.id })
        });

        const data = await res.json();
        if (!data.ok) {
          if (data.code === 'INSUFFICIENT_BALANCE') {
            alert('Insufficient balance. Call ending in 5 seconds...');
            setTimeout(() => this.endCall(), 5000);
          }
        }
      } catch (error) {
        console.error('[PingCall] Heartbeat error:', error);
      }
    }, HEARTBEAT_INTERVAL_MS);
  },

  _startCallTimer() {
    this.callTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timerEl = document.getElementById('ping-call-timer');
      if (timerEl) {
        timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);
  },

  toggleMute() {
    if (!this.localStream) return;

    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    const muteBtn = document.getElementById('ping-call-mute-btn');
    if (muteBtn) {
      muteBtn.innerHTML = this.isMuted ? ICONS.micOff : ICONS.mic;
      muteBtn.classList.toggle('active', this.isMuted);
    }
  },

  toggleVideo() {
    if (!this.localStream) return;

    this.isVideoOff = !this.isVideoOff;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = !this.isVideoOff;
    });

    // Notify other peer
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'video-toggle',
        callId: this.currentCall.id,
        videoEnabled: !this.isVideoOff
      }));
    }

    const videoBtn = document.getElementById('ping-call-video-btn');
    if (videoBtn) {
      videoBtn.innerHTML = this.isVideoOff ? ICONS.videoOff : ICONS.video;
      videoBtn.classList.toggle('active', this.isVideoOff);
    }

    const localVideo = document.getElementById('ping-call-local-video');
    if (localVideo) {
      localVideo.style.display = this.isVideoOff ? 'none' : '';
    }
  },

  async endCall() {
    if (!this.currentCall) return;

    const durationSecs = this.callStartTime 
      ? Math.floor((Date.now() - this.callStartTime) / 1000)
      : 0;

    // Notify server
    this.ws.send(JSON.stringify({
      type: 'call-end',
      callId: this.currentCall.id,
      durationSecs
    }));

    // Update DB
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      fetch(`${API_BASE_URL}/api/calls/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          call_id: this.currentCall.id,
          duration_secs: durationSecs
        })
      });
    }

    this._cleanup();
  },

  _cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteStream) {
      this.remoteStream = null;
    }

    this.pendingOffer = null;
    this.pendingCandidates = [];
    this.currentCall = null;
    this.callStartTime = null;
    this.isMuted = false;
    this.isVideoOff = false;

    // Remove UI
    this._removeCallUI();
  },

  _showCallingUI(contactId, callType) {
    // Fetch contact profile
    supabase.from('profiles').select('full_name, avatar_url').eq('id', contactId).single().then(({ data }) => {
      const overlay = document.createElement('div');
      overlay.id = 'ping-call-overlay';
      overlay.className = 'ping-call-overlay';
      overlay.innerHTML = `
        <div class="ping-call-container">
          <div class="ping-call-header">
            <img src="${data?.avatar_url || '/icons/icon.png'}" alt="" class="ping-call-avatar">
            <div class="ping-call-contact-info">
              <div class="ping-call-contact-name">${data?.full_name || 'User'}</div>
              <div class="ping-call-status">Calling...</div>
            </div>
          </div>
          <div class="ping-call-video-container">
            <video id="ping-call-remote-video" autoplay playsinline></video>
            <video id="ping-call-local-video" autoplay playsinline muted></video>
          </div>
          <div class="ping-call-controls">
            <button class="ping-call-control-btn" id="ping-call-mute-btn" onclick="window.pingCallInstance.toggleMute()">
              ${ICONS.mic}
            </button>
            ${callType === 'video' ? `
              <button class="ping-call-control-btn" id="ping-call-video-btn" onclick="window.pingCallInstance.toggleVideo()">
                ${ICONS.video}
              </button>
            ` : ''}
            <button class="ping-call-control-btn end" onclick="window.pingCallInstance.endCall()">
              ${ICONS.end}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    });
  },

  _showIncomingCallModal(caller, callType) {
    const modal = document.createElement('div');
    modal.id = 'ping-call-incoming-modal';
    modal.className = 'ping-call-modal-overlay';
    modal.innerHTML = `
      <div class="ping-call-modal">
        <img src="${caller.avatar_url || '/icons/icon.png'}" alt="" class="ping-call-modal-avatar">
        <div class="ping-call-modal-name">${caller.full_name}</div>
        <div class="ping-call-modal-status">Incoming ${callType} call...</div>
        <div class="ping-call-modal-actions">
          <button class="ping-call-modal-btn reject" onclick="window.pingCallInstance.rejectCall()">
            ${ICONS.reject}
          </button>
          <button class="ping-call-modal-btn accept" onclick="window.pingCallInstance.acceptCall()">
            ${ICONS.accept}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  _showCallConnectingUI() {
    const modal = document.getElementById('ping-call-incoming-modal');
    if (modal) {
      const status = modal.querySelector('.ping-call-modal-status');
      if (status) status.textContent = 'Connecting...';
    }
  },

  _showActiveCallUI() {
    // Remove incoming modal if present
    const modal = document.getElementById('ping-call-incoming-modal');
    if (modal) modal.remove();

    // Create active call overlay
    const overlay = document.createElement('div');
    overlay.id = 'ping-call-overlay';
    overlay.className = 'ping-call-overlay';
    overlay.innerHTML = `
      <div class="ping-call-container">
        <div class="ping-call-header">
          <img src="${this.currentCall.contactAvatar || '/icons/icon.png'}" alt="" class="ping-call-avatar">
          <div class="ping-call-contact-info">
            <div class="ping-call-contact-name">${this.currentCall.contactName || 'User'}</div>
            <div class="ping-call-status" id="ping-call-timer">00:00</div>
          </div>
        </div>
        <div class="ping-call-video-container">
          <video id="ping-call-remote-video" autoplay playsinline></video>
          <video id="ping-call-local-video" autoplay playsinline muted></video>
        </div>
        <div class="ping-call-controls">
          <button class="ping-call-control-btn" id="ping-call-mute-btn" onclick="window.pingCallInstance.toggleMute()">
            ${ICONS.mic}
          </button>
          ${this.currentCall.callType === 'video' ? `
            <button class="ping-call-control-btn" id="ping-call-video-btn" onclick="window.pingCallInstance.toggleVideo()">
              ${ICONS.video}
            </button>
          ` : ''}
          <button class="ping-call-control-btn end" onclick="window.pingCallInstance.endCall()">
            ${ICONS.end}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Set local video
    const localVideo = document.getElementById('ping-call-local-video');
    if (localVideo && this.localStream) {
      localVideo.srcObject = this.localStream;
    }
  },

  _removeCallUI() {
    const overlay = document.getElementById('ping-call-overlay');
    if (overlay) overlay.remove();
    const modal = document.getElementById('ping-call-incoming-modal');
    if (modal) modal.remove();
  }
};

// Export singleton
window.pingCallInstance = CallManager;
export default CallManager;
