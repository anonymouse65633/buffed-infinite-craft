// ═══════════════════════════════════════════════════════════════════════
//  AUTH.JS  —  Firebase Authentication (email+password under the hood)
//
//  Users still type a plain username + password.
//  Internally we use  username@ic.game  as the Firebase Auth email so
//  Firestore security rules can safely use  request.auth.uid.
//
//  Firestore layout:
//    accounts/{username}  →  { uid, displayName, createdAt }
//    saves/{uid}          →  { ...gameState, savedAt }
//    (uid = Firebase Auth UID — never the username)
// ═══════════════════════════════════════════════════════════════════════

// ── Auth State ────────────────────────────────────────────────────────
var AUTH_USER   = null;   // display username (string)
var AUTH_UID    = null;   // Firebase Auth UID
var authSaveTimeout = null;

// ── Synthetic e-mail helper ───────────────────────────────────────────
function _toEmail(username) {
  return username.toLowerCase().trim() + '@ic.game';
}

// ── Auth UI helpers ───────────────────────────────────────────────────
function showAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('open');
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.remove('open');
}

function setAuthStatus(msg, type = 'info') {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auth-status ' + type;
  el.style.display = msg ? 'block' : 'none';
}

function setAuthLoading(loading) {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ Please wait…'
                            : (authMode === 'login' ? '🔐 Log In' : '🚀 Create Account');
}

// ── Auth Mode (login / signup) ────────────────────────────────────────
var authMode = 'login';

function switchAuthMode(mode) {
  authMode = mode;
  const loginTab   = document.getElementById('auth-tab-login');
  const signupTab  = document.getElementById('auth-tab-signup');
  const submitBtn  = document.getElementById('auth-submit-btn');
  const confirmRow = document.getElementById('auth-confirm-row');
  if (loginTab)    loginTab.classList.toggle('active', mode === 'login');
  if (signupTab)   signupTab.classList.toggle('active', mode === 'signup');
  if (submitBtn)   submitBtn.textContent = mode === 'login' ? '🔐 Log In' : '🚀 Create Account';
  if (confirmRow)  confirmRow.style.display = mode === 'signup' ? 'block' : 'none';
  setAuthStatus('');
}

// ── Firebase Auth helper ──────────────────────────────────────────────
function _getAuth() {
  return typeof firebase !== 'undefined' ? firebase.auth() : null;
}

// ── Friendly error messages ───────────────────────────────────────────
function _friendlyError(code) {
  const map = {
    'auth/user-not-found':        '❌ Account not found. Did you mean to sign up?',
    'auth/wrong-password':        '❌ Incorrect password.',
    'auth/email-already-in-use':  '❌ Username already taken. Choose another.',
    'auth/weak-password':         '❌ Password must be at least 6 characters.',
    'auth/invalid-email':         '❌ Invalid username format.',
    'auth/too-many-requests':     '⏳ Too many attempts. Please wait a moment.',
    'auth/network-request-failed':'⚠️ Network error — check your connection.',
  };
  return map[code] || '⚠️ Error: ' + code;
}

// ── Log In ────────────────────────────────────────────────────────────
async function authLogin() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) {
    setAuthStatus('⚠️ Firebase not ready. Check your config.js keys.', 'error');
    return;
  }

  const username = (document.getElementById('auth-username').value || '').trim().toLowerCase();
  const password = document.getElementById('auth-password').value || '';

  if (username.length < 2) { setAuthStatus('Username must be at least 2 characters.', 'error'); return; }
  if (password.length < 4) { setAuthStatus('Password must be at least 4 characters.', 'error'); return; }

  setAuthLoading(true);
  setAuthStatus('');

  try {
    const cred = await auth.signInWithEmailAndPassword(_toEmail(username), password);
    await _onAuthSuccess(cred.user, username, false);
  } catch (e) {
    console.error('[Auth] Login error:', e);
    setAuthStatus(_friendlyError(e.code), 'error');
    setAuthLoading(false);
  }
}

