// Small shared UI helpers: DOM shortcuts, toasts, haptics, screen switching.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Short haptic pulse (design section 8.3). Silently ignored when unsupported.
export function vibrate(pattern = 30) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
  }
}

export function toast(message, type = "info", timeout = 2600) {
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-wrap";
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

// Shows exactly one .screen element and hides the rest.
export function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  if (typeof window !== "undefined") window.scrollTo(0, 0);
  document.body.dataset.screen = id;
}

export function setActiveChip(container, activeEl) {
  $$(".chip", container).forEach((c) => c.classList.toggle("active", c === activeEl));
}
