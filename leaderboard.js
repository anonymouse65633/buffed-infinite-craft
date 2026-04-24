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
      <button class="acct-btn secondary" style="margin-top:10px;font-size:12px" onclick="pushLeaderboardStats().then(()=>showTokenToast('Stats synced!'))">🔄 Sync Stats</button>`;
  }

  // Render badges
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
      html += `<div class="podium-slot podium-${rank}${isMe?' lb-me':''}">
        <div class="podium-name" title="${doc.name||'???' }">${doc.name||'???'}</div>
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
    html += `<div class="lb-row${isMe?' lb-me':''}">
      <span class="lb-rank">${rank}</span>
      <span class="lb-name">${doc.name||'???'}</span>
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
