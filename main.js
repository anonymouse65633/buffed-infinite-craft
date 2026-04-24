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

  // ── Admin panel: poll until AUTH_USER is ready, then init once ──────
  let _adminInitDone = false;
  (function _pollAdminInit() {
    if (_adminInitDone) return;
    if (typeof ADMIN !== 'undefined' && ADMIN.init &&
        typeof AUTH_USER !== 'undefined' && AUTH_USER &&
        typeof AUTH_UID  !== 'undefined' && AUTH_UID) {
      _adminInitDone = true;
      ADMIN.init();
    } else {
      setTimeout(_pollAdminInit, 400);
    }
  })();
});
