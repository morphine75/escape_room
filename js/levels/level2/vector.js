// Level 2 - Game B: "Shape Type" (vector curve adjustment).
//
// Design decision (DESIGN.md section 9): the tolerance is scaled to the canvas
// (success radius ~ 8% of the shorter side) instead of a fixed 20 px, which
// would require pixel-perfect touch placement.
import { $, toast, vibrate } from "../../ui.js";

const TARGET_PRECISION = 85;

export function initVector({ onComplete }) {
  const canvas = $("#vector-canvas");
  const precisionEl = $("#vector-precision");
  const ctx = canvas.getContext("2d");

  // Normalised shape: a quadratic Bézier with one draggable control node.
  const shape = {
    start: { x: 0.12, y: 0.82 },
    end: { x: 0.88, y: 0.18 },
    target: { x: 0.72, y: 0.82 }
  };

  const size = { w: 0, h: 0, dpr: 1 };
  let node = { x: 0.2, y: 0.2 };
  let dragging = false;
  let finished = false;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const toPx = (p) => ({ x: p.x * size.w, y: p.y * size.h });
  const tolerance = () => 0.08 * Math.min(size.w, size.h);

  function resetNode() {
    node = { x: 0.08 + Math.random() * 0.3, y: 0.08 + Math.random() * 0.3 };
    precisionEl.textContent = String(precision());
    draw();
  }

  // Full restart for a new round (used when the coordinator resets the game).
  function restart() {
    finished = false;
    dragging = false;
    resetNode();
  }

  function precision() {
    if (tolerance() <= 0) return 0;
    const cur = toPx(node);
    const tgt = toPx(shape.target);
    const dist = Math.hypot(cur.x - tgt.x, cur.y - tgt.y);
    const p = Math.max(0, 100 - (dist / tolerance()) * 100);
    return Math.round(p);
  }

  function drawCurve(from, control, to, { dotted = false, color, glow = false }) {
    const A = toPx(from);
    const C = toPx(control);
    const B = toPx(to);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.quadraticCurveTo(C.x, C.y, B.x, B.y);
    ctx.lineWidth = glow ? 6 : 4;
    ctx.strokeStyle = color;
    if (glow) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
    }
    if (dotted) ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, size.w, size.h);

    // Target silhouette (dotted guide).
    drawCurve(shape.start, shape.target, shape.end, { dotted: true, color: "#64748b" });

    // Current curve.
    const color = finished ? "#22c55e" : "#2563eb";
    drawCurve(shape.start, node, shape.end, { color, glow: finished });

    // Target node marker.
    if (!finished) {
      const t = toPx(shape.target);
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.fill();
    }

    // Draggable node.
    const n = toPx(node);
    ctx.beginPath();
    ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = finished ? "#22c55e" : "#ef4444";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    size.w = rect.width;
    size.h = rect.height;
    size.dpr = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function nearNode(p) {
    const n = toPx(node);
    return Math.hypot(p.x - n.x, p.y - n.y) <= 28;
  }

  function onDown(e) {
    if (finished) return;
    if (nearNode(pointerPos(e))) {
      dragging = true;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }
  }

  function onMove(e) {
    if (!dragging || finished) return;
    const p = pointerPos(e);
    node = { x: clamp01(p.x / size.w), y: clamp01(p.y / size.h) };
    precisionEl.textContent = String(precision());
    draw();
  }

  function onUp() {
    if (!dragging || finished) return;
    dragging = false;
    const p = precision();
    if (p >= TARGET_PRECISION) {
      win(p);
    } else {
      toast("No es suficientemente preciso. Intentá de nuevo.", "warning");
      resetNode();
    }
  }

  function win(p) {
    finished = true;
    node = { ...shape.target };
    precisionEl.textContent = "100";
    draw();
    vibrate([30, 50, 30]);
    toast("¡Curva reconstruida! ✨", "success");
    onComplete && onComplete({ precision: p });
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  // Initial sizing. The screen is already visible when this runs (the player
  // controller shows it before initialising), so the canvas has a real size.
  // ResizeObserver keeps it correct on rotation / resize afterwards.
  resize();
  resetNode();

  return { restart };
}
