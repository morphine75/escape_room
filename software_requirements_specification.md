# REQUIREMENTS.md — System Requirements Specification

## 1. Executive Summary
"Hackean el Terciario: Misión Cero" is a collaborative, real-time web game designed for high school visitors. Players scan QR codes to solve beginner-level logical and usability challenges. Phase progression is locked until **all participants in a room** successfully solve their assigned randomized puzzles.

---

## 2. Target Audience & Environment
- **Users:** High school students (ages 15–18) with varying levels of tech literacy.
- **Devices:** Personal mobile smartphones connected via mobile data or public Wi-Fi.
- **Context:** Guided institutional tours with 5 to 20 students per group.

---

## 3. Functional Requirements (FR)

### FR-1: Lobby & Room Management
- **FR-1.1:** A coordinator/host can create a game room or join a pre-set room ID (e.g., `SALA-101`).
- **FR-1.2:** The system must accept a target player threshold $N$ (e.g., $N = 10$).
- **FR-1.3:** Students enter their name or nickname to register in the active room.
- **FR-1.4:** The room lobby displays a real-time player counter (`Joined: X / N`).

### FR-2: Randomized Challenge Distribution (Phase 1: Logic)
- **FR-2.1:** Upon starting, the game generates a unique, randomized $4 \times 4$ grid maze/puzzle for each student.
- **FR-2.2:** Each challenge tests basic algorithmic logic (e.g., grid navigation, loop iterations).
- **FR-2.3:** The challenge must evaluate user inputs locally and mark the player's status as `completed: true` in Firebase upon success.

### FR-3: Real-Time Synchronization & Phase Progression
- **FR-3.1:** The app listens to live updates from Firebase Realtime Database.
- **FR-3.2:** A progress bar/dashboard displays live room completion (`Completed: X / N`).
- **FR-3.3:** When all $N$ players reach `completed: true`, the system automatically unlocks Phase 2 across all connected screens simultaneously without requiring a page refresh.

### FR-4: User Feedback & End Game
- **FR-4.1:** Once a player completes their individual task, a waiting screen prevents re-submission while showing live group progress.
- **FR-4.2:** Successful phase unlock displays victory feedback and gives directions or QR prompts for the next station.

---

## 4. Non-Functional Requirements (NFR)

- **NFR-1 (Performance):** Page load time under 2 seconds on 3G connections.
- **NFR-2 (Real-time Latency):** Firebase state sync latency under 500ms.
- **NFR-3 (Usability):** Zero prior programming knowledge required; intuitive interface.
- **NFR-4 (Reliability):** App state must recover gracefully if a user temporarily loses connection or refreshes their browser.