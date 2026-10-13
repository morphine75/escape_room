// Room + player data operations against Firebase Realtime Database.
import { db } from "./firebase.js";
import {
  ref, set, get, update, remove, onDisconnect, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { randomId, saveSession } from "./session.js";

// Normalises a room code: "sala 101" -> "SALA-101".
export function normalizeRoomId(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export async function roomExists(roomId) {
  const snap = await get(ref(db, `rooms/${roomId}`));
  return snap.exists();
}

// FR-1.1 / FR-1.2: a coordinator creates a room with a target player count.
export async function createRoom(roomId, requiredPlayers) {
  const roomRef = ref(db, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (snap.exists()) {
    return { ok: false, error: "Esa sala ya existe" };
  }
  await set(roomRef, {
    current_phase: 1,
    started: false,
    required_players: Number(requiredPlayers) || 10,
    level_1_unlocked: true,
    level_2_unlocked: false,
    created_at: serverTimestamp(),
    players: null
  });
  return { ok: true };
}

// Deletes a room only if it has no registered players. Runs as a transaction so
// a student who joins at the same moment cannot be deleted along with the room.
// The same code can be created again afterwards with createRoom().
export async function deleteRoomIfEmpty(roomId) {
  let hasPlayers = false;
  const res = await runTransaction(ref(db, `rooms/${roomId}`), (room) => {
    if (room === null) return null; // not cached yet / already gone: retried with server data
    hasPlayers = Object.keys(room.players || {}).length > 0;
    if (hasPlayers) return; // abort: never delete a room with players
    return null; // delete
  });
  if (!res.committed || hasPlayers) {
    return { ok: false, error: "La sala tiene jugadores. Vaciala antes de eliminarla." };
  }
  return { ok: true };
}

// FR-1.3: register a student in the room (with duplicate-name handling).
export async function joinRoom(roomId, rawName) {
  const name = String(rawName || "").trim();
  if (!name) return { ok: false, error: "Ingresá un nombre" };
  if (name.length > 16) return { ok: false, error: "Máximo 16 caracteres" };

  // The room must exist before anyone can register.
  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  if (!roomSnap.exists()) return { ok: false, error: "Sala no encontrada" };
  if (roomSnap.child("started").val() === true) {
    return { ok: false, error: "La partida ya comenzó" };
  }

  const playersRef = ref(db, `rooms/${roomId}/players`);
  const snap = await get(playersRef);
  const players = snap.val() || {};
  const taken = Object.values(players).some(
    (p) => (p.name || "").toLowerCase() === name.toLowerCase()
  );
  if (taken) return { ok: false, error: "Ese nombre ya está en uso" };

  const playerId = randomId("player_");
  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await set(playerRef, {
    name,
    connected: true,
    level_1_completed: false,
    level_2_completed: false,
    level_2_game: null,
    level_2_score: 0,
    level_2_precision: 0,
    joined_at: serverTimestamp(),
    last_changed: serverTimestamp()
  });

  // Presence (connected + onDisconnect) is armed by the app once the live room
  // data confirms this player exists — see trackPresence().
  saveSession({ roomId, playerId, name });
  return { ok: true, playerId };
}

// Presence: marks the player connected and arms onDisconnect -> connected=false.
// Only call it when the live room data shows the player exists: writing to a
// removed player would re-create it as a nameless "ghost" record (the
// database rules also reject player records without a name).
export async function trackPresence(roomId, playerId) {
  const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
  await onDisconnect(ref(db, `rooms/${roomId}/players/${playerId}/connected`)).set(false);
  await update(playerRef, { connected: true, last_changed: serverTimestamp() });
}

// Cancels the pending onDisconnect write. Used when the player was removed from
// the room, so closing the tab later does not re-create a ghost record.
export async function stopPresence(roomId, playerId) {
  await onDisconnect(ref(db, `rooms/${roomId}/players/${playerId}/connected`)).cancel();
}

// Coordinator: removes one player from the room. Their device returns to the
// registration screen.
export async function removePlayer(roomId, playerId) {
  await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
}

// FR-2.3 / 7.3.3: persist an individual level completion.
export async function markLevelComplete(roomId, playerId, level, extra = {}) {
  const payload = { last_changed: serverTimestamp(), ...extra };
  if (level === 1) payload.level_1_completed = true;
  if (level === 2) payload.level_2_completed = true;
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), payload);
}

// Level 1 done: mark it and self-assign the Level 2 mini-game in one transaction,
// so the player moves on immediately without waiting for the group or the
// coordinator. The game goes to whichever of serif / vector has fewer players so
// far (ties -> serif), which keeps the split close to half and half.
export async function completeLevel1(roomId, playerId) {
  await runTransaction(ref(db, `rooms/${roomId}/players`), (players) => {
    if (!players || !players[playerId]) return players; // retried with server data
    const me = players[playerId];
    if (!me.level_2_game) {
      let serif = 0;
      let vector = 0;
      Object.entries(players).forEach(([id, p]) => {
        if (id === playerId || !p) return;
        if (p.level_2_game === "serif") serif++;
        else if (p.level_2_game === "vector") vector++;
      });
      me.level_2_game = serif <= vector ? "serif" : "vector";
    }
    me.level_1_completed = true;
    return players;
  });
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    last_changed: serverTimestamp()
  });
}
