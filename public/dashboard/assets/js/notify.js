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
    faviconCtx.fillStyle = 'var(--brand-primary)';
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
    if (!audio || audio.state === 'closed') return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    try {
      tone(880, 0, 0.11);
      tone(1174.66, 0.1, 0.16);
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
  }
};

export default notify;
