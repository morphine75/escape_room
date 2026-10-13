// Blocks page zoom on the player app (index.html). Zooming the game breaks the
// layout and, on iPhone, Safari does not always zoom back out. iOS Safari
// ignores `user-scalable=no` in the viewport meta tag, so several layers are
// needed (see also the viewport meta tag and `touch-action` in base.css):
//   - pinch zoom on iOS Safari: cancel its proprietary gesture events and any
//     multi-finger touchmove;
//   - double-tap zoom: `touch-action: manipulation` (CSS) + a guard for older
//     iOS that only cancels a second tap landing outside interactive controls,
//     so fast taps on the game buttons are never swallowed;
//   - desktop: Ctrl/Cmd + wheel and Ctrl/Cmd + "+", "-", "0".

const block = (e) => e.preventDefault();

// iOS Safari pinch (non-standard events, only fired by WebKit).
["gesturestart", "gesturechange", "gestureend"].forEach((type) =>
  document.addEventListener(type, block, { passive: false })
);

// Any browser: two or more fingers moving = pinch.
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

// Older iOS (< 13) double-tap zoom. Controls are excluded so rapid taps on the
// D-pad / action buttons and inputs keep working.
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const t = Date.now();
    const onControl = e.target.closest && e.target.closest("button, input, a, label, select, textarea");
    if (!onControl && t - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = t;
  },
  { passive: false }
);

// Desktop: Ctrl/Cmd + mouse wheel / trackpad pinch.
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  },
  { passive: false }
);

// Desktop: Ctrl/Cmd + "+", "-", "0".
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0", "Add", "Subtract"].includes(e.key)) {
    e.preventDefault();
  }
});
