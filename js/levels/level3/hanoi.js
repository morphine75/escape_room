// Level 3 - Game A: "Torres de Hanoi" (server migration).
//
// Move every disk from Servidor A to Servidor C, one at a time, only taking the
// top disk of a tower (a stack / LIFO) and never placing a bigger disk on a
// smaller one. Tap a tower to pick its top disk and another to drop it.
// Completing the migration in any number of moves passes; the optimum
// (2^n - 1) is shown so players can compare. Invalid moves are rejected with a
// message and never count.
import { $, vibrate } from "../../ui.js";

export const DISKS = 4; // optimum: 2^4 - 1 = 15 moves
const TOWER_NAMES = ["Servidor A", "Buffer B", "Servidor C"];
const DISK_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#8b5cf6"];

export function initHanoi({ onComplete } = {}) {
  const towersEl = $("#hanoi-towers");
  const movesEl = $("#hanoi-moves");
  const optimalEl = $("#hanoi-optimal");
  const msgEl = $("#hanoi-msg");
  const resetBtn = $("#hanoi-reset");

  const optimal = 2 ** DISKS - 1;
  let towers = [[], [], []];
  let selected = null;
  let moves = 0;
  let finished = false;

  // Tower buttons are created once; only their disks are re-rendered.
  const towerBtns = TOWER_NAMES.map((name, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hanoi-tower";
    btn.setAttribute("aria-label", name);
    btn.innerHTML = `<span class="hanoi-label">${name}</span><span class="hanoi-stack"></span><span class="hanoi-peg"></span>`;
    btn.addEventListener("click", () => onTower(i));
    towersEl.appendChild(btn);
    return btn;
  });

  function setMsg(text, kind = "info") {
    msgEl.textContent = text;
    msgEl.dataset.kind = kind;
  }

  function render() {
    towerBtns.forEach((btn, i) => {
      btn.classList.toggle("selected", selected === i);
      const stack = btn.querySelector(".hanoi-stack");
      stack.innerHTML = "";
      // column-reverse in CSS: the first child is drawn at the bottom.
      towers[i].forEach((disk, idx) => {
        const d = document.createElement("span");
        d.className = "hanoi-disk";
        if (selected === i && idx === towers[i].length - 1) d.classList.add("lifted");
        d.style.width = 30 + (disk / DISKS) * 65 + "%";
        d.style.background = DISK_COLORS[disk - 1];
        d.textContent = disk;
        stack.appendChild(d);
      });
    });
    movesEl.textContent = String(moves);
  }

  function onTower(i) {
    if (finished) return;
    if (selected === null) {
      if (!towers[i].length) {
        setMsg("Torre vacía: elegí una torre con discos.", "warning");
        return;
      }
      selected = i;
      setMsg(`Disco ${towers[i][towers[i].length - 1]} tomado de ${TOWER_NAMES[i]}. Elegí el destino.`);
      vibrate(10);
      render();
      return;
    }
    if (selected === i) {
      selected = null;
      setMsg("Movimiento cancelado.");
      render();
      return;
    }
    const from = towers[selected];
    const to = towers[i];
    const disk = from[from.length - 1];
    if (to.length && to[to.length - 1] < disk) {
      setMsg("❌ Un disco mayor no puede ir sobre uno menor (integridad violada).", "error");
      vibrate([30, 40]);
      selected = null;
      render();
      return;
    }
    to.push(from.pop());
    moves++;
    selected = null;
    vibrate(15);
    if (towers[2].length === DISKS) {
      win();
      return;
    }
    setMsg("Tocá una torre para tomar su disco superior.");
    render();
  }

  function win() {
    finished = true;
    render();
    const perfect = moves === optimal;
    setMsg(
      perfect
        ? `🏆 ¡Migración perfecta en ${moves} movimientos (óptimo)!`
        : `✅ Migración completada en ${moves} movimientos (óptimo: ${optimal}).`,
      "success"
    );
    vibrate([30, 50, 30]);
    onComplete && onComplete({ moves });
  }

  function restart() {
    towers = [[], [], []];
    for (let d = DISKS; d >= 1; d--) towers[0].push(d);
    selected = null;
    moves = 0;
    finished = false;
    optimalEl.textContent = String(optimal);
    setMsg("Tocá una torre para tomar su disco superior.");
    render();
  }

  resetBtn.addEventListener("click", () => {
    if (!finished) restart();
  });

  restart();
  // Key live data for the coordinator's monitor (js/monitor.js). Towers are sent
  // as strings ("4 3 2 1") because Firebase drops empty arrays.
  function snapshot() {
    return {
      moves,
      optimal,
      towers: towers.map((t) => t.join(" ")),
      selected: selected === null ? -1 : selected,
      msg: msgEl.textContent,
      finished
    };
  }

  return { restart, snapshot };
}
