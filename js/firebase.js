// Firebase bootstrap.
//
// NOTE: the snippet that the Firebase console gives you uses bare imports such
// as `import { initializeApp } from "firebase/app"`. Those only work when a
// bundler (Vite, Webpack, ...) resolves them. This project is plain static
// files with no build step, so the SDK is imported from the gstatic CDN with
// explicit URLs instead.
//
// Analytics is intentionally left out: it is optional, unused by the game and
// would only add an extra network dependency.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

// Consider the app configured only when the essentials look real, so the UI can
// warn instead of failing with a cryptic error.
export const isConfigured =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.startsWith("AIza") &&
  typeof firebaseConfig.databaseURL === "string" &&
  firebaseConfig.databaseURL.includes("firebaseio.com");

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
