// ═══════════════════════════════════════════════════════════════════════
//  AUTH.JS  —  Firebase Authentication (email+password + Google)
//
//  Username/password:  synthetic email = username@ic.game
//  Google sign-in:     auto-detects existing account by uid;
//                      if none found, prompts user to pick a username.
//
//  Firestore layout:
//    accounts/{username}  →  { uid, displayName, createdAt }
//    saves/{uid}          →  { ...gameState, savedAt }
// ═══════════════════════════════════════════════════════════════════════

var AUTH_USER   = null;
var AUTH_UID    = null;
var authSaveTimeout = null;
var _pendingGoogleUser = null;

function _toEmail(u) { return u.toLowerCase().trim() + '@ic.game'; }
function _getAuth()  { return typeof firebase !== 'undefined' ? firebase.auth() : null; }

function _friendlyError(code) {
  const m = {
    'auth/user-not-found':         '❌ Account not found. Did you mean to sign up?',
    'auth/wrong-password':         '❌ Incorrect password.',
    'auth/invalid-credential':     '❌ Incorrect username or password.',
    'auth/email-already-in-use':   '❌ Username already taken. Choose another.',
    'auth/weak-password':          '❌ Password must be at least 6 characters.',
    'auth/invalid-email':          '❌ Invalid username format.',
    'auth/too-many-requests':      '⏳ Too many attempts. Please wait.',
    'auth/network-request-failed': '⚠️ Network error — check your connection.',
    'auth/popup-blocked':          '⚠️ Popup blocked — allow popups for this site.',
  };
  return m[code] || '⚠️ Error: ' + (code || 'unknown');
}

// ── Auth UI helpers ───────────────────────────────────────────────────
function showAuthOverlay() { document.getElementById('auth-overlay')?.classList.add('open'); }
function hideAuthOverlay() { document.getElementById('auth-overlay')?.classList.remove('open'); }

function setAuthStatus(msg, type='info') {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = msg; el.className = 'auth-status ' + type;
  el.style.display = msg ? 'block' : 'none';
}

function setAuthLoading(loading) {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ Please wait…' : (authMode === 'login' ? '🔐 Log In' : '🚀 Create Account');
}

var authMode = 'login';
function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-login')?.classList.toggle('active', mode==='login');
  document.getElementById('auth-tab-signup')?.classList.toggle('active', mode==='signup');
  const btn = document.getElementById('auth-submit-btn');
  if (btn) btn.textContent = mode==='login' ? '🔐 Log In' : '🚀 Create Account';
  const cr = document.getElementById('auth-confirm-row');
  if (cr) cr.style.display = mode==='signup' ? 'block' : 'none';
  setAuthStatus('');
}

// ── Log In ────────────────────────────────────────────────────────────
async function authLogin() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) { setAuthStatus('⚠️ Firebase not ready.','error'); return; }

  const username = (document.getElementById('auth-username').value||'').trim().toLowerCase();
  const password = document.getElementById('auth-password').value||'';
  if (username.length<2) { setAuthStatus('Username must be at least 2 characters.','error'); return; }
  if (password.length<4) { setAuthStatus('Password must be at least 4 characters.','error'); return; }

  setAuthLoading(true); setAuthStatus('');
  try {
    const cred = await auth.signInWithEmailAndPassword(_toEmail(username), password);
    await _onAuthSuccess(cred.user, username, false);
  } catch(e) {
    console.error('[Auth] Login error:', e);
    setAuthStatus(_friendlyError(e.code), 'error');
    setAuthLoading(false);
  }
}

