// Coordinator dashboard: creates the room, shows live progress and is the SOLE
// authority that writes `current_phase` (inside transactions) — see DESIGN.md 9.
import { db, isConfigured } from "./firebase.js";
import {
  ref, update, get, remove, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { createRoom, normalizeRoomId } from "./room.js";
import { subscribeRoom } from "./sync.js";
import { saveHostRoom, loadHostRoom } from "./session.js";
import { showScreen, toast, $ } from "./ui.js";

const state = { roomId: null, data: null, unsub: null, transitioning: false };

function boot() {
  if (!isConfigured) {
    toast("Firebase no está configurado. Editá js/firebase-config.js", "error", 8000);
  }
  wireSetup();

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

  $("#dash-start").addEventListener("click", async () => {
    if (!state.roomId) return;
    try {
      await update(ref(db, `rooms/${state.roomId}`), { started: true });
      toast("¡Partida iniciada!", "success");
    } catch (err) {
      toast("Error al iniciar: " + err.message, "error");
    }
  });

  // Safety hatch: advance the phase even if a disconnected player never finished,
  // so a live session cannot deadlock. Still the single writer of current_phase.
  $("#dash-force").addEventListener("click", () => {
    if (!state.data || !state.roomId) return;
    const phase = state.data.current_phase;
    if (phase === 1) advanceToLevel2(state.data.players || {});
    else if (phase === 2) finishGame();
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

function onData(data) {
  if (!data) {
    toast("Esa sala no existe", "error");
    showScreen("dash-setup");
    return;
  }
  state.data = data;
  showScreen("dash-room-view");
  render(data);
  maybeAdvance(data);
}

// --- Rendering ---------------------------------------------------------------

function phaseLabel(data) {
  if (!data.started) return "Lobby";
  if (data.current_phase === 1) return "Nivel 1";
  if (data.current_phase === 2) return "Nivel 2";
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

  const field = data.current_phase === 2 ? "level_2_completed" : "level_1_completed";
  const done = list.filter((p) => p[field] === true).length;
  $("#dash-bar").style.width = total ? Math.min(100, (done / total) * 100) + "%" : "0%";
  $("#dash-progress").textContent = `${done} / ${total} completaron ${
    data.current_phase === 2 ? "el Nivel 2" : "el Nivel 1"
  }`;

  const startBtn = $("#dash-start");
  startBtn.disabled = data.started === true || total === 0;
  startBtn.textContent = data.started ? "Partida en curso" : "▶️ Iniciar partida";

  const forceBtn = $("#dash-force");
  forceBtn.disabled = !data.started || data.current_phase >= 3;
  $("#dash-hint").textContent = data.started
    ? "Las fases avanzan automáticamente cuando todos completan."
    : `Se necesitan jugadores. Recomendado: ${required}.`;

  renderRoster(list);
}

function renderRoster(list) {
  const tbody = $("#dash-roster");
  tbody.innerHTML = "";
  const sorted = [...list].sort((a, b) => (a.joined_at || 0) - (b.joined_at || 0));

  sorted.forEach((p, i) => {
    const tr = document.createElement("tr");
    if (p.connected === false) tr.classList.add("offline");

    let detail = "";
    if (p.level_2_game === "serif") detail = `serif · ${p.level_2_score || 0} pts`;
    else if (p.level_2_game === "vector") detail = `vector · ${p.level_2_precision || 0}%`;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name || "")}</td>
      <td>${p.level_1_completed ? "✅" : "⏳"}</td>
      <td>${p.level_2_completed ? "✅" : "⏳"}</td>
      <td>${p.level_2_game || "—"}</td>
      <td>${detail || "—"}</td>`;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// --- Phase progression (single writer, transactional) ------------------------

function maybeAdvance(data) {
  if (!data.started || state.transitioning) return;
  const list = Object.values(data.players || {});
  if (list.length === 0) return;

  if (data.current_phase === 1 && list.every((p) => p.level_1_completed === true)) {
    advanceToLevel2(data.players);
  } else if (data.current_phase === 2 && list.every((p) => p.level_2_completed === true)) {
    finishGame();
  }
}

async function advanceToLevel2(players) {
  state.transitioning = true;
  try {
    // First half -> serif, second half -> vector (DESIGN.md 7.1).
    const ids = Object.keys(players).sort();
    const serifCount = Math.ceil(ids.length / 2);

    await runTransaction(ref(db, `rooms/${state.roomId}`), (room) => {
      if (!room || room.current_phase !== 1) return room; // already advanced
      room.current_phase = 2;
      room.level_2_unlocked = true;
      ids.forEach((id, i) => {
        if (room.players && room.players[id]) {
          room.players[id].level_2_game = i < serifCount ? "serif" : "vector";
        }
      });
      return room;
    });
    toast("Nivel 2 desbloqueado", "success");
  } catch (err) {
    toast("Error al desbloquear el Nivel 2: " + err.message, "error");
  } finally {
    state.transitioning = false;
  }
}

async function finishGame() {
  state.transitioning = true;
  try {
    await runTransaction(ref(db, `rooms/${state.roomId}`), (room) => {
      if (!room || room.current_phase !== 2) return room;
      room.current_phase = 3; // finished (no Phase 3 gameplay)
      return room;
    });
    toast("¡El equipo completó la misión! 🎉", "success");
  } catch (err) {
    toast("Error al finalizar: " + err.message, "error");
  } finally {
    state.transitioning = false;
  }
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
    } else {
      const snap = await get(ref(db, `rooms/${state.roomId}/players`));
      const players = snap.val() || {};
      const updates = {};
      Object.keys(players).forEach((pid) => {
        updates[`${pid}/level_1_completed`] = false;
        updates[`${pid}/level_2_completed`] = false;
        updates[`${pid}/level_2_game`] = null;
        updates[`${pid}/level_2_score`] = 0;
        updates[`${pid}/level_2_precision`] = 0;
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
