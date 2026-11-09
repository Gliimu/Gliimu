// Must match the ?v= that app.js uses for this same import: a second specifier
// would load a second copy of the router, which remounts without destroying the
// view the page is actually showing.
import { refreshCurrentView } from './router.js?v=213';

// Pull down from the very top of the page and the route you are already on
// remounts, which is what its init() does on arrival — so the feed, the lists
// and the counters all come back without reloading the document.
const THRESHOLD = 72;
const MAX_TRAVEL = 110;
const RESISTANCE = 0.5;
const MIN_SPIN_MS = 650;

export function initPullToRefresh() {
  if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  const indicator = document.createElement('div');
  indicator.className = 'ptr';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = '<span class="ptr-ring"></span>';
  document.body.appendChild(indicator);
  const ring = indicator.querySelector('.ptr-ring');

  let startY = 0;
  let startX = 0;
  let travel = 0;
  let claimed = false;
  let committed = false;
  let busy = false;

  // A panel that can still scroll up owns the gesture: pulling inside a chat
  // list or a modal body should scroll that panel, not refresh the page.
  function canScrollUp(node) {
    for (let el = node; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') continue;
      if (el.scrollTop > 0) return true;
    }
    return false;
  }

  function blocked() {
    if (busy) return true;
    if (window.liveInstance?.isLiveActive?.()) return true;
    if (window.hubInstance?.isModalOpen?.()) return true;
    return false;
  }

  function move() {
    indicator.style.setProperty('--ptr-shift', `${travel}px`);
    ring.style.transform = `rotate(${Math.round((travel / THRESHOLD) * 270)}deg)`;
    indicator.classList.toggle('ptr--ready', committed);
  }

  function retract() {
    travel = 0;
    claimed = false;
    committed = false;
    indicator.classList.remove('ptr--ready', 'ptr--loading');
    indicator.style.setProperty('--ptr-shift', '0px');
    ring.style.transform = '';
  }

  function onStart(e) {
    if (blocked()) return;
    if (window.scrollY > 0) return;
    if (canScrollUp(e.target)) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    // Only worth paying for once the page is at the top with nowhere to go.
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
  }

  function onMove(e) {
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (dy < 10 || dy < Math.abs(dx)) return;
    if (window.scrollY > 0) return;
    claimed = true;
    e.preventDefault();
    travel = Math.min(MAX_TRAVEL, dy * RESISTANCE);
    committed = travel >= THRESHOLD;
    move();
  }

  async function onEnd() {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
    if (!claimed || !committed) {
      retract();
      return;
    }
    busy = true;
    // The CSS animation owns the ring from here, so only the chip is placed.
    ring.style.transform = '';
    indicator.style.setProperty('--ptr-shift', `${THRESHOLD}px`);
    indicator.classList.add('ptr--loading');
    indicator.classList.remove('ptr--ready');
    try {
      await Promise.all([refreshCurrentView(), wait(MIN_SPIN_MS)]);
    } finally {
      busy = false;
      retract();
    }
  }

  retract();
  document.addEventListener('touchstart', onStart, { passive: true });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
