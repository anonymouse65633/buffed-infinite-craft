// ═══════════════════════════════════════════════════════════════════════
//  AUTH.JS  —  Username + Password Authentication
//  Stores accounts in Firestore: accounts/{username} → { passwordHash }
//  Stores saves in:              saves/{username}    → { ...gameState }
//  Session persisted in localStorage: ic_auth_user
// ═══════════════════════════════════════════════════════════════════════

// ── Auth State ────────────────────────────────────────────────────────
var AUTH_USER = localStorage.getItem('ic_auth_user') || null;
var authSaveTimeout = null;

// ── Crypto: SHA-256 password hashing ─────────────────────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'ic_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
  btn.textContent = loading ? '⏳ Please wait…' : (authMode === 'login' ? '🔐 Log In' : '🚀 Create Account');
}

// ── Auth Mode (login / signup) ────────────────────────────────────────
var authMode = 'login';

function switchAuthMode(mode) {
  authMode = mode;
  const loginTab  = document.getElementById('auth-tab-login');
  const signupTab = document.getElementById('auth-tab-signup');
  const submitBtn = document.getElementById('auth-submit-btn');
  const confirmRow = document.getElementById('auth-confirm-row');
  if (loginTab)  loginTab.classList.toggle('active', mode === 'login');
  if (signupTab) signupTab.classList.toggle('active', mode === 'signup');
  if (submitBtn) submitBtn.textContent = mode === 'login' ? '🔐 Log In' : '🚀 Create Account';
  if (confirmRow) confirmRow.style.display = mode === 'signup' ? 'block' : 'none';
  setAuthStatus('');
}

// ── Log In ────────────────────────────────────────────────────────────
async function authLogin() {
  if (!_fbReady()) {
    setAuthStatus('⚠️ Firebase not ready. Check your config.js API keys.', 'error');
    return;
  }
  const username = (document.getElementById('auth-username').value || '').trim().toLowerCase();
  const password = document.getElementById('auth-password').value || '';

  if (username.length < 2) { setAuthStatus('Username must be at least 2 characters.', 'error'); return; }
  if (password.length < 4) { setAuthStatus('Password must be at least 4 characters.', 'error'); return; }

  setAuthLoading(true);
  setAuthStatus('');

  try {
    const hash = await hashPassword(password);
    const doc = await window._db.collection('accounts').doc(username).get();

    if (!doc.exists) {
      setAuthStatus('❌ Account not found. Did you mean to sign up?', 'error');
      setAuthLoading(false);
      return;
    }

    const data = doc.data();
    if (data.passwordHash !== hash) {
      setAuthStatus('❌ Incorrect password.', 'error');
      setAuthLoading(false);
      return;
    }

    // Success — load the game
    AUTH_USER = username;
    localStorage.setItem('ic_auth_user', username);
    PLAYER_NAME = data.displayName || username;
    localStorage.setItem('ic_player_name', PLAYER_NAME);

    setAuthStatus('✅ Logged in! Loading your game…', 'success');

    // Prompt browser to save password (Chrome/Edge Credential Management API)
    _offerPasswordSave(username, password);

    // Load cloud save if it exists
    await cloudLoadGame(username);

    hideAuthOverlay();
    initGame();
    updateAuthUI();
    showTokenToast('👋 Welcome back, ' + PLAYER_NAME + '!');

  } catch (e) {
    console.error('Login error:', e);
    setAuthStatus('⚠️ Error: ' + (e.message || 'Unknown error'), 'error');
    setAuthLoading(false);
  }
}

