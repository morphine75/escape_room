// Matrix "digital rain" ambience for the Level 1 ("Matrix Protocol") screen.
//
// A self-contained canvas effect: no dependencies, no build step. It renders on
// the #digital-rain canvas and is shown only while body[data-screen="screen-level1"].
// Columns of glyphs (katakana / Latin / binary) fall down; the leading glyph
// "shines" (bright + glow) while the trail fades, matching the classic Matrix look.
//
// Performance / accessibility:
//   - The animation loop only runs while the Level 1 screen is visible and the
//     tab is in the foreground; otherwise it stops and the canvas is cleared.
//   - When the user prefers reduced motion, a single static frame is drawn.

const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ" +
  "0123456789ABCDEF@#$%&*+<>";

const FONT_SIZE = 16; // medium letters
const FRAME_MS = 55; // ~18 fps: smooth enough for rain, cheap on phones
const FADE_ALPHA = 0.08; // trail persistence
const HEAD_COLOR = "#e8fff0"; // shining head glyph
const TRAIL_COLOR = "#00ff66"; // Matrix green

let canvas = null;
let ctx = null;
let drops = [];
let raf = 0;
let running = false;
let lastFrame = 0;
let width = 0;
let height = 0;
let cols = 0;

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cols = Math.ceil(width / FONT_SIZE);

  // Preserve each column's progress; new columns start scattered on screen so
  // the rain is visible immediately when the player enters Level 1.
  const next = [];
  for (let i = 0; i < cols; i++) {
    next[i] =
      drops[i] != null
        ? drops[i]
        : Math.random() * (height / FONT_SIZE);
  }
  drops = next;
  ctx.clearRect(0, 0, width, height);
}

// Single frozen frame for reduced-motion users (and a pleasant first paint).
function paintStatic() {
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
  ctx.textBaseline = "top";
  for (let i = 0; i < cols; i++) {
    const x = i * FONT_SIZE;
    const len = 6 + Math.floor(Math.random() * 12);
    const startRow = Math.max(
      0,
      Math.floor(Math.random() * (height / FONT_SIZE)) - len
    );
    for (let j = 0; j < len; j++) {
      const y = (startRow + j) * FONT_SIZE;
      const isHead = j === len - 1;
      ctx.globalAlpha = isHead ? 0.9 : Math.max(0.08, 0.5 - j * 0.05);
      ctx.fillStyle = isHead ? HEAD_COLOR : TRAIL_COLOR;
      ctx.fillText(randomGlyph(), x, y);
    }
  }
  ctx.globalAlpha = 1;
}

function frame(ts) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  if (ts - lastFrame < FRAME_MS) return;
  lastFrame = ts;

  // Fade the previous frame towards transparent so the page background shows.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  ctx.font = `${FONT_SIZE}px "Courier New", monospace`;
  ctx.textBaseline = "top";

  for (let i = 0; i < cols; i++) {
    const x = i * FONT_SIZE;
    const y = drops[i] * FONT_SIZE;

    if (y >= 0 && y < height) {
      // Shining head glyph.
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = HEAD_COLOR;
      ctx.shadowColor = TRAIL_COLOR;
      ctx.shadowBlur = 8;
      ctx.fillText(randomGlyph(), x, y);
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
    if (y > height && Math.random() > 0.975) drops[i] = 0;
    drops[i] += 1;
  }
}

export function start() {
  if (!canvas || running) return;
  if (prefersReducedMotion()) {
    paintStatic();
    return;
  }
  running = true;
  lastFrame = 0;
  raf = requestAnimationFrame(frame);
}

export function stop() {
  running = false;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (canvas) ctx.clearRect(0, 0, width, height);
}

export function initRain() {
  canvas = document.getElementById("digital-rain");
  if (!canvas || !canvas.getContext) return;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  const sync = () => {
    const on =
      document.body.dataset.screen === "screen-level1" && !document.hidden;
    if (on) start();
    else stop();
  };

  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-screen"]
  });
  document.addEventListener("visibilitychange", sync);
  sync();
}
