// Persists the player's session so a browser refresh can resume the game
// (NFR-4: recover gracefully after a refresh).

const ROOM_KEY = "hmo_roomId";
const PLAYER_KEY = "hmo_playerId";
const NAME_KEY = "hmo_playerName";
const HOST_KEY = "hmo_hostRoom";

export function randomId(prefix = "player_") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function saveSession({ roomId, playerId, name }) {
  try {
    localStorage.setItem(ROOM_KEY, roomId);
    localStorage.setItem(PLAYER_KEY, playerId);
    localStorage.setItem(NAME_KEY, name || "");
  } catch (_) { /* storage may be unavailable */ }
}

export function loadSession() {
  try {
    return {
      roomId: localStorage.getItem(ROOM_KEY),
      playerId: localStorage.getItem(PLAYER_KEY),
      name: localStorage.getItem(NAME_KEY)
    };
  } catch (_) {
    return { roomId: null, playerId: null, name: null };
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(PLAYER_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch (_) { /* ignore */ }
}

export function saveHostRoom(roomId) {
  try { localStorage.setItem(HOST_KEY, roomId); } catch (_) { /* ignore */ }
}

export function loadHostRoom() {
  try { return localStorage.getItem(HOST_KEY); } catch (_) { return null; }
}

export function clearHostRoom() {
  try { localStorage.removeItem(HOST_KEY); } catch (_) { /* ignore */ }
}
