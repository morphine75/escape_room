# 🎨 DESIGN.md — Hack the Institute: Mission Zero

## 📌 1. Overview

**Event Name:** Hack the Institute: Mission Zero
**General Theme:** Collaborative, real-time digital infiltration / escape room.
**Target Platform:** Mobile web (responsive, portrait-first) + a projectable dashboard for the event's central screen.
**Tech Stack:** HTML5, CSS3 (CSS Grid/Flexbox), JavaScript ES6+ (no heavy frameworks) and Firebase Realtime Database.

**Game structure:**

| Level | Name | Type |
|-------|------|------|
| 1 | Matrix Protocol (The Hacker Escape) | Algorithmic logic / maze |
| 2 | Typography & Vector Design (two mini-games in parallel) | Typographic agility / curve adjustment |
| 3 | To be defined | — |

---

## 🏗️ 2. System Architecture

The application is a Serverless Real-Time Web App.

```
[ Student Phones (HTML/CSS/JS) ] <--- WebSockets / Long-Polling ---> [ Firebase Realtime Database ]
                                                                             ^
[ Coordinator Screen / Projector ] <----------------------------------------|
```

---

## 🗄️ 3. Data Model (Firebase Realtime Database)

The structure is flat and lightweight to allow low-latency real-time synchronization.

```json
{
  "rooms": {
    "ROOM-101": {
      "current_phase": 1,
      "required_players": 10,
      "level_1_unlocked": true,
      "level_2_unlocked": false,
      "created_at": 1728345600,
      "players": {
        "player_abc123": {
          "name": "Neo_404",
          "level_1_completed": true,
          "level_2_game": "serif",
          "level_2_completed": false,
          "level_2_score": 400,
          "last_changed": 1728345600
        },
        "player_def456": {
          "name": "Trinity_7",
          "level_1_completed": true,
          "level_2_game": "vector",
          "level_2_completed": false,
          "level_2_precision": 0,
          "last_changed": 1728345605
        }
      }
    }
  }
}
```

**Field reference:**

| Field | Description |
|-------|-------------|
| `current_phase` | Global room phase (1, 2, 3…). Controls which screen everyone sees. |
| `required_players` | Target number of players needed to start and advance. |
| `level_1_completed` / `level_2_completed` | Individual progress per level. |
| `level_2_game` | Assigned mini-game: `"serif"` ("I Shot The Serif") or `"vector"` ("Shape Type"). |
| `level_2_score` | Score accumulated in "I Shot The Serif" (+100 per correct serif). |
| `level_2_precision` | Precision achieved in "Shape Type" (≥ 85% required to pass). |
| `last_changed` | Timestamp (epoch) of the player's last update. |

> **Note:** Use a single timestamp format everywhere (epoch via `ServerValue.TIMESTAMP` is recommended).

---

## 🔄 4. Application State & Flow

```
[ Screen 1: Registration ]
         │
         ▼ (Submit name)
[ Screen 2: Waiting Lobby ] ─── (Real-time listener counts connected players)
         │
         ▼ (required_players reached)
[ Screen 3: Level 1 - Matrix Protocol ] ─── (Generates randomized grid + local logic state)
         │
         ▼ (Player runs their exploit and reaches the phone booth 📞)
[ Screen 4: Individual Completion / Group Wait ]
         │
         ▼ (Listener detects ALL players level_1_completed = true)
[ Screen 5: Level 1 Victory & Level 2 Assignment ]
         │
         ▼ (Distribution: first half → Serif, second half → Vector)
[ Screen 6a: Level 2 - "I Shot The Serif" ] ──────┐
         │ (30-second timer, eliminate serifs)     │
[ Screen 6b: Level 2 - "Shape Type" ] ────────────┤ (Parallel execution)
         │ (Drag nodes to match vector curves)     │
         ▼                                          │
[ Screen 7: Individual Completion / Group Wait ] <─┘
         │
         ▼ (Listener detects ALL players level_2_completed = true)
[ Screen 8: Phase 3 Unlocked / Next Challenge ]
```

---

## 🕵🏻 5. LEVEL 1: Matrix Protocol (The Hacker Escape)

### 5.1. Narrative & Aesthetics

