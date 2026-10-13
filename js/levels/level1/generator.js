// Level 1 "Matrix Protocol" — procedural maze generation (real-time arcade mode).
//
// The maze is 7x7 (see DESIGN.md section 9). Every client generates its own maze
// locally, so server load stays at zero. Generation guarantees the maze is fully
// connected: every open cell is reachable from the hero's start. That means the
// agents can always chase and the phone is always reachable.

export const GRID_SIZE = 7;

const WALL_DENSITY = 0.26; // share of random wall blocks before the connectivity check
const MIN_OPEN_RATIO = 0.62; // keep the maze open enough for a Pac-Man feel
const CONNECT_ATTEMPTS = 500; // retries until a fully connected maze is found

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

function emptyWalls(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
}

function countOpen(walls, size) {
  let n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (!walls[y][x]) n++;
  }
  return n;
}

export function openCells(walls, size) {
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (!walls[y][x]) out.push({ x, y });
  }
  return out;
}

// Breadth-first distances (in cells) from `start` over walkable cells.
// Walls and unreachable cells keep `Infinity`.
export function bfsDistances(walls, size, start) {
  const dist = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Infinity)
  );
  if (start.x < 0 || start.y < 0 || start.x >= size || start.y >= size) return dist;
  if (walls[start.y][start.x]) return dist;

  dist[start.y][start.x] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const nd = dist[c.y][c.x] + 1;
    for (const d of DIRECTIONS) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      if (n.x < 0 || n.y < 0 || n.x >= size || n.y >= size) continue;
      if (walls[n.y][n.x] || dist[n.y][n.x] !== Infinity) continue;
      dist[n.y][n.x] = nd;
      queue.push(n);
    }
  }
  return dist;
}

function allReachable(walls, size, root) {
  const dist = bfsDistances(walls, size, root);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!walls[y][x] && dist[y][x] === Infinity) return false;
    }
  }
  return true;
}

function forceOpen(walls, cells) {
  for (const c of cells) {
    if (c && walls[c.y] && walls[c.y][c.x] !== undefined) walls[c.y][c.x] = false;
  }
}

// Random walls, retried until the whole maze is connected and `keepOpen` cells
// stay walkable. Falls back to a fully open board if no layout converges.
function makeSolvableWalls(size, keepOpen) {
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    const walls = emptyWalls(size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        walls[y][x] = Math.random() < WALL_DENSITY;
      }
    }
    forceOpen(walls, keepOpen);
    if (countOpen(walls, size) < Math.ceil(size * size * MIN_OPEN_RATIO)) continue;
    const root = (keepOpen && keepOpen[0]) || { x: 0, y: 0 };
    if (!allReachable(walls, size, root)) continue;
    return walls;
  }
  return emptyWalls(size);
}

// Rebuilds the wall layout while keeping the given cells walkable. Used by the
// BYPASS action, which reconfigures the maze live.
export function regenerateWalls(size, keepOpen) {
  return makeSolvableWalls(size, keepOpen);
}

function pickAmongFarthest(cells, dist, frac) {
  const sorted = [...cells].sort((a, b) => dist[b.y][b.x] - dist[a.y][a.x]);
  const top = Math.max(1, Math.ceil(sorted.length * frac));
  return sorted[Math.floor(Math.random() * top)];
}

function pickFarthestFrom(cells, from, avoid) {
  let best = null;
  let bestDist = -1;
  for (const c of cells) {
    if (avoid.some((a) => a && a.x === c.x && a.y === c.y)) continue;
    const d = Math.abs(c.x - from.x) + Math.abs(c.y - from.y);
    if (d > bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function generateLevel1(size = GRID_SIZE) {
  const start = { x: 0, y: 0 };
  const walls = makeSolvableWalls(size, [start]);
  const dist = bfsDistances(walls, size, start);
  const reachable = openCells(walls, size).filter((c) => dist[c.y][c.x] !== Infinity);

  // Phone: far away from the hero.
  const phonePool = reachable.filter((c) => !(c.x === 0 && c.y === 0));
  const phone = pickAmongFarthest(
    phonePool.length ? phonePool : reachable,
    dist,
    0.3
  );

  // Agents: two distinct cells, spread from the hero and from each other.
  const far = reachable.filter(
    (c) =>
      !(c.x === 0 && c.y === 0) &&
      !(c.x === phone.x && c.y === phone.y) &&
      dist[c.y][c.x] >= Math.max(3, Math.floor(size * 0.6))
  );
  const pool = far.length >= 2
    ? far
    : reachable.filter(
        (c) =>
          !(c.x === start.x && c.y === start.y) &&
          !(c.x === phone.x && c.y === phone.y)
      );

  const agentA = pool.length ? pool[Math.floor(Math.random() * pool.length)] : start;
  const agentB =
    pickFarthestFrom(pool, agentA, [start, phone, agentA]) || { ...agentA };

  return {
    size,
    walls,
    hero: { x: start.x, y: start.y },
    phone: { x: phone.x, y: phone.y },
    agents: [
      { x: agentA.x, y: agentA.y },
      { x: agentB.x, y: agentB.y }
    ]
  };
}
