// Room + player data operations against Firebase Realtime Database.
import { db } from "./firebase.js";
import {
  ref, set, get, update, onDisconnect, serverTimestamp
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

  // Presence: flag the player as disconnected if the socket drops.
  onDisconnect(ref(db, `rooms/${roomId}/players/${playerId}/connected`)).set(false);

  saveSession({ roomId, playerId, name });
  return { ok: true, playerId };
}

export async function markConnected(roomId, playerId) {
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    connected: true,
    last_changed: serverTimestamp()
  });
}

// FR-2.3 / 7.3.3: persist an individual level completion.
export async function markLevelComplete(roomId, playerId, level, extra = {}) {
  const payload = { last_changed: serverTimestamp(), ...extra };
  if (level === 1) payload.level_1_completed = true;
  if (level === 2) payload.level_2_completed = true;
  await update(ref(db, `rooms/${roomId}/players/${playerId}`), payload);
}
