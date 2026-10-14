// Coordinator dashboard: creates the room, starts the round, shows live progress
// and resets the room. Level unlocks happen on the clients (each one moves on as
// soon as every active player cleared the current level), so there is no phase
// advance here — see DESIGN.md 9 #12.
import { db, isConfigured } from "./firebase.js";
import {
  ref, update, get, set, remove, onValue, onDisconnect, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { createRoom, deleteRoomIfEmpty, removePlayer, clearLive, normalizeRoomId } from "./room.js";
import { subscribeRoom, subscribeRooms, everyoneCompleted } from "./sync.js";
import { saveHostRoom, loadHostRoom, clearHostRoom, randomId } from "./session.js";
import { showScreen, toast, $ } from "./ui.js";

const state = { roomId: null, data: null, unsub: null, transitioning: false };

// "👁️ Ver pantalla" monitor (see js/monitor.js). This dashboard registers itself
// as a watcher of one player; the player's phone publishes its screen state
// only while somebody is watching.
const DASH_ID = randomId("dash_");
const watch = { pid: null, unsub: null, timer: 0, data: null, receivedAt: 0 };

function boot() {
  if (!isConfigured) {
    toast("Firebase no está configurado. Editá js/firebase-config.js", "error", 8000);
  }
  wireSetup();
  subscribeRooms(renderRoomList, (err) => toast("Error al listar salas: " + err.message, "error"));

  const saved = loadHostRoom();
  if (saved) {
    $("#dash-room").value = saved;
    openRoom(saved);
  } else {
    showScreen("dash-setup");
  }
}

function wireSetup() {
  $("#dash-create").addEventListener("click", async () => {
    const roomId = normalizeRoomId($("#dash-room").value);
    const required = parseInt($("#dash-required").value, 10) || 10;
    if (!roomId) { toast("Ingresá un código de sala", "warning"); return; }
    try {
      const res = await createRoom(roomId, required);
      if (!res.ok) { toast(res.error, "error"); return; }
      saveHostRoom(roomId);
      openRoom(roomId);
      toast("Sala creada: " + roomId, "success");
    } catch (err) {
      toast("Error al crear la sala: " + err.message, "error");
    }
  });

  $("#dash-open").addEventListener("click", () => {
    const roomId = normalizeRoomId($("#dash-room").value);
    if (!roomId) { toast("Ingresá un código de sala", "warning"); return; }
    saveHostRoom(roomId);
    openRoom(roomId);
  });

  $("#dash-back").addEventListener("click", closeRoom);

  $("#watch-close").addEventListener("click", closeWatch);
  $("#watch-modal").addEventListener("click", (e) => {
    if (e.target.id === "watch-modal") closeWatch(); // click outside the card
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeWatch();
  });

  $("#dash-delete").addEventListener("click", () => {
    if (state.roomId) deleteRoom(state.roomId);
  });

  $("#dash-start").addEventListener("click", async () => {
    if (!state.roomId) return;
    try {
      await update(ref(db, `rooms/${state.roomId}`), { started: true });
      toast("¡Partida iniciada!", "success");
    } catch (err) {
      toast("Error al iniciar: " + err.message, "error");
    }
  });

  // Reset for the next group: keeps the same players and resets their progress.
  $("#dash-reset").addEventListener("click", () => {
    if (!state.roomId) return;
    const ok = window.confirm(
      "¿Reiniciar la partida?\n\nSe resetea el progreso de todos los jugadores y la sala vuelve al lobby. Los jugadores registrados se mantienen."
    );
    if (ok) resetRoom(false);
  });

  // Full wipe: removes every player so a brand-new group can register.
  $("#dash-clear").addEventListener("click", () => {
    if (!state.roomId) return;
    const ok = window.confirm(
      "¿Vaciar la sala?\n\nSe eliminan TODOS los jugadores registrados y la sala vuelve al lobby, lista para un grupo nuevo. Esta acción no se puede deshacer."
    );
    if (ok) resetRoom(true);
  });
}

function openRoom(roomId) {
  state.roomId = roomId;
  if (state.unsub) state.unsub();
  state.unsub = subscribeRoom(
    roomId,
    onData,
    (err) => toast("Error de conexión: " + err.message, "error")
  );
}

// Leaves the open room and goes back to the room list.
// --- Live monitor ("👁️ Ver pantalla") ------------------------------------------

const SCREEN_LABELS = {
  "screen-register": "Registro",
  "screen-lobby": "Lobby (esperando el inicio)",
  "screen-level1": "Nivel 1 · Matrix Protocol",
  "screen-wait": "Espera grupal",
  "screen-serif": "Nivel 2 · I Shot The Serif",
  "screen-vector": "Nivel 2 · Shape Type",
  "screen-hanoi": "Nivel 3 · Torres de Hanoi",
  "screen-robot": "Nivel 3 · Robot Ciego",
  "screen-victory": "Victoria 🎉"
};
const STALE_MS = 10000; // no update for this long -> warn (heartbeat is every 4 s)

async function openWatch(pid, name) {
  if (!state.roomId) return;
  closeWatch();
  watch.pid = pid;
  watch.data = null;
  watch.receivedAt = 0;
  $("#watch-name").textContent = name || "";
  $("#watch-modal").classList.remove("hidden");
  renderWatch();

  const base = `live/${state.roomId}/${pid}`;
  const me = ref(db, `${base}/watchers/${DASH_ID}`);
  try {
    // Drop the last state left by an earlier watch, so nothing stale is shown
    // as current: the phone publishes a fresh one as soon as it sees a watcher.
    await remove(ref(db, `${base}/state`));
    // If this dashboard closes or loses connection, stop the phone publishing.
    await onDisconnect(me).remove();
    await set(me, true);
  } catch (err) {
    $("#watch-body").textContent =
      "No se pudo activar el monitor: " + err.message +
      ". ¿Publicaste las reglas nuevas de database.rules.json en Firebase?";
    return;
  }
  watch.unsub = onValue(ref(db, `${base}/state`), (snap) => {
    watch.data = snap.val();
    watch.receivedAt = Date.now();
    renderWatch();
  });
  watch.timer = setInterval(renderWatch, 1000); // keeps "hace X s" current
}

function closeWatch() {
  if (!watch.pid) return;
  const me = ref(db, `live/${state.roomId}/${watch.pid}/watchers/${DASH_ID}`);
  remove(me).catch(() => {});
  onDisconnect(me).cancel().catch(() => {});
  if (watch.unsub) watch.unsub();
  clearInterval(watch.timer);
  Object.assign(watch, { pid: null, unsub: null, timer: 0, data: null, receivedAt: 0 });
  $("#watch-modal").classList.add("hidden");
}

const yesNo = (v) => (v ? "sí" : "no");
// Firebase may return arrays as {0: .., 1: ..} objects: accept both.
const asList = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
const cell = (p) => (p ? `(${p.x + 1}, ${p.y + 1})` : "—");

// Rows [label, value] with the key data of the screen being shown.
function watchRows(d) {
  const g = d.game || {};
  switch (d.screen) {
    case "screen-level1":
      return [
        ["Intento", g.attempts],
        ["Munición 🔫", g.ammo],
        ["BYPASS ⚔️", g.bypass],
        ["ENCRYPT 🧊", g.encrypt],
        ["Línea de estado", g.status],
        ["Héroe 😎", cell(g.hero)],
        ["Cabina 📞", cell(g.phone)],
        ["Agente 🕵🏻", asList(g.agents).map((a) => cell(a) + (a.frozen ? " ❄ congelado" : "")).join(" · ") || "—"],
        ["Completado", yesNo(g.solved)]
      ];
    case "screen-serif":
      return [
        ["Tiempo", `${g.time ?? "—"} s`],
        ["Puntaje", g.score],
        ["Errores", `${g.errors ?? 0} / ${g.maxErrors ?? 2}`],
        ["Serifas restantes", g.remaining],
        ["Completado", yesNo(g.finished)]
      ];
    case "screen-vector":
      return [
        ["Precisión (peor punto)", `${g.precision ?? 0} %`],
        ...asList(g.points).map((p, i) => [`Punto ${i + 1}`, `${p} %${p >= 85 ? " ✔" : ""}`]),
        ["Completado", yesNo(g.finished)]
      ];
    case "screen-hanoi":
      return [
        ["Movimientos", `${g.moves ?? 0} (óptimo ${g.optimal ?? "—"})`],
        ...["Servidor A", "Buffer B", "Servidor C"].map((n, i) => [
          n + (g.selected === i ? " ✋" : ""),
          asList(g.towers)[i] || "vacía"
        ]),
        ["Mensaje", g.msg],
        ["Completado", yesNo(g.finished)]
      ];
    case "screen-robot": {
      const names = { forward: "⬆️", left: "↩️", right: "↪️" };
      const prog = (g.program || "").split(",").filter(Boolean).map((c) => names[c] || c);
      return [
        ["Comandos", g.commands ?? 0],
        ["Programa", prog.join(" ") || "—"],
        ["Ejecutando", yesNo(g.running)],
        ["Robot", g.robot ? cell(g.robot) : "—"],
        ["Mensaje", g.msg],
        ["Completado", yesNo(g.finished)]
      ];
    }
    case "screen-wait":
      return [["Pantalla", d.wait ? d.wait.title : "—"], ["Progreso del grupo", d.wait ? d.wait.count : "—"]];
    default:
      return [];
  }
}

function renderWatch() {
  if (!watch.pid) return;
  const body = $("#watch-body");
  const d = watch.data;
  if (!d) {
    body.innerHTML =
      '<p class="muted">Esperando datos del celular… Puede tardar unos segundos. Si no llega nada, el jugador puede tener el juego cerrado o sin conexión.</p>';
    return;
  }
  const age = Math.round((Date.now() - watch.receivedAt) / 1000);
  const warnings = [];
  if (d.hidden) warnings.push("⚠️ El juego está en segundo plano (otra app abierta o pantalla bloqueada).");
  if (Date.now() - watch.receivedAt > STALE_MS) warnings.push(`⚠️ Sin datos hace ${age} s: puede haber perdido la conexión.`);

  const rows = watchRows(d)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v ?? "—")}</td></tr>`)
    .join("");
  body.innerHTML = `
    <p class="watch-screen">${escapeHtml(SCREEN_LABELS[d.screen] || d.screen || "—")}</p>
    ${warnings.map((w) => `<p class="watch-warn">${escapeHtml(w)}</p>`).join("")}
    ${rows ? `<table class="watch-table">${rows}</table>` : ""}
    <p class="muted watch-age">Actualizado hace ${age} s</p>`;
}

function closeRoom() {
  closeWatch();
  if (state.unsub) state.unsub();
  state.unsub = null;
  state.roomId = null;
  state.data = null;
  clearHostRoom();
  showScreen("dash-setup");
}

// Deletes a room (only when it has no players). Its code stays in the input so
// it can be created again right away with "Crear sala".
async function deleteRoom(roomId) {
  const ok = window.confirm(
    `¿Eliminar la sala ${roomId}?\n\nSolo se puede eliminar si no tiene jugadores. Después podés volver a crearla con el mismo código.`
  );
  if (!ok) return;
  // Stop listening first so the open view does not report "room not found".
  const wasOpen = state.roomId === roomId;
  if (wasOpen && state.unsub) { state.unsub(); state.unsub = null; }
  try {
    const res = await deleteRoomIfEmpty(roomId);
    if (!res.ok) {
      toast(res.error, "error");
      if (wasOpen) openRoom(roomId);
      return;
    }
    if (wasOpen) closeRoom();
    if (loadHostRoom() === roomId) clearHostRoom();
    $("#dash-room").value = roomId;
    toast(`Sala ${roomId} eliminada. Podés volver a crearla con "Crear sala".`, "success");
  } catch (err) {
    toast("Error al eliminar: " + err.message, "error");
    if (wasOpen) openRoom(roomId);
  }
}

function renderRoomList(rooms) {
  const ul = $("#dash-rooms");
  ul.innerHTML = "";
  const ids = Object.keys(rooms).sort();
  if (!ids.length) {
    const li = document.createElement("li");
    li.className = "room-empty";
    li.textContent = "No hay salas creadas.";
    ul.appendChild(li);
    return;
  }
  ids.forEach((id) => {
    const room = rooms[id] || {};
    const count = Object.keys(room.players || {}).length;
    const li = document.createElement("li");
    li.className = "room-item";
    li.innerHTML = `
      <div class="room-info">
        <span class="room-code">${escapeHtml(id)}</span>
        <span class="muted">${count} jugador${count === 1 ? "" : "es"} · ${phaseLabel(room)}</span>
      </div>
      <div class="row">
        <button class="btn secondary" data-act="open">Abrir</button>
        <button class="btn danger" data-act="delete" ${count ? "disabled" : ""}
          title="${count ? "Vaciá la sala antes de eliminarla" : "Eliminar sala"}">🗑️</button>
      </div>`;
    li.querySelector('[data-act="open"]').addEventListener("click", () => {
      saveHostRoom(id);
      openRoom(id);
    });
    li.querySelector('[data-act="delete"]').addEventListener("click", () => deleteRoom(id));
    ul.appendChild(li);
  });
}

function onData(data) {
  if (!data) {
    toast("Esa sala no existe. Podés crearla con ese código.", "error");
    closeRoom();
    return;
  }
  state.data = data;
  showScreen("dash-room-view");
  render(data);
}

// --- Rendering ---------------------------------------------------------------

function phaseLabel(data) {
  if (!data.started) return "Lobby";
  if (!everyoneCompleted(data.players, "level_1_completed")) return "Nivel 1";
  if (!everyoneCompleted(data.players, "level_2_completed")) return "Nivel 2";
  if (!everyoneCompleted(data.players, "level_3_completed")) return "Nivel 3";
  return "Finalizado";
}

function render(data) {
  const players = data.players || {};
  const list = Object.values(players);
  const total = list.length;
  const required = data.required_players || 0;

  $("#dash-title").textContent = "Sala " + state.roomId;
  $("#dash-phase").textContent = phaseLabel(data);
  $("#dash-joined").textContent = String(total);
  $("#dash-required-view").textContent = String(required);

  const done1 = list.filter((p) => p.level_1_completed === true).length;
  const done2 = list.filter((p) => p.level_2_completed === true).length;
  const done3 = list.filter((p) => p.level_3_completed === true).length;
  $("#dash-bar").style.width = total
    ? Math.min(100, ((done1 + done2 + done3) / (3 * total)) * 100) + "%"
    : "0%";
  $("#dash-progress").textContent =
    `Nivel 1: ${done1} / ${total} · Nivel 2: ${done2} / ${total} · Nivel 3: ${done3} / ${total}`;

  const startBtn = $("#dash-start");
  startBtn.disabled = data.started === true || total === 0;
  startBtn.textContent = data.started ? "Partida en curso" : "▶️ Iniciar partida";

  $("#dash-hint").textContent = data.started
    ? "Cada nivel se desbloquea solo cuando todos los jugadores conectados completan el anterior."
    : `Se necesitan jugadores. Recomendado: ${required}.`;

  const deleteBtn = $("#dash-delete");
  deleteBtn.disabled = total > 0;
  deleteBtn.title = total > 0 ? "Vaciá la sala antes de eliminarla" : "";

  renderRoster(players);

  // The watched player was removed (or the room wiped): close the monitor.
  if (watch.pid && !players[watch.pid]) {
    closeWatch();
    toast("El jugador ya no está en la sala", "warning");
  }
}

function renderRoster(players) {
  const tbody = $("#dash-roster");
  tbody.innerHTML = "";
  const sorted = Object.entries(players).sort(
    ([, a], [, b]) => (a.joined_at || 0) - (b.joined_at || 0)
  );

  sorted.forEach(([pid, p], i) => {
    const tr = document.createElement("tr");
    if (p.connected === false) tr.classList.add("offline");
    // A record without a name never went through registration (e.g. a stray
    // write to a removed player): flag it so the coordinator can delete it.
    const ghost = !p.name;
    if (ghost) tr.classList.add("ghost");

    const details = [];
    if (p.level_2_completed && p.level_2_game === "serif") details.push(`${p.level_2_score || 0} pts`);
    if (p.level_2_completed && p.level_2_game === "vector") details.push(`${p.level_2_precision || 0}%`);
    if (p.level_3_completed && p.level_3_game === "hanoi") details.push(`${p.level_3_moves || 0} mov.`);
    if (p.level_3_completed && p.level_3_game === "robot") details.push(`${p.level_3_commands || 0} cmd.`);
    const levelCell = (done, game) => `${done ? "✅" : "⏳"}${game ? " " + game : ""}`;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${ghost ? "⚠️ <em>sin nombre</em>" : escapeHtml(p.name)}</td>
      <td title="${p.connected === false ? "Desconectado" : "Conectado"}">${p.connected === false ? "⚫" : "🟢"}</td>
      <td>${p.level_1_completed ? "✅" : "⏳"}</td>
      <td>${levelCell(p.level_2_completed, p.level_2_game)}</td>
      <td>${levelCell(p.level_3_completed, p.level_3_game)}</td>
      <td>${details.join(" · ") || "—"}</td>
      <td class="roster-actions">
        <button class="btn secondary roster-watch" title="Ver pantalla" ${ghost ? "disabled" : ""}>👁️</button>
        <button class="btn danger roster-del" title="Eliminar jugador">🗑️</button>
      </td>`;
    tr.querySelector(".roster-watch").addEventListener("click", () => openWatch(pid, p.name));
    tr.querySelector(".roster-del").addEventListener("click", () =>
      deletePlayer(pid, ghost ? "(sin nombre)" : p.name)
    );
    tbody.appendChild(tr);
  });
}