// ── Sign Up ───────────────────────────────────────────────────────────
async function authSignup() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) { setAuthStatus('⚠️ Firebase not ready.','error'); return; }

  const username = (document.getElementById('auth-username').value||'').trim().toLowerCase();
  const password = document.getElementById('auth-password').value||'';
  const confirm  = document.getElementById('auth-confirm').value||'';
  if (username.length<2) { setAuthStatus('Username must be at least 2 characters.','error'); return; }
  if (!/^[a-z0-9_-]+$/.test(username)) { setAuthStatus('Username: letters, numbers, _ and - only.','error'); return; }
  if (password.length<4) { setAuthStatus('Password must be at least 4 characters.','error'); return; }
  if (password!==confirm) { setAuthStatus('Passwords do not match.','error'); return; }

  setAuthLoading(true); setAuthStatus('');
  try {
    const existing = await window._db.collection('accounts').doc(username).get();
    if (existing.exists) { setAuthStatus('❌ Username already taken.','error'); setAuthLoading(false); return; }

    const cred = await auth.createUserWithEmailAndPassword(_toEmail(username), password);
    await window._db.collection('accounts').doc(username).set({
      uid: cred.user.uid, displayName: username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _onAuthSuccess(cred.user, username, true);
  } catch(e) {
    console.error('[Auth] Signup error:', e);
    setAuthStatus(_friendlyError(e.code), 'error');
    setAuthLoading(false);
  }
}

function authSubmit()    { authMode==='login' ? authLogin() : authSignup(); }
function authKeydown(e)  { if (e.key==='Enter') authSubmit(); }

// ═══════════════════════════════════════════════════════════════════════
//  GOOGLE SIGN-IN
// ═══════════════════════════════════════════════════════════════════════

async function authGoogleSignIn() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) { setAuthStatus('⚠️ Firebase not ready.','error'); return; }

  const gBtn = document.getElementById('auth-google-btn');
  if (gBtn) { gBtn.disabled=true; gBtn.style.opacity='0.6'; }
  setAuthStatus('');

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result   = await auth.signInWithPopup(provider);
    const user     = result.user;

    // Check if this Google uid already has an Infinite Craft account
    const snap = await window._db.collection('accounts').where('uid','==',user.uid).limit(1).get();

    if (!snap.empty) {
      // Existing account — log in
      await _onAuthSuccess(user, snap.docs[0].id, false);
    } else {
      // New Google user — ask for a username
      _showGoogleSetup(user);
    }
  } catch(e) {
    if (e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request') {
      // user closed popup — do nothing
    } else {
      console.error('[Auth] Google error:', e);
      setAuthStatus(_friendlyError(e.code), 'error');
    }
  } finally {
    if (gBtn) { gBtn.disabled=false; gBtn.style.opacity=''; }
  }
}

function _showGoogleSetup(googleUser) {
  _pendingGoogleUser = googleUser;
  document.getElementById('auth-step-main').style.display  = 'none';
  document.getElementById('auth-step-google').style.display = 'block';

  const suggested = (googleUser.displayName||googleUser.email||'')
    .split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,24);

  const note = document.getElementById('auth-google-email-note');
  if (note) note.textContent = 'Signed in as ' + (googleUser.email||'');

  const inp = document.getElementById('auth-google-username');
  if (inp) { inp.value=suggested; inp.focus(); inp.select(); }

  const st = document.getElementById('auth-google-status');
  if (st) { st.textContent=''; st.style.display='none'; }
}

function authGoogleUsernameKeydown(e) { if (e.key==='Enter') authGoogleCreateAccount(); }

async function authGoogleCreateAccount() {
  if (!_pendingGoogleUser) return;

  const username = (document.getElementById('auth-google-username').value||'').trim().toLowerCase();
  const statusEl = document.getElementById('auth-google-status');

  function gStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent=msg; statusEl.className='auth-status '+(type||'info');
    statusEl.style.display=msg?'block':'none';
  }

  if (username.length<2)            { gStatus('Username must be at least 2 characters.','error'); return; }
  if (!/^[a-z0-9_-]+$/.test(username)) { gStatus('Username: letters, numbers, _ and - only.','error'); return; }

  const btn = document.getElementById('auth-google-create-btn');
  if (btn) { btn.disabled=true; btn.textContent='⏳ Creating…'; }
  gStatus('');

  try {
    const existing = await window._db.collection('accounts').doc(username).get();
    if (existing.exists) {
      gStatus('❌ Username already taken. Try another.','error');
      if (btn) { btn.disabled=false; btn.textContent='🚀 Create Account'; }
      return;
    }

    await window._db.collection('accounts').doc(username).set({
      uid: _pendingGoogleUser.uid, displayName: username,
      googleEmail: _pendingGoogleUser.email||'',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await _onAuthSuccess(_pendingGoogleUser, username, true);
    _pendingGoogleUser = null;
  } catch(e) {
    console.error('[Auth] Google create error:', e);
    gStatus(_friendlyError(e.code), 'error');
    if (btn) { btn.disabled=false; btn.textContent='🚀 Create Account'; }
  }
}

function authGoogleCancel() {
  _pendingGoogleUser = null;
  const auth = _getAuth();
  if (auth) auth.signOut().catch(()=>{});
  document.getElementById('auth-step-google').style.display = 'none';
  document.getElementById('auth-step-main').style.display   = 'block';
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
    setAuthStatus('✅ Account created! Starting fresh game…','success');
    localStorage.removeItem('infinite_craft_save');
  } else {
    setAuthStatus('✅ Logged in! Loading your game…','success');
    await cloudLoadGame(AUTH_UID);
  }

  hideAuthOverlay();
  initGame();
  updateAuthUI();

  // Auto-enrol in leaderboard — no manual join needed
  lbSignedUp = true;
  localStorage.setItem('ic_lb_signed_up', '1');
  setTimeout(function() {
    if (typeof pushLeaderboardStats === 'function') pushLeaderboardStats();
    if (typeof updateRankHUD === 'function') updateRankHUD();
  }, 2500);

  showTokenToast(isNew ? '🎉 Welcome to Infinite Craft, '+PLAYER_NAME+'!'
                       : '👋 Welcome back, '+PLAYER_NAME+'!');
}