* **Concept:** Participants are trapped inside the Matrix simulation. To free the whole team (10 participants), each one must navigate their personal terminal, dodge the Agents/Firewalls, and run the escape script at the phone booth.
* **Color Palette:**
  * Background: `#0d1117` / `#000000` (deep black).
  * Digital rain and accents: `#00ff66` / `#00ff41` (Matrix neon green).
  * Alerts / errors: `#ff0055` (neon red) / `#ffb700` (amber).
  * Secondary text: `#a3b8cc` (cool gray).
* **Typography:** Monospace (`Courier New`, `Consolas`, or `Fira Code`).
* **Optional ambience:** "Digital rain" canvas background at low opacity so it doesn't hurt readability.

### 5.2. Mobile Layout (Portrait / 100vh)

```text
+------------------------------------+
| 🕵🏻 MATRIX OS | 👤 Neo (3/10 Ready) |  <-- Sticky Header (Room info)
+------------------------------------+
|                                    |
|   [😎]  [01]  [🧱]  [10]          |
|   [🧱]  [🕵🏻]  [00]  [🚪]          |  <-- ZONE 1: Simulation Matrix
|   [10]  [01]  [🧱]  [📞]          |      (Canvas 2D / CSS Grid)
|                                    |
+------------------------------------+
| SCRIPT TERMINAL:                   |
| > bypassFirewall()  [❌]           |  <-- ZONE 2: Command blocks
| > moveRight(2)      [❌]           |      assembled by the student
+------------------------------------+
| [⬆️ UP] [⬇️ DOWN] [⬅️ LEFT] [➡️ RIGHT]|  <-- TOUCH CONTROL PANEL
| [⚔️ BYPASS] [🗝️ DECRYPT]            |      Command injection
|------------------------------------|
|      [ ⚡ RUN EXPLOIT ]            |  <-- Main action button
+------------------------------------+
```

### 5.3. Level 1 Game Mechanics

1. **Matrix components (procedural 5×5 or 6×6 maze):**
   * **Hacker (`😎`):** Starting position `(0, 0)`.
   * **Data cells (`01`, `10`, `00`):** Walkable tiles (binary decoration).
   * **Walls / static firewalls (`🧱`):** Impassable obstacles.
   * **Agents / active firewalls (`🕵🏻`):** Block passage; neutralized with `bypassFirewall(power)`, where the power must match the Agent's defense value (HP).
   * **Encrypted gate (`🚪`):** Requires solving a small logic puzzle in a modal (`decryptGate`).
   * **Phone booth (`📞`):** Final goal. Reaching it runs the escape script.

