// ── Player Identity ────────────────────────────────────────────
function _getPlayerName() {
  let n = localStorage.getItem('ic_player_name');
  if (!n) { n = 'Crafter' + Math.floor(Math.random()*9000+1000); localStorage.setItem('ic_player_name', n); }
  return n;
}
let PLAYER_NAME = _getPlayerName();

// ── Combo Cache (localStorage + cloud) ────────────────────────
let KNOWN_COMBOS = {};
(function _loadComboCache() {
  try { const r = localStorage.getItem('ic_combos'); if (r) KNOWN_COMBOS = JSON.parse(r); } catch(e) {}
})();
function _saveComboCache() {
  try { localStorage.setItem('ic_combos', JSON.stringify(KNOWN_COMBOS)); } catch(e) {}
}
function _comboKey(aName, bName) { return [aName, bName].sort().join('|||'); }

// ── Bad-word sanitiser ─────────────────────────────────────────
const _BAD_RE = /\b(fuck|shit|cunt|nigger|nigga|faggot|fag|rape|porn|nude|naked|sex|bitch|bastard|asshole|dick|cock|pussy|slut|whore|retard|pedo|pedophile|terrorist|bomb|murder|suicide|self.?harm)\b/gi;
function sanitizeElementName(name) {
  return (name || '').replace(/[<>{}()\[\]\\]/g, '').replace(_BAD_RE, m => '★'.repeat(m.length)).trim() || 'Mysterious Element';
}

// ── Firebase Init ──────────────────────────────────────────────
let _db = null;
// ── Get DB reference (handles deferred init) ──────────────────
function _getDb() { return _db || window._db || null; }

function initializeFirebase() {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('YOUR_')) {
    console.info('ℹ️  Firebase not configured — global discoveries disabled. See FIREBASE_CONFIG above.');
    return;
  }
  try {
    const app = firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore(app);
    window._db = _db; // expose for auth.js
    console.log('🔥 Firebase connected — global discoveries active!');
    _subscribeGlobalFeed();
  } catch(e) { console.warn('Firebase init failed:', e.message); }
}

function _fbReady() { return !!(_db || window._db); }
function _encKey(str) { return str.replace(/[/\\.#$[\]\s]/g, '_').replace(/_+/g,'_').slice(0, 200); }

// Check cloud combo cache
async function _getCloudCombo(key) {
  if (!_db) return null;
  try {
    const snap = await _db.collection('combos').doc(_encKey(key)).get();
    if (snap.exists) { const d = snap.data(); return { emoji: d.emoji, name: d.name }; }
  } catch(e) {}
  return null;
}

// Write combo to cloud (only if not already there)
async function _setCloudCombo(key, result) {
  if (!_db) return;
  try {
    const ref = _db.collection('combos').doc(_encKey(key));
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ emoji: result.emoji, name: result.name, discoverer: PLAYER_NAME, at: firebase.firestore.FieldValue.serverTimestamp() });
    }
  } catch(e) {}
}

// Claim global first discovery (atomic — only first caller wins)
async function _claimGlobalFirst(name, emoji) {
  if (!_db) return { isGlobalFirst: false, discoverer: '' };
  try {
    const ref = _db.collection('global_firsts').doc(_encKey(name));
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ emoji, name, discoverer: PLAYER_NAME, at: firebase.firestore.FieldValue.serverTimestamp() });
      // Add to global feed
      try {
        await _db.collection('global_feed').add({ emoji, name, discoverer: PLAYER_NAME, at: firebase.firestore.FieldValue.serverTimestamp() });
      } catch(e) {}
      return { isGlobalFirst: true, discoverer: PLAYER_NAME };
    }
    return { isGlobalFirst: false, discoverer: snap.data().discoverer || '???' };
  } catch(e) { return { isGlobalFirst: false, discoverer: '' }; }
}

// ── Global Feed (live updates from Firestore) ──────────────────
var _globalFeedUnsub = null;
function _subscribeGlobalFeed() {
  if (!_db) return;
  try {
    _globalFeedUnsub = _db.collection('global_feed')
      .orderBy('at', 'desc').limit(1)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            if (d.discoverer !== PLAYER_NAME) { // don't show our own
              showTokenToast(`🌍 ${d.discoverer} discovered ${d.emoji} ${d.name} first!`);
            }
          }
        });
      }, () => {});
  } catch(e) {}
}

// ── Zoom sensitivity (lower = less sensitive) ──────────────────
const ZOOM_FACTOR = 1.07;   // original was 1.12; reduce for gentler zoom
const ZOOM_MIN    = 0.15;
const ZOOM_MAX    = 4;
// ──────────────────────────────────────────────────────────────
