// Shared media helpers used by both the Ping (chat) and Live views:
// attachment bubbles, attachment/voice-note uploads, voice-note recording
// and voice-note playback. Each view wires these to its own DOM context.

import { supabase } from '/shared/js/config.js';
import { store } from './store.js';
import { uploadFile } from './upload.js';

// ============================================
// VOICE NOTE PLAYBACK
// ============================================
let currentAudio = null;
let currentAudioId = null;

export function toggleAudio(msgId, url) {
  if (currentAudio) {
    currentAudio.pause();
    const oldBtn = document.querySelector(`#vn-${currentAudioId} .vn-play-btn`);
    if (oldBtn) { oldBtn.querySelector('.vn-icon-play').style.display = 'block'; oldBtn.querySelector('.vn-icon-pause').style.display = 'none'; }
    if (currentAudioId === msgId) { currentAudio = null; currentAudioId = null; return; }
  }
  currentAudio = new Audio(url);
  currentAudioId = msgId;
  currentAudio.play();
  const btn = document.querySelector(`#vn-${msgId} .vn-play-btn`);
  if (btn) {
    btn.querySelector('.vn-icon-play').style.display = 'none';
    btn.querySelector('.vn-icon-pause').style.display = 'block';
  }
  currentAudio.addEventListener('timeupdate', () => {
    const fill = document.getElementById(`vn-fill-${msgId}`);
    const dur = document.getElementById(`vn-dur-${msgId}`);
    if (fill) fill.style.width = `${(currentAudio.currentTime / currentAudio.duration) * 100}%`;
    if (dur) dur.innerText = `${Math.floor(currentAudio.currentTime / 60)}:${Math.floor(currentAudio.currentTime % 60).toString().padStart(2, '0')}`;
  });
  currentAudio.addEventListener('ended', () => {
    if (btn) {
      btn.querySelector('.vn-icon-play').style.display = 'block';
      btn.querySelector('.vn-icon-pause').style.display = 'none';
    }
    const fill = document.getElementById(`vn-fill-${msgId}`);
    if (fill) fill.style.width = `0%`;
    currentAudio = null; currentAudioId = null;
  });
}

// ============================================
// ATTACHMENT MARKUP & UPLOADS
// ============================================
export function attachmentHtml(m, instanceName) {
  if (!m.attachment_url) return '';
  if (m.attachment_type === 'image') return `<img src="${m.attachment_url}" class="ping-attachment img">`;
  if (m.attachment_type === 'audio_note') {
    return `
      <div class="voice-note-bubble" id="vn-${m.id}">
        <button class="vn-play-btn" onclick="${instanceName}.toggleAudio('${m.id}', '${m.attachment_url}')">
          <svg class="vn-icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg class="vn-icon-pause" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <div class="vn-progress-bar"><div class="vn-progress-fill" id="vn-fill-${m.id}"></div></div>
        <span class="vn-duration" id="vn-dur-${m.id}">0:00</span>
      </div>
    `;
  }
  if (m.attachment_type === 'video') return `<video controls src="${m.attachment_url}" class="ping-attachment video"></video>`;
  return `<a href="${m.attachment_url}" target="_blank" class="ping-attachment file">📎 Download File</a>`;
}

export async function uploadAttachment(file) {
  const url = await uploadFile(file, 'chat');
  let type = 'file';
  if (file.type.startsWith('image/')) type = 'image';
  else if (file.type.startsWith('video/')) type = 'video';
  else if (file.type === 'application/pdf') type = 'pdf';
  return { url, type };
}

export async function uploadAudioNote(blob) {
  // Named so R2 stores an .webm key and the right content type.
  const named = new File([blob], `${Date.now()}_audio.webm`, { type: blob.type || 'audio/webm' });
  return uploadFile(named, 'chat');
}

