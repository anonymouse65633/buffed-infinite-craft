//  MAIN MENU (Account + Leaderboard)
// ═════════════════════════════════════════════════════════════════════════

// ── Badge Definitions ─────────────────────────────────────────────────────
const BADGE_DEFS = [
  // Milestone badges
  { id:'b_first_craft',  type:'milestone', icon:'⚗️',  name:'First Craft',       desc:'Performed first combination',    check:()=>totalCrafts>=1 },
  { id:'b_craft100',     type:'milestone', icon:'🔬',  name:'Experimenter',       desc:'1,000 total crafts',             check:()=>totalCrafts>=1000 },
  { id:'b_craft10k',     type:'milestone', icon:'🌌',  name:'Infinite Crafter',   desc:'10,000 total crafts',            check:()=>totalCrafts>=10000 },
  { id:'b_disc1',        type:'milestone', icon:'✨',  name:'First Discovery',    desc:'First global discovery',         check:()=>firstDiscs.length>=1 },
  { id:'b_disc25',       type:'milestone', icon:'🗺️', name:'Pioneer',            desc:'25 first discoveries',           check:()=>firstDiscs.length>=25 },
  { id:'b_disc100',      type:'milestone', icon:'📚',  name:'Archivist',          desc:'100 first discoveries',          check:()=>firstDiscs.length>=100 },
  { id:'b_disc500',      type:'milestone', icon:'📖',  name:'Grand Archivist',    desc:'500 first discoveries',          check:()=>firstDiscs.length>=500 },
  { id:'b_tokens1k',     type:'milestone', icon:'💰',  name:'Coin Hoarder',       desc:'Earned 1,000 tokens',            check:()=>totalTokensEarned>=1000 },
  { id:'b_tokens100k',   type:'milestone', icon:'🤑',  name:'Millionaire',        desc:'Earned 100,000 tokens',          check:()=>totalTokensEarned>=100000 },
  // Level badges
  { id:'b_lv25',         type:'level',     icon:'📈',  name:'Level 25',           desc:'Reached Level 25',               check:()=>level>=25 },
  { id:'b_lv50',         type:'level',     icon:'🏅',  name:'Level 50',           desc:'Reached Level 50',               check:()=>level>=50 },
  { id:'b_lv100',        type:'level',     icon:'🥇',  name:'Level 100',          desc:'Reached Level 100',              check:()=>level>=100 },
  { id:'b_lv250',        type:'level',     icon:'💎',  name:'Level 250',          desc:'Reached Level 250',              check:()=>level>=250 },
  { id:'b_lv500',        type:'level',     icon:'👑',  name:'Level 500',          desc:'Reached Level 500',              check:()=>level>=500 },
  { id:'b_lv1000',       type:'level',     icon:'🌟',  name:'Level 1000',         desc:'Reached Level 1000',             check:()=>level>=1000 },
  // Prestige badges
  { id:'b_p1',           type:'prestige',  icon:'⭐',  name:'Prestige I',         desc:'First prestige',                 check:()=>prestige>=1 },
  { id:'b_p3',           type:'prestige',  icon:'🌟',  name:'Prestige III',       desc:'Prestige 3 times',               check:()=>prestige>=3 },
  { id:'b_p5',           type:'prestige',  icon:'💫',  name:'Prestige V',         desc:'Prestige 5 times',               check:()=>prestige>=5 },
  { id:'b_p10',          type:'prestige',  icon:'👑',  name:'Prestige Master',    desc:'Reached max Prestige',           check:()=>prestige>=10 },
  // Special
  { id:'b_world_first',  type:'special',   icon:'🌍',  name:'World First',        desc:'Made a global first discovery',  check:()=>!!localStorage.getItem('ic_had_world_first') },
];

function computeEarnedBadges() {
  return BADGE_DEFS.filter(b => { try { return b.check(); } catch(e) { return false; } });
}

// ── Leaderboard State ─────────────────────────────────────────────────────
// lbSignedUp: true if user has an account (auto-joined) or manually opted in
function _isLbActive() {
  return !!(( typeof AUTH_UID !== 'undefined' && AUTH_UID ) || localStorage.getItem('ic_lb_signed_up'));
}
var lbSignedUp = _isLbActive();
var lbFeaturedBadge= localStorage.getItem('ic_lb_featured_badge') || null;
var lbCurrentCat   = 'crafts';
var lbUnsubscribe  = null;
var lbSessionStart = Date.now();
var lbTimePlayed   = parseInt(localStorage.getItem('ic_time_played') || '0');
var lbMyRank       = null;