// ── Sign Up ───────────────────────────────────────────────────────────
async function authSignup() {
  if (!_fbReady()) {
    setAuthStatus('⚠️ Firebase not ready. Check your config.js API keys.', 'error');
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
    const hash = await hashPassword(password);

    // Check if username is taken
    const existing = await window._db.collection('accounts').doc(username).get();
    if (existing.exists) {
      setAuthStatus('❌ Username already taken. Choose another.', 'error');
      setAuthLoading(false);
      return;
    }

    // Create account
    await window._db.collection('accounts').doc(username).set({
      passwordHash: hash,
      displayName: username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Set session
    AUTH_USER = username;
    localStorage.setItem('ic_auth_user', username);
    PLAYER_NAME = username;
    localStorage.setItem('ic_player_name', PLAYER_NAME);

    setAuthStatus('✅ Account created! Starting fresh game…', 'success');

    // Prompt browser to save password
    _offerPasswordSave(username, password);

    // Clear any existing local save for clean start
    localStorage.removeItem('infinite_craft_save');

    hideAuthOverlay();
    initGame();
    updateAuthUI();
    showTokenToast('🎉 Welcome to Infinite Craft, ' + PLAYER_NAME + '!');

  } catch (e) {
    console.error('Signup error:', e);
    setAuthStatus('⚠️ Error: ' + (e.message || 'Unknown error'), 'error');
    setAuthLoading(false);
  }
}

// ── Submit handler (routes to login/signup) ───────────────────────────
function authSubmit() {
  if (authMode === 'login') authLogin();
  else authSignup();
}

// ── Handle Enter key in auth fields ──────────────────────────────────
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
  if (AUTH_USER) {
    // Always save to localStorage first (synchronous, can't fail)
    saveGame();
    showTokenToast('💾 Saving progress…');
    // Await cloud save so nothing is lost before reloading
    try {
      await cloudSaveGame(AUTH_USER);
      showTokenToast('✅ Progress saved! Logging out…');
    } catch(e) {
      console.warn('[Auth] Cloud save on logout failed:', e);
    }
  }
  AUTH_USER = null;
  localStorage.removeItem('ic_auth_user');
  localStorage.removeItem('ic_player_name');
  // Brief delay so the toast is visible before reload
  setTimeout(() => location.reload(), 700);
}

// ── Update auth UI (used in account tab) ─────────────────────────────
function updateAuthUI() {
  const nameEl = document.getElementById('auth-account-name');
  const loggedInSection = document.getElementById('auth-logged-in');
  const loggedOutSection = document.getElementById('auth-logged-out');

  if (nameEl) nameEl.textContent = AUTH_USER || 'Guest';
  if (loggedInSection) loggedInSection.style.display = AUTH_USER ? 'block' : 'none';
  if (loggedOutSection) loggedOutSection.style.display = AUTH_USER ? 'none' : 'block';
}

// ═══════════════════════════════════════════════════════════════════════
//  CLOUD SAVE / LOAD
// ═══════════════════════════════════════════════════════════════════════

async function cloudSaveGame(username) {
  if (!_fbReady() || !username) return;
  try {
    const saveData = buildSaveObject();
    await window._db.collection('saves').doc(username).set({
      ...saveData,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log('[Auth] Cloud save OK for', username);
  } catch (e) {
    console.warn('[Auth] Cloud save failed:', e);
  }
}

async function cloudLoadGame(username) {
  if (!_fbReady() || !username) return false;
  try {
    const doc = await window._db.collection('saves').doc(username).get();
    if (!doc.exists) {
      console.log('[Auth] No cloud save for', username);
      return false;
    }
    const data = doc.data();

    // If the beacon write stored a full JSON blob, prefer that (most complete)
    let saveData = data;
    if (data._fullSave) {
      try { saveData = JSON.parse(data._fullSave); } catch(e) {}
    }

    // Store in localStorage so loadGame() picks it up
    localStorage.setItem('infinite_craft_save', JSON.stringify(saveData));
    console.log('[Auth] Cloud save loaded for', username);
    return true;
  } catch (e) {
    console.warn('[Auth] Cloud load failed:', e);
    return false;
  }
}

// ── Debounced auto-save to cloud ─────────────────────────────────────
function scheduleCloudSave() {
  if (!AUTH_USER) return;
  clearTimeout(authSaveTimeout);
  authSaveTimeout = setTimeout(() => cloudSaveGame(AUTH_USER), 3000);
}

// ── Save on page close ────────────────────────────────────────────────
// Always save to localStorage synchronously (browsers allow this in beforeunload).
// Cloud save is attempted via fetch keepalive so it survives page close.
window.addEventListener('beforeunload', (e) => {
  if (!AUTH_USER) return;

  // 1. Synchronous localStorage save — guaranteed to complete
  saveGame();

  // 2. Cloud save via fetch keepalive — browser keeps the request alive after page closes
  if (_fbReady()) {
    try {
      const saveData = buildSaveObject();
      // Firestore REST API endpoint for a direct set (no SDK needed for keepalive)
      const projectId = (window._db && window._db.app && window._db.app.options.projectId) || '';
      if (projectId) {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/saves/${AUTH_USER}`;
        // Build a minimal Firestore REST payload
        const fields = {};
        fields['_savedAt'] = { stringValue: new Date().toISOString() };
        fields['tokens']   = { integerValue: String(saveData.tokens || 0) };
        fields['xp']       = { integerValue: String(saveData.xp || 0) };
        fields['level']    = { integerValue: String(saveData.level || 1) };
        fields['_beacon']  = { booleanValue: true };
        // Also keep the full JSON blob in one field for reliable restore
        fields['_fullSave'] = { stringValue: JSON.stringify(saveData) };
        fetch(url + '?currentDocument.exists=false', {
          method: 'PATCH',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        }).catch(() => {});
        // Also fire the normal async cloud save (may or may not complete)
        cloudSaveGame(AUTH_USER);
      }
    } catch(err) {
      // Never block the page from closing
    }
  }
});

// ── Prompt browser to save credentials (Chrome/Edge/Firefox) ─────────
function _offerPasswordSave(username, password) {
  if (!window.PasswordCredential) return; // not supported
  try {
    const cred = new PasswordCredential({
      id: username,
      password: password,
      name: username
    });
    navigator.credentials.store(cred);
  } catch(e) {
    // Silently ignore — not all browsers support this
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  INIT  —  Check if already logged in and start accordingly
// ═══════════════════════════════════════════════════════════════════════

async function authInit() {
  if (AUTH_USER && _fbReady()) {
    // Already logged in — verify account still exists and load save
    try {
      const doc = await window._db.collection('accounts').doc(AUTH_USER).get();
      if (doc.exists) {
        const data = doc.data();
        PLAYER_NAME = data.displayName || AUTH_USER;
        localStorage.setItem('ic_player_name', PLAYER_NAME);

        // Load cloud save
        await cloudLoadGame(AUTH_USER);
        initGame();
        updateAuthUI();
        return;
      }
    } catch (e) {
      console.warn('[Auth] Session restore failed:', e);
    }
  }

  // Not logged in — check if firebase is ready
  if (!_fbReady()) {
    // Firebase not configured — fall back to guest mode (no cloud save)
    console.warn('[Auth] Firebase not configured — running in guest mode');
    initGame();
    return;
  }

  // Show login screen
  showAuthOverlay();
  switchAuthMode('login');
}