// ============================================
// VOICE NOTE RECORDER
// ============================================
// Parameterized per view: which input area hosts the record/preview UI,
// how to restore that input area afterwards, and how to deliver the
// uploaded note. Uses its own mic stream so it never clobbers a live
// host's broadcast stream.
export function createRecorder({ instanceName, inputAreaId, restore, send }) {
  let recStream = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordSeconds = 0;
  let currentRecordingUrl = null;
  let previewAudio = null;
  let cancelled = false;

  const stopTracks = () => { if (recStream) recStream.getTracks().forEach(t => t.stop()); };

  async function start() {
    try {
      cancelled = false;
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(recStream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.onstop = () => { if (!cancelled) processRecording(); };
      mediaRecorder.start();
      recordSeconds = 0;

      const inputArea = document.getElementById(inputAreaId);
      if (!inputArea) return;

      inputArea.innerHTML = `
        <div class="ping-voice-recording">
          <div class="voice-rec-dot"></div>
          <span class="voice-rec-timer" id="rec-timer">0:00</span>
          <button class="btn-secondary btn-sm" onclick="${instanceName}.cancelRecording()">Cancel</button>
          <button class="btn-primary btn-sm" onclick="${instanceName}.stopRecording()">Stop</button>
        </div>
      `;
      recordTimer = setInterval(() => {
        recordSeconds++;
        const timerEl = document.getElementById('rec-timer');
        if (timerEl) timerEl.innerText = `${Math.floor(recordSeconds / 60)}:${(recordSeconds % 60).toString().padStart(2, '0')}`;
      }, 1000);
    } catch (err) { alert("Microphone access denied."); }
  }

  function processRecording() {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    currentRecordingUrl = URL.createObjectURL(blob);
    const inputArea = document.getElementById(inputAreaId);
    if (!inputArea) return;

    inputArea.innerHTML = `
      <div class="ping-voice-preview">
        <button class="vn-play-btn" id="preview-play-btn" onclick="${instanceName}.togglePreviewAudio()">
          <svg class="vn-icon-play" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg class="vn-icon-pause" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <div class="vn-progress-bar"><div class="vn-progress-fill" id="preview-fill"></div></div>
        <span class="vn-duration" id="preview-dur">0:00</span>
        <button class="btn-primary" onclick="${instanceName}.sendAudioNote()">Send</button>
        <button class="btn-secondary" onclick="${instanceName}.cancelRecording()">Discard</button>
      </div>
    `;
    previewAudio = new Audio(currentRecordingUrl);
    previewAudio.addEventListener('timeupdate', () => {
      const fill = document.getElementById('preview-fill');
      const dur = document.getElementById('preview-dur');
      if (fill) fill.style.width = `${(previewAudio.currentTime / previewAudio.duration) * 100}%`;
      if (dur) dur.innerText = `${Math.floor(previewAudio.currentTime / 60)}:${Math.floor(previewAudio.currentTime % 60).toString().padStart(2, '0')}`;
    });
    previewAudio.addEventListener('ended', () => {
      const playBtn = document.getElementById('preview-play-btn');
      const fill = document.getElementById('preview-fill');
      if (playBtn) {
        playBtn.querySelector('.vn-icon-play').style.display = 'block';
        playBtn.querySelector('.vn-icon-pause').style.display = 'none';
      }
      if (fill) fill.style.width = `0%`;
    });
  }

  function togglePreview() {
    const btn = document.getElementById('preview-play-btn');
    if (!btn || !previewAudio) return;
    if (previewAudio.paused) {
      previewAudio.play();
      btn.querySelector('.vn-icon-play').style.display = 'none';
      btn.querySelector('.vn-icon-pause').style.display = 'block';
    } else {
      previewAudio.pause();
      btn.querySelector('.vn-icon-play').style.display = 'block';
      btn.querySelector('.vn-icon-pause').style.display = 'none';
    }
  }

  async function sendNote() {
    if (!currentRecordingUrl) return;
    const blob = await fetch(currentRecordingUrl).then(r => r.blob());
    let url;
    try { url = await uploadAudioNote(blob); } catch (err) { return alert("Failed to upload audio."); }
    await send(url);
    cancel();
  }

  function cancel() {
    cancelled = true;
    clearInterval(recordTimer);
    if (previewAudio) { previewAudio.pause(); previewAudio = null; }
    currentRecordingUrl = null;
    stopTracks();
    restore();
  }

  function stop() {
    clearInterval(recordTimer);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stopTracks();
  }

  return { start, stop, cancel, togglePreview, sendNote };
}