// ── Profile fetch cache (60 s TTL to protect DB read quotas) ─────────────
var _profileCache  = {};   // uid → { data, rank, fetchedAt }
var _PROFILE_TTL   = 60000; // 60 seconds

const LB_CATEGORIES = {
  crafts:      { label:'⚗️ Crafts',      field:'totalCrafts',      format: n => n.toLocaleString()+' crafts'   },
  discoveries: { label:'✨ Discoveries', field:'firstDiscoveries', format: n => n.toLocaleString()+' firsts'   },
  tokens:      { label:'🪙 Tokens',      field:'totalTokensEarned',format: n => n.toLocaleString()+' tokens'   },
  timePlayed:  { label:'⏱️ Time',        field:'timePlayed',       format: n => _fmtTime(n)                    },
  prestige:    { label:'⭐ Prestige',    field:'prestige',         format: n => 'P'+n                          },
  level:       { label:'📈 Level',       field:'level',            format: n => 'Lv '+n                        },
};

function _fmtTime(secs) {
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  if (h > 0) return h+'h '+m+'m';
  return m+'m';
}

// ── Session time tracker ──────────────────────────────────────────────────
setInterval(function() {
  lbTimePlayed += 10;
  localStorage.setItem('ic_time_played', lbTimePlayed);
  if (lbSignedUp && _fbReady()) {
    _db.collection('leaderboard').doc(_getLbPlayerId()).update({
      timePlayed: lbTimePlayed,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(()=>{});
  }
}, 10000);

function _getLbPlayerId() {
  if (typeof AUTH_UID !== 'undefined' && AUTH_UID) return AUTH_UID;
  let id = localStorage.getItem('ic_lb_player_id');
  if (!id) { id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); localStorage.setItem('ic_lb_player_id', id); }
  return id;
}

// ── Push stats to leaderboard ─────────────────────────────────────────────
async function pushLeaderboardStats() {
  if (!lbSignedUp || !_fbReady()) return;
  // ── Anti-cheat gate ─────────────────────────────────────────────────
  if (window._AC_SUSPICIOUS || (typeof AC !== 'undefined' && AC.isSuspicious())) {
    console.warn('[AC] pushLeaderboardStats blocked: suspicious session');
    return;
  }
  // ── Sanity-check values before submitting ──────────────────────────
  const MAX_LB = { totalCrafts:5000000, firstDiscs:50000, totalTokensEarned:500000000, prestige:10, level:100000 };
  if (totalCrafts > MAX_LB.totalCrafts || firstDiscs.length > MAX_LB.firstDiscs ||
      totalTokensEarned > MAX_LB.totalTokensEarned || prestige > MAX_LB.prestige || level > MAX_LB.level) {
    console.warn('[AC] pushLeaderboardStats blocked: values out of range');
    window._AC_SUSPICIOUS = true;
    return;
  }
  const earned = computeEarnedBadges();
  const badges = earned.map(b => b.id);
  const feat   = lbFeaturedBadge && badges.includes(lbFeaturedBadge) ? lbFeaturedBadge : (badges[badges.length-1] || null);
  try {
    await _db.collection('leaderboard').doc(_getLbPlayerId()).set({
      name:             PLAYER_NAME,
      totalCrafts:      totalCrafts,
      firstDiscoveries: firstDiscs.length,
      totalTokensEarned:totalTokensEarned,
      timePlayed:       lbTimePlayed,
      prestige:         prestige,
      level:            level,
      badges:           badges,
      featuredBadge:    feat,
      lbPrivate:        typeof lbPrivate !== 'undefined' ? lbPrivate : false,
      lbTextColor:      typeof lbTextColor !== 'undefined' ? lbTextColor : 'default',
      lastSeen:         firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch(e) { console.warn('pushLeaderboardStats failed:', e); }
}

// ── Sign up ────────────────────────────────────────────────────────────────
async function signUpForLeaderboard(nameOverride) {
  const inputEl = document.getElementById('lb-signup-name-input');
  const name = nameOverride || (inputEl ? inputEl.value.trim() : PLAYER_NAME);
  if (!name || name.length < 2) { showErr('Enter a display name (2+ chars)'); return; }
  // Save name
  PLAYER_NAME = name;
  localStorage.setItem('ic_player_name', name);
  localStorage.setItem('ic_lb_signed_up', '1');
  lbSignedUp = true;
  // Push initial entry
  await pushLeaderboardStats();
  showTokenToast('🎉 Joined leaderboard as '+name+'!');
  renderAccountTab();
  // Now subscribe to leaderboard
  switchLBCat(lbCurrentCat);
  updateRankHUD();
}

// ── Rank HUD ───────────────────────────────────────────────────────────────
function updateRankHUD() {
  const hud = document.getElementById('rank-hud');
  const badge = document.getElementById('rank-badge-el');
  const gbadge = document.getElementById('global-badge');
  const levelHud = document.getElementById('level-hud');
  if (!lbSignedUp || lbMyRank === null) {
    if (hud) hud.style.display = 'none';
    if (gbadge) gbadge.style.top = '8px';
    if (levelHud) levelHud.style.top = '40px';
    return;
  }
  if (hud) hud.style.display = '';
  // rank badge ~28px tall + 8px top = 36px → push username down
  if (gbadge) gbadge.style.top = '38px';
  if (levelHud) levelHud.style.top = '68px';
  const r = lbMyRank;
  let cls = 'rank-badge';
  if (r <= 3)  cls += ' rank-top3';
  else if (r <= 10) cls += ' rank-top10';
  else if (r <= 25) cls += ' rank-top25';
  const medal = r===1?'🥇':r===2?'🥈':r===3?'🥉':'🏆';
  if (badge) { badge.className = cls; badge.textContent = medal+' #'+r; }
}

// ── Main Menu Toggle ─────────────────────────────────────────────────────
var mainMenuTab = 'account';
function toggleMainMenu() {
  const panel = document.getElementById('main-menu-panel');
  const btn   = document.getElementById('main-menu-btn');
  const isOpen = panel.classList.contains('open');
  // Close shop panel if open
  document.getElementById('menu-panel').style.display = 'none';
  document.getElementById('menu-btn').classList.remove('open');
  if (!isOpen) {
    panel.classList.add('open');
    btn.classList.add('open');
    switchMainMenu(mainMenuTab);
  } else {
    panel.classList.remove('open');
    btn.classList.remove('open');
  }
}

function closeMainMenu() {
  document.getElementById('main-menu-panel').classList.remove('open');
  document.getElementById('main-menu-btn').classList.remove('open');
}

function switchMainMenu(tab) {
  mainMenuTab = tab;
  ['account','leaderboard'].forEach(function(t) {
    var v = document.getElementById('mm-view-'+t);
    if (v) v.style.display = t===tab ? '' : 'none';
    var b = document.getElementById('mmtab-'+t);
    if (b) b.classList.toggle('active', t===tab);
  });
  if (tab === 'account')     renderAccountTab();
  if (tab === 'leaderboard') switchLBCat(lbCurrentCat);
}

// ── Render Account Tab ────────────────────────────────────────────────────
function renderAccountTab() {
  const profileSection = document.getElementById('acct-profile-section');
  if (!profileSection) return;

  // Show auth account info (logged-in user) at top
  const authSection = document.getElementById('acct-auth-section');
  if (authSection) {
    if (typeof AUTH_USER !== 'undefined' && AUTH_USER) {
      authSection.innerHTML = `
        <div class="acct-section-title">🔐 Account</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font-size:1.5rem">${activePic}</div>
          <div>
            <div style="font-weight:600;font-size:1rem">${AUTH_USER}</div>
            <div style="font-size:0.75rem;opacity:0.5">Logged in · Progress saves automatically</div>
          </div>
        </div>
        <button class="acct-btn secondary" style="font-size:12px;margin-bottom:4px" onclick="cloudSaveGame(AUTH_UID).then(()=>showTokenToast('☁️ Saved to cloud!'))">☁️ Save to Cloud</button>
        <button class="auth-logout-btn" onclick="authLogout()">🚪 Log Out</button>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:14px 0">`;
    } else {
      authSection.innerHTML = `
        <div class="acct-section-title">🔐 Account</div>
        <div style="font-size:0.85rem;opacity:0.6;margin-bottom:8px">Not logged in — progress won't be saved to the cloud.</div>
        <button class="acct-btn primary" style="font-size:13px;margin-bottom:12px" onclick="toggleMainMenu();showAuthOverlay()">🔐 Log In / Sign Up</button>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:14px 0">`;
    }
  }

  // Refresh lbSignedUp in case auth changed
  lbSignedUp = _isLbActive();

  if (typeof AUTH_USER !== 'undefined' && AUTH_USER) {
    // Ensure they're auto-enrolled
    if (!lbSignedUp) {
      lbSignedUp = true;
      localStorage.setItem('ic_lb_signed_up', '1');
    }
  }

  {
    const profileEarned = computeEarnedBadges();
    const rankTxt = lbMyRank !== null ? '#'+lbMyRank : '…';
    profileSection.innerHTML = `
      <div class="acct-section-title">👤 Profile</div>
      <div class="acct-profile-row">
        <div class="acct-avatar">${activePic}</div>
        <div class="acct-info">
          <div class="acct-name">${PLAYER_NAME}</div>
          <div class="acct-meta">Level ${level} · P${prestige} · ${profileEarned.length} badges</div>
        </div>
        <div class="acct-rank-pill">${lbMyRank !== null ? '#'+lbMyRank : '…'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;opacity:0.6;margin-top:4px">
        <span>⚗️ ${totalCrafts.toLocaleString()} crafts</span>
        <span>✨ ${firstDiscs.length} discoveries</span>
        <span>🪙 ${totalTokensEarned.toLocaleString()} tokens</span>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="acct-btn secondary" style="font-size:12px" onclick="pushLeaderboardStats().then(()=>showTokenToast('Stats synced!'))">🔄 Sync Stats</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none">
          <input type="checkbox" ${lbPrivate?'checked':''} onchange="toggleLbPrivate(this.checked)" style="cursor:pointer">
          🔒 Private profile
        </label>
      </div>`;
  }

  // Text colour swatches (only unlocked themes shown)
  const colorSection = document.getElementById('acct-lb-colors');
  if (colorSection) {
    const unlocked = TEXT_THEMES.filter(t =>
      unlockedTextThemes.has(t.id) || t.reqLevel <= level && t.reqPrestige <= prestige
    );
    colorSection.innerHTML = `
      <div class="acct-section-title" style="margin-top:12px">🎨 Leaderboard Name Colour</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
        ${unlocked.map(t => `
          <span title="${t.name}" onclick="setLbTextColor('${t.id}')"
            style="width:22px;height:22px;border-radius:50%;cursor:pointer;
                   background:${t.swatch==='rainbow'?'linear-gradient(135deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)':t.swatch};
                   border:2px solid ${lbTextColor===t.id?'#fff':'transparent'};
                   box-shadow:${lbTextColor===t.id?'0 0 0 1px var(--accent)':'none'};
                   transition:all .15s" class="lb-swatch"></span>
        `).join('')}
      </div>`;
  } else {
    // Inject the section if not yet in DOM
    const profileEl = document.getElementById('acct-profile-section');
    if (profileEl) {
      const div = document.createElement('div');
      div.id = 'acct-lb-colors';
      profileEl.parentNode.insertBefore(div, profileEl.nextSibling);
      // recurse once
      renderAccountTab();
      return;
    }
  }

  // Render badges (keep existing logic below intact)
  const earned = computeEarnedBadges();
  const featEl = document.getElementById('acct-featured-badge');
  const gridEl = document.getElementById('acct-badges-grid');
  if (featEl) {
    const feat = lbFeaturedBadge ? BADGE_DEFS.find(b=>b.id===lbFeaturedBadge) : null;
    if (feat && earned.find(b=>b.id===feat.id)) {
      featEl.innerHTML = `<span class="badge-pill badge-featured" title="${feat.desc}">${feat.icon} ${feat.name}</span>`;
    } else {
      featEl.innerHTML = `<span class="badge-empty">No featured badge — click a badge to feature it</span>`;
    }
  }
  if (gridEl) {
    if (earned.length === 0) {
      gridEl.innerHTML = `<span class="badge-empty">Keep crafting to earn badges!</span>`;
    } else {
      gridEl.innerHTML = earned.map(b => `
        <span class="badge-pill badge-${b.type}" title="${b.desc}" onclick="setFeaturedBadge('${b.id}')" style="cursor:pointer">
          ${b.icon} ${b.name}
        </span>`).join('');
    }
  }
}

function setFeaturedBadge(id) {
  lbFeaturedBadge = id;
  localStorage.setItem('ic_lb_featured_badge', id);
  renderAccountTab();
  pushLeaderboardStats();
  showTokenToast('⭐ Featured badge updated!');
}

// ── Leaderboard Rendering ─────────────────────────────────────────────────
var _lbUnsubscribe = null;

function switchLBCat(cat) {
  lbCurrentCat = cat;
  // Update tab buttons
  document.querySelectorAll('.lb-cat-btn').forEach(function(btn) {
    const catKey = btn.getAttribute('onclick').match(/'([^']+)'/)?.[1];
    btn.classList.toggle('active', catKey === cat);
  });
  renderLeaderboard(cat);
}

async function renderLeaderboard(cat) {
  if (!_fbReady()) {
    document.getElementById('lb-rows-container').innerHTML = `<div class="lb-no-data">⚠️ Firebase not connected. Check console.</div>`;
    return;
  }

  const container = document.getElementById('lb-rows-container');
  container.innerHTML = `<div class="lb-loading">⏳ Loading…</div>`;

  const catInfo = LB_CATEGORIES[cat];
  if (!catInfo) return;

  // Unsubscribe previous listener
  if (_lbUnsubscribe) { try { _lbUnsubscribe(); } catch(e){} _lbUnsubscribe = null; }

  try {
    _lbUnsubscribe = _db.collection('leaderboard')
      .orderBy(catInfo.field, 'desc')
      .limit(50)
      .onSnapshot(function(snap) {
        const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        _renderLBRows(docs, cat, catInfo);
      }, function(err) {
        container.innerHTML = `<div class="lb-no-data">⚠️ ${err.message}</div>`;
      });
  } catch(e) {
    container.innerHTML = `<div class="lb-no-data">⚠️ ${e.message}</div>`;
  }
}

function _renderLBRows(docs, cat, catInfo) {
  const container = document.getElementById('lb-rows-container');
  const myId = _getLbPlayerId();
  const myRankRow = document.getElementById('lb-my-rank-row');

  if (!docs || docs.length === 0) {
    container.innerHTML = `<div class="lb-no-data">No players yet — you could be first! 🏆</div>`;
    if (myRankRow) myRankRow.style.display = 'none';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  let myRank = null;
  let html = '';

  // Build podium for top 3
  if (docs.length >= 1) {
    const top = docs.slice(0, Math.min(3, docs.length));
    // podium order: 2nd, 1st, 3rd
    const podiumOrder = top.length === 1 ? [top[0]]
                      : top.length === 2 ? [top[1], top[0]]
                      : [top[1], top[0], top[2]];
    const podiumRanks = top.length === 1 ? [1]
                      : top.length === 2 ? [2, 1]
                      : [2, 1, 3];
    html += '<div class="lb-podium">';
    podiumOrder.forEach(function(doc, pi) {
      const rank = podiumRanks[pi];
      const isMe = doc.id === myId;
      if (isMe && myRank === null) myRank = rank;
      const score = doc[catInfo.field] ?? 0;
      const featBadge = doc.featuredBadge ? (BADGE_DEFS.find(b=>b.id===doc.featuredBadge)||null) : null;
      const nameColor = _lbNameStyle(doc.lbTextColor);
      html += `<div class="podium-slot podium-${rank}${isMe?' lb-me':''}" style="cursor:pointer" onclick="openPlayerProfile('${doc.id}','${(doc.name||'???').replace(/'/g,"\\'")}')">
        <div class="podium-name" title="${doc.name||'???' }" style="${nameColor}">${doc.name||'???'}</div>
        ${featBadge ? `<div class="podium-badge">${featBadge.icon}</div>` : ''}
        <div class="podium-medal">${medals[rank-1]}</div>
        <div class="podium-score">${catInfo.format(score)}</div>
        <div class="podium-bar"></div>
      </div>`;
    });
    html += '</div>';
  }

  // Remaining rows (rank 4+)
  docs.forEach(function(doc, i) {
    const rank = i + 1;
    if (rank <= 3) {
      if (doc.id === myId) myRank = rank;
      return; // already in podium
    }
    const isMe = doc.id === myId;
    if (isMe) myRank = rank;
    const score = doc[catInfo.field] ?? 0;
    const featBadge = doc.featuredBadge ? (BADGE_DEFS.find(b=>b.id===doc.featuredBadge)||null) : null;
    const badgeHtml = featBadge ? `<span title="${featBadge.desc}">${featBadge.icon}</span>` : '';
    const nameColor = _lbNameStyle(doc.lbTextColor);
    html += `<div class="lb-row${isMe?' lb-me':''}" style="cursor:pointer" onclick="openPlayerProfile('${doc.id}','${(doc.name||'???').replace(/'/g,"\\'")}')">
      <span class="lb-rank">${rank}</span>
      <span class="lb-name" style="${nameColor}">${doc.name||'???'}</span>
      <span class="lb-badge">${badgeHtml}</span>
      <span class="lb-score">${catInfo.format(score)}</span>
    </div>`;
  });

  container.innerHTML = html;

  // Update my rank
  lbMyRank = myRank;
  updateRankHUD();

  if (myRankRow) {
    if (myRank !== null) {
      myRankRow.style.display = 'flex';
      const rankTxt = document.getElementById('lb-my-rank-text');
      if (rankTxt) rankTxt.textContent = 'Your rank: #'+myRank+' in '+catInfo.label;
    } else {
      myRankRow.style.display = 'none';
    }
  }
}

// Push stats whenever meaningful events happen
var _lbPushTimeout = null;
function _scheduleLBPush() {
  if (!lbSignedUp) return;
  if (_lbPushTimeout) clearTimeout(_lbPushTimeout);
  _lbPushTimeout = setTimeout(pushLeaderboardStats, 5000);
}

// Hook into existing game events — schedule LB push after any craft
// (We use a post-combine hook via autoSave override instead of reassigning gainXP)
var _origAutoSave = autoSave;
autoSave = function() {
  _origAutoSave();
  _scheduleLBPush();
};

// Close main menu when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.getElementById('main-menu-panel');
  const btn   = document.getElementById('main-menu-btn');
  if (!panel || !btn) return;
  if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('open');
    btn.classList.remove('open');
  }
}, true);

// ── Init leaderboard on startup ───────────────────────────────────────────
(function _initLeaderboard() {
  if (lbSignedUp) {
    // Push initial stats after game loads
    setTimeout(function() {
      pushLeaderboardStats();
      updateRankHUD();
    }, 3000);
  }
})();

// Flag world-first in localStorage so badge triggers
var _origClaimGlobalFirst = _claimGlobalFirst;
_claimGlobalFirst = async function(name, emoji) {
  const result = await _origClaimGlobalFirst(name, emoji);
  if (result && result.isGlobalFirst) {
    localStorage.setItem('ic_had_world_first', '1');
    _scheduleLBPush();
  }
  return result;
};

async function askGemini(a, b) {
  const cacheKey = _comboKey(a.name, b.name);

  // ── 1. Local in-memory / localStorage cache ───────────────────────────
  if (KNOWN_COMBOS[cacheKey]) return KNOWN_COMBOS[cacheKey];

  // ── 2. Cloud combo cache ───────────────────────────────────────────────
  const cloudHit = await _getCloudCombo(cacheKey);
  if (cloudHit) {
    KNOWN_COMBOS[cacheKey] = cloudHit;
    _saveComboCache();
    return cloudHit;
  }

  // ── 3. Sanitize inputs before sending to AI ────────────────────────────
  const safeA = sanitizeElementName(a.name);
  const safeB = sanitizeElementName(b.name);

  const prompt = `${a.emoji} ${safeA} + ${b.emoji} ${safeB} =`;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: prompt }
  ];

  const _isRefusal = (text) => {
    const l = text.toLowerCase();
    return l.includes("sorry") || l.includes("can't help") || l.includes("cannot help") ||
           l.includes("i cannot") || l.includes("i'm unable") || l.includes("inappropriate") ||
           l.includes("as an ai") || l.includes("as a language") || l.length > 100;
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw  = await callLLM('craft', messages, 60, 1.1);
      const line = raw.trim().split('\n')[0].trim();

      // Detect refusals / bad output
      if (_isRefusal(line)) {
        // Return a safe creative fallback
        const result = { emoji: '✨', name: safeA + ' Fusion' };
        KNOWN_COMBOS[cacheKey] = result;
        _saveComboCache();
        return result;
      }

      const sp = line.search(/\s/);
      if (sp < 1) throw new Error('Unexpected response: ' + line);
      const emoji = line.slice(0, sp).trim();
      const name  = line.slice(sp + 1).trim().replace(/[.!?,;:]+$/, '');
      if (!emoji || !name) throw new Error('Empty result from API');

      // Double-check name isn't a refusal
      if (_isRefusal(name)) throw new Error('Refusal in name field');

      const result = { emoji, name };
      KNOWN_COMBOS[cacheKey] = result;
      _saveComboCache();

      // Save to cloud (fire-and-forget — don't await)
      _setCloudCombo(cacheKey, result);

      return result;
    } catch (e) {
      if (e.message && e.message.includes('No API keys')) throw e;
      if (attempt === 3) {
        // Final safe fallback
        const fallback = { emoji: '⚗️', name: safeA.split(' ')[0] + ' Essence' };
        KNOWN_COMBOS[cacheKey] = fallback;
        _saveComboCache();
        return fallback;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PLAYER PROFILE MODAL  —  click any leaderboard row to view a profile
// ═══════════════════════════════════════════════════════════════════════

// ── Name colour helper ─────────────────────────────────────────────────
function _lbNameStyle(colorId) {
  if (!colorId || colorId === 'default') return '';
  const theme = (typeof TEXT_THEMES !== 'undefined')
    ? TEXT_THEMES.find(t => t.id === colorId) : null;
  if (!theme) return '';
  if (theme.swatch === 'rainbow') {
    return 'background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f);' +
           '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
  }
  return `color:${theme.swatch};`;
}

// ── Privacy / colour helpers (called from account tab) ─────────────────
function toggleLbPrivate(val) {
  lbPrivate = !!val;
  localStorage.setItem('ic_lb_private', lbPrivate ? '1' : '0');
  pushLeaderboardStats();
  showTokenToast(lbPrivate ? '🔒 Profile hidden' : '🔓 Profile visible');
}

function setLbTextColor(colorId) {
  lbTextColor = colorId;
  localStorage.setItem('ic_lb_text_color', colorId);
  pushLeaderboardStats();
  renderAccountTab();
  showTokenToast('🎨 Leaderboard colour updated!');
}

// ── 60-second cached profile fetch ─────────────────────────────────────
async function _fetchPlayerProfile(uid) {
  const cached = _profileCache[uid];
  if (cached && (Date.now() - cached.fetchedAt) < _PROFILE_TTL) {
    return cached;
  }
  const db = window._db || _db || null;
  if (!db || !uid) return null;
  try {
    const [saveDoc, lbDoc, rankDoc] = await Promise.all([
      db.collection('saves').doc(uid).get().catch(() => null),
      db.collection('leaderboard').doc(uid).get().catch(() => null),
      db.collection('player_ranks').doc(uid).get().catch(() => null),
    ]);
    const result = {
      save:      saveDoc?.exists  ? saveDoc.data()  : null,
      lb:        lbDoc?.exists    ? lbDoc.data()    : null,
      rank:      rankDoc?.exists  ? rankDoc.data()  : null,
      fetchedAt: Date.now(),
    };
    _profileCache[uid] = result;
    return result;
  } catch(e) { return null; }
}

// ── Inject modal CSS once ───────────────────────────────────────────────
function _injectProfileModal() {
  if (document.getElementById('lb-profile-modal')) return;

  // CSS
  if (!document.getElementById('lb-profile-css')) {
    const s = document.createElement('style');
    s.id = 'lb-profile-css';
    s.textContent = `
#lb-profile-backdrop {
  position:fixed;inset:0;z-index:88888;background:rgba(0,0,0,.55);
  display:flex;align-items:center;justify-content:center;
  animation:lbFadeIn .15s ease;
}
@keyframes lbFadeIn { from{opacity:0} to{opacity:1} }
#lb-profile-card {
  background:var(--sb-bg,#1e2028);color:var(--text,#f0f0f0);
  border:1px solid var(--border,rgba(255,255,255,.1));
  border-radius:16px;padding:24px;width:min(380px,92vw);
  box-shadow:0 8px 40px rgba(0,0,0,.5);
  animation:lbSlideUp .2s ease;position:relative;
}
@keyframes lbSlideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
#lb-profile-close {
  position:absolute;top:14px;right:14px;background:none;border:none;
  font-size:18px;cursor:pointer;color:var(--text);opacity:.5;line-height:1;
}
#lb-profile-close:hover{opacity:1}
.lbp-avatar { font-size:36px;margin-bottom:6px; }
.lbp-name   { font-size:20px;font-weight:700;margin-bottom:2px; }
.lbp-rank-pill {
  display:inline-flex;align-items:center;gap:4px;
  border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;
  border:1px solid currentColor;margin-bottom:10px;
}
.lbp-private { opacity:.45;font-size:13px;text-align:center;padding:16px 0; }
.lbp-stat-grid {
  display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;
}
.lbp-stat { background:rgba(128,128,128,.08);border-radius:10px;padding:10px 12px; }
.lbp-stat-val { font-size:18px;font-weight:700; }
.lbp-stat-lbl { font-size:11px;opacity:.5;margin-top:2px; }
.lbp-badges { display:flex;flex-wrap:wrap;gap:6px;margin-top:8px; }
.lbp-badge-pill {
  background:rgba(128,128,128,.1);border-radius:20px;
  padding:3px 9px;font-size:12px;border:1px solid rgba(128,128,128,.2);
}
    `;
    document.head.appendChild(s);
  }

  // Modal DOM
  const backdrop = document.createElement('div');
  backdrop.id = 'lb-profile-backdrop';
  backdrop.onclick = function(e) { if (e.target === backdrop) closePlayerProfile(); };
  backdrop.innerHTML = `
<div id="lb-profile-card">
  <button id="lb-profile-close" onclick="closePlayerProfile()">✕</button>
  <div id="lb-profile-inner" style="text-align:center">
    <div style="opacity:.4;padding:20px">⏳ Loading…</div>
  </div>
</div>`;
  document.body.appendChild(backdrop);
}

// ── Open profile ────────────────────────────────────────────────────────
async function openPlayerProfile(uid, displayName) {
  _injectProfileModal();
  const inner = document.getElementById('lb-profile-inner');
  if (inner) inner.innerHTML = '<div style="opacity:.4;padding:20px">⏳ Loading…</div>';

  const profile = await _fetchPlayerProfile(uid);
  if (!inner) return;

  // Privacy check
  const lb = profile?.lb || {};
  if (lb.lbPrivate && uid !== _getLbPlayerId()) {
    inner.innerHTML = `
      <div class="lbp-avatar">🔒</div>
      <div class="lbp-name">${displayName}</div>
      <div class="lbp-private">This player has set their profile to private.</div>`;
    return;
  }

  const save  = profile?.save || {};
  const rank  = profile?.rank || null;
  const badges = (lb.badges || []);
  const badgeDefs = badges
    .map(id => BADGE_DEFS.find(b => b.id === id))
    .filter(Boolean)
    .slice(0, 12);

  const rankPill = rank
    ? `<div class="lbp-rank-pill" style="color:${rank.rankColor};border-color:${rank.rankColor};background:${rank.rankColor}22">
         ${rank.rankEmoji} ${rank.rankName}
       </div>`
    : '';

  const nameColor = _lbNameStyle(lb.lbTextColor);
  const timePlayed = lb.timePlayed || save.timePlayed || 0;
  const h = Math.floor(timePlayed / 3600);
  const m = Math.floor((timePlayed % 3600) / 60);
  const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

  const featBadge = lb.featuredBadge
    ? BADGE_DEFS.find(b => b.id === lb.featuredBadge) : null;

  inner.innerHTML = `
    <div class="lbp-avatar">${save.activePic || lb.activePic || '⚗️'}</div>
    <div class="lbp-name" style="${nameColor}">${displayName}</div>
    ${featBadge ? `<div style="font-size:22px;margin-bottom:4px" title="${featBadge.desc}">${featBadge.icon} ${featBadge.name}</div>` : ''}
    ${rankPill}
    <div class="lbp-stat-grid">
      <div class="lbp-stat">
        <div class="lbp-stat-val">${(lb.totalCrafts||0).toLocaleString()}</div>
        <div class="lbp-stat-lbl">⚗️ Crafts</div>
      </div>
      <div class="lbp-stat">
        <div class="lbp-stat-val">${(lb.firstDiscoveries||0).toLocaleString()}</div>
        <div class="lbp-stat-lbl">✨ Discoveries</div>
      </div>
      <div class="lbp-stat">
        <div class="lbp-stat-val">Lv ${lb.level||1}</div>
        <div class="lbp-stat-lbl">📈 Level · P${lb.prestige||0}</div>
      </div>
      <div class="lbp-stat">
        <div class="lbp-stat-val">${timeStr}</div>
        <div class="lbp-stat-lbl">⏱️ Time Played</div>
      </div>
    </div>
    ${badgeDefs.length ? `
      <div style="font-size:12px;opacity:.5;text-align:left;margin-top:8px;margin-bottom:4px;font-weight:700">BADGES</div>
      <div class="lbp-badges">
        ${badgeDefs.map(b=>`<span class="lbp-badge-pill" title="${b.desc}">${b.icon} ${b.name}</span>`).join('')}
      </div>` : ''}
  `;
}

function closePlayerProfile() {
  const el = document.getElementById('lb-profile-backdrop');
  if (el) el.remove();
}

// Close on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closePlayerProfile();
});
