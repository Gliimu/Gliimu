// Persistent media strip: audio and video started in the reader (or a gliim
// modal) keep playing after the page that owned them is gone, shown as a
// floating card on desktop and a bar above the bottom nav on mobile.
// While the strip lives, the gliim it belongs to still counts as consumed, so
// the reader's per-minute billing carries on; closing the strip ends both.
//
// Chrome restarts a media element from zero the moment it is moved to another
// parent, and pauses one that leaves the document, so the strip cannot simply
// take the page's node. It clones the same source into a node of its own and
// picks the clock up where the page left off.

import * as heartbeat from './heartbeat.js?v=3';

let _player = null;
let _refs = null;
// The one element the strip speaks for. Last media to start playing wins.
let _current = null;
let _raf = 0;
// Where a handed-over track resumes, and whether it was running when it moved.
let _resumeAt = 0;
let _resumePlay = false;

export function trackMedia(el, postId, title, coverUrl) {
  el.addEventListener('play', () => {
    adopt(el, postId, title, coverUrl);
    // A track that is playing inside a page has its own player on screen, so
    // the strip stands down until that page lets go of it.
    if (_player && !_player.contains(el)) dropStrip();
    else syncPlayer();
  });

  el.addEventListener('pause', () => {
    if (_player && _current && _current.el === el) syncPlayer();
  });

  el.addEventListener('ended', () => {
    if (_current && _current.el === el) closePlayer();
  });
}

// Called when the surface that owns the media is torn down. Returns the gliim
// that is still playing, or null when nothing was kept alive.
export function minimizePlaying() {
  if (!_current || _current.el.paused) {
    closePlayer();
    return null;
  }
  handOver(true);
  return _current.postId;
}

// The minimize control on a player: hand the track to the strip now, without
// waiting for the page to be torn down. A track that never played stays paused.
// `origin` is the page's own node, so a second click on the same button is a
// no-op instead of a second hand-over that would restart the track.
export function minimizeNow(el, postId, title, coverUrl) {
  if (!_current || (el && _current.origin !== el)) {
    if (!el) return false;
    adopt(el, postId, title, coverUrl);
  }
  if (_player && _player.contains(_current.el)) return true;
  handOver(!_current.el.paused);
  return true;
}

// One gliim at a time: whatever takes over owns the strip, and the previous
// track is paused rather than left running silently.
function adopt(el, postId, title, coverUrl) {
  if (_current && _current.el !== el) _current.el.pause();
  _current = { el, origin: el, postId, title, cover: coverUrl };
}

export function closePlayer() {
  const wasStrip = !!_player;
  dropStrip();
  if (_current) {
    _current.el.pause();
    _current = null;
  }
  stopTick();
  // A live session runs its own heartbeat on this same timer, so handing the
  // clock back is the strip's job only while no call is up.
  if (wasStrip && !window.liveInstance?.isLiveActive?.()) {
    heartbeat.stop();
    heartbeat.setCurrentPost(null);
  }
}

export function restore() {
  if (!_current || !_current.postId) return;
  const postId = _current.postId;
  closePlayer();
  sessionStorage.setItem('openReadViewId', postId);
  window.location.hash = `#/post?id=${postId}`;
}

// Rebuild the strip around a fresh node for the same source, keeping position.
function handOver(wasPlaying) {
  const from = _current.el;
  _resumeAt = from.currentTime;
  _resumePlay = !!wasPlaying;
  from.pause();
  _current.el = carryOver(from);
  dropStrip();
  buildPlayer();
}

function carryOver(el) {
  const clone = el.cloneNode(false);
  clone.removeAttribute('id');
  clone.removeAttribute('class');
  if (!clone.getAttribute('src') && el.src) clone.src = el.src;
  clone.volume = el.volume;
  clone.muted = el.muted;
  clone.addEventListener('loadedmetadata', () => {
    if (!_current || !_player) return;
    try { clone.currentTime = _resumeAt; } catch { /* too short to seek */ }
    if (_resumePlay) clone.play().catch(() => {});
  }, { once: true });
  clone.addEventListener('play', syncPlayer);
  clone.addEventListener('pause', syncPlayer);
  clone.addEventListener('ended', closePlayer);
  clone.addEventListener('contextmenu', blockContextMenu);
  return clone;
}

