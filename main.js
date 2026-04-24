// ═══════════════════════════════════════════════════════════════════════
//  MAIN.JS  —  Entry point: initialize Firebase then auth
// ═══════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  // Kick off Firebase init (defined in firebase.js)
  initializeFirebase();

  // Wait a tick for Firebase to register, then init auth
  setTimeout(() => {
    authInit();
  }, 300);
});
