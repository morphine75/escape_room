// Individual ranking (decision #26). Besides the group goal, every player earns
// points per level. Points are COMPUTED from the stored results (never stored),
// so the dashboard and every phone always show the same numbers.
//
// Per completed level:
//   - 100 base points;
//   - up to 100 performance points:
//       L1  100 at the 1st attempt, -20 per extra attempt   (level_1_attempts)
//       L2  precision 85% -> 0 ... 100% -> 100               (level_2_precision)
//       L3  100 with the optimal 15 moves, -10 per extra move (level_3_moves)
//       L4  100 with no timeouts, -20 per extra round         (level_4_rounds; 6 = none)
//   - speed bonus by completion order in that level (level_N_at, server time):
//       1st +50, 2nd +35, 3rd +20, the rest +10.
// Maximum: 4 x 250 = 1000. Ties: the player who finished the last level earlier.

export const LEVELS = [1, 2, 3, 4];
export const BASE = 100;
export const SPEED_BONUS = [50, 35, 20];
export const SPEED_REST = 10;
export const MAX_POINTS = LEVELS.length * (BASE + 100 + SPEED_BONUS[0]);

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

// Performance points (0-100) of a completed level.
export function performance(p, level) {
  switch (level) {
    case 1: return clamp(100 - 20 * Math.max(0, (p.level_1_attempts || 1) - 1));
    case 2: return clamp(((p.level_2_precision || 85) - 85) / 15 * 100);
    case 3: return clamp(100 - 10 * Math.max(0, (p.level_3_moves || 15) - 15));
    case 4: return clamp(100 - 20 * Math.max(0, (p.level_4_rounds || 6) - 6));
    default: return 0;
  }
}

export const speedBonus = (place) => (place <= SPEED_BONUS.length ? SPEED_BONUS[place - 1] : SPEED_REST);

// Completion order per level: { level: Map(playerId -> place 1..n) }.
// Players without a stored time (old data) go after the timed ones.
function completionPlaces(entries) {
  const places = {};
  LEVELS.forEach((level) => {
    const done = entries
      .filter(([, p]) => p[`level_${level}_completed`] === true)
      .sort(([, a], [, b]) => (a[`level_${level}_at`] || Infinity) - (b[`level_${level}_at`] || Infinity));
    places[level] = new Map(done.map(([id], i) => [id, i + 1]));
  });
  return places;
}

// Ranking of the room's players (ghost records without a name are skipped).
// Returns [{ id, name, total, levels: [{ level, done, base, perf, speed, place, points }], rank }]
// sorted best first; equal totals share the rank order by earliest last finish.
export function ranking(players) {
  const entries = Object.entries(players || {}).filter(([, p]) => p && p.name);
  const places = completionPlaces(entries);
  const rows = entries.map(([id, p]) => {
    let lastAt = 0;
    const levels = LEVELS.map((level) => {
      const done = p[`level_${level}_completed`] === true;
      if (!done) return { level, done, base: 0, perf: 0, speed: 0, place: null, points: 0 };
      const place = places[level].get(id);
      const perf = performance(p, level);
      const speed = speedBonus(place);
      lastAt = Math.max(lastAt, p[`level_${level}_at`] || 0);
      return { level, done, base: BASE, perf, speed, place, points: BASE + perf + speed };
    });
    const total = levels.reduce((sum, l) => sum + l.points, 0);
    return { id, name: p.name, total, levels, lastAt: lastAt || Infinity };
  });
  rows.sort((a, b) => b.total - a.total || a.lastAt - b.lastAt || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