// ── Sign Up ───────────────────────────────────────────────────────────
async function authSignup() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) {
    setAuthStatus('⚠️ Firebase not ready. Check your config.js keys.', 'error');
    return;
  }

  const username = (document.getElementById('auth-username').value || '').trim().toLowerCase();
  const password = document.getElementById('auth-password').value || '';
  const confirm  = document.getElementById('auth-confirm').value || '';

  if (username.length < 2) { setAuthStatus('Username must be at least 2 characters.', 'error'); return; }
  if (!/^[a-z0-9_-]+$/.test(username)) { setAuthStatus('Username can only contain letters, numbers, _ and -.', 'error'); return; }
  if (password.length < 4) { setAuthStatus('Password must be at least 4 characters.', 'error'); return; }
  if (password !== confirm) { setAuthStatus('Passwords do not match.', 'error'); return; }

  setAuthLoading(true);
  setAuthStatus('');

  try {
    // Check username not already taken
    const existing = await window._db.collection('accounts').doc(username).get();
    if (existing.exists) {
      setAuthStatus('❌ Username already taken. Choose another.', 'error');
      setAuthLoading(false);
      return;
    }

    // Create Firebase Auth user
    const cred = await auth.createUserWithEmailAndPassword(_toEmail(username), password);
    const uid  = cred.user.uid;

    // Store display name in Firestore (accounts collection is world-readable
    // but only writable by the owner — see security rules)
    await window._db.collection('accounts').doc(username).set({
      uid,
      displayName: username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await _onAuthSuccess(cred.user, username, true);
  } catch (e) {
    console.error('[Auth] Signup error:', e);
    setAuthStatus(_friendlyError(e.code), 'error');
    setAuthLoading(false);
  }
}

// ── Shared post-auth setup ────────────────────────────────────────────
async function _onAuthSuccess(firebaseUser, username, isNew) {
  AUTH_UID  = firebaseUser.uid;
  AUTH_USER = username;

  localStorage.setItem('ic_auth_user', username);
  localStorage.setItem('ic_auth_uid',  AUTH_UID);

  PLAYER_NAME = username;
  localStorage.setItem('ic_player_name', PLAYER_NAME);

  if (isNew) {
    setAuthStatus('✅ Account created! Starting fresh game…', 'success');
    localStorage.removeItem('infinite_craft_save');
  } else {
    setAuthStatus('✅ Logged in! Loading your game…', 'success');
    await cloudLoadGame(AUTH_UID);
  }

  hideAuthOverlay();
  initGame();
  updateAuthUI();
  showTokenToast(isNew ? '🎉 Welcome to Infinite Craft, ' + PLAYER_NAME + '!'
                       : '👋 Welcome back, ' + PLAYER_NAME + '!');
}

// ── Submit handler ────────────────────────────────────────────────────
function authSubmit() {
  if (authMode === 'login') authLogin();
  else authSignup();
}

function authKeydown(e) {
  if (e.key === 'Enter') authSubmit();
}

// ── Toggle password visibility ────────────────────────────────────────
function toggleAuthPw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.style.opacity = show ? '1' : '0.5';
}

// ── Log Out ───────────────────────────────────────────────────────────
async function authLogout() {
  if (AUTH_USER && AUTH_UID) {
    saveGame();
    showTokenToast('💾 Saving progress…');
    try {
      await cloudSaveGame(AUTH_UID);
      showTokenToast('✅ Progress saved! Logging out…');
    } catch (e) {
      console.warn('[Auth] Cloud save on logout failed:', e);
    }
  }

  try {
    const auth = _getAuth();
    if (auth) await auth.signOut();
  } catch (e) {}

  AUTH_USER = null;
  AUTH_UID  = null;
  localStorage.removeItem('ic_auth_user');
  localStorage.removeItem('ic_auth_uid');
  localStorage.removeItem('ic_player_name');
  setTimeout(() => location.reload(), 700);
}

