// Message alerts: a short synthesised ping plus an optional desktop
// notification. Browsers refuse to play audio or show the permission prompt
// until the page has seen a real user gesture, so both are armed from the very
// first pointer/key interaction and stay silent until then.

let audio = null;
let desktopAsked = false;
let faviconCanvas = null;
let faviconCtx = null;
let originalFavicon = null;

function armAudio() {
  if (audio) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try { audio = new Ctor(); } catch { audio = null; }
}

function tone(frequency, offset, duration) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + offset;
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

const SOUND_KEY = 'gliimu_notification_sound';

function soundPref() {
  const saved = localStorage.getItem(SOUND_KEY);
  return saved === 'off' || saved === 'crunch' ? saved : 'default';
}

// Two filtered noise bursts — a bite-like crunch synthesised on the spot,
// no audio file needed.
function crunch() {
  for (let i = 0; i < 2; i++) {
    const duration = 0.07;
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let s = 0; s < samples.length; s++) {
      samples[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / samples.length, 2);
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200 + i * 700;
    filter.Q.value = 0.9;
    const gain = audio.createGain();
    gain.gain.value = 0.6;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(audio.currentTime + i * 0.12);
  }
}

function askDesktop() {
  if (desktopAsked || typeof Notification === 'undefined') return;
  desktopAsked = true;
  if (Notification.permission !== 'default') return;
  try {
    const requested = Notification.requestPermission();
    if (requested && typeof requested.catch === 'function') requested.catch(() => {});
  } catch { /* older browsers only support the callback form */ }
}

// Draw a colored notification dot on the favicon
function updateFaviconDot(hasNotification) {
  const link = document.querySelector("link[rel~='icon']");
  if (!link) return;

  if (!hasNotification) {
    // Restore original favicon
    if (originalFavicon) {
      link.href = originalFavicon;
    }
    return;
  }

  // Create canvas for favicon with dot
  if (!faviconCanvas) {
    faviconCanvas = document.createElement('canvas');
    faviconCanvas.width = 32;
    faviconCanvas.height = 32;
    faviconCtx = faviconCanvas.getContext('2d');
  }

  // Load original favicon image
  const img = new Image();
  img.onload = () => {
    faviconCtx.clearRect(0, 0, 32, 32);
    faviconCtx.drawImage(img, 0, 0, 32, 32);

    // Draw notification dot (top-right)
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#6366F1';
    faviconCtx.fillStyle = brand;
    faviconCtx.beginPath();
    faviconCtx.arc(24, 8, 6, 0, Math.PI * 2);
    faviconCtx.fill();

    // Update favicon
    link.href = faviconCanvas.toDataURL();
  };
  img.src = originalFavicon || '/icons/icon.png';
}

// Initialize original favicon on load
function initFavicon() {
  const link = document.querySelector("link[rel~='icon']");
  if (link && !originalFavicon) {
    originalFavicon = link.href;
  }
}

export const notify = {
  init() {
    const arm = () => {
      armAudio();
      askDesktop();
      window.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', arm, true);
    };
    window.addEventListener('pointerdown', arm, true);
    window.addEventListener('keydown', arm, true);
    initFavicon();
  },

  sound() {
    const pref = soundPref();
    if (pref === 'off') return;
    if (!audio || audio.state === 'closed') return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    try {
      if (pref === 'crunch') {
        crunch();
      } else {
        tone(880, 0, 0.11);
        tone(1174.66, 0.1, 0.16);
      }
    } catch { /* a blocked context is not worth a crash */ }
  },

  desktop(title, body, tag) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const note = new Notification(title, {
        body,
        tag,
        icon: '/icons/icon.png',
        badge: '/icons/icon.png',
        silent: true
      });
      note.onclick = () => { window.focus(); note.close(); };
    } catch { /* iOS Safari and some webviews throw instead of showing */ }
  },

  // Update favicon notification dot
  faviconDot(hasNotification) {
    updateFaviconDot(hasNotification);
  },

  // sound=false when the user is already looking at the conversation, desktop
  // only matters when they are not.
  message({ title, body, tag, sound = true, desktop = true }) {
    if (sound) this.sound();
    if (desktop) this.desktop(title, body || 'New message', tag);
  },

  // Toast notification: a brief, non-intrusive message at the bottom of the screen.
  // Automatically dismisses after the specified duration (default 3 seconds).
  toast(message, duration = 3000) {
    const existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

export default notify;