// The native "Save audio/video as" item is the other way a file leaves the
// reader, so it is refused on the strip's node as well as the page's.
function blockContextMenu(e) {
  e.preventDefault();
}

function dropStrip() {
  if (!_player) return;
  _player.remove();
  _player = null;
  _refs = null;
}

function stopTick() {
  cancelAnimationFrame(_raf);
  _raf = 0;
}

function buildPlayer() {
  const mobile = window.innerWidth <= 768;
  const player = document.createElement('div');
  player.className = mobile ? 'audiolite-mini-player' : 'audiolite-floating-player';
  player.innerHTML = mobile ? mobileMarkup() : desktopMarkup();
  _player = document.body.appendChild(player);
  _player.querySelector('.audiolite-slot').appendChild(_current.el);

  _refs = {
    toggle: _player.querySelector('[data-role="toggle"]'),
    progress: _player.querySelector('[data-role="progress"]'),
  };
  _refs.toggle.addEventListener('click', togglePlay);
  _player.querySelector('[data-role="close"]').addEventListener('click', closePlayer);
  _player.querySelectorAll('[data-role="open"]').forEach(el => el.addEventListener('click', restore));

  syncPlayer();

  const tick = () => {
    if (!_player || !_current) return;
    if (_refs.progress && _current.el.duration) {
      _refs.progress.style.width = `${(_current.el.currentTime / _current.el.duration) * 100}%`;
    }
    _raf = requestAnimationFrame(tick);
  };
  tick();
}

function syncPlayer() {
  if (!_player || !_current) return;
  const playing = !_current.el.paused;
  _refs.toggle.innerHTML = playing ? pauseIcon() : playIcon();
  _refs.toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function togglePlay() {
  if (!_current) return;
  if (_current.el.paused) _current.el.play().catch(() => {});
  else _current.el.pause();
  syncPlayer();
}

// The cover cell doubles as the media's home: a video is shown there, an audio
// track only needs to stay attached to the document, out of sight.
function coverMarkup(base) {
  if (_current.el.tagName === 'VIDEO') {
    return `<div class="${base} audiolite-slot audiolite-slot--video" data-role="open"></div>`;
  }
  const cover = _current.cover
    ? `<img src="${escapeAttr(_current.cover)}" alt="" class="${base}" data-role="open">`
    : `<div class="${base} ${base}-fallback" data-role="open"></div>`;
  return `${cover}<div class="audiolite-slot" data-role="hidden"></div>`;
}

function desktopMarkup() {
  return `
    <div class="floating-player-header">
      <span class="floating-player-label">Now Playing</span>
      <button class="floating-player-btn" data-role="close" aria-label="Close">${closeIcon()}</button>
    </div>
    <div class="floating-player-body">
      ${coverMarkup('floating-player-cover')}
      <div class="floating-player-info">
        <div class="floating-player-title" data-role="open">${escapeHtml(_current.title || 'Gliim')}</div>
        <div class="floating-player-controls">
          <button class="floating-player-btn" data-role="toggle" aria-label="Play or pause"></button>
        </div>
      </div>
    </div>
    <div class="floating-player-progress"><div class="floating-player-progress-bar" data-role="progress"></div></div>
  `;
}

function mobileMarkup() {
  return `
    <div class="mini-player-content">
      ${coverMarkup('mini-player-cover')}
      <div class="mini-player-info">
        <div class="mini-player-title" data-role="open">${escapeHtml(_current.title || 'Gliim')}</div>
        <div class="mini-player-controls">
          <button class="mini-player-btn" data-role="toggle" aria-label="Play or pause"></button>
          <button class="mini-player-btn" data-role="close" aria-label="Close">${closeIcon()}</button>
        </div>
      </div>
    </div>
    <div class="mini-player-progress"><div class="mini-player-progress-bar" data-role="progress"></div></div>
  `;
}

// Crossing the mobile breakpoint swaps the strip between its two shapes.
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (!_player || !_current) return;
    const wasMobile = _player.classList.contains('audiolite-mini-player');
    if (wasMobile === (window.innerWidth <= 768)) return;
    handOver(!_current.el.paused);
  }, 250);
});

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function playIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
}

function pauseIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
}

function closeIcon() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}
