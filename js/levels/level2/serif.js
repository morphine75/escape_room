// Level 2 - Game A: "I Shot The Serif" (typographic agility).
//
// Design decision (DESIGN.md section 9): if the 30s timer runs out without
// completion, a fresh grid is generated automatically. No penalty, and the
// player never blocks the group. Only MAX_ERRORS wrong taps (sans-serif letters)
// are allowed per round: reaching that count restarts the round with a new grid.
import { $, vibrate, toast } from "../../ui.js";

const SERIF_FONTS = ["Georgia", "Garamond", "'Times New Roman'", "'Courier New'"];
const SANS_FONTS = ["Arial", "Helvetica", "Verdana", "'Trebuchet MS'", "'Segoe UI'"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const GRID = 3;
const TIME_LIMIT = 30; // seconds
const POINTS_PER_HIT = 100;
const MAX_ERRORS = 2;

export function initSerif({ onComplete }) {
  const gridEl = $("#serif-grid");
  const timeEl = $("#serif-time");
  const scoreEl = $("#serif-score");
  const errorsEl = $("#serif-errors");

  let score = 0;
  let errors = 0;
  let remainingSerifs = 0;
  let remainingTime = TIME_LIMIT;
  let timer = null;
  let finished = false;

  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function buildGrid() {
    gridEl.innerHTML = "";
    gridEl.style.gridTemplateColumns = `repeat(${GRID}, 1fr)`;
    score = 0;
    scoreEl.textContent = "0";
    errors = 0;
    errorsEl.textContent = `0/${MAX_ERRORS}`;
    remainingSerifs = 0;

    const total = GRID * GRID;
    const serifCount = 3 + Math.floor(Math.random() * 3); // 3..5 serif letters
    const serifIdx = new Set();
    while (serifIdx.size < serifCount) {
      serifIdx.add(Math.floor(Math.random() * total));
    }

    for (let i = 0; i < total; i++) {
      const isSerif = serifIdx.has(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "serif-cell";
      btn.style.fontFamily = isSerif ? rand(SERIF_FONTS) : rand(SANS_FONTS);
      btn.textContent = rand(LETTERS);
      btn.dataset.serif = isSerif ? "1" : "0";
      if (isSerif) remainingSerifs++;
      btn.addEventListener("click", () => onCell(btn));
      gridEl.appendChild(btn);
    }
  }

  function onCell(btn) {
    if (finished || btn.disabled) return;
    if (btn.dataset.serif === "1") {
      btn.disabled = true;
      btn.classList.add("hit");
      score += POINTS_PER_HIT;
      scoreEl.textContent = String(score);
      remainingSerifs--;
      vibrate(20);
      if (remainingSerifs <= 0) win();
    } else {
      errors++;
      errorsEl.textContent = `${errors}/${MAX_ERRORS}`;
      vibrate([30, 40]);
      if (errors >= MAX_ERRORS) {
        toast(`❌ ${MAX_ERRORS} errores. Nueva ronda…`, "error");
        reset();
        return;
      }
      toast("❌ Error: That's Sans Serif!", "error", 1400);
      btn.classList.add("shake");
      setTimeout(() => btn.classList.remove("shake"), 400);
    }
  }

  function startTimer() {
    stopTimer();
    remainingTime = TIME_LIMIT;
    timeEl.textContent = String(remainingTime);
    timer = setInterval(() => {
      remainingTime--;
      timeEl.textContent = String(Math.max(0, remainingTime));
      if (remainingTime <= 0) {
        stopTimer();
        if (!finished) {
          toast("⏱️ Se acabó el tiempo. Nueva ronda…", "warning");
          reset();
        }
      }
    }, 1000);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function reset() {
    finished = false;
    buildGrid();
    startTimer();
  }

  function win() {
    finished = true;
    stopTimer();
    vibrate([30, 50, 30]);
    toast("¡Todos los serifs eliminados! 🎯", "success");
    onComplete && onComplete({ score });
  }

  reset();
  // Key live data for the coordinator's monitor (js/monitor.js).
  function snapshot() {
    return { time: Math.max(0, remainingTime), score, errors, maxErrors: MAX_ERRORS, remaining: remainingSerifs, finished };
  }

  return { restart: reset, snapshot };
}