async function deletePlayer(pid, label) {
  if (!state.roomId) return;
  const ok = window.confirm(
    `¿Eliminar al jugador ${label} de la sala ${state.roomId}?\n\nSu celular vuelve a la pantalla de registro y puede unirse de nuevo mientras la partida no haya empezado.`
  );
  if (!ok) return;
  try {
    await removePlayer(state.roomId, pid);
    toast(`Jugador ${label} eliminado`, "success");
  } catch (err) {
    toast("Error al eliminar el jugador: " + err.message, "error");
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Resets the room back to the lobby. `clearPlayers` removes every registered
// player (for a new group); otherwise their progress is reset and they stay.
async function resetRoom(clearPlayers) {
  if (!state.roomId || state.transitioning) return;
  state.transitioning = true;
  const resetBtn = $("#dash-reset");
  const clearBtn = $("#dash-clear");
  resetBtn.disabled = true;
  clearBtn.disabled = true;
  try {
    if (clearPlayers) {
      await remove(ref(db, `rooms/${state.roomId}/players`));
      await clearLive(state.roomId);
    } else {
      const snap = await get(ref(db, `rooms/${state.roomId}/players`));
      const players = snap.val() || {};
      const updates = {};
      // Nameless ghost records are skipped: the rules reject them, and one
      // rejected path would make the whole (atomic) reset fail.
      Object.keys(players).filter((pid) => players[pid] && players[pid].name).forEach((pid) => {
        updates[`${pid}/level_1_completed`] = false;
        updates[`${pid}/level_2_completed`] = false;
        updates[`${pid}/level_2_game`] = null;
        updates[`${pid}/level_2_score`] = 0;
        updates[`${pid}/level_2_precision`] = 0;
        updates[`${pid}/level_3_completed`] = false;
        updates[`${pid}/level_3_game`] = null;
        updates[`${pid}/level_3_moves`] = 0;
        updates[`${pid}/level_3_commands`] = 0;
      });
      if (Object.keys(updates).length) {
        await update(ref(db, `rooms/${state.roomId}/players`), updates);
      }
    }

    // Back to the lobby (single writer of current_phase).
    await runTransaction(ref(db, `rooms/${state.roomId}`), (room) => {
      if (!room) return room;
      room.current_phase = 1;
      room.started = false;
      room.level_1_unlocked = true;
      room.level_2_unlocked = false;
      return room;
    });

    toast(
      clearPlayers ? "Sala vaciada. Lista para un grupo nuevo." : "Partida reiniciada.",
      "success"
    );
  } catch (err) {
    toast("Error al reiniciar: " + err.message, "error");
  } finally {
    state.transitioning = false;
    resetBtn.disabled = false;
    clearBtn.disabled = false;
  }
}

boot();
