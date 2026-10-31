// Audiolite minimizer: floating player (desktop) / thumbnail (mobile) that
// persists when the user navigates away from an playing audiolite.
// Tracks the currently playing audio element and recreates it in minimized form.

import { store } from './store.js?v=2';

let _minimizedPlayer = null;
let _currentAudio = null;
let _currentPostId = null;
let _currentTitle = null;
let _currentCover = null;

export function trackAudio(audioEl, postId, title, coverUrl) {
  _currentAudio = audioEl;
  _currentPostId = postId;
  _currentTitle = title;
  _currentCover = coverUrl;
  
  audioEl.addEventListener('play', () => {
    if (_minimizedPlayer) updateMinimizedState();
  });
  
  audioEl.addEventListener('pause', () => {
    if (_minimizedPlayer) updateMinimizedState();
  });
  
  audioEl.addEventListener('ended', () => {
    if (_minimizedPlayer) closeMinimizedPlayer();
  });
}

export function minimizeCurrentAudio() {
  if (!_currentAudio || _currentAudio.paused) {
    closeMinimizedPlayer();
    return;
  }
  
  if (_minimizedPlayer) {
    updateMinimizedState();
    return;
  }
  
  createMinimizedPlayer();
}

function createMinimizedPlayer() {
  const isMobile = window.innerWidth <= 768;
  
  const player = document.createElement('div');
  player.className = isMobile ? 'audiolite-mini-player' : 'audiolite-floating-player';
  player.id = 'audiolite-minimized';
  
  if (isMobile) {
    player.innerHTML = `
      <div class="mini-player-content">
        ${_currentCover 
          ? `<img src="${_currentCover}" alt="" class="mini-player-cover">`
          : `<div class="mini-player-cover mini-player-cover-fallback"></div>`}
        <div class="mini-player-info">
          <div class="mini-player-title">${escapeHtml(_currentTitle || 'Audiolite')}</div>
          <div class="mini-player-controls">
            <button class="mini-player-btn" id="mini-play-pause" aria-label="Play/Pause">
              ${_currentAudio.paused ? playIcon() : pauseIcon()}
            </button>
            <button class="mini-player-btn" id="mini-close" aria-label="Close">
              ${closeIcon()}
            </button>
          </div>
        </div>
      </div>
      <div class="mini-player-progress">
        <div class="mini-player-progress-bar" id="mini-progress"></div>
      </div>
    `;
  } else {
    player.innerHTML = `
      <div class="floating-player-header">
        <span class="floating-player-label">Now Playing</span>
        <button class="floating-player-btn" id="float-close" aria-label="Close">
          ${closeIcon()}
        </button>
      </div>
      <div class="floating-player-body">
        ${_currentCover 
          ? `<img src="${_currentCover}" alt="" class="floating-player-cover">`
          : `<div class="floating-player-cover floating-player-cover-fallback"></div>`}
        <div class="floating-player-info">
          <div class="floating-player-title">${escapeHtml(_currentTitle || 'Audiolite')}</div>
          <div class="floating-player-controls">
            <button class="floating-player-btn" id="float-play-pause" aria-label="Play/Pause">
              ${_currentAudio.paused ? playIcon() : pauseIcon()}
            </button>
          </div>
        </div>
      </div>
      <div class="floating-player-progress">
        <div class="floating-player-progress-bar" id="float-progress"></div>
      </div>
    `;
  }
  
  document.body.appendChild(player);
  _minimizedPlayer = player;
  
  attachMinimizedListeners();
  startProgressTracking();
}

function attachMinimizedListeners() {
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    const playPauseBtn = document.getElementById('mini-play-pause');
    const closeBtn = document.getElementById('mini-close');
    
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (_currentAudio) {
          if (_currentAudio.paused) {
            _currentAudio.play();
          } else {
            _currentAudio.pause();
          }
          updateMinimizedState();
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', closeMinimizedPlayer);
    }
  } else {
    const playPauseBtn = document.getElementById('float-play-pause');
    const closeBtn = document.getElementById('float-close');
    
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (_currentAudio) {
          if (_currentAudio.paused) {
            _currentAudio.play();
          } else {
            _currentAudio.pause();
          }
          updateMinimizedState();
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', closeMinimizedPlayer);
    }
  }
}

function updateMinimizedState() {
  if (!_minimizedPlayer || !_currentAudio) return;
  
  const isMobile = window.innerWidth <= 768;
  const playPauseBtn = document.getElementById(isMobile ? 'mini-play-pause' : 'float-play-pause');
  
  if (playPauseBtn) {
    playPauseBtn.innerHTML = _currentAudio.paused ? playIcon() : pauseIcon();
  }
}

function startProgressTracking() {
  if (!_currentAudio || !_minimizedPlayer) return;
  
  const updateProgress = () => {
    if (!_currentAudio || !_minimizedPlayer) return;
    
    const isMobile = window.innerWidth <= 768;
    const progressBar = document.getElementById(isMobile ? 'mini-progress' : 'float-progress');
    
    if (progressBar && _currentAudio.duration) {
      const percent = (_currentAudio.currentTime / _currentAudio.duration) * 100;
      progressBar.style.width = percent + '%';
    }
    
    requestAnimationFrame(updateProgress);
  };
  
  updateProgress();
}

export function closeMinimizedPlayer() {
  if (_minimizedPlayer) {
    _minimizedPlayer.remove();
    _minimizedPlayer = null;
  }
  
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio = null;
  }
  
  _currentPostId = null;
  _currentTitle = null;
  _currentCover = null;
}

export function restoreAudio() {
  if (!_currentAudio || !_currentPostId) return;
  
  const postId = _currentPostId;
  closeMinimizedPlayer();
  
  sessionStorage.setItem('openReadViewId', postId);
  window.location.hash = `#/post?id=${postId}`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// Handle window resize to switch between mobile/desktop layouts
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (_minimizedPlayer && _currentAudio && !_currentAudio.paused) {
      const wasMobile = _minimizedPlayer.classList.contains('audiolite-mini-player');
      const isMobile = window.innerWidth <= 768;
      
      if (wasMobile !== isMobile) {
        _minimizedPlayer.remove();
        _minimizedPlayer = null;
        createMinimizedPlayer();
      }
    }
  }, 250);
});
