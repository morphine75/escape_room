# AGENTS.md — Guidelines for AI Coding Assistants

## 🎯 Project Overview
**Name:** Hackean el Terciario: Misión Cero
**Type:** Real-time, multiplayer interactive web scavenger hunt for high school students visiting a higher education technical institute.
**Tech Stack:** Plain HTML5, CSS3, Vanilla JavaScript (ES6+), Firebase Realtime Database (Web SDK v10+).

---

## 🛠️ Tech Stack & Constraints
1. **Frontend:** Pure HTML5, CSS3, Vanilla JS. No React, Vue, or heavy frameworks to ensure instant loading on mobile devices.
2. **Backend/Database:** **Firebase Realtime Database**. No custom backend server (Node/Express). All real-time synchronization must happen via Firebase Web SDK.
3. **Architecture:** Single-page app (SPA) or simple multi-view structure, keeping assets lightweight for mobile network conditions.

---

## 📐 Coding & Design Guidelines

### 1. Code Style & Structure
- Write clean, modern, self-documenting JavaScript ES6+ code.
- Avoid external CSS or JS libraries unless strictly necessary (e.g., Firebase Web SDK, QR generation/scanning libraries).
- Keep HTML semantic and mobile-first.

### 2. Mobile-First & UX First
- All UI elements must be optimized for touchscreens (minimum 44x44px touch targets).
- Use high-contrast, clear fonts, and responsive layouts (CSS Flexbox/Grid).
- Provide immediate visual feedback for every user action (loading states, disabled buttons while waiting, clear success/error toasts).

### 3. Firebase Best Practices
- Use Firebase Realtime Database (`firebase/database`) for sub-second event synchronization across connected client devices.
- Always handle edge cases: network disconnection, empty inputs, duplicate usernames, and unexpected room resets.
- Store minimal, flat state data to minimize bandwidth consumption.

---

## 🤖 Persona & Context
- **Role:** Lead Software Architect & Tech Lead for an educational tech event.
- **Tone:** Technical yet clear, structured, and focused on simplicity and stability during live events.