// ── Update auth UI ────────────────────────────────────────────────────
function updateAuthUI() {
  const nameEl          = document.getElementById('auth-account-name');
  const loggedInSection = document.getElementById('auth-logged-in');
  const loggedOutSection= document.getElementById('auth-logged-out');

  if (nameEl)           nameEl.textContent = AUTH_USER || 'Guest';
  if (loggedInSection)  loggedInSection.style.display  = AUTH_USER ? 'block' : 'none';
  if (loggedOutSection) loggedOutSection.style.display = AUTH_USER ? 'none'  : 'block';
}

// ═══════════════════════════════════════════════════════════════════════
//  CLOUD SAVE / LOAD  (keyed on UID, not username)
// ═══════════════════════════════════════════════════════════════════════

async function cloudSaveGame(uid) {
  if (!_fbReady() || !uid) return;
  try {
    const saveData = buildSaveObject();
    await window._db.collection('saves').doc(uid).set({
      ...saveData,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('[Auth] Cloud save OK for uid', uid);
  } catch (e) {
    console.warn('[Auth] Cloud save failed:', e);
  }
}

async function cloudLoadGame(uid) {
  if (!_fbReady() || !uid) return false;
  try {
    const doc = await window._db.collection('saves').doc(uid).get();
    if (!doc.exists) {
      console.log('[Auth] No cloud save for uid', uid);
      return false;
    }
    let saveData = doc.data();
    if (saveData._fullSave) {
      try { saveData = JSON.parse(saveData._fullSave); } catch (e) {}
    }
    localStorage.setItem('infinite_craft_save', JSON.stringify(saveData));
    console.log('[Auth] Cloud save loaded for uid', uid);
    return true;
  } catch (e) {
    console.warn('[Auth] Cloud load failed:', e);
    return false;
  }
}

// ── Debounced auto-save ───────────────────────────────────────────────
function scheduleCloudSave() {
  if (!AUTH_UID) return;
  clearTimeout(authSaveTimeout);
  authSaveTimeout = setTimeout(() => cloudSaveGame(AUTH_UID), 3000);
}

// ── Save on page close ────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (!AUTH_UID) return;
  saveGame(); // synchronous localStorage write

  if (_fbReady()) {
    try {
      const saveData   = buildSaveObject();
      const projectId  = (window._db?.app?.options?.projectId) || '';
      if (projectId) {
        const url    = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/saves/${AUTH_UID}`;
        const fields = {};
        fields['_savedAt']  = { stringValue: new Date().toISOString() };
        fields['tokens']    = { integerValue: String(saveData.tokens  || 0) };
        fields['xp']        = { integerValue: String(saveData.xp      || 0) };
        fields['level']     = { integerValue: String(saveData.level   || 1) };
        fields['_beacon']   = { booleanValue: true };
        fields['_fullSave'] = { stringValue: JSON.stringify(saveData) };
        fetch(url, {
          method: 'PATCH',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        }).catch(() => {});
        cloudSaveGame(AUTH_UID);
      }
    } catch (e) {}
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  INIT  —  Firebase Auth state observer drives everything
// ═══════════════════════════════════════════════════════════════════════

async function authInit() {
  const auth = _getAuth();

  if (!auth || !_fbReady()) {
    // Firebase not configured — guest mode
    console.warn('[Auth] Firebase not configured — running in guest mode');
    initGame();
    return;
  }

  // Let Firebase Auth tell us whether a session exists
  auth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      // Restore username from localStorage (we stored it on last login)
      const storedUser = localStorage.getItem('ic_auth_user');
      AUTH_UID  = firebaseUser.uid;
      AUTH_USER = storedUser || firebaseUser.email?.replace('@ic.game', '') || firebaseUser.uid;

      localStorage.setItem('ic_auth_uid', AUTH_UID);
      PLAYER_NAME = AUTH_USER;
      localStorage.setItem('ic_player_name', PLAYER_NAME);

      await cloudLoadGame(AUTH_UID);
      initGame();
      updateAuthUI();
    } else {
      // No session — show login screen
      AUTH_USER = null;
      AUTH_UID  = null;
      showAuthOverlay();
      switchAuthMode('login');
    }
  });
}