2. **Command blocks (zero-typing input):**
   * **Movement:** `moveUp(steps)`, `moveDown(steps)`, `moveLeft(steps)`, `moveRight(steps)`
   * **Action / Combat:** `bypassFirewall(power)` (must equal the adjacent Agent's HP)
   * **Logic / Unlock:** `decryptGate(key)` (opens the logic puzzle modal)

3. **Execution & debugging loop:**
   * The player taps direction and action buttons to build an ordered command list in the **Script Terminal**.
   * Each command can be removed with `[❌]`.
   * The player presses **[ ⚡ RUN EXPLOIT ]**.
   * The sprite executes the steps sequentially, with animation.
   * **Success:** The hacker reaches `📞` → `level_1_completed: true` is written to Firebase → waiting screen is shown ("Waiting for the rest of the team… 7/10").
   * **Failure (bug):** The hacker hits a wall or fails a challenge → the failing command is highlighted in neon red (`#ff0055`) for targeted debugging, and the hacker returns to `(0, 0)`.

4. **Procedural generation:**
   * Each client generates its own grid locally with random walls, **guaranteeing at least one valid path** (e.g., carve a path first, then place walls only outside it).
   * Every student gets a unique puzzle and server load stays at zero.

### 5.4. Grid Generation Example (pseudocode)

```javascript
function generateGrid(size = 5) {
  const grid = Array.from({ length: size }, () => Array(size).fill("data"));
  const path = generateRandomPath(size); // from (0,0) to (size-1, size-1)

  // Place walls only outside the guaranteed path
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!path.some(c => c.x === x && c.y === y) && Math.random() < 0.3) {
        grid[y][x] = "wall";
      }
    }
  }

  // Place an Agent and a gate on the path (not on start/end)
  grid[path[2].y][path[2].x] = { type: "agent", hp: 2 + Math.floor(Math.random() * 3) };
  grid[path[path.length - 2].y][path[path.length - 2].x] = "gate";
  grid[size - 1][size - 1] = "booth";
  return grid;
}
```

---

## ⚙️ 6. Firebase Synchronization

### 6.1. Real-Time Listener (Client JS)

```javascript
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const roomRef = ref(db, `rooms/${roomId}`);

onValue(roomRef, (snapshot) => {
  const data = snapshot.val();
  if (!data || !data.players) return;

  const players = Object.values(data.players);
  const totalJoined = players.length;
  const required = data.required_players;

  const level1Completed = players.filter(p => p.level_1_completed === true).length;
  const level2Completed = players.filter(p => p.level_2_completed === true).length;

  // Progress bar depends on the active phase
  if (data.current_phase === 1) {
    updateUIProgressBar(level1Completed, required);
  } else if (data.current_phase === 2) {
    updateUIProgressBar(level2Completed, required);
  }

  // Trigger: Level 1 → Level 2
  if (data.current_phase === 1 && totalJoined >= required && level1Completed >= required) {
    transitionToLevel2();
  }

  // Trigger: Level 2 → Phase 3 (ALL players complete their assigned game)
  if (data.current_phase === 2 && totalJoined >= required && level2Completed >= required) {
    transitionToPhase3();
  }
});
```

> **Recommendation:** Only one client (or the coordinator dashboard) should write `current_phase` to avoid duplicate writes. All other clients just react to the change.

### 6.2. Marking Individual Progress

```javascript
import { ref, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

function completeLevel1() {
  update(ref(db, `rooms/${roomId}/players/${playerId}`), {
    level_1_completed: true,
    last_changed: serverTimestamp()
  });
}
```

---

## 🔠 7. LEVEL 2: Typography & Vector Design

### 7.1. Game Distribution & Assignment Logic

**Distribution algorithm:**
- When Level 2 unlocks, the coordinator defines the total player count ($N$).
- The first half ($\lceil N/2 \rceil$) is assigned `level_2_game: "serif"` (I Shot The Serif).
- The second half ($\lfloor N/2 \rfloor$) is assigned `level_2_game: "vector"` (Shape Type).
- Firebase updates each player's record with their assigned game type.
- **Example:** 10 players → 5 serif, 5 vector. 11 players → 6 serif, 5 vector.

---

### 7.2. Game A: "I Shot The Serif" (Typographic Agility)

#### 7.2.1. Objective
Eliminate all letters displayed with **serifs** before the 30-second timer expires.

#### 7.2.2. Mobile Layout (Portrait)

```text
+------------------------------------+
| ⏱️ Time: 00:22s   |  🎯 Points: 400 |
+------------------------------------+
|                                    |
|     [ T ] (Serif)    [ A ] (Sans)  |
|         (Tap)            (Tap)     |
|                                    |
|     [ R ] (Sans)     [ G ] (Serif) |
|         (Tap)            (Tap)     |
|                                    |
|     [ M ] (Serif)    [ E ] (Sans)  |
|         (Tap)            (Tap)     |
|                                    |
+------------------------------------+
|     Tap ONLY the typefaces         |
|         WITH SERIFS!               |
+------------------------------------+
```

#### 7.2.3. Game Mechanics

**Display grid:** 3×3 or 4×4 grid of random letters ($A$–$Z$).

**Font families:**
- **Serif fonts** (must tap): Times New Roman, Garamond, Georgia, Courier New.
- **Sans-serif fonts** (must avoid): Helvetica, Arial, Inter, Verdana, Open Sans.

**Player interaction:**
1. The grid shows letters in random serif / sans-serif fonts.
2. The player taps only letters with **serifs**.
3. Tapping a serif letter:
   - The letter explodes / disappears.
   - +100 points.
   - Short haptic vibration.
4. Tapping a sans-serif letter (mistake):
   - Visual error warning: "❌ Error: That's Sans Serif!"
   - No points lost, but time is wasted.
5. **Success condition:** All serif letters eliminated, or the timer reaches zero.
   - If all serifs are eliminated: `level_2_completed: true` and the score is saved in `level_2_score`.
   - The player moves to the waiting screen to watch group progress.

> **To define:** The original design doesn't specify what happens if the timer hits zero without completion. Suggestion: automatic retry (new grid) so no player blocks the group.

#### 7.2.4. Timing & Scoring
- **Timer:** 30 seconds.
- **Points:** +100 per correctly identified serif letter.
- **Pass condition:** Eliminate all serif fonts before time expires.

---

### 7.3. Game B: "Shape Type" (Vector Curve Adjustment)

#### 7.3.1. Objective
Reconstruct the original shape of a letter/logo by dragging deformed **Bézier curve nodes** to match the target silhouette. A **precision of ≥ 85%** is required to pass.

#### 7.3.2. Mobile Layout (Portrait)

```text
+------------------------------------+
| ✏️ Vector Adjust | Precision: 92%  |
+------------------------------------+
|                                    |
|                . - - - .           |
|              /           \         |
|             |     (🔴)----| <--Draggable
|              \           /     Node |
|                ` - - - '           |
|          (Dotted Guide Silhouette) |
|                                    |
|         [↙️ Drag the Red Node]     |
|                                    |
+------------------------------------+
|  Drag the red dot to correct       |
|  the curve of the letter.          |
|                                    |
|  Required precision: 85% ✓         |
+------------------------------------+
```

#### 7.3.3. Game Mechanics

**Setup:**
- A large letter or icon (e.g., 'a', 'g', 'S', or a career-related logo) is displayed with **one or more Bézier nodes displaced from their correct position**.
- A **dotted guide silhouette** shows the correct, harmonic shape.

**Player interaction:**
1. The player identifies the misplaced red node (🔴).
2. The player **drags (touch & drag)** the node across the canvas.
3. Real-time precision calculation:
   - The distance between the current node position and the target is computed continuously.
   - The header updates live: `Precision: 92%`.
4. When the node is released:
   - Final precision is calculated.
   - **Pass (≥ 85%):** the letter "comes to life" with a success animation (glow, pulse, scale-up), `level_2_completed: true`, and `level_2_precision` is stored in Firebase.
   - **Fail (< 85%):** brief error feedback ("Not precise enough, try again"), the node resets to its original position, and the player can retry.

#### 7.3.4. Precision Calculation Algorithm

```javascript
// Pseudocode for precision calculation
function calculatePrecision(currentNodePos, targetNodePos, tolerance = 20) {
  const distance = Math.hypot(
    currentNodePos.x - targetNodePos.x,
    currentNodePos.y - targetNodePos.y
  );
  const precision = Math.max(0, 100 - (distance / tolerance) * 100);
  return Math.round(precision);
}
```

> **Note:** With `tolerance = 20`, 85% means landing within ~3 px of the target, which is very demanding on a touchscreen. Consider raising the tolerance (e.g., 40–60 px) or scaling it to the canvas size.

---

## 🎨 8. UI/UX Design System

### 8.1. Level 1 (Matrix theme)

* **Colors:** see section 5.1.
* **Typography:** Monospace.
* **Effects:** Digital rain background, terminal-style text, blinking `_` cursor, neon-green glow on active elements.

### 8.2. Level 2 and the rest of the app

* **Color Palette:**
  * Background: Dark Navy (`#0f172a`)
  * Cards / containers: Slate Blue (`#1e293b`)
  * Accent / primary action: Electric Blue (`#2563eb`)
  * Success / unlock state: Emerald Green (`#22c55e`)
  * Warning / progress state: Amber Yellow (`#f59e0b`)
  * Error / incorrect action: Red (`#ef4444`)
* **Typography:** Sans-serif, bold, easily readable on mobile displays.

> **Suggestion:** To keep immersion, add a "glitch" transition between Level 1 (Matrix) and Level 2, as if the system were rebooting with a different look.

### 8.3. Shared rules

* **Touch targets:** Minimum $44 \times 44\text{px}$.
* **Components:** Responsive cards, touchable directional controls, dynamic progress bars, draggable vector nodes.
* **Haptic feedback:** Short vibration on serif elimination (Game A); gentle pulse on node drag (Game B); brief vibration on exploit run and on failure (Level 1).
* **Animations:**
  * Step-by-step hacker movement and a "hack" effect when an Agent is neutralized (Level 1).
  * Letter explosion on correct taps (Game A).
  * Node "snap-to-target" animation when precision ≥ 85% (Game B).
  * Success glow/pulse when each objective is met.