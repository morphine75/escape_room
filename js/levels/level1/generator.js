// Level 1 procedural maze generation.
//
// Design decision (see DESIGN.md section 9): the maze is 5x5. The grid size is
// exposed as a constant so it can be tweaked in one place. REQUIREMENTS.md
// (FR-2.1) mentions 4x4; the design prevails.
//
// Strategy: carve a guaranteed solvable path first, then scatter walls only
// outside that path. Every client generates its own puzzle, so server load is 0.

export const GRID_SIZE = 5;

const PATH_WALL_CHANCE = 0.3;

export function generateLevel1(size = GRID_SIZE) {
  // 1. Empty grid ("data" tiles).
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ type: "data" }))
  );

  // 2. Carve a random monotonic path (only right/down) from (0,0) to (size-1,size-1).
  const path = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  while (x < size - 1 || y < size - 1) {
    const canRight = x < size - 1;
    const canDown = y < size - 1;
    if (canRight && canDown) {
      if (Math.random() < 0.5) x++; else y++;
    } else if (canRight) {
      x++;
    } else {
      y++;
    }
    path.push({ x, y });
  }

  const onPath = (cx, cy) => path.some((c) => c.x === cx && c.y === cy);

  // 3. Place walls only outside the guaranteed path.
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      if (!onPath(gx, gy) && Math.random() < PATH_WALL_CHANCE) {
        grid[gy][gx] = { type: "wall" };
      }
    }
  }

  // 4. Place an Agent and a gate on the path (never on start or end).
  const agentPos = path[2];
  const gatePos = path[path.length - 2];

  grid[agentPos.y][agentPos.x] = {
    type: "agent",
    hp: 2 + Math.floor(Math.random() * 3) // 2, 3 or 4
  };
  grid[gatePos.y][gatePos.x] = { type: "gate", open: false };

  // 5. Phone booth (goal) at the bottom-right corner.
  grid[size - 1][size - 1] = { type: "booth" };

  return { size, grid, path };
}