function toggleAuthPw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const show = inp.type==='password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.style.opacity = show ? '1' : '0.5';
}

// ── Log Out ───────────────────────────────────────────────────────────
async function authLogout() {
  if (AUTH_USER && AUTH_UID) {
    saveGame();
    showTokenToast('💾 Saving progress…');
    try { await cloudSaveGame(AUTH_UID); showTokenToast('✅ Saved! Logging out…'); }
    catch(e) { console.warn('[Auth] Save on logout failed:', e); }
  }
  try { const auth=_getAuth(); if(auth) await auth.signOut(); } catch(e){}
  AUTH_USER=null; AUTH_UID=null;
  localStorage.removeItem('ic_auth_user');
  localStorage.removeItem('ic_auth_uid');
  localStorage.removeItem('ic_player_name');
  setTimeout(()=>location.reload(), 700);
}

function updateAuthUI() {
  const nameEl  = document.getElementById('auth-account-name');
  const logIn   = document.getElementById('auth-logged-in');
  const logOut  = document.getElementById('auth-logged-out');
  if (nameEl) nameEl.textContent       = AUTH_USER||'Guest';
  if (logIn)  logIn.style.display      = AUTH_USER ? 'block':'none';
  if (logOut) logOut.style.display     = AUTH_USER ? 'none':'block';
}

// ═══════════════════════════════════════════════════════════════════════
//  CLOUD SAVE / LOAD
// ═══════════════════════════════════════════════════════════════════════

async function cloudSaveGame(uid) {
  if (!_fbReady()||!uid) return;
  try {
    const d = buildSaveObject();
    await window._db.collection('saves').doc(uid).set({...d, savedAt:firebase.firestore.FieldValue.serverTimestamp()});
  } catch(e) { console.warn('[Auth] Cloud save failed:',e); }
}

async function cloudLoadGame(uid) {
  if (!_fbReady()||!uid) return false;
  try {
    const doc = await window._db.collection('saves').doc(uid).get();
    if (!doc.exists) return false;
    let d = doc.data();
    if (d._fullSave) { try { d=JSON.parse(d._fullSave); } catch(e){} }
    localStorage.setItem('infinite_craft_save', JSON.stringify(d));
    return true;
  } catch(e) { console.warn('[Auth] Cloud load failed:',e); return false; }
}

function scheduleCloudSave() {
  if (!AUTH_UID) return;
  clearTimeout(authSaveTimeout);
  authSaveTimeout = setTimeout(()=>cloudSaveGame(AUTH_UID), 3000);
}

window.addEventListener('beforeunload', ()=>{
  if (!AUTH_UID) return;
  saveGame();
  if (_fbReady()) {
    try {
      const d=buildSaveObject(), pid=(window._db?.app?.options?.projectId)||'';
      if (pid) {
        const f={};
        f['_savedAt']={stringValue:new Date().toISOString()};
        f['tokens']={integerValue:String(d.tokens||0)};
        f['xp']={integerValue:String(d.xp||0)};
        f['level']={integerValue:String(d.level||1)};
        f['_beacon']={booleanValue:true};
        f['_fullSave']={stringValue:JSON.stringify(d)};
        fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/saves/${AUTH_UID}`,
          {method:'PATCH',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:f})}).catch(()=>{});
        cloudSaveGame(AUTH_UID);
      }
    } catch(e){}
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════

async function authInit() {
  const auth = _getAuth();
  if (!auth || !_fbReady()) {
    console.warn('[Auth] Firebase not configured — guest mode');
    initGame();
    return;
  }

  auth.onAuthStateChanged(async (firebaseUser) => {
    if (_pendingGoogleUser) return; // mid Google setup

    if (firebaseUser) {
      let storedUser = localStorage.getItem('ic_auth_user');
      if (!storedUser) {
        try {
          const snap = await window._db.collection('accounts').where('uid','==',firebaseUser.uid).limit(1).get();
          if (!snap.empty) storedUser = snap.docs[0].id;
        } catch(e){}
      }
      AUTH_UID  = firebaseUser.uid;
      AUTH_USER = storedUser || firebaseUser.email?.replace('@ic.game','') || firebaseUser.uid;
      localStorage.setItem('ic_auth_uid',  AUTH_UID);
      localStorage.setItem('ic_auth_user', AUTH_USER);
      PLAYER_NAME = AUTH_USER;
      localStorage.setItem('ic_player_name', PLAYER_NAME);
      await cloudLoadGame(AUTH_UID);
      initGame();
      updateAuthUI();
    } else {
      AUTH_USER=null; AUTH_UID=null;
      showAuthOverlay();
      switchAuthMode('login');
    }
  });
}
