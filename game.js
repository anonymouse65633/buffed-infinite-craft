// DOM
const world      = document.getElementById('world');
const canvas     = document.getElementById('canvas');
const ghost      = document.getElementById('ghost');
const searchInput= document.getElementById('search-input');
const itemsInner = document.getElementById('items-inner');
const discInner  = document.getElementById('disc-inner');
const shopInner  = document.getElementById('shop-inner');
const questInner = document.getElementById('quest-inner');
const pinnedOv   = document.getElementById('pinned-overlay');

// ─────────────────────────────────────────────────────────────
//  CONSTANTS (must be before boot)
// ─────────────────────────────────────────────────────────────
const RING_R          = 37;
const RING_CIRC       = 2 * Math.PI * RING_R;
const RING_ARC_FRAC   = 0.75;
const RING_ARC_LEN    = RING_CIRC * RING_ARC_FRAC;
const RING_GAP_LEN    = RING_CIRC - RING_ARC_LEN;
let ZOOM_MIN_DYNAMIC  = 0.15;

// ── Variables that initQuestProgress / boot need (must be before BOOT) ──
let secretsUnlocked    = {};   // id → true
var ACH_FILTER         = 'all';
let chainStepProgress  = {};   // chainId → { completed:Set, revealed:number }
let chainStepsCompleted = 0;
let chainFullCompleted  = 0;
let secretsCount        = 0;
let generatedSecretsAdded = 0;

// ─────────────────────────────────────────────────────────────
//  GAME INIT (called by auth.js after login)
// ─────────────────────────────────────────────────────────────
function initGame() {

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
STARTERS.forEach(e => register(e.emoji, e.name, false));
initQuestProgress();
initMilestonesProgress();

// ── Load saved game (overrides defaults above) ──
const _hasSave = loadGame();
if (!_hasSave) {
  // fresh game — starters already registered above
} else {
  // ensure any chain IDs missing from save are initialised
  CRAFT_CHAINS.forEach(c => {
    if (!chainStepProgress[c.id])
      chainStepProgress[c.id] = { completed: new Set(), revealed: 1 };
  });
}

renderSidebar();
renderShop();
renderQuests();
renderPinned();
updateLevelHUD();
updateLogo();
initCanvas();
initControls();
_initGlobalBadge();
} // end initGame()

// ─────────────────────────────────────────────────────────────
//  USERNAME MODAL
// ─────────────────────────────────────────────────────────────
function openUsernameModal() {
  const inp = document.getElementById('username-input');
  if (inp) inp.value = PLAYER_NAME;
  const m = document.getElementById('username-modal');
  if (m) m.classList.add('open');
}
function closeUsernameModal() {
  const m = document.getElementById('username-modal');
  if (m) m.classList.remove('open');
}
function saveUsername() {
  const inp = document.getElementById('username-input');
  const val = (inp ? inp.value.trim() : '') || PLAYER_NAME;
  if (val.length < 2) { alert('Name too short — at least 2 characters!'); return; }
  PLAYER_NAME = val.slice(0, 24);
  localStorage.setItem('ic_player_name', PLAYER_NAME);
  const nameEl = document.getElementById('gb-name');
  if (nameEl) nameEl.textContent = PLAYER_NAME;
  closeUsernameModal();
  showTokenToast('👤 Name saved: ' + PLAYER_NAME);
}
function _initGlobalBadge() {
  const nameEl = document.getElementById('gb-name');
  const dotEl  = document.getElementById('gb-dot');
  if (nameEl) nameEl.textContent = PLAYER_NAME;
  if (dotEl)  dotEl.classList.toggle('offline', !_fbReady());
}

// ─────────────────────────────────────────────────────────────
//  PRESTIGE HELPERS
// ─────────────────────────────────────────────────────────────
function prestigeRequired() {
  if (prestige >= 10) return null; // already max
  return PRESTIGE_LEVELS[prestige + 1];
}
function canPrestige() {
  const req = prestigeRequired();
  return req !== null && level >= req;
}
function openPrestigeModal() {
  const nextP = prestige + 1;
  if (!canPrestige()) return;
  const boost = PRESTIGE_BOOSTS[nextP];
  const isMax = nextP === 10;
  document.getElementById('pm-title').textContent = isMax ? '👑 Prestige Master!' : `⭐ Prestige ${nextP}`;
  document.getElementById('pm-desc').textContent = isMax
    ? 'Achieve max prestige and become a true Prestige Master!'
    : `You've reached Level ${PRESTIGE_LEVELS[nextP]}! Reset for permanent power.`;
  document.getElementById('pm-reward').innerHTML =
    `<b>New Permanent Boost:</b><br>${boost.icon} ${boost.text}` +
    (prestige > 0 ? `<br><br><b>All previous boosts still active!</b>` : '');
  document.getElementById('pm-warn').textContent =
    `⚠️ Resets: Level → 1, XP → 0, basic shop upgrades (you get 50% tokens back)`;
  document.getElementById('prestige-modal').classList.add('open');
}
function closePrestigeModal() {
  document.getElementById('prestige-modal').classList.remove('open');
}
function doPrestige() {
  if (!canPrestige()) return;
  closePrestigeModal();

  // Refund 50% of resettable shop items
  let refund = 0;
  SHOP.forEach(s => {
    if (s.resetsOnPrestige && (owned[s.id]||0) > 0) {
      refund += Math.floor(s.cost * (owned[s.id]||0) * 0.5);
      owned[s.id] = 0;
    }
  });
  tokens += refund;
  prestige++;
  level = 1;
  xp = 0;
  currentUnlockPrestigeView = prestige; // show current prestige in unlocks

  showTokenToast(`⭐ Prestige ${prestige}! +${refund}🪙 refunded`);
  updateXPBar();
  updateLevelHUD();
  renderShop();
  updateQuestProgress();
  renderQuests();
  autoSave();
  // Generate fresh content on each prestige
  setTimeout(generateMoreQuests, 2000);
  setTimeout(generateMoreMilestones, 3000);
  setTimeout(generateMoreShopItems, 4000);
}

function prestigeXPMult() {
  let m = 1;
  if (prestige >= 1) m += 0.15;
  if (prestige >= 7) m += 0.10;
  if (prestige >= 10) m += 0.25;
  return m;
}
function prestigeTokenMult() {
  let m = 1;
  if (prestige >= 2) m += 0.15;
  if (prestige >= 7) m += 0.10;
  if (prestige >= 10) m += 0.25;
  return m;
}
function luckyChance() {
  return prestige >= 4 ? 0.30 : 0.20;
}
function autoCraftInterval() {
  let ms = 30000;
  if (owned['speed3']) ms = 3000;
  else if (owned['speed2']) ms = 7000;
  else if (owned['speed1']) ms = 15000;
  if (prestige >= 3) ms = Math.floor(ms * 0.80);
  return ms;
}

// ─────────────────────────────────────────────────────────────
//  LEVEL HUD
// ─────────────────────────────────────────────────────────────

function updateLevelHUD() {
  const thresh = levelThreshold(level);
  const pct    = Math.min(1, xp / thresh);

  // Drive the ring fill
  const fillLen = pct * RING_ARC_LEN;
  const ringEl  = document.getElementById('ring-fill-el');
  if (ringEl) {
    ringEl.setAttribute('stroke-dasharray', `${fillLen.toFixed(1)} ${(RING_CIRC - fillLen).toFixed(1)}`);
  }

  // Update ring track to show the 270° arc correctly
  const trackEl = document.querySelector('.ring-track');
  if (trackEl) {
    trackEl.setAttribute('stroke-dasharray', `${RING_ARC_LEN.toFixed(1)} ${RING_GAP_LEN.toFixed(1)}`);
  }

  // Center number + pic
  const numEl = document.getElementById('hud-level-num');
  if (numEl) numEl.textContent = level;
  const picEl = document.getElementById('hud-pic');
  if (picEl) picEl.textContent = activePic || '⚗️';

  // XP label below ring
  document.getElementById('hud-xp-label').textContent = `${xp}/${thresh} XP`;

  // Prestige badge
  const presEl = document.getElementById('hud-prestige');
  const hudEl  = document.getElementById('level-hud');
  if (prestige > 0) {
    presEl.style.display = '';
    presEl.className = `p${prestige}`;
    presEl.textContent = prestige >= 10 ? '👑 MASTER' : `⭐ P${prestige}`;
    hudEl.className   = `p${prestige}`;
  } else {
    presEl.style.display = 'none';
    hudEl.className = '';
  }

  // Prestige button
  const btn = document.getElementById('hud-prestige-btn');
  if (canPrestige() && prestige < 10) {
    const nextP = prestige + 1;
    btn.style.display = '';
    btn.textContent = prestige >= 9 ? `👑 GO MASTER!` : `⭐ PRESTIGE ${nextP}!`;
  } else {
    btn.style.display = 'none';
  }
  updateLogo();
}

// ─────────────────────────────────────────────────────────────
//  BOOSTER SYSTEM
// ─────────────────────────────────────────────────────────────
// BOOSTER_DURATIONS defined earlier to avoid TDZ issues

function activateBooster(id) {
  const dur = BOOSTER_DURATIONS[id];
  if (!dur) return;
  const bonus = prestige >= 6 && id === 'clairvoy' ? dur * 2 : dur;
  activeBoosters[id] = Date.now() + bonus * 1000;
  updateBoosterHUD();
  if (!boosterTickTimer) boosterTickTimer = setInterval(tickBoosters, 1000);
}
function tickBoosters() {
  const now = Date.now();
  let any = false;
  Object.keys(activeBoosters).forEach(id => {
    if (activeBoosters[id] <= now) delete activeBoosters[id];
    else any = true;
  });
  if (!any) { clearInterval(boosterTickTimer); boosterTickTimer = null; }
  updateBoosterHUD();
}
function boosterActive(id) {
  return activeBoosters[id] && activeBoosters[id] > Date.now();
}
function updateBoosterHUD() {
  const hub = document.getElementById('booster-hud');
  hub.innerHTML = '';
  const labels = { xp_pot:'⏳ XP x2', midas:'✨ Midas', clairvoy:'🔮 Clairvoy', eureka:'💡 Eureka x3' };
  const now = Date.now();
  Object.keys(activeBoosters).forEach(id => {
    if (!boosterActive(id)) return;
    const secs = Math.ceil((activeBoosters[id] - now) / 1000);
    const m = Math.floor(secs/60), s = secs%60;
    const badge = document.createElement('div');
    badge.className = 'booster-badge';
    badge.innerHTML = `${labels[id]||id} <span class="bb-timer">${m}m ${s}s</span>`;
    hub.appendChild(badge);
  });
}
// ─────────────────────────────────────────────────────────────
function register(emoji, name, isFirst) {
  if (discovered.find(e => e.name === name)) return false;
  discovered.push({ emoji, name, isFirst: !!isFirst, order: discovered.length });
  if (isFirst) firstDiscs.push({ emoji, name });
  return true;
}

// ─────────────────────────────────────────────────────────────
//  SIDEBAR RENDERING
// ─────────────────────────────────────────────────────────────
function renderSidebar() {
  var q    = searchInput.value.toLowerCase();
  var list = [...discovered];
  if (sortMode === 'name')   list.sort(function(a,b){ return a.name.localeCompare(b.name); });
  if (sortMode === 'emoji')  list.sort(function(a,b){ return a.emoji.localeCompare(b.emoji); });
  if (sortMode === 'length') list.sort(function(a,b){ return a.name.length - b.name.length; });
  if (sortMode === 'random') list.sort(function(){ return Math.random()-0.5; });
  if (q) list = list.filter(function(e){ return e.name.toLowerCase().includes(q); });

  itemsInner.innerHTML = '';
  list.forEach(function(e) {
    var wrap = document.createElement('div');
    wrap.className = 'item-wrapper';
    var pill = document.createElement('div');
    pill.className = 'item';
    pill.innerHTML = '<span>'+e.emoji+'</span> '+e.name;
    pill.addEventListener('mousedown', function(ev){ sidebarDragStart(ev, e); });
    wrap.appendChild(pill);
    itemsInner.appendChild(wrap);
  });
  document.getElementById('el-count').textContent = discovered.length;

  // Discoveries tab
  discInner.innerHTML = '';
  if (firstDiscs.length === 0) {
    discInner.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.4;font-size:14px;">No first discoveries yet!<br>Keep crafting ✨</div>';
  } else {
    firstDiscs.slice().reverse().forEach(function(e) {
      var row = document.createElement('div');
      row.className = 'disc-item';
      row.innerHTML = '<span class="disc-emoji">'+e.emoji+'</span><span class="disc-name">'+e.name+'</span><span class="disc-badge">First!</span>';
      discInner.appendChild(row);
    });
  }
  document.getElementById('disc-count').textContent = firstDiscs.length;
  var dbc = document.getElementById('disc-btn-count');
  if (dbc) dbc.textContent = firstDiscs.length;
  updateSortDropUI();
}

searchInput.addEventListener('input', renderSidebar);
var SORT_LABELS = { time:'\uD83D\uDD50 Time', name:'\uD83D\uDD24 Name', emoji:'\uD83D\uDE00 Emoji', length:'\uD83D\uDCCF Length', random:'\uD83C\uDFB2 Random' };



function setSort(mode) {
  var lockedModes = { emoji:'sort_emoji', length:'sort_length', random:'sort_random' };
  if (lockedModes[mode] && !(owned[lockedModes[mode]] > 0)) {
    showErr('Buy "' + (mode==='emoji'?'Emoji':mode==='length'?'Length':'Random') + ' Sorting" in the Shop to unlock this!');
    return;
  }
  sortMode = mode;
  updateSortDropUI();
  closeSortDrop();
  renderSidebar();
}

function updateSortDropUI() {
  var label = document.getElementById('sort-btn-label');
  if (label) label.textContent = SORT_LABELS[sortMode] || '🕐 Time';
  ['time','name','emoji','length','random'].forEach(function(m) {
    var el = document.getElementById('sdrop-'+m);
    if (!el) return;
    el.classList.toggle('active', m===sortMode);
    var locked = { emoji:'sort_emoji', length:'sort_length', random:'sort_random' };
    if (locked[m]) {
      var isUnlocked = owned[locked[m]] > 0;
      el.classList.toggle('locked', !isUnlocked);
      var lk = document.getElementById('sdrop-lock-'+m);
      if (lk) lk.style.display = isUnlocked ? 'none' : '';
    }
  });
}

function toggleSortDrop(ev) {
  ev.stopPropagation();
  var dd = document.getElementById('sort-dropdown');
  var btn = document.getElementById('sort-btn');
  var isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  updateSortDropUI();
  if (!isOpen) {
    setTimeout(function() { document.addEventListener('click', closeSortDrop, {once:true}); }, 0);
  }
}
function closeSortDrop() {
  var dd = document.getElementById('sort-dropdown');
  var btn = document.getElementById('sort-btn');
  if (dd) dd.classList.remove('open');
  if (btn) btn.classList.remove('open');
}

function toggleDisc() {
  var showing = currentTab === 'disc';
  switchTab(showing ? 'items' : 'disc');
}

// ── MENU PANEL ──
var menuTab = 'shop';
function toggleMenu() {
  var panel = document.getElementById('menu-panel');
  var btn   = document.getElementById('menu-btn');
  var mpanel = document.getElementById('milestones-panel');
  var isOpen = panel.style.display === 'flex';
  // Close milestones panel when opening menu
  if (!isOpen) {
    mpanel.style.display = 'none';
    panel.style.display = 'flex';
    btn.classList.add('open');
    switchMenu(menuTab);
    if (menuTab==='shop')   { renderShop(); if (shopSubTab==='unlocks') renderUnlocks(); }
    if (menuTab==='quests') renderQuests();
    if (menuTab==='home')   renderHome();
  } else {
    panel.style.display = 'none';
    btn.classList.remove('open');
  }
}
function closeMenu() {
  document.getElementById('menu-panel').style.display = 'none';
  document.getElementById('menu-btn').classList.remove('open');
}
function toggleMilestonesPanel() {
  var panel = document.getElementById('milestones-panel');
  var isOpen = panel.style.display !== 'none';
  // Close menu if open
  if (!isOpen) {
    document.getElementById('menu-panel').style.display = 'none';
    document.getElementById('menu-btn').classList.remove('open');
    panel.style.display = 'flex';
    renderMilestones();
  } else {
    panel.style.display = 'none';
  }
}
function switchMenu(tab) {
  menuTab = tab;
  // Close milestones panel if open
  document.getElementById('milestones-panel').style.display = 'none';
  ['shop','quests','unlocks','prestige'].forEach(function(t) {
    var v = document.getElementById('menu-view-' + t);
    if (v) v.style.display = t===tab ? '' : 'none';
    var b = document.getElementById('mtab-' + t);
    if (b) b.classList.toggle('active', t===tab);
  });
  if (tab==='shop')     renderShop();
  if (tab==='quests')   { renderQuests(); renderChains(); }
  if (tab==='unlocks')  renderUnlocks();
  if (tab==='prestige') renderHome();
}

// ─────────────────────────────────────────────────────────────
//  TAB SWITCHING
// ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('view-items').style.display = tab==='items' ? '' : 'none';
  document.getElementById('view-disc').style.display  = tab==='disc'  ? '' : 'none';

  var discBtn = document.getElementById('disc-wide-btn');
  if (discBtn) discBtn.classList.toggle('active', tab==='disc');
}

// ─────────────────────────────────────────────────────────────
//  SIDEBAR CLICK / DRAG
// ─────────────────────────────────────────────────────────────
function sidebarClick(ev, e) {
  const r  = canvas.getBoundingClientRect();
  const wx = (r.width/2-panX)/zoom + (Math.random()-0.5)*200;
  const wy = (r.height/2-panY)/zoom + (Math.random()-0.5)*120;
  spawnEl(e.emoji, e.name, wx, wy);
}

function sidebarDragStart(ev, e) {
  if (ev.button!==0) return;
  ev.preventDefault();
  ev.stopPropagation();
  sbDrag=e; sbMoved=false; sbDown={x:ev.clientX,y:ev.clientY};
  ghost.innerHTML=`<span class="instance-emoji">${e.emoji}</span><span class="instance-text">${e.name}</span>`;
  ghost.style.display='flex'; posGhost(ev.clientX,ev.clientY);
  document.addEventListener('mousemove',sbMove); document.addEventListener('mouseup',sbEnd);
}
function sbMove(ev) {
  // Raise threshold to 12 px so normal hand-jitter doesn't trigger drag mode
  if (Math.abs(ev.clientX-sbDown.x)+Math.abs(ev.clientY-sbDown.y)>12) sbMoved=true;
  posGhost(ev.clientX,ev.clientY);
}
// Find which canvas element the world-point (wx,wy) is visually inside
function findAtPoint(wx, wy) {
  for (let i = canvasEls.length - 1; i >= 0; i--) {
    const b = canvasEls[i];
    const ow = b.el.offsetWidth  || 200;
    const oh = b.el.offsetHeight || 90;
    // scale:0.5 + transform-origin:center → visual bounds shrunk 50% from center
    const vx1 = b.x + ow * 0.25, vx2 = b.x + ow * 0.75;
    const vy1 = b.y + oh * 0.25, vy2 = b.y + oh * 0.75;
    if (wx >= vx1 && wx <= vx2 && wy >= vy1 && wy <= vy2) return b;
  }
  return null;
}

async function sbEnd(ev) {
  document.removeEventListener('mousemove',sbMove); document.removeEventListener('mouseup',sbEnd);
  ghost.style.display='none';
  if (!sbDrag) return;
  const e=sbDrag; sbDrag=null;
  const r=canvas.getBoundingClientRect();
  const overCanvas=ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;

  if (sbMoved && overCanvas) {
    const w=toWorld(ev.clientX,ev.clientY);
    // Check if the cursor is directly over an existing canvas element
    const directHit = findAtPoint(w.x, w.y);
    if (directHit) {
      // Spawn adjacent to the hit element so combine works
      const spawnX = directHit.x - 90;
      const spawnY = directHit.y;
      const spawned = spawnEl(e.emoji, e.name, spawnX, spawnY);
      await combine(spawned, directHit);
      return;
    }
    // Normal drop: place at cursor position
    const wx=w.x-55, wy=w.y-22;
    const spawned=spawnEl(e.emoji,e.name,wx,wy);
    const hit=findOverlap(spawned);
    if (hit) await combine(spawned,hit);
  } else {
    const wx=(r.width/2-panX)/zoom+(Math.random()-0.5)*200;
    const wy=(r.height/2-panY)/zoom+(Math.random()-0.5)*120;
    spawnEl(e.emoji,e.name,wx,wy);
  }
}
function posGhost(cx,cy) { ghost.style.left=(cx-45)+'px'; ghost.style.top=(cy-45)+'px'; }

// ─────────────────────────────────────────────────────────────
//  SPAWN
// ─────────────────────────────────────────────────────────────
function spawnEl(emoji, name, wx, wy, isFirst=false, isWorldFirst=false) {
  const el = document.createElement('div');
  el.className = 'instance new-spawn';
  if (isFirst) el.classList.add('first-disc');
  if (isWorldFirst) el.classList.add('world-first');
  el.innerHTML = `<span class="instance-emoji">${emoji}</span><span class="instance-text">${name}</span>`;
  el.style.left = wx+'px'; el.style.top = wy+'px';
  const id=uid++, entry={id,el,emoji,name,x:wx,y:wy};
  canvasEls.push(entry);
  world.appendChild(el);
  el.addEventListener('mousedown', ev=>canvasDragStart(ev,entry));
  setTimeout(()=>el.classList.remove('new-spawn'),300);
  document.getElementById('hint').style.display='none';
  return entry;
}

// ─────────────────────────────────────────────────────────────
//  CANVAS DRAG
// ─────────────────────────────────────────────────────────────
function canvasDragStart(ev, entry) {
  if (ev.button!==0||busy) return;
  ev.preventDefault(); ev.stopPropagation();
  cDrag=entry;
  const w=toWorld(ev.clientX,ev.clientY);
  cdx=w.x-entry.x; cdy=w.y-entry.y;
  entry.el.classList.add('selected');
  entry.el.style.zIndex=500;
  world.appendChild(entry.el);
  document.addEventListener('mousemove',cMove); document.addEventListener('mouseup',cEnd);
}
function cMove(ev) {
  if (!cDrag) return;
  const w=toWorld(ev.clientX,ev.clientY);
  cDrag.x=w.x-cdx; cDrag.y=w.y-cdy;
  cDrag.el.style.left=cDrag.x+'px'; cDrag.el.style.top=cDrag.y+'px';
  canvasEls.forEach(b=>{
    if (b.id===cDrag.id) return;
    b.el.classList.toggle('hover-target', overlaps(cDrag,b));
  });
}
async function cEnd() {
  document.removeEventListener('mousemove',cMove); document.removeEventListener('mouseup',cEnd);
  if (!cDrag) return;
  const dragged=cDrag; cDrag=null;
  dragged.el.classList.remove('selected');
  dragged.el.style.zIndex=11;
  canvasEls.forEach(b=>b.el.classList.remove('hover-target'));
  const hit=findOverlap(dragged);
  if (hit) await combine(dragged,hit);
}

// ─────────────────────────────────────────────────────────────
//  OVERLAP
// ─────────────────────────────────────────────────────────────
function overlaps(a,b) {
  const aw=(a.el.offsetWidth||200)*0.5, ah=(a.el.offsetHeight||90)*0.5;
  const bw=(b.el.offsetWidth||200)*0.5, bh=(b.el.offsetHeight||90)*0.5;
  const acx=a.x+aw/2, acy=a.y+ah/2, bcx=b.x+bw/2, bcy=b.y+bh/2;
  return Math.abs(acx-bcx)<(aw+bw)*0.45 && Math.abs(acy-bcy)<(ah+bh)*0.45;
}
function findOverlap(a) {
  for (const b of canvasEls) { if (b.id!==a.id&&overlaps(a,b)) return b; }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  COMBINE
// ─────────────────────────────────────────────────────────────
async function combine(a, b, autoMode=false) {
  if (busy) return;
  busy=true;
  a.el.classList.add('disabled'); b.el.classList.add('disabled');
  const sa=addSpinner(a.el), sb2=addSpinner(b.el);
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
  try {
    const res     = await askGemini(a,b);
    const isFirst = register(res.emoji,res.name,true);
    const alreadyKnew = !isFirst;

    // ── Global first-discovery check (before spawn so correct badge shows) ──
    let _globalFirstResult = { isGlobalFirst: false, discoverer: '' };
    if (isFirst) {
      _globalFirstResult = await _claimGlobalFirst(res.name, res.emoji);
    }

    removeEl(a); removeEl(b);
    spawnEl(res.emoji,res.name,mx,my,isFirst,_globalFirstResult.isGlobalFirst);
    totalCrafts++;

    // EXP calculation
    let baseXP = alreadyKnew ? 5 : 20;
    if (isFirst) baseXP = 50;
    if (isFirst && prestige >= 5) baseXP *= 2; // prestige 5 boost
    gainXP(baseXP);

    // Tokens
    let tokGain = 1;
    if (isFirst) tokGain += 2; // bonus for first discovery
    if (!isFirst && boosterActive('midas')) tokGain += 1; // midas: dupes earn coins too
    if (owned['lucky'] && Math.random() < luckyChance()) tokGain *= 5;
    gainTokens(tokGain, isFirst);

    if (isFirst) {
      if (_globalFirstResult.isGlobalFirst) {
        showDiscoveryToast('🌍 WORLD FIRST! ' + res.emoji + ' ' + res.name);
        showTokenToast('🌟 Global First Discovery — you\'re in the history books!');
      } else if (_fbReady() && _globalFirstResult.discoverer) {
        showDiscoveryToast('✨ ' + res.emoji + ' ' + res.name + ' (first: ' + _globalFirstResult.discoverer + ')');
      } else {
        showDiscoveryToast(res.emoji+' '+res.name);
      }
      robotPetDiscoveryBurst();
      checkSecretTriggers(res.name);
      if (owned['discovery_bonus']) {
        tokens += 50;
        let drip = 0;
        const drip_i = setInterval(()=>{ tokens += 3; updateXPBar(); if (++drip >= 10) clearInterval(drip_i); }, 1000);
        showTokenToast('🌠 Discovery Surge! +50🪙 + coin shower!');
      }
    }

    updateQuestProgress();
    updateMilestonesProgress();
    checkGenerationTriggers();
    renderSidebar();
    if (currentTab==='shop')   renderShop();
    if (currentTab==='quests') renderQuests();
    renderPinned();
    autoSave();
  } catch(err) {
    console.error(err);
    sa.remove(); sb2.remove();
    a.el.classList.remove('disabled'); b.el.classList.remove('disabled');
    showErr(err.message||'Combination failed — try again');
  } finally {
    busy=false;
  }
}

function addSpinner(el) {
  const s=document.createElement('div'); s.className='spinner';
  el.appendChild(s); return s;
}
function removeEl(entry) {
  entry.el.remove(); canvasEls=canvasEls.filter(e=>e.id!==entry.id);
}

// ─────────────────────────────────────────────────────────────
//  ECONOMY
// ─────────────────────────────────────────────────────────────
function gainXP(amount) {
  let mult = prestigeXPMult();
  if (owned['xp2x']) mult *= 1.5;
  if (owned['xp_mega']) mult *= 3;
  if (boosterActive('xp_pot')) mult *= 2;
  if (boosterActive('eureka')) mult *= 3;
  if (owned['pet_slime']) mult *= (owned['pet_upgrade_slime'] ? 1.10 : 1.05); // Slime pet XP
  amount = Math.floor(amount * mult);
  xp += amount;
  // Level up check
  while (xp >= levelThreshold(level)) {
    xp -= levelThreshold(level);
    level++;
    showToastMsg(false, `🎉 Level Up! Now Level ${level}`);
    grantLevelRewards(prestige, level);
  }
  updateXPBar();
  updateLevelHUD();
}
function gainTokens(amount, isFirst) {
  let mult = prestigeTokenMult();
  if (owned['token2x']) mult *= 2;
  if (owned['token_mega']) mult *= 3;
  if (boosterActive('eureka')) mult *= 3;
  if (owned['prestige_aura']) mult *= 1.5;  // Prestige Aura: +50%
  if (owned['element_sense'] && isFirst) amount += 10; // Element Sense: +10 on discovery
  if (petRobotBoostActive) mult *= 2;  // Robot pet discovery burst: 2×
  amount = Math.floor(amount * mult);
  tokens += amount;
  totalTokensEarned += amount;
  const msg = isFirst
    ? `✨ First Discovery! +${amount} 🪙`
    : `+${amount} 🪙`;
  showTokenToast(msg);
  updateXPBar();
}
function updateXPBar() {
  const thresh = levelThreshold(level);
  const pct    = Math.min(100, Math.round(xp/thresh*100));
  const fillEl = document.getElementById('xp-fill');
  if (fillEl) {
    fillEl.style.width = pct+'%';
    const theme = getLevelBarTheme(level);
    if (theme.rainbow) {
      fillEl.classList.add('rainbow-bar');
      fillEl.style.background = '';
    } else {
      fillEl.classList.remove('rainbow-bar');
      fillEl.style.background = `linear-gradient(90deg,${theme.grad[0]},${theme.grad[1]})`;
    }
  }
  const badgeEl = document.getElementById('xp-level-badge');
  if (badgeEl) {
    const theme = getLevelBarTheme(level);
    badgeEl.textContent = `Lv ${level}`;
    badgeEl.style.background = theme.rainbow ? '#8800ff' : theme.grad[0];
  }
  document.getElementById('xp-sub').textContent  = `${xp} / ${thresh} XP`;
  document.getElementById('level-label').textContent = `Level ${level}`;
  document.getElementById('token-label').textContent = `🪙 ${tokens} Tokens`;
  updateLevelHUD();
}

// ─────────────────────────────────────────────────────────────
//  SHOP
// ─────────────────────────────────────────────────────────────
function renderShop() {
  updateXPBar();
  shopInner.innerHTML='';

  // Prestige section at top
  renderPrestigeSection();

  const sections=[
    { title:'🧰 Utility',          ids:['custom','expand','expand2','expand3','undo','cloner','recipebok','workspace','sorter','vault'] },
    { title:'💎 Boosts',           ids:['token2x','xp2x','lucky','combo_boost','element_sense','prestige_aura','xp_surge','crafter_gift','token_saver'] },
    { title:'⏳ Time Boosters',    ids:['xp_pot','midas','clairvoy','eureka','frenzy','token_rain'] },
    { title:'⚙️ Auto Crafter',     ids:['autocraft','speed1','speed2','speed3','dual','intern','coinminer'] },
    { title:'🔍 Discovery Aids',   ids:['hint','wildcard','dice','mystery'] },
    { title:'🎨 Cosmetics',        ids:['theme_chalk','theme_space','theme_neon','theme_parch','disc_rainbow','disc_gold','goldborder'] },
    { title:'🐾 Starter Packs',    ids:['starter_pack_spooky','starter_pack_tech'] },
    { title:'🐾 Pets',             ids:['pet_slime','pet_dragon','pet_robot'] },
    { title:'🐾 Pet Upgrades',      ids:['pet_upgrade_slime','pet_upgrade_dragon','pet_slot2','pet_slot3','pet_food'] },
    { title:'✖️ Multipliers',       ids:['multi_2x','multi_3x','xp_mega','token_mega','combo5x','discovery_bonus','passive_xp'] },
    { title:'🎨 Extras',            ids:['trail_effect','big_text','element_glow','sound_fx'] },
  ];

  sections.forEach(sec=>{
    const h=document.createElement('div'); h.className='shop-sec-title'; h.textContent=sec.title;
    shopInner.appendChild(h);
    sec.ids.forEach(id=>{
      const def=SHOP.find(s=>s.id===id);
      if (!def) return;
      const cnt   = owned[id]||0;
      const isOwned = cnt>=def.max;
      const needsMet = !def.needs || (owned[def.needs]||0)>0;
      const lvlMet   = level>=def.lvl;
      const prestMet = prestige>=def.prestige;
      const locked   = !lvlMet || !needsMet || !prestMet;

      // Custom element is one-shot per purchase — pending charge opens modal, never "owned"
      const isCustomPending = (id==='custom' && cnt>0);
      const div=document.createElement('div');
      const cantAfford = tokens < def.cost && !(isOwned && def.max===1) && !locked;
      div.className='shop-item'+(isOwned&&def.max===1?' owned':(locked?' locked':(cantAfford?' cant-afford':'')));
      const activeNote = boosterActive(id) ? `<div class="shop-item-own">⏳ Active!</div>` : '';
      div.innerHTML=`
        <div class="shop-item-header">
          <div class="shop-item-name">${def.icon} ${def.name}${def.prestige>0?`<span class="prestige-tag ${def.prestige>=10?'gold':'purple'}">P${def.prestige}${def.prestige>=10?' MAX':''}</span>`:''}  </div>
          <div class="shop-item-cost">${isOwned&&def.max===1?'✓ Owned':isCustomPending?'🧪 Ready':'🪙 '+def.cost}  </div>
        </div>
        <div class="shop-item-desc">${def.desc}</div>
        ${!lvlMet?`<div class="shop-item-req">🔒 Requires Level ${def.lvl}</div>`:''}
        ${!prestMet?`<div class="shop-prestige-req">⭐ Requires Prestige ${def.prestige}${def.prestige>=10?' (Master)':''}</div>`:''}
        ${!needsMet?`<div class="shop-item-req">Requires ${SHOP.find(s=>s.id===def.needs)?.name||def.needs}</div>`:''}
        ${isOwned&&def.max===1?`<div class="shop-item-own">✓ Owned</div>`:''}
        ${isCustomPending?`<div class="shop-item-own" style="color:#4f46e5">🧪 1 charge ready — click to use!</div>`:''}
        ${cantAfford && !isOwned && !locked ? `<div class="shop-item-cant-afford-note">⚠️ Need ${(def.cost-tokens).toLocaleString()} more 🪙</div>` : ''}
        ${activeNote}
      `;
      if (!locked && !(isOwned&&def.max===1)) {
        if (isCustomPending) {
          div.addEventListener('click', openCustomModal);
        } else {
          div.addEventListener('click',()=>buyShopItem(id));
        }
      }
      shopInner.appendChild(div);
    });
  });

  // ── AI-Generated Shop Items ──
  const genIds = window._generatedShopIds || [];
  if (genIds.length > 0) {
    const genH = document.createElement('div');
    genH.className = 'shop-sec-title';
    genH.textContent = '🤖 AI-Generated Items';
    shopInner.appendChild(genH);
    genIds.forEach(id => {
      const def = SHOP.find(s => s.id === id);
      if (!def) return;
      const cnt = owned[id]||0;
      const isOwned = cnt >= def.max;
      const lvlMet  = level >= def.lvl;
      const prestMet= prestige >= def.prestige;
      const locked  = !lvlMet || !prestMet;
      const cantAfford = tokens < def.cost && !isOwned && !locked;
      const div = document.createElement('div');
      div.className = 'shop-item' + (isOwned&&def.max===1?' owned':(locked?' locked':(cantAfford?' cant-afford':'')));
      div.innerHTML = `
        <div class="shop-item-header">
          <div class="shop-item-name">${def.icon} ${def.name}</div>
          <div class="shop-item-cost">${isOwned&&def.max===1?'✓ Owned':'🪙 '+def.cost}</div>
        </div>
        <div class="shop-item-desc">${def.desc}</div>
        ${!lvlMet?`<div class="shop-item-req">🔒 Level ${def.lvl} required</div>`:''}
        ${!prestMet?`<div class="shop-prestige-req">⭐ Prestige ${def.prestige} required</div>`:''}
        ${cantAfford?`<div class="shop-item-cant-afford-note">⚠️ Need ${(def.cost-tokens).toLocaleString()} more 🪙</div>`:''}
      `;
      if (!locked && !(isOwned&&def.max===1)) div.addEventListener('click', ()=>buyShopItem(id));
      shopInner.appendChild(div);
    });
  }
}

function renderPrestigeSection() {
  const sec = document.createElement('div');
  sec.className = 'shop-sec-title';
  sec.textContent = '⭐ Prestige';
  shopInner.appendChild(sec);

  // ── Retro "next unlock" bar colour preview ──
  if (prestige < 10) {
    const nextP = prestige + 1;
    const nextLvl = PRESTIGE_LEVELS[nextP];
    const nextLogo = PRESTIGE_LOGOS[nextP];
    // Figure out what bar colour will be active at Lv 1 of next prestige (always resets to Lv 1)
    // But more interesting: show the bar colour for the new prestige's mid-level range
    const barTheme = getLevelBarTheme(level); // current bar colour
    const nextBarTheme = getLevelBarTheme(level); // same level reset to 1, so show next prestige logo+colours
    const nuCard = document.createElement('div');
    nuCard.className = 'prestige-next-unlock';
    const logoInfo = PRESTIGE_LOGOS[nextP];
    const barSwatchStyle = barTheme.rainbow
      ? 'background:linear-gradient(90deg,#ff0000,#ff7700,#ffff00,#00cc00,#0088ff,#8800ff,#ff00cc)'
      : `background:linear-gradient(90deg,${barTheme.grad[0]},${barTheme.grad[1]})`;
    nuCard.innerHTML = `
      <div class="pnu-title">🎁 Next Prestige Unlocks</div>
      <div class="pnu-logo">${logoInfo.text}</div>
      <div style="font-size:11px;opacity:0.55;margin-bottom:4px">New logo at Prestige ${nextP}</div>
      <div class="pnu-bar ${barTheme.rainbow ? 'rainbow-bar' : ''}" style="${barTheme.rainbow ? '' : barSwatchStyle}"></div>
      <div class="pnu-info">Your level bar will reset — earn new colours as you level up again!</div>
      <div style="font-size:11px;margin-top:4px;font-weight:600;opacity:0.7">Requires Level ${nextLvl}</div>
    `;
    shopInner.appendChild(nuCard);
  }

  const card = document.createElement('div');
  card.className = 'shop-item';
  card.style.borderColor = prestige>=10 ? 'gold' : '#a855f7';

  if (prestige >= 10) {
    card.innerHTML = `
      <div class="shop-item-header">
        <div class="shop-item-name">👑 Prestige Master</div>
        <div class="shop-item-cost" style="color:#f59e0b">MAX</div>
      </div>
      <div class="shop-item-desc">You have achieved max Prestige. All boosts are active!</div>
      <div class="shop-item-own">All 10 prestige boosts unlocked 🎉</div>
    `;
  } else {
    const nextP = prestige + 1;
    const nextLvl = PRESTIGE_LEVELS[nextP];
    const boost = PRESTIGE_BOOSTS[nextP];
    const ready = canPrestige();
    card.innerHTML = `
      <div class="shop-item-header">
        <div class="shop-item-name">⭐ Prestige ${nextP}${nextP>=10?' (Master)':''}</div>
        <div class="shop-item-cost" style="color:#a855f7">Lv ${nextLvl}</div>
      </div>
      <div class="shop-item-desc"><b>Reward:</b> ${boost.icon} ${boost.text}</div>
      <div class="shop-item-desc" style="margin-top:4px">Resets level & basic upgrades (50% refund). Keeps discovered elements & permanent upgrades.</div>
      ${prestige>0?`<div class="shop-item-own" style="color:#a855f7">Currently: Prestige ${prestige} — ${PRESTIGE_BOOSTS.slice(1,prestige+1).map(b=>b.icon).join('')} active</div>`:''}
      ${!ready?`<div class="shop-item-req">Need Level ${nextLvl} (currently ${level})</div>`:'<div class="shop-item-own" style="color:#a855f7">✨ Ready to Prestige!</div>'}
    `;
    if (ready) card.addEventListener('click', openPrestigeModal);
    else card.classList.add('locked');
  }
  shopInner.appendChild(card);
}

function buyShopItem(id) {
  const def=SHOP.find(s=>s.id===id);
  if (!def) return;
  if ((owned[id]||0)>=def.max) return;
  if (tokens<def.cost) { showErr('Not enough tokens! Need 🪙'+def.cost); return; }
  if (level<def.lvl) { showErr(`Need Level ${def.lvl} to buy this`); return; }
  if (def.prestige > prestige) { showErr(`Need Prestige ${def.prestige} for this!`); return; }
  if (def.needs&&!(owned[def.needs]>0)) { showErr('Buy the required upgrade first!'); return; }

  tokens-=def.cost; totalSpent+=def.cost;
  owned[id]=(owned[id]||0)+1;

  // Special handlers
  if (id==='custom') { openCustomModal(); }
  if (id==='autocraft') { startAutoCrafter(); }
  if (id==='speed1'||id==='speed2'||id==='speed3') { restartAutoCrafter(); }
  if (id==='expand')  { addBonusStarters(1); }
  if (id==='expand2') { addBonusStarters(2); }
  if (id==='expand3') { addBonusStarters(3); }
  if (id==='starter_pack_spooky') { SPOOKY_STARTERS.forEach(e=>{ if (!discovered.find(d=>d.name===e.name)) register(e.emoji,e.name,false); }); renderSidebar(); }
  if (id==='starter_pack_tech')   { TECH_STARTERS.forEach(e=>{   if (!discovered.find(d=>d.name===e.name)) register(e.emoji,e.name,false); }); renderSidebar(); }
  if (BOOSTER_DURATIONS[id]) { activateBooster(id); showTokenToast(`${def.icon} ${def.name} activated!`); }
  if (id==='hint') { showRandomHint(); }
  if (id==='coinminer') { startCoinMiner(); }
  if (id==='pet_slime'||id==='pet_dragon'||id==='pet_robot') { startPets(); }
  if (id==='intern') { startLabIntern(); }
  if (id==='workspace') { applyWorkspaceExpand(); }
  if (id==='theme_chalk'||id==='theme_space'||id==='theme_neon'||id==='theme_parch') { applyTheme(id); }
  if (id==='goldborder') { document.body.classList.add('golden-borders'); }
  if (id==='sort_emoji'||id==='sort_length'||id==='sort_random') { updateSortDropUI(); }
  if (id==='big_text')   { document.body.classList.add('big-text-mode'); }
  if (id==='element_glow') { document.body.classList.add('element-glow-mode'); }
  if (id==='passive_xp') { startPassiveXP(); }
  if (id==='pet_food')   { activatePetFood(); }
  if (id==='sound_fx')   { showTokenToast('🔔 Sound FX enabled!'); }

  updateXPBar();
  updateQuestProgress();
  renderShop();
  // Auto-generate more shop items if all generated ones are now owned
  if (hasAnyApiKey() && (window._generatedShopIds||[]).length > 0) {
    const allGenBought = (window._generatedShopIds||[]).every(id => {
      const def = SHOP.find(s=>s.id===id);
      return !def || (owned[id]||0) >= def.max;
    });
    if (allGenBought) setTimeout(generateMoreShopItems, 1200);
  }
  if (currentTab==='quests') renderQuests();
  autoSave();
}

function addBonusStarters(tier) {
  const sets = [BONUS_STARTERS, BONUS_STARTERS2, BONUS_STARTERS3];
  const set = sets[(tier||1)-1] || BONUS_STARTERS;
  set.forEach(e=>{
    if (!discovered.find(d=>d.name===e.name)) register(e.emoji,e.name,false);
  });
  renderSidebar();
}

// ─────────────────────────────────────────────────────────────
//  AUTO CRAFTER
// ─────────────────────────────────────────────────────────────
function autoCrafterInterval() {
  let ms = 30000;
  if (owned['speed3']) ms = 3000;
  else if (owned['speed2']) ms = 7000;
  else if (owned['speed1']) ms = 15000;
  if (prestige >= 3) ms = Math.floor(ms * 0.80);
  return ms;
}
function startAutoCrafter() {
  clearInterval(autoCraftTimer);
  document.getElementById('auto-status').style.display='';
  autoCraftTimer=setInterval(autoCraft, autoCrafterInterval());
}
function restartAutoCrafter() {
  if (!(owned['autocraft']>0)) return;
  clearInterval(autoCraftTimer);
  autoCraftTimer=setInterval(autoCraft, autoCrafterInterval());
}

// Coin miner
function startCoinMiner() {
  if (coinMinerTimer) return;
  coinMinerTimer = setInterval(()=>{
    tokens += 1;
    updateXPBar();
  }, 60000);
}

// Pet timers
function startPets() {
  if (petTimer) clearInterval(petTimer);

  // Slime: 2 coins every 45s + passive XP tracked via flag
  // Dragon: 8 coins every 30s + occasional dragon event every 5 min
  // Robot: auto-craft every 20s + 5 coins per craft, discovery burst on new find

  let dragonTick = 0;
  petTimer = setInterval(()=>{
    let coins = 0;

    // ── Slime Pet: 2 coins every 45s ──
    if (owned['pet_slime']) {
      coins += 2;
    }

    // ── Dragon Pet: 8 coins every 30s; scorches every 10 ticks (5 min) ──
    if (owned['pet_dragon']) {
      coins += 8;
      dragonTick++;
      if (dragonTick >= 10) {
        dragonTick = 0;
        // Dragon scorch: bonus coins burst
        coins += 20;
        showTokenToast('🐉 Dragon scorches a path! Bonus +20 🪙');
      }
    }

    // ── Robot Pet: auto-craft + 5 coins per attempt every 20s ──
    if (owned['pet_robot']) {
      coins += 5;
      if (!busy && discovered.length >= 2) {
        autoCraft().then(()=>{
          // After each robot craft, check if it discovered something new (handled in combine)
        });
      }
    }

    if (coins > 0) {
      if (petFoodActive) coins *= 3;
      if (owned['pet_upgrade_slime'] && owned['pet_slime']) coins += 3; // extra from upgrade
      if (owned['pet_upgrade_dragon'] && owned['pet_dragon']) coins += 12; // extra from upgrade
      tokens += coins;
      showTokenToast(`🐾 Pet income +${coins} 🪙`);
      updateXPBar();
    }
  }, 30000); // base tick: 30s (slime effectively earns every 45s via skipping every other tick)
}

// Robot pet discovery burst: called from combine() on first discovery
function robotPetDiscoveryBurst() {
  if (!owned['pet_robot']) return;
  if (petRobotBoostTimer) clearTimeout(petRobotBoostTimer);
  petRobotBoostActive = true;
  showTokenToast('🤖 Robot Pet activated! 2× tokens for 60s! 🔥');
  petRobotBoostTimer = setTimeout(()=>{ petRobotBoostActive = false; }, 60000);
}

// Passive XP
var passiveXPTimer = null;
function startPassiveXP() {
  if (passiveXPTimer) return;
  passiveXPTimer = setInterval(()=>{
    if (owned['passive_xp']) { xp += 1; updateXPBar(); updateLevelHUD(); }
  }, 30000);
}
// Pet food burst
var petFoodTimer = null;
var petFoodActive = false;
function activatePetFood() {
  if (petFoodTimer) clearTimeout(petFoodTimer);
  petFoodActive = true;
  showTokenToast('🍖 Pet Food active! 3× pet income for 10 min!');
  petFoodTimer = setTimeout(()=>{ petFoodActive = false; }, 600000);
}

// Lab intern
function startLabIntern() {
  if (labInternTimer) return;
  labInternTimer = setInterval(()=>{
    if (discovered.length < 2) return;
    const a = discovered[Math.floor(Math.random()*discovered.length)];
    const b = discovered[Math.floor(Math.random()*discovered.length)];
    showTokenToast(`🤖 Lab Intern tested: ${a.emoji}${a.name} + ${b.emoji}${b.name}`);
  }, 120000);
}

// Random hint
function showRandomHint() {
  if (discovered.length < 2) { showErr('Need more elements for hints!'); return; }
  const a = discovered[Math.floor(Math.random()*discovered.length)];
  const b = discovered[Math.floor(Math.random()*discovered.length)];
  showTokenToast(`🔍 Hint: Try ${a.emoji} ${a.name} + ${b.emoji} ${b.name}`);
  // Highlight in sidebar
  document.querySelectorAll('.item').forEach(el=>{
    if (el.textContent.includes(a.name)||el.textContent.includes(b.name)) {
      el.style.background='rgba(16,185,129,0.25)';
      setTimeout(()=>el.style.background='',4000);
    }
  });
}

// Workspace expand
function applyWorkspaceExpand() {
  const count = owned['workspace']||1;
  // Each workspace upgrade increases max zoom-out by 0.05
  ZOOM_MIN_DYNAMIC = Math.max(0.05, 0.15 - count*0.03);
}

// Themes
function applyTheme(id) {
  // Strip all theme classes
  document.body.className = [...document.body.classList]
    .filter(c => !c.startsWith('theme-'))
    .concat(document.body.classList.contains('dark') ? ['dark'] : [])
    .join(' ');
  const map = {
    theme_chalk:'theme-chalk', theme_space:'theme-space', theme_neon:'theme-neon',
    theme_parch:'theme-parch', theme_ocean:'theme-ocean', theme_forest:'theme-forest',
    theme_crystal:'theme-crystal', theme_lava:'theme-lava', theme_galaxy:'theme-galaxy',
    theme_golden:'theme-golden', theme_cyber:'theme-cyber', theme_void:'theme-void',
    theme_ancient:'theme-ancient', theme_heaven:'theme-heaven', theme_radiant:'theme-radiant',
    'theme_cosmic-gold':'theme-cosmic-gold', 'theme_prestige-master':'theme-prestige-master',
    theme_magic:'theme-magic', theme_royal:'theme-royal', theme_space2:'theme-space2',
    'theme_dark-lord':'theme-dark-lord', theme_matrix:'theme-matrix', theme_crystal2:'theme-crystal',
  };
  if (map[id]) document.body.classList.add(map[id]);
  // Also handle the dark mode class preservation
  if (darkMode) document.body.classList.add('dark');
  if (owned['goldborder']) document.body.classList.add('golden-borders');
}
async function autoCraft() {
  if (busy||discovered.length<2) return;
  const pairs = (owned['dual']>0 || prestige>=9) ? 2 : 1;
  for (let p=0; p<pairs; p++) {
    const pool=[...discovered];
    const a=pool[Math.floor(Math.random()*pool.length)];
    const b=pool[Math.floor(Math.random()*pool.length)];
    // Spawn both on canvas temporarily
    const ex = (Math.random()-0.5)*400 + (canvas.clientWidth/2-panX)/zoom;
    const ey = (Math.random()-0.5)*200 + (canvas.clientHeight/2-panY)/zoom;
    const ea=spawnEl(a.emoji,a.name,ex-60,ey);
    const eb=spawnEl(b.emoji,b.name,ex+60,ey);
    await combine(ea,eb);
    await new Promise(r=>setTimeout(r,500));
  }
}

// ─────────────────────────────────────────────────────────────
//  CUSTOM ELEMENT
// ─────────────────────────────────────────────────────────────
function openCustomModal() {
  if ((owned['custom']||0) <= 0) return; // must have a purchased charge
  const m = document.getElementById('custom-modal');
  m.style.display = 'flex';
  m.classList.add('open');
}
function closeCustomModal() {
  const m = document.getElementById('custom-modal');
  m.style.display = 'none';
  m.classList.remove('open');
  // If user cancels, refund the charge so they don't lose tokens without getting an element
  if ((owned['custom']||0)>0) { owned['custom']--; renderShop(); }
}
function confirmCustomElement() {
  const emoji=(document.getElementById('custom-emoji').value.trim()||'❓');
  let name =(document.getElementById('custom-name').value.trim());
  if (!name) { alert('Please enter a name!'); return; }
  // Sanitize custom element name to prevent AI refusals
  name = sanitizeElementName(name);
  if (!name || name === 'Mysterious Element') { alert('Please enter a valid element name!'); return; }
  register(emoji,name,false);
  renderSidebar();
  // Consume the charge — each purchase is single-use
  if ((owned['custom']||0)>0) owned['custom']--;
  // Close modal directly (bypass the cancel-refund in closeCustomModal)
  const m = document.getElementById('custom-modal');
  m.style.display = 'none';
  m.classList.remove('open');
  document.getElementById('custom-emoji').value='';
  document.getElementById('custom-name').value='';
  renderShop();
}

// ─────────────────────────────────────────────────────────────
//  QUESTS
// ─────────────────────────────────────────────────────────────
function initQuestProgress() {
  QUESTS_DEF.forEach(q=>{ questProgress[q.id]=0; });
  SECRET_QUESTS_DEF.forEach(q=>{ questProgress[q.id]=0; });
  // Init chain progress
  CRAFT_CHAINS.forEach(c=>{
    chainStepProgress[c.id] = { completed: new Set(), revealed: 1 }; // first step always revealed
  });
}
function updateQuestProgress() {
  QUESTS_DEF.forEach(q=>{
    if (questDone.has(q.id)) return;
    let val=0;
    if (q.type==='crafts')   val=totalCrafts;
    if (q.type==='discov')   val=firstDiscs.length;
    if (q.type==='level')    val=level;
    if (q.type==='spent')    val=totalSpent;
    if (q.type==='elements') val=discovered.length;
    if (q.type==='prestige') val=prestige;
    if (q.type==='purchase') val=(owned[q.goal]||0)>0?1:0;
    questProgress[q.id]=val;
    // Check completion
    const goalVal = q.type==='purchase'?1:q.goal;
    if (val>=goalVal) completeQuest(q);
  });
  // Secret/chain quests
  SECRET_QUESTS_DEF.forEach(q=>{
    if (questDone.has(q.id)) return;
    let val=0;
    if (q.type==='secrets')    val=secretsCount;
    if (q.type==='chains')     val=chainStepsCompleted;
    if (q.type==='chain_full') val=chainFullCompleted;
    questProgress[q.id]=val;
    const goalVal=q.goal;
    if (val>=goalVal) completeQuest(q);
  });
}
function completeQuest(q) {
  if (questDone.has(q.id)) return;
  questDone.add(q.id);
  let tokRew = q.tokRew;
  let xpRew  = q.xpRew;
  if (prestige >= 8) { tokRew = Math.floor(tokRew * 1.5); xpRew = Math.floor(xpRew * 1.5); }
  tokens += tokRew; gainXP(xpRew);
  updateXPBar();
  showTokenToast(`📜 Quest done! +${tokRew}🪙${xpRew?` +${xpRew}XP`:''}`);
  renderQuests();
  renderPinned();
  autoSave();
}
function getAllQuestsDef() {
  return [...QUESTS_DEF, ...SECRET_QUESTS_DEF];
}
function renderQuests() {
  questInner.innerHTML='';
  const allQ=[...QUESTS_DEF, ...SECRET_QUESTS_DEF];
  const sorted=[...allQ].sort((a,b)=>{
    const ad=questDone.has(a.id)?1:0, bd=questDone.has(b.id)?1:0;
    return ad-bd;
  });
  sorted.forEach(q=>{
    const done=questDone.has(q.id);
    const pinned=pinnedQuests.has(q.id);
    const goalVal=q.type==='purchase'?1:q.goal;
    const prog=Math.min(goalVal,questProgress[q.id]||0);
    const pct=Math.round(prog/goalVal*100);

    const div=document.createElement('div');
    div.className='quest-item'+(done?' done':'')+(pinned&&!done?' pinned':'');
    div.innerHTML=`
      <div class="quest-header">
        <div class="quest-name">${done?'✅ ':''} ${q.name}</div>
        ${!done?`<div class="quest-pin" title="${pinned?'Unpin':'Pin'}">${pinned?'📌':'📍'}</div>`:''}
      </div>
      <div class="quest-desc">${q.desc}</div>
      <div class="quest-reward">
        <span class="reward-tok">+${q.tokRew} 🪙</span>
        ${q.xpRew?`<span class="reward-xp">+${q.xpRew} XP</span>`:''}
      </div>
      ${!done?`
      <div class="quest-prog">
        <div class="quest-prog-track"><div class="quest-prog-fill" style="width:${pct}%"></div></div>
        <div class="quest-prog-label">${prog} / ${goalVal}</div>
      </div>`:''}
    `;
    if (!done) {
      const pin=div.querySelector('.quest-pin');
      if (pin) pin.addEventListener('click', ev=>{
        ev.stopPropagation();
        if (pinnedQuests.has(q.id)) pinnedQuests.delete(q.id);
        else pinnedQuests.add(q.id);
        renderQuests(); renderPinned();
      });
    }
    questInner.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────
//  PINNED QUESTS OVERLAY
// ─────────────────────────────────────────────────────────────
function renderPinned() {
  pinnedOv.innerHTML='';
  pinnedQuests.forEach(qid=>{
    if (questDone.has(qid)) return;
    const q=getAllQuestsDef().find(x=>x.id===qid); if (!q) return;
    const goalVal=q.type==='purchase'?1:q.goal;
    const prog=Math.min(goalVal,questProgress[qid]||0);
    const pct=Math.round(prog/goalVal*100);
    const card=document.createElement('div');
    card.className='pinned-card';
    card.innerHTML=`
      <div class="pinned-card-name">📌 ${q.name}</div>
      <div style="font-size:11px;opacity:0.5">${prog} / ${goalVal}</div>
      <div class="pinned-card-bar"><div class="pinned-card-fill" style="width:${pct}%"></div></div>
    `;
    pinnedOv.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────
//  LEVEL REWARDS
// ─────────────────────────────────────────────────────────────
function grantLevelRewards(p, lvl) {
  const tiers = PRESTIGE_LEVEL_REWARDS[p];
  if (!tiers) return;
  const entry = tiers.find(e => e.lvl === lvl);
  if (!entry) return;
  let tokTotal = 0;
  const names = [];
  entry.r.forEach(r => {
    if (r.type === 'tokens') { tokens += r.amount; tokTotal += r.amount; names.push(`+${r.amount}🪙`); }
    if (r.type === 'pic')    { unlockedPics.add(r.id); names.push(`${r.icon} ${r.name}`); }
    if (r.type === 'bg')     { unlockedThemes.add(r.id); names.push(`${r.icon} ${r.name}`); }
  });
  if (names.length) showTokenToast(`🎁 Lv${lvl} Reward: ${names.slice(0,2).join(', ')}`);
}

// ─── Shop Sub-tab (unlocks is now its own main tab) ──────────
var shopSubTab = 'shop';
function switchShopSub(tab) { shopSubTab = tab; renderShop(); }

// ─────────────────────────────────────────────────────────────
//  UNLOCKS VIEW
// ─────────────────────────────────────────────────────────────
var PRESTIGE_REWARD_DESC = [
  null,
  'First prestige! Earn basic profile pics and board themes as you level up.',
  'The journey deepens. Better pics, neon grid, ocean board unlock.',
  'Elemental power. Dragons, volcanos, lava board await.',
  'Into the cosmos. Space themes and stellar profile pics.',
  'Myth and magic. Legendary weapons, magic board themes.',
  'Ancient mysteries. Divine symbols and ancient board art.',
  'Cyberpunk era. Robot pics, cyber and matrix boards.',
  'Shadow realm. Dark moon, void board, shadow aesthetic.',
  'Divine ascension. Celestial pics, heaven and radiant boards.',
  '👑 PRESTIGE MASTER. The ultimate rewards. Golden kingdoms, cosmic gold, and the legendary PRESTIGE MASTER board.',
];

function renderUnlocks() {
  // Show achievement web + existing prestige unlocks
  renderAchievementWeb();
  renderSecretUnlocksList();
  const selRow  = document.getElementById('prestige-sel-row');
  const listDiv = document.getElementById('unlocks-list');
  if (!selRow || !listDiv) return;

  // Build prestige selector buttons
  selRow.innerHTML = '';
  for (let p = 1; p <= 10; p++) {
    const btn = document.createElement('button');
    btn.className = 'psel-btn' +
      (p === currentUnlockPrestigeView ? ' active' : '') +
      (p > prestige + 1 ? ' locked' : '') +
      (p <= prestige ? ' done' : '');
    const stars = p >= 10 ? '👑' : '⭐'.repeat(Math.min(p,5)) + (p>5?`${p}`:'');
    btn.textContent = p >= 10 ? '👑 P10' : `P${p}`;
    btn.title = p > prestige + 1 ? `Requires Prestige ${p-1} first` : `View Prestige ${p} rewards`;
    if (p <= prestige + 1) {
      btn.addEventListener('click', () => {
        currentUnlockPrestigeView = p;
        renderUnlocks();
      });
    }
    selRow.appendChild(btn);
  }

  // Build the level reward list for the selected prestige
  listDiv.innerHTML = '';
  const p    = currentUnlockPrestigeView;
  const tiers = PRESTIGE_LEVEL_REWARDS[p] || [];
  const maxLvl = PRESTIGE_LEVELS[p] || 100;

  // Prestige banner
  const banner = document.createElement('div');
  banner.className = 'prestige-unlock-banner';
  const boost = PRESTIGE_BOOSTS[p];
  banner.innerHTML = `
    <div class="pub-badge">Prestige ${p}${p>=10?' — MASTER':''}</div>
    <div class="pub-title">${boost ? boost.icon + ' ' + boost.text : ''}</div>
    <div class="pub-desc">
      ${PRESTIGE_REWARD_DESC[p]}<br>
      <b>Level requirement to access:</b> Reach Level ${maxLvl} (in previous prestige or as current run).
    </div>`;
  listDiv.appendChild(banner);

  // Shop items that unlock at each level for this prestige
  const shopByLevel = {};
  SHOP.forEach(s => {
    if (s.prestige > p) return; // not available in this prestige
    if (!shopByLevel[s.lvl]) shopByLevel[s.lvl] = [];
    shopByLevel[s.lvl].push(s);
  });

  // Collect all levels with content (reward levels + shop unlock levels)
  const allLevels = new Set([...tiers.map(t => t.lvl), ...Object.keys(shopByLevel).map(Number)]);
  const sortedLevels = [...allLevels].sort((a,b) => a-b);

  // Determine current progress context
  const isCurrentPrestige = (p === prestige + 1 || (p === prestige && prestige > 0));
  const activeLvl = isCurrentPrestige ? level : (p <= prestige ? maxLvl : 0);

  sortedLevels.forEach(lvl => {
    const row = document.createElement('div');
    row.className = 'unlock-lvl-row';

    const isDone    = activeLvl >= lvl;
    const isCurrent = activeLvl < lvl && activeLvl >= lvl - 10 && isCurrentPrestige;
    const headerCls = isDone ? 'done' : isCurrent ? 'current' : '';

    const header = document.createElement('div');
    header.className = `unlock-lvl-header ${headerCls}`;
    header.innerHTML = isDone
      ? `<span class="lvl-check">✅</span> Level ${lvl}`
      : isCurrent
        ? `<span class="lvl-check">▶</span> Level ${lvl} <span style="font-size:10px;opacity:0.6">(up next)</span>`
        : `Level ${lvl}`;
    row.appendChild(header);

    const pills = document.createElement('div');
    pills.className = 'unlock-rewards-list';

    // Level rewards
    const rewardEntry = tiers.find(t => t.lvl === lvl);
    if (rewardEntry) {
      rewardEntry.r.forEach(r => {
        const pill = document.createElement('div');
        const isEarned   = isDone;
        const isEquipped = (r.type === 'pic' && activePic === r.id) ||
                           (r.type === 'bg' && document.body.classList.contains(r.id));
        pill.className = `unlock-pill${isEarned?' earned':''}${isEquipped?' equipped':''}${isEarned&&r.type==='pic'?' equip':''}`;
        pill.innerHTML = `<span class="up-icon">${r.icon}</span><span class="up-name">${r.name}</span>${isEquipped?'<span class="up-eq">EQUIPPED</span>':''}`;

        if (isEarned && r.type === 'pic') {
          pill.classList.add('equip');
          pill.title = 'Click to equip as profile pic';
          pill.addEventListener('click', () => {
            activePic = r.icon; // store emoji icon
            updateLevelHUD();
            renderUnlocks();
          });
        }
        if (isEarned && r.type === 'bg') {
          pill.classList.add('equip');
          pill.title = 'Click to apply board theme';
          pill.addEventListener('click', () => {
            applyTheme(r.id);
            renderUnlocks();
          });
        }
        pills.appendChild(pill);
      });
    }

    // Shop items that unlock at this level
    if (shopByLevel[lvl]) {
      shopByLevel[lvl].forEach(s => {
        const pill = document.createElement('div');
        const lvlMet   = level >= s.lvl;
        const prestMet = prestige >= s.prestige;
        const isAvail  = lvlMet && prestMet;
        pill.className = `unlock-pill shop-pill${isAvail?' available':''}`;
        pill.innerHTML = `<span class="up-icon">${s.icon}</span><span class="up-name">${s.name} <span style="font-size:10px;opacity:0.5">(Shop)</span></span>`;
        pill.title = s.desc;
        pills.appendChild(pill);
      });
    }

    row.appendChild(pills);
    listDiv.appendChild(row);
  });
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  LEVEL BAR COLOUR + LOGO + HOME TAB
// ─────────────────────────────────────────────────────────────
function getLevelBarTheme(lvl) {
  return LEVEL_BAR_THEMES.find(t => lvl >= t.min && lvl <= t.max) || LEVEL_BAR_THEMES[0];
}

function updateLogo() {
  const el = document.getElementById('logo');
  if (!el) return;
  const p = Math.min(prestige, 10);
  const info = PRESTIGE_LOGOS[p];
  el.textContent = info.text;
  el.className = info.cls;
}

function applyTextTheme(id) {
  activeTextTheme = id;
  const body = document.body;
  TEXT_THEMES.forEach(t => { if (t.cls) body.classList.remove(t.cls); });
  const theme = TEXT_THEMES.find(t => t.id === id);
  if (theme && theme.cls) body.classList.add(theme.cls);
  // refresh Home swatch active states
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function renderHome() {
  // ── Text colour theme cards ──
  const swatchBox = document.getElementById('text-swatches');
  if (swatchBox) {
    swatchBox.innerHTML = '';
    TEXT_THEMES.forEach(t => {
      const meetsLevel    = level >= t.reqLevel;
      const meetsPrestige = prestige >= t.reqPrestige;
      const isUnlocked    = t.reqTokens === 0 || unlockedTextThemes.has(t.id);
      const canAfford     = tokens >= t.reqTokens;
      const canUnlock     = meetsLevel && meetsPrestige && !isUnlocked && canAfford;
      const isLocked      = !meetsLevel || !meetsPrestige || !isUnlocked;
      const isActive      = activeTextTheme === t.id;
      const isRainbow     = t.swatch === 'rainbow';

      const card = document.createElement('div');
      card.className = 'tc-swatch-card' +
        (isActive  ? ' tc-active' : '') +
        (isLocked  ? ' tc-locked' : '');
      card.style.background = isRainbow
        ? 'linear-gradient(135deg,#ff000022,#ff770022,#ffff0022,#00cc0022,#0088ff22,#8800ff22)'
        : t.swatch + '22';
      card.style.borderColor = isLocked ? 'transparent' : (isActive ? '' : t.swatch + '55');
      card.innerHTML = `
        <span style="font-size:18px">${t.emoji}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:${isRainbow ? '#888' : t.swatch}">${t.name}</div>
          ${isLocked ? `<div class="tc-req">${!meetsLevel ? '🔒 Lv '+t.reqLevel : ''}${!meetsPrestige ? ' ⭐P'+t.reqPrestige : ''}${isUnlocked||t.reqTokens===0 ? '' : ' 🪙'+t.reqTokens.toLocaleString()}</div>` : ''}
          ${!isLocked && !isUnlocked && t.reqTokens > 0 ? `<div class="tc-req" style="color:var(--gold)">🪙 Unlock: ${t.reqTokens.toLocaleString()} tokens</div>` : ''}
        </div>
        ${isActive ? '<span style="font-size:14px;color:var(--accent)">✓</span>' : ''}
        ${isLocked ? '<span class="logo-lock-icon">🔒</span>' : ''}
      `;
      if (!isLocked && isUnlocked) {
        card.addEventListener('click', () => applyTextTheme(t.id));
      } else if (canUnlock) {
        card.classList.remove('tc-locked');
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          if (tokens >= t.reqTokens) {
            tokens -= t.reqTokens; totalSpent += t.reqTokens;
            unlockedTextThemes.add(t.id);
            applyTextTheme(t.id);
            renderHome();
            updateXPBar();
          } else {
            showErr('Not enough tokens! Need 🪙' + t.reqTokens.toLocaleString());
          }
        });
      }
      swatchBox.appendChild(card);
    });
  }

  // ── Level bar colour legend ──
  const barList = document.getElementById('bar-theme-list');
  if (barList) {
    barList.innerHTML = '';
    const theme = getLevelBarTheme(level);
    LEVEL_BAR_THEMES.forEach(t => {
      const unlocked  = level >= t.min;
      const isCurrent = t.id === theme.id;
      const div = document.createElement('div');
      div.className = 'bar-theme-item' + (unlocked ? ' unlocked' : ' locked') + (isCurrent ? ' current' : '');
      const swatchStyle = t.rainbow
        ? 'background:linear-gradient(90deg,#ff0000,#ff7700,#ffff00,#00cc00,#0088ff,#8800ff,#ff00cc)'
        : `background:linear-gradient(90deg,${t.grad[0]},${t.grad[1]})`;
      div.innerHTML = `
        <div class="bar-theme-swatch" style="${swatchStyle}"></div>
        <div class="bar-theme-name">${t.name}${isCurrent ? ' ✓' : ''}</div>
        <div class="bar-theme-range">${t.max === Infinity ? 'Lv '+t.min+'+' : 'Lv '+t.min+'–'+t.max}</div>
      `;
      barList.appendChild(div);
    });
  }

  // ── Logo gallery ──
  const logoGallery = document.getElementById('home-logo-gallery');
  if (logoGallery) {
    logoGallery.innerHTML = '';
    PRESTIGE_LOGOS.forEach((logo, p) => {
      const isUnlocked = prestige >= p;
      const isCurrent  = Math.min(prestige, 10) === p;
      const reqLvl     = p === 0 ? 1 : PRESTIGE_LEVELS[p];
      const card = document.createElement('div');
      card.className = 'logo-card' +
        (isCurrent  ? ' logo-current'  : '') +
        (isUnlocked && !isCurrent ? ' logo-unlocked' : '') +
        (!isUnlocked ? ' logo-locked'  : '');
      card.innerHTML = `
        <span class="logo-lock-icon">${isUnlocked ? (isCurrent ? '▶' : '✅') : '🔒'}</span>
        <div class="logo-card-text">${logo.text}</div>
        <div class="logo-card-req">${p === 0 ? 'Default' : 'P'+p+' · Lv '+reqLvl}</div>
      `;
      logoGallery.appendChild(card);
    });
  }
}


// ─────────────────────────────────────────────────────────────
//  MILESTONES
// ─────────────────────────────────────────────────────────────
function initMilestonesProgress() {
  MILESTONES.forEach(m => { msProgress[m.id] = 0; });
}
function updateMilestonesProgress() {
  MILESTONES.forEach(m => {
    if (milestonesDone.has(m.id)) return;
    let val = 0;
    if (m.type === 'crafts')   val = totalCrafts;
    if (m.type === 'discov')   val = firstDiscs.length;
    if (m.type === 'elements') val = discovered.length;
    if (m.type === 'level')    val = level;
    if (m.type === 'tokens')   val = totalTokensEarned;
    if (m.type === 'spent')    val = totalSpent;
    if (m.type === 'prestige') val = prestige;
    msProgress[m.id] = val;
    if (val >= m.goal) completeMilestone(m);
  });
}
function completeMilestone(m) {
  if (milestonesDone.has(m.id)) return;
  milestonesDone.add(m.id);
  let tokRew = m.tokRew, xpRew = m.xpRew;
  if (prestige >= 8) { tokRew = Math.floor(tokRew * 1.5); xpRew = Math.floor(xpRew * 1.5); }
  tokens += tokRew; totalTokensEarned += tokRew;
  if (xpRew > 0) gainXP(xpRew);
  updateXPBar();
  showTokenToast('🏆 Milestone: ' + m.name + '! +' + tokRew + '🪙' + (xpRew ? ' +' + xpRew + 'XP' : ''));
  if (menuTab === 'milestones' || document.getElementById('milestones-panel').style.display !== 'none') renderMilestones();
  autoSave();
}
function renderMilestones() {
  const inner = document.getElementById('milestones-inner');
  if (!inner) return;
  inner.innerHTML = '';

  const sections = [
    { title:'⚗️ Crafting',    types:['crafts']           },
    { title:'✨ Discoveries', types:['discov','elements'] },
    { title:'📈 Levels',      types:['level']             },
    { title:'🪙 Tokens',      types:['tokens']            },
    { title:'⭐ Prestige',    types:['prestige']          },
    { title:'🛒 Spending',    types:['spent']             },
  ];

  sections.forEach(sec => {
    const secMs = MILESTONES.filter(m => sec.types.includes(m.type));
    if (!secMs.length) return;
    const h = document.createElement('div');
    h.className = 'ms-section-title';
    h.textContent = sec.title;
    inner.appendChild(h);

    secMs.forEach(m => {
      const done   = milestonesDone.has(m.id);
      const prog   = Math.min(m.goal, msProgress[m.id] || 0);
      const pct    = Math.round(prog / m.goal * 100);
      const isNext = !done && secMs.filter(x => !milestonesDone.has(x.id))[0]?.id === m.id;

      const div = document.createElement('div');
      div.className = 'milestone-item' + (done ? ' ms-done' : '') + (isNext ? ' ms-next' : '');
      div.innerHTML =
        '<div class="ms-icon">' + (done ? '✅' : m.icon) + '</div>' +
        '<div class="ms-body">' +
          '<div class="ms-name">' + m.name + '</div>' +
          '<div class="ms-desc">' + m.desc + '</div>' +
          '<div class="ms-rewards">' +
            '<span class="ms-tok">+' + m.tokRew.toLocaleString() + ' 🪙</span>' +
            (m.xpRew ? '<span class="ms-xp">+' + m.xpRew.toLocaleString() + ' XP</span>' : '') +
          '</div>' +
          (!done ?
            '<div class="ms-prog">' +
              '<div class="ms-bar"><div class="ms-fill" style="width:' + pct + '%"></div></div>' +
              '<div class="ms-lbl">' + prog.toLocaleString() + ' / ' + m.goal.toLocaleString() + '</div>' +
            '</div>' : '') +
        '</div>' +
        (done ? '<span class="ms-badge">DONE</span>' : '');
      inner.appendChild(div);
    });
  });
}



// ═══════════════════════════════════════════════════════════════
//  ACHIEVEMENT WEB SYSTEM
// ═══════════════════════════════════════════════════════════════

// --- Achievement Node Definitions ---
// type: 'crafts'|'discov'|'elements'|'level'|'tokens'|'prestige'|'spent'|'secret'
// status: computed at render time
// secret: if true, hidden as ??? unless prerequisites done OR secret unlocked
// secretTrigger: element name(s) that must be discovered to unlock
const ACH_NODES = [
  // ── CRAFTING column ──
  {id:'ac_c1',  cat:'craft',   icon:'⚗️',  name:'First Craft',     desc:'Perform your first combination.',              goalType:'crafts',   goal:1,     x:80,   y:60,  req:[] },
  {id:'ac_c2',  cat:'craft',   icon:'🧪',  name:'Apprentice',      desc:'Craft 10 elements.',                           goalType:'crafts',   goal:10,    x:80,   y:150, req:['ac_c1'] },
  {id:'ac_c3',  cat:'craft',   icon:'🔬',  name:'Experimenter',    desc:'Craft 50 elements.',                           goalType:'crafts',   goal:50,    x:80,   y:240, req:['ac_c2'] },
  {id:'ac_c4',  cat:'craft',   icon:'💡',  name:'Inventor',        desc:'Craft 100 elements.',                          goalType:'crafts',   goal:100,   x:80,   y:330, req:['ac_c3'] },
  {id:'ac_c5',  cat:'craft',   icon:'🏭',  name:'Factory Owner',   desc:'Craft 500 elements.',                          goalType:'crafts',   goal:500,   x:80,   y:420, req:['ac_c4'] },
  {id:'ac_c6',  cat:'craft',   icon:'🤯',  name:'Mad Scientist',   desc:'Craft 1,000 elements.',                        goalType:'crafts',   goal:1000,  x:80,   y:510, req:['ac_c5'] },
  {id:'ac_c7',  cat:'craft',   icon:'🧬',  name:'Science Overlord',desc:'Craft 5,000 elements.',                        goalType:'crafts',   goal:5000,  x:80,   y:600, req:['ac_c6'] },
  {id:'ac_c8',  cat:'craft',   icon:'🌌',  name:'Infinite Crafter',desc:'Craft 10,000 elements.',                       goalType:'crafts',   goal:10000, x:80,   y:690, req:['ac_c7'] },

  // ── DISCOVERY column ──
  {id:'ac_d1',  cat:'disc',    icon:'✨',  name:'First Discovery', desc:'Make your first first-discovery.',             goalType:'discov',   goal:1,     x:230,  y:60,  req:[] },
  {id:'ac_d2',  cat:'disc',    icon:'🔭',  name:'Explorer',        desc:'Make 5 first discoveries.',                   goalType:'discov',   goal:5,     x:230,  y:150, req:['ac_d1'] },
  {id:'ac_d3',  cat:'disc',    icon:'🗺️', name:'Pioneer',         desc:'Make 25 first discoveries.',                  goalType:'discov',   goal:25,    x:230,  y:240, req:['ac_d2'] },
  {id:'ac_d4',  cat:'disc',    icon:'📚',  name:'Archivist',       desc:'Discover 100 unique elements.',               goalType:'elements', goal:100,   x:230,  y:330, req:['ac_d3'] },
  {id:'ac_d5',  cat:'disc',    icon:'📖',  name:'Grand Archivist', desc:'Unlock 500 unique elements.',                 goalType:'elements', goal:500,   x:230,  y:420, req:['ac_d4'] },
  {id:'ac_d6',  cat:'disc',    icon:'🏛️', name:'Librarian',       desc:'Unlock 1,000 unique elements.',               goalType:'elements', goal:1000,  x:230,  y:510, req:['ac_d5'] },

  // ── ECONOMY column ──
  {id:'ac_e1',  cat:'econ',    icon:'🪙',  name:'First Haul',      desc:'Earn 100 tokens total.',                      goalType:'tokens',   goal:100,   x:380,  y:60,  req:[] },
  {id:'ac_e2',  cat:'econ',    icon:'💰',  name:'Coin Hoarder',    desc:'Earn 1,000 tokens total.',                    goalType:'tokens',   goal:1000,  x:380,  y:150, req:['ac_e1'] },
  {id:'ac_e3',  cat:'econ',    icon:'🏦',  name:'Banker',          desc:'Earn 10,000 tokens total.',                   goalType:'tokens',   goal:10000, x:380,  y:240, req:['ac_e2'] },
  {id:'ac_e4',  cat:'econ',    icon:'🤑',  name:'Millionaire',     desc:'Earn 100,000 tokens total.',                  goalType:'tokens',   goal:100000,x:380,  y:330, req:['ac_e3'] },
  {id:'ac_e5',  cat:'econ',    icon:'🛒',  name:'First Purchase',  desc:'Spend 50 tokens in the shop.',                goalType:'spent',    goal:50,    x:380,  y:420, req:['ac_e1'] },
  {id:'ac_e6',  cat:'econ',    icon:'🛍️', name:'Shopaholic',      desc:'Spend 500 tokens in the shop.',               goalType:'spent',    goal:500,   x:380,  y:510, req:['ac_e5'] },
  {id:'ac_e7',  cat:'econ',    icon:'💸',  name:'Big Spender',     desc:'Spend 5,000 tokens in the shop.',             goalType:'spent',    goal:5000,  x:380,  y:600, req:['ac_e6'] },

  // ── LEVELING column ──
  {id:'ac_l1',  cat:'level',   icon:'📈',  name:'Level 5',         desc:'Reach Level 5.',                              goalType:'level',    goal:5,     x:530,  y:60,  req:[] },
  {id:'ac_l2',  cat:'level',   icon:'🎯',  name:'Level 10',        desc:'Reach Level 10.',                             goalType:'level',    goal:10,    x:530,  y:150, req:['ac_l1'] },
  {id:'ac_l3',  cat:'level',   icon:'🎖️', name:'Level 25',        desc:'Reach Level 25.',                             goalType:'level',    goal:25,    x:530,  y:240, req:['ac_l2'] },
  {id:'ac_l4',  cat:'level',   icon:'🏅',  name:'Level 50',        desc:'Reach Level 50.',                             goalType:'level',    goal:50,    x:530,  y:330, req:['ac_l3'] },
  {id:'ac_l5',  cat:'level',   icon:'🥇',  name:'Level 100',       desc:'Reach Level 100.',                            goalType:'level',    goal:100,   x:530,  y:420, req:['ac_l4'] },
  {id:'ac_l6',  cat:'level',   icon:'💎',  name:'Level 250',       desc:'Reach Level 250.',                            goalType:'level',    goal:250,   x:530,  y:510, req:['ac_l5'] },
  {id:'ac_l7',  cat:'level',   icon:'👑',  name:'Level 500',       desc:'Reach Level 500.',                            goalType:'level',    goal:500,   x:530,  y:600, req:['ac_l6'] },
  {id:'ac_l8',  cat:'level',   icon:'🌟',  name:'Level 1000',      desc:'Reach Level 1000!',                           goalType:'level',    goal:1000,  x:530,  y:690, req:['ac_l7'] },

  // ── PRESTIGE column ──
  {id:'ac_p1',  cat:'prest',   icon:'⭐',  name:'First Prestige',  desc:'Perform your first Prestige.',                goalType:'prestige', goal:1,     x:680,  y:150, req:['ac_l5'] },
  {id:'ac_p2',  cat:'prest',   icon:'🌟',  name:'Double Prestige', desc:'Prestige 2 times.',                           goalType:'prestige', goal:2,     x:680,  y:240, req:['ac_p1'] },
  {id:'ac_p3',  cat:'prest',   icon:'💫',  name:'Triple Prestige', desc:'Prestige 3 times.',                           goalType:'prestige', goal:3,     x:680,  y:330, req:['ac_p2'] },
  {id:'ac_p4',  cat:'prest',   icon:'✨',  name:'Halfway There',   desc:'Prestige 5 times.',                           goalType:'prestige', goal:5,     x:680,  y:420, req:['ac_p3'] },
  {id:'ac_p5',  cat:'prest',   icon:'💥',  name:'Elite',           desc:'Prestige 7 times.',                           goalType:'prestige', goal:7,     x:680,  y:510, req:['ac_p4'] },
  {id:'ac_p6',  cat:'prest',   icon:'👑',  name:'Prestige Master', desc:'Reach Prestige 10.',                          goalType:'prestige', goal:10,    x:680,  y:600, req:['ac_p5'] },

  // ── SECRET achievements (hidden until prerequisites crafted) ──
  // Each secret has secretTrigger: array of element names that must all be discovered
  {id:'sc_party',    cat:'secret', icon:'🎉', name:'Disco Master',       desc:'Craft Party to unlock the Disco visual theme!',          goalType:'secret', goal:1, x:870, y:80,  req:[], secret:true, secretTrigger:['Party'] ,               reward:{type:'theme',id:'theme_disco',tokens:500,desc:'🎉 Disco theme unlocked!'} },
  {id:'sc_universe', cat:'secret', icon:'🌌', name:'Cosmos Walker',      desc:'Craft Universe or Galaxy to unlock the Cosmos theme.',   goalType:'secret', goal:1, x:1020,y:80,  req:[], secret:true, secretTrigger:['Universe','Galaxy'],       reward:{type:'theme',id:'theme_cosmos',tokens:800,desc:'🌌 Cosmos theme unlocked!'} },
  {id:'sc_dragon',   cat:'secret', icon:'🐉', name:'Dragon Tamer',       desc:'Craft Dragon and Castle.',                               goalType:'secret', goal:1, x:870, y:200, req:[], secret:true, secretTrigger:['Dragon','Castle'],          reward:{type:'tokens',tokens:1500,desc:'🐉 Dragon Tamer bonus!'} },
  {id:'sc_robot',    cat:'secret', icon:'🤖', name:'Rise of the Machine', desc:'Craft Robot and Internet.',                              goalType:'secret', goal:1, x:1020,y:200, req:[], secret:true, secretTrigger:['Robot','Internet'],          reward:{type:'tokens',tokens:1200,desc:'🤖 Rise of Machines bonus!'} },
  {id:'sc_ocean',    cat:'secret', icon:'🌊', name:"Ocean's Depths",    desc:'Craft Ocean and Mermaid.',                              goalType:'secret', goal:1, x:870, y:320, req:[], secret:true, secretTrigger:['Ocean','Mermaid'],           reward:{type:'tokens',tokens:1000,desc:"🌊 Ocean's Depths bonus!"} },
  {id:'sc_volcano',  cat:'secret', icon:'🌋', name:'Pyroclast',          desc:'Craft Volcano and Dinosaur.',                            goalType:'secret', goal:1, x:1020,y:320, req:[], secret:true, secretTrigger:['Volcano','Dinosaur'],        reward:{type:'tokens',tokens:1000,desc:'🌋 Pyroclast bonus!'} },
  {id:'sc_time',     cat:'secret', icon:'⏰', name:'Time Lord',          desc:'Craft Time Machine.',                                    goalType:'secret', goal:1, x:870, y:440, req:[], secret:true, secretTrigger:['Time Machine'],              reward:{type:'tokens',tokens:2000,desc:'⏰ Time Lord unlocked!'} },
  {id:'sc_music',    cat:'secret', icon:'🎵', name:'Maestro',            desc:'Craft Symphony and Jazz.',                               goalType:'secret', goal:1, x:1020,y:440, req:[], secret:true, secretTrigger:['Symphony','Jazz'],           reward:{type:'tokens',tokens:1500,desc:'🎵 Maestro bonus!'} },
  {id:'sc_space',    cat:'secret', icon:'🚀', name:'Astronaut',          desc:'Craft Rocket and Moon.',                                 goalType:'secret', goal:1, x:870, y:560, req:[], secret:true, secretTrigger:['Rocket','Moon'],             reward:{type:'tokens',tokens:2000,desc:'🚀 Astronaut bonus!'} },
  {id:'sc_myth',     cat:'secret', icon:'🦄', name:'Mythic Realm',       desc:'Craft Unicorn and Phoenix.',                             goalType:'secret', goal:1, x:1020,y:560, req:[], secret:true, secretTrigger:['Unicorn','Phoenix'],         reward:{type:'tokens',tokens:3000,desc:'🦄 Mythic Realm bonus!'} },
  {id:'sc_alchemy',  cat:'secret', icon:'🧪', name:'The Alchemist',      desc:"Craft Gold and Philosopher's Stone.",                  goalType:'secret', goal:1, x:870, y:680, req:[], secret:true, secretTrigger:['Gold','Philosopher Stone'],  reward:{type:'tokens',tokens:5000,desc:'🧪 Alchemy bonus!'} },
  {id:'sc_ai',       cat:'secret', icon:'🧠', name:'AI Singularity',     desc:'Craft AI and Consciousness.',                            goalType:'secret', goal:1, x:1020,y:680, req:[], secret:true, secretTrigger:['AI','Consciousness'],        reward:{type:'tokens',tokens:4000,desc:'🧠 AI Singularity bonus!'} },
  {id:'sc_weather',  cat:'secret', icon:'⛈️', name:'Storm Caller',       desc:'Craft Hurricane and Tornado.',                           goalType:'secret', goal:1, x:1170,y:80,  req:[], secret:true, secretTrigger:['Hurricane','Tornado'],       reward:{type:'tokens',tokens:800,desc:'⛈️ Storm Caller bonus!'} },
  {id:'sc_food',     cat:'secret', icon:'🍕', name:'Master Chef',        desc:'Craft Pizza and Sushi.',                                 goalType:'secret', goal:1, x:1170,y:200, req:[], secret:true, secretTrigger:['Pizza','Sushi'],             reward:{type:'tokens',tokens:600,desc:'🍕 Master Chef bonus!'} },
  {id:'sc_life',     cat:'secret', icon:'🌱', name:'Life Itself',        desc:'Craft Evolution and DNA.',                               goalType:'secret', goal:1, x:1170,y:320, req:[], secret:true, secretTrigger:['Evolution','DNA'],           reward:{type:'tokens',tokens:3000,desc:'🌱 Life Itself bonus!'} },
  {id:'sc_city',     cat:'secret', icon:'🏙️', name:'City Builder',      desc:'Craft City and Government.',                             goalType:'secret', goal:1, x:1170,y:440, req:[], secret:true, secretTrigger:['City','Government'],         reward:{type:'tokens',tokens:1200,desc:'🏙️ City Builder bonus!'} },
  {id:'sc_chaos',    cat:'secret', icon:'😈', name:'Chaos Theory',       desc:'Craft Chaos and Order.',                                 goalType:'secret', goal:1, x:1170,y:560, req:[], secret:true, secretTrigger:['Chaos','Order'],             reward:{type:'tokens',tokens:2500,desc:'😈 Chaos Theory bonus!'} },
  {id:'sc_love',     cat:'secret', icon:'❤️', name:'Heartfelt',          desc:'Craft Love and Heart.',                                  goalType:'secret', goal:1, x:1170,y:680, req:[], secret:true, secretTrigger:['Love','Heart'],              reward:{type:'tokens',tokens:800,desc:'❤️ Heartfelt bonus!'} },
  {id:'sc_war',      cat:'secret', icon:'⚔️', name:'Warmonger',          desc:'Craft War and Peace.',                                   goalType:'secret', goal:1, x:1320,y:80,  req:[], secret:true, secretTrigger:['War','Peace'],               reward:{type:'tokens',tokens:1000,desc:'⚔️ Warmonger bonus!'} },
  {id:'sc_dead',     cat:'secret', icon:'💀', name:'Necromancer',        desc:'Craft Undead and Grave.',                                goalType:'secret', goal:1, x:1320,y:200, req:[], secret:true, secretTrigger:['Undead','Grave'],            reward:{type:'tokens',tokens:1500,desc:'💀 Necromancer bonus!'} },
  {id:'sc_sci',      cat:'secret', icon:'⚛️', name:'Physicist',          desc:'Craft Atom and Black Hole.',                             goalType:'secret', goal:1, x:1320,y:320, req:[], secret:true, secretTrigger:['Atom','Black Hole'],         reward:{type:'tokens',tokens:3500,desc:'⚛️ Physicist bonus!'} },
  {id:'sc_art',      cat:'secret', icon:'🎨', name:'Artist',             desc:'Craft Painting and Music.',                              goalType:'secret', goal:1, x:1320,y:440, req:[], secret:true, secretTrigger:['Painting','Music'],          reward:{type:'tokens',tokens:700,desc:'🎨 Artist bonus!'} },
  {id:'sc_legend',   cat:'secret', icon:'🏆', name:'Legend',             desc:'Craft Hero and Villain.',                                goalType:'secret', goal:1, x:1320,y:560, req:[], secret:true, secretTrigger:['Hero','Villain'],            reward:{type:'tokens',tokens:2000,desc:'🏆 Legend bonus!'} },
  {id:'sc_dream',    cat:'secret', icon:'💤', name:'Dream Weaver',       desc:'Craft Dream and Nightmare.',                             goalType:'secret', goal:1, x:1320,y:680, req:[], secret:true, secretTrigger:['Dream','Nightmare'],         reward:{type:'tokens',tokens:1800,desc:'💤 Dream Weaver bonus!'} },
  {id:'sc_nature',   cat:'secret', icon:'🌿', name:'Nature Whisperer',   desc:'Craft Forest and Animal.',                               goalType:'secret', goal:1, x:1470,y:80,  req:[], secret:true, secretTrigger:['Forest','Animal'],           reward:{type:'tokens',tokens:600,desc:'🌿 Nature Whisperer bonus!'} },
  {id:'sc_internet', cat:'secret', icon:'💻', name:'Internet Pioneer',   desc:'Craft Internet and Hacker.',                             goalType:'secret', goal:1, x:1470,y:200, req:[], secret:true, secretTrigger:['Internet','Hacker'],         reward:{type:'tokens',tokens:1200,desc:'💻 Internet Pioneer bonus!'} },
  {id:'sc_god',      cat:'secret', icon:'😇', name:'Divine Touch',       desc:'Craft God and Human.',                                   goalType:'secret', goal:1, x:1470,y:320, req:[], secret:true, secretTrigger:['God','Human'],               reward:{type:'tokens',tokens:10000,desc:'😇 Divine Touch bonus!'} },
  {id:'sc_nuke',     cat:'secret', icon:'☢️', name:'Atomic Power',       desc:'Craft Nuclear and Energy.',                              goalType:'secret', goal:1, x:1470,y:440, req:[], secret:true, secretTrigger:['Nuclear','Energy'],          reward:{type:'tokens',tokens:3000,desc:'☢️ Atomic Power bonus!'} },
  {id:'sc_zombie',   cat:'secret', icon:'🧟', name:'Zombie Apocalypse',  desc:'Craft Zombie and Virus.',                                goalType:'secret', goal:1, x:1470,y:560, req:[], secret:true, secretTrigger:['Zombie','Virus'],            reward:{type:'tokens',tokens:2000,desc:'🧟 Zombie Apocalypse bonus!'} },
  {id:'sc_magic2',   cat:'secret', icon:'🪄', name:'Supreme Mage',       desc:'Craft Magic and Spell.',                                 goalType:'secret', goal:1, x:1470,y:680, req:[], secret:true, secretTrigger:['Magic','Spell'],             reward:{type:'tokens',tokens:1500,desc:'🪄 Supreme Mage bonus!'} },
];

// Extra themes for secrets
const SECRET_THEMES = {
  theme_disco: `
    .theme-disco #canvas {
      background:radial-gradient(ellipse at center,#1a0033 0%,#000 70%);
      background-image:radial-gradient(4px 4px at 20% 30%,rgba(255,0,200,0.8),transparent),
        radial-gradient(4px 4px at 60% 20%,rgba(0,200,255,0.8),transparent),
        radial-gradient(3px 3px at 80% 70%,rgba(255,255,0,0.8),transparent),
        radial-gradient(2px 2px at 40% 80%,rgba(0,255,0,0.8),transparent);
    }
    .theme-disco .instance { border-color: hsl(calc(var(--ach-time,0)*30),70%,60%) !important; }
  `,
  theme_cosmos: `
    .theme-cosmos #canvas {
      background:radial-gradient(ellipse at 30% 50%,#0a003f 0%,#000010 60%,#000 100%);
      background-image:
        radial-gradient(2px 2px at 10% 20%,white,transparent),
        radial-gradient(1px 1px at 30% 50%,rgba(200,180,255,0.9),transparent),
        radial-gradient(3px 3px at 55% 35%,rgba(150,200,255,0.7),transparent),
        radial-gradient(1px 1px at 75% 70%,white,transparent),
        radial-gradient(2px 2px at 90% 40%,rgba(255,200,100,0.8),transparent);
    }
  `
};

// Inject secret theme styles
(function(){
  const s = document.createElement('style');
  s.textContent = Object.values(SECRET_THEMES).join('\n');
  document.head.appendChild(s);
})();

// (secretsUnlocked, ACH_FILTER, chainStepProgress, chainStepsCompleted,
//  chainFullCompleted, secretsCount, generatedSecretsAdded declared before BOOT)


// Called whenever elements are discovered — check secret triggers + chains
function checkSecretTriggers(newElementName) {
  let secretJustUnlocked = false;
  ACH_NODES.forEach(n => {
    if (!n.secret || secretsUnlocked[n.id]) return;
    if (!n.secretTrigger || !n.secretTrigger.length) return;
    const allMet = n.secretTrigger.every(name =>
      discovered.some(e => e.name.toLowerCase() === name.toLowerCase())
    );
    if (allMet) {
      secretsUnlocked[n.id] = true;
      secretsCount++;
      secretJustUnlocked = true;
      const r = n.reward || {};
      if (r.tokens) { tokens += r.tokens; totalTokensEarned += r.tokens; }
      // Also give XP for secrets
      const xpBonus = r.tokens ? Math.floor(r.tokens * 0.15) : 50;
      gainXP(xpBonus);
      if (r.type === 'theme' && r.id) {
        applyTheme(r.id);
        document.body.classList.add(r.id.replace('theme_','theme-'));
      }
      showSecretToast('🔐 ' + n.name + ' unlocked! ' + (r.desc||''));
      updateXPBar();
      const achWrap = document.getElementById('ach-web-wrap');
      if (achWrap && achWrap.offsetParent) renderAchievementWeb();
      // Refresh secret unlocks section if visible
      renderSecretUnlocksList();
      // Maybe generate new secrets via API
      if (secretsCount > 0 && secretsCount % 5 === 0 && generatedSecretsAdded < 15) {
        setTimeout(generateMoreSecrets, 2000);
      }
    }
  });
  // Check crafting chains
  checkChainProgress(newElementName);
  if (secretJustUnlocked) {
    updateQuestProgress();
    renderQuests();
    renderPinned();
  }
}

function checkChainProgress(newElementName) {
  CRAFT_CHAINS.forEach(chain => {
    const prog = chainStepProgress[chain.id];
    if (!prog) return;
    chain.steps.forEach((step, idx) => {
      if (prog.completed.has(idx)) return; // already done
      if (idx > prog.revealed - 1) return; // not yet revealed
      // Check if this step's element was just discovered
      const match = step.name.toLowerCase() === newElementName.toLowerCase();
      if (match) {
        prog.completed.add(idx);
        chainStepsCompleted++;
        // Grant reward
        tokens += step.tokRew;
        totalTokensEarned += step.tokRew;
        gainXP(step.xpRew);
        updateXPBar();
        showChainToast(`⛓️ Chain step: ${step.name}! +${step.tokRew}🪙 +${step.xpRew}XP`);
        // Reveal next step
        if (idx + 1 < chain.steps.length) {
          prog.revealed = Math.max(prog.revealed, idx + 2);
        }
        // Check if full chain completed
        if (prog.completed.size === chain.steps.length) {
          chainFullCompleted++;
          const bonus = 500 * chain.steps.length;
          tokens += bonus;
          totalTokensEarned += bonus;
          gainXP(bonus * 2);
          showTokenToast(`🏆 Chain Complete: ${chain.name}! +${bonus}🪙!`);
        }
        updateQuestProgress();
        renderQuests();
        renderChains();
      }
    });
  });
}

// ─── Toast helpers ──
var secretToastTimer = null;
function showSecretToast(msg) {
  const el = document.getElementById('secret-toast');
  if (!el) { showTokenToast(msg); return; }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(secretToastTimer);
  secretToastTimer = setTimeout(()=>el.classList.remove('on'), 3500);
}
var chainToastTimer = null;
function showChainToast(msg) {
  const el = document.getElementById('chain-toast');
  if (!el) { showTokenToast(msg); return; }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(chainToastTimer);
  chainToastTimer = setTimeout(()=>el.classList.remove('on'), 3000);
}

// ─── Generate more secrets ──
async function generateMoreSecrets() {
  if (!hasAnyApiKey()) return;
  const currentCount = ACH_NODES.filter(n=>n.secret).length;
  const existingNames = ACH_NODES.filter(n=>n.secret).map(n=>n.name).join(', ') || 'none yet';
  const prompt = `You are generating hidden "secret achievement" nodes for the achievement web in Infinite Craft, an idle crafting game.
Secrets are discovered when the player crafts two specific elements together — triggers are hidden until after unlocking.

ALREADY EXISTS — do NOT repeat these names: ${existingNames}

Generate 4 NEW secret achievements in this EXACT JSON format (array only, no markdown, no preamble):
[{"icon":"🔥","name":"Short Title","desc":"Flavour text revealed after unlock.","triggers":["ElementA","ElementB"],"tokens":2500}]

RULES:
- icon: single thematic emoji
- name: 2–4 words, Title Case, mysterious or exciting
- desc: one evocative sentence shown AFTER unlock (can be cryptic, funny, or flavourful)
- triggers: EXACTLY 2 craftable element names that thematically match the name
  Examples: "Jurassic Secret" → ["Dinosaur","Island"], "Robot Uprising" → ["Robot","Army"]
  Good trigger elements: Volcano, Dragon, AI, Titanic, Black Hole, Meme, Zeus, Tornado, Pharaoh, Unicorn, Ninja, Pirate, Galaxy, etc.
- tokens: 500–20000 (scale with how clever/rare the combo feels)
- Mix pop culture, mythology, internet culture, science, history, and absurdism
- Each secret should feel like a delightful Easter egg

Return ONLY the JSON array.`;
  try {
    const raw = await callLLM('generate', prompt, 400, 1.0);
    const arr = JSON.parse(raw.replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return;
    let added = 0;
    arr.forEach((item,i) => {
      if (!item.icon||!item.name||!Array.isArray(item.triggers)) return;
      if (item.triggers.length < 1) return;
      const id = `sc_gen_${Date.now()}_${i}`;
      // Position in a new column
      const col = Math.floor(currentCount / 8);
      const row = (ACH_NODES.filter(n=>n.secret).length % 8);
      const newNode = {
        id, cat:'secret', icon:item.icon, name:item.name,
        desc: item.desc||`Craft ${item.triggers.join(' and ')}.`,
        goalType:'secret', goal:1,
        x: 1620 + col*150, y: 80 + row*120,
        req:[], secret:true,
        secretTrigger: item.triggers,
        reward:{type:'tokens', tokens:item.tokens||1000, desc:`${item.icon} ${item.name} bonus!`}
      };
      ACH_NODES.push(newNode);
      generatedSecretsAdded++;
      added++;
    });
    if (added > 0) {
      showSecretToast(`🤖 ${added} new secret unlocks generated!`);
      renderSecretUnlocksList();
      const achWrap = document.getElementById('ach-web-wrap');
      if (achWrap && achWrap.offsetParent) renderAchievementWeb();
    }
  } catch(e) {
    console.warn('generateMoreSecrets failed:', e);
  }
}

// Get current value for achievement goal type
function getAchVal(goalType) {
  if (goalType==='crafts')   return totalCrafts;
  if (goalType==='discov')   return firstDiscs.length;
  if (goalType==='elements') return discovered.length;
  if (goalType==='level')    return level;
  if (goalType==='tokens')   return totalTokensEarned;
  if (goalType==='spent')    return totalSpent;
  if (goalType==='prestige') return prestige;
  return 0;
}

function isAchUnlocked(n) {
  if (n.secret) return !!secretsUnlocked[n.id];
  return getAchVal(n.goalType) >= n.goal;
}

// Check if all secretTrigger elements are discovered (show hint)
function isSecretRevealed(n) {
  if (!n.secret) return true;
  if (secretsUnlocked[n.id]) return true;
  if (!n.secretTrigger || !n.secretTrigger.length) return false;
  return n.secretTrigger.every(name =>
    discovered.some(e => e.name.toLowerCase() === name.toLowerCase())
  );
}

// Is the player "one step away" from a secret (shown as "?" not "???")
function isSecretAlmostRevealed(n) {
  if (!n.secret || secretsUnlocked[n.id]) return false;
  if (!n.secretTrigger || !n.secretTrigger.length) return false;
  const met = n.secretTrigger.filter(name =>
    discovered.some(e => e.name.toLowerCase() === name.toLowerCase())
  ).length;
  // Show hint if >= 50% of triggers discovered
  return met >= Math.ceil(n.secretTrigger.length * 0.5) && met < n.secretTrigger.length;
}


// ─────────────────────────────────────────────────────────────
//  CHAIN RENDERING
// ─────────────────────────────────────────────────────────────
function renderChains() {
  const inner = document.getElementById('chain-inner');
  if (!inner) return;
  inner.innerHTML = '';
  CRAFT_CHAINS.forEach(chain => {
    const prog = chainStepProgress[chain.id];
    if (!prog) return;
    const totalDone = prog.completed.size;
    const isFullComplete = totalDone === chain.steps.length;
    const card = document.createElement('div');
    card.className = 'chain-card' + (isFullComplete?' chain-complete':totalDone>0?' chain-active':'');
    const pct = Math.round((totalDone/chain.steps.length)*100);
    card.innerHTML = `
      <div class="chain-header">
        <span style="font-size:16px">${chain.icon}</span>
        <div class="chain-title">${chain.name}</div>
        ${isFullComplete?'<span class="chain-done-badge">✅ DONE</span>':''}
      </div>
      <div style="font-size:11px;opacity:0.5;margin-bottom:5px">${chain.desc}</div>
      <div class="chain-steps">${chain.steps.map((step,idx)=>{
        const done = prog.completed.has(idx);
        const isActive = !done && idx < prog.revealed;
        const isNext = !done && idx === prog.revealed-1;
        const isLocked = !done && idx >= prog.revealed;
        let cls='chain-step '+(done?'cs-done':isActive?'cs-active':isLocked?'cs-locked':'');
        let icon = done?'✅':isActive?'❓':isLocked?'🔒':'❓';
        let nameStr = done?step.name:isActive?step.name:'???';
        let hintStr = isActive&&!done?`<div class="cs-hint">💡 ${step.hint}</div>`:'';
        return `<div class="${cls}">
          <span class="cs-icon">${icon}</span>
          <span class="cs-name">${nameStr}</span>
          ${!done&&isActive?`<span class="cs-rew">+${step.tokRew}🪙 +${step.xpRew}XP</span>`:''}
        </div>${hintStr}`;
      }).join('')}</div>
      <div class="chain-prog-bar"><div class="chain-prog-fill" style="width:${pct}%"></div></div>
      <div style="font-size:10px;opacity:0.45;margin-top:3px">${totalDone}/${chain.steps.length} steps complete</div>
    `;
    inner.appendChild(card);
  });
  if (!inner.children.length) {
    inner.innerHTML = '<div style="padding:12px;opacity:0.4;font-size:12px;text-align:center">Start crafting to unlock discovery chains!</div>';
  }
}

// ─────────────────────────────────────────────────────────────
//  SECRET UNLOCKS LIST (in unlocks tab)
// ─────────────────────────────────────────────────────────────

function toggleSecretUnlocksPanel() {
  const grid = document.getElementById('secret-unlocks-list');
  const arrow = document.getElementById('su-toggle-arrow');
  if (!grid) return;
  const isOpen = grid.style.display !== 'none';
  grid.style.display = isOpen ? 'none' : 'grid';
  if (arrow) arrow.textContent = isOpen ? '▼ Show' : '▲ Hide';
  if (!isOpen) renderSecretUnlocksList();
}
function renderSecretUnlocksList() {
  const grid = document.getElementById('secret-unlocks-list');
  if (!grid) return;
  // Update badge count even if hidden
  const secrets_all = ACH_NODES.filter(n=>n.secret);
  const totalUnlocked_badge = secrets_all.filter(n=>secretsUnlocked[n.id]).length;
  const badge = document.getElementById('su-count-badge');
  if (badge) badge.textContent = `(${totalUnlocked_badge}/${secrets_all.length})`;
  // Only render grid if it's visible
  if (grid.style.display === 'none') return;
  grid.innerHTML = '';
  const secrets = ACH_NODES.filter(n=>n.secret);
  const totalUnlocked = secrets.filter(n=>secretsUnlocked[n.id]).length;
  // Summary
  const summary = document.createElement('div');
  summary.style.cssText = 'grid-column:1/-1;font-size:11px;opacity:0.55;padding:4px 0;';
  summary.textContent = `${totalUnlocked} / ${secrets.length} secrets discovered`;
  grid.appendChild(summary);
  secrets.forEach(n => {
    const unlocked = secretsUnlocked[n.id];
    const almost   = isSecretAlmostRevealed(n);
    const revealed = isSecretRevealed(n) && !unlocked;
    const card = document.createElement('div');
    let cls = 'su-card';
    let icon, name, status;
    if (unlocked) {
      cls += ' su-done';
      icon = n.icon; name = n.name;
      status = '✅ Unlocked';
    } else if (revealed) {
      cls += ' su-revealed';
      icon = n.icon; name = n.name;
      status = '⚡ Craft the elements!';
    } else if (almost) {
      cls += ' su-almost';
      icon = '❓'; name = '? Almost...';
      status = '🔍 Getting close...';
    } else {
      cls += ' su-hidden';
      icon = '🔐'; name = '??? Secret';
      status = 'Keep crafting...';
    }
    card.className = cls;
    card.innerHTML = `
      <div class="su-icon">${icon}</div>
      <div class="su-name">${name}</div>
      <div class="su-status">${status}</div>
      ${unlocked&&n.reward?.tokens?`<div style="font-size:10px;color:var(--gold);margin-top:2px">+${n.reward.tokens}🪙</div>`:''}
      ${unlocked?'<span class="su-done-check">✓</span>':''}
    `;
    grid.appendChild(card);
  });

}

// ─────────────────────────────────────────────────────────────
//  SAVE / LOAD  (localStorage → game_save.json format shown in console)
// ─────────────────────────────────────────────────────────────
const SAVE_KEY = 'infinite_craft_save';

function buildSaveObject() {
  return {
    // economy
    tokens,
    xp,
    level,
    totalCrafts,
    totalSpent,
    totalTokensEarned,
    prestige,
    // collections
    discovered:      discovered.map(e => ({ emoji:e.emoji, name:e.name, isFirst:e.isFirst, order:e.order })),
    firstDiscs:      firstDiscs.map(e => ({ emoji:e.emoji, name:e.name })),
    owned:           { ...owned },
    // quests / milestones
    questDone:       [...questDone],
    questProgress:   { ...questProgress },
    pinnedQuests:    [...pinnedQuests],
    milestonesDone:  [...milestonesDone],
    msProgress:      { ...msProgress },
    // secrets / chains
    secretsUnlocked: { ...secretsUnlocked },
    secretsCount,
    chainStepsCompleted,
    chainFullCompleted,
    generatedSecretsAdded,
    chainStepProgress: Object.fromEntries(
      Object.entries(chainStepProgress).map(([k,v]) => [k, { completed:[...v.completed], revealed:v.revealed }])
    ),
    // cosmetics / ui
    darkMode,
    sortMode,
    activePic,
    activeTextTheme,
    unlockedPics:        [...unlockedPics],
    unlockedThemes:      [...unlockedThemes],
    unlockedTextThemes:  [...unlockedTextThemes],
    activeBoosters:      { ...activeBoosters },
    currentUnlockPrestigeView,
    // generated extra shop/quest/milestone ids
    generatedShopIds:   (window._generatedShopIds   || []),
    generatedQuestIds:  (window._generatedQuestIds  || []),
    generatedMsIds:     (window._generatedMsIds     || []),
    // generated ACH secret nodes (serialisable subset)
    generatedAchNodes:  ACH_NODES.filter(n => n.id && n.id.startsWith('sc_gen_')).map(n => ({
      id:n.id, icon:n.icon, name:n.name, desc:n.desc,
      secretTrigger:n.secretTrigger, x:n.x, y:n.y,
      reward:n.reward
    })),
    _savedAt: new Date().toISOString()
  };
}

function saveGame() {
  try {
    const data = buildSaveObject();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    // Also schedule a cloud save if user is logged in
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  } catch(e) { console.warn('saveGame failed:', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);

    // economy
    if (d.tokens           != null) tokens           = d.tokens;
    if (d.xp               != null) xp               = d.xp;
    if (d.level            != null) level             = d.level;
    if (d.totalCrafts      != null) totalCrafts       = d.totalCrafts;
    if (d.totalSpent       != null) totalSpent        = d.totalSpent;
    if (d.totalTokensEarned!= null) totalTokensEarned = d.totalTokensEarned;
    if (d.prestige         != null) prestige          = d.prestige;

    // collections
    if (Array.isArray(d.discovered)) {
      discovered = [];
      d.discovered.forEach(e => { discovered.push({ emoji:e.emoji, name:e.name, isFirst:e.isFirst, order:e.order }); });
    }
    if (Array.isArray(d.firstDiscs)) {
      firstDiscs = d.firstDiscs.map(e => ({ emoji:e.emoji, name:e.name }));
    }
    if (d.owned)         owned        = { ...d.owned };
    if (Array.isArray(d.questDone))       questDone      = new Set(d.questDone);
    if (d.questProgress)                  questProgress  = { ...d.questProgress };
    if (Array.isArray(d.pinnedQuests))    pinnedQuests   = new Set(d.pinnedQuests);
    if (Array.isArray(d.milestonesDone))  milestonesDone = new Set(d.milestonesDone);
    if (d.msProgress)                     msProgress     = { ...d.msProgress };

    // secrets / chains
    if (d.secretsUnlocked)      secretsUnlocked      = { ...d.secretsUnlocked };
    if (d.secretsCount    !=null) secretsCount        = d.secretsCount;
    if (d.chainStepsCompleted!=null) chainStepsCompleted = d.chainStepsCompleted;
    if (d.chainFullCompleted !=null) chainFullCompleted  = d.chainFullCompleted;
    if (d.generatedSecretsAdded!=null) generatedSecretsAdded = d.generatedSecretsAdded;
    if (d.chainStepProgress) {
      chainStepProgress = {};
      Object.entries(d.chainStepProgress).forEach(([k,v]) => {
        chainStepProgress[k] = { completed: new Set(v.completed||[]), revealed: v.revealed||1 };
      });
    }

    // cosmetics
    if (d.darkMode   != null) { darkMode = d.darkMode; document.body.classList.toggle('dark', darkMode); document.getElementById('btn-dark').textContent = darkMode?'☀️':'🌙'; }
    if (d.sortMode)  sortMode  = d.sortMode;
    if (d.activePic) activePic = d.activePic;
    if (d.activeTextTheme) { activeTextTheme = d.activeTextTheme; applyTextTheme(activeTextTheme); }
    if (Array.isArray(d.unlockedPics))       unlockedPics       = new Set(d.unlockedPics);
    if (Array.isArray(d.unlockedThemes))     unlockedThemes     = new Set(d.unlockedThemes);
    if (Array.isArray(d.unlockedTextThemes)) unlockedTextThemes = new Set(d.unlockedTextThemes);
    if (d.activeBoosters) activeBoosters = { ...d.activeBoosters };
    if (d.currentUnlockPrestigeView != null) currentUnlockPrestigeView = d.currentUnlockPrestigeView;

    // restore generated ids
    if (Array.isArray(d.generatedShopIds))  window._generatedShopIds  = d.generatedShopIds;
    if (Array.isArray(d.generatedQuestIds)) window._generatedQuestIds = d.generatedQuestIds;
    if (Array.isArray(d.generatedMsIds))    window._generatedMsIds    = d.generatedMsIds;

    // restore generated secret ach nodes
    if (Array.isArray(d.generatedAchNodes)) {
      d.generatedAchNodes.forEach(n => {
        if (!ACH_NODES.find(x => x.id === n.id)) {
          ACH_NODES.push({ ...n, cat:'secret', goalType:'secret', goal:1, req:[], secret:true });
        }
      });
    }

    return true;
  } catch(e) { console.warn('loadGame failed:', e); return false; }
}

function exportSave() {
  const data = JSON.stringify(buildSaveObject(), null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'infinite_craft_save.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showTokenToast('💾 Save exported!');
}

function importSave() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const text = await inp.files[0].text();
      localStorage.setItem(SAVE_KEY, text);
      showTokenToast('📂 Save imported — reloading…');
      setTimeout(() => location.reload(), 800);
    } catch(e) { showErr('Import failed: ' + e.message); }
  };
  inp.click();
}

// Auto-save wrapper — call after any state mutation
function autoSave() { saveGame(); }

// ─────────────────────────────────────────────────────────────
//  API: GENERATE MORE QUESTS VIA GEMINI
// ─────────────────────────────────────────────────────────────
window._generatedQuestIds  = window._generatedQuestIds  || [];
window._generatedShopIds   = window._generatedShopIds   || [];
window._generatedMsIds     = window._generatedMsIds     || [];

async function generateMoreQuests() {
  if (!hasAnyApiKey()) return;
  const existingNames = QUESTS_DEF.map(q=>q.name).join(', ') || 'none';
  const existingIds   = (window._generatedQuestIds||[]).join(', ') || 'none';
  const prompt = `You are expanding the quest log for "Infinite Craft", an idle crafting game where players combine elements (e.g. Water + Fire = Steam) to earn tokens and XP.

EXISTING QUEST NAMES — do NOT duplicate: ${existingNames}
GENERATED IDs in use — do NOT reuse: ${existingIds}

Generate 4 NEW quests in this EXACT JSON format (array only, no markdown, no preamble):
[{"id":"q_gen_XXXXXX","name":"Quest Name","desc":"One sentence task description.","type":"crafts","goal":200,"tokRew":300,"xpRew":250}]

RULES:
- id: start with "q_gen_" followed by a random 6-digit number (e.g. q_gen_847392) — must be unique
- type: one of: crafts | discov | elements | level | spent | prestige
- goal: crafts 50–10000 | discov 5–500 | elements 20–2000 | level 3–100 | spent 100–50000 | prestige 1–15
- tokRew: 50–10000, xpRew: 0–5000
- name: 2–5 words, Title Case, fun and thematic (e.g. "Alchemist's Gambit", "Thousand Crafts Club")
- desc: one sentence clearly stating what the player must accomplish
- Include a MIX of easy (low goal), medium, and hard (high goal) quests
- Vary the types — do not generate all the same type

Return ONLY the JSON array.`;
  try {
    const raw  = await callLLM('generate', prompt, 400, 0.9);
    const arr  = JSON.parse(raw.replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return;
    let added = 0;
    arr.forEach(q => {
      if (!q.id||!q.name||!q.type) return;
      if (QUESTS_DEF.find(x=>x.id===q.id)||SECRET_QUESTS_DEF.find(x=>x.id===q.id)) return;
      QUESTS_DEF.push({ id:q.id, name:q.name, desc:q.desc||'Complete this challenge.', type:q.type, goal:q.goal||50, tokRew:q.tokRew||100, xpRew:q.xpRew||50 });
      questProgress[q.id] = 0;
      window._generatedQuestIds.push(q.id);
      added++;
    });
    if (added > 0) {
      showTokenToast(`📜 ${added} new quests generated!`);
      renderQuests();
      autoSave();
    }
  } catch(e) { console.warn('generateMoreQuests failed:', e); }
}

async function generateMoreMilestones() {
  if (!hasAnyApiKey()) return;
  const existingNames = MILESTONES.map(m=>m.name).join(', ') || 'none';
  const existingIds   = (window._generatedMsIds||[]).join(', ') || 'none';
  const prompt = `You are expanding the milestone system for "Infinite Craft", an idle crafting game.
Milestones are permanent long-term goals that reward large token and XP payouts when reached.

EXISTING MILESTONE NAMES — do NOT duplicate: ${existingNames}
GENERATED IDs in use — do NOT reuse: ${existingIds}

Generate 4 NEW milestones in this EXACT JSON format (array only, no markdown, no preamble):
[{"id":"ms_gen_XXXXXX","icon":"🏆","name":"Milestone Name","desc":"Short achievement description.","type":"crafts","goal":750,"tokRew":400,"xpRew":2000}]

RULES:
- id: start with "ms_gen_" followed by a random 6-digit number — must be unique
- icon: single relevant emoji that matches the theme
- type: one of: crafts | discov | elements | level | tokens | spent | prestige
- goal: a meaningful, satisfying target for the type:
  crafts 100–50000 | discov 10–1000 | elements 50–5000 | level 5–100 | tokens 500–500000 | spent 500–100000 | prestige 1–15
- tokRew: 100–25000 (scale with difficulty)
- xpRew: 0–100000 (scale with difficulty)
- name: 2–5 words, Title Case, epic and achievement-like (e.g. "Grand Architect", "Token Tycoon")
- desc: one sentence describing what the player achieved
- Include a range of difficulty levels — some early-game, some very late-game

Return ONLY the JSON array.`;
  try {
    const raw  = await callLLM('generate', prompt, 400, 0.9);
    const arr  = JSON.parse(raw.replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return;
    let added = 0;
    arr.forEach(m => {
      if (!m.id||!m.name||!m.type) return;
      if (MILESTONES.find(x=>x.id===m.id)) return;
      MILESTONES.push({ id:m.id, icon:m.icon||'🏆', name:m.name, desc:m.desc||'Reach this milestone.', type:m.type, goal:m.goal||100, tokRew:m.tokRew||200, xpRew:m.xpRew||500 });
      msProgress[m.id] = 0;
      window._generatedMsIds.push(m.id);
      added++;
    });
    if (added > 0) {
      showTokenToast(`🏆 ${added} new milestones generated!`);
      if (menuTab === 'milestones' || document.getElementById('milestones-panel').style.display !== 'none') renderMilestones();
      autoSave();
    }
  } catch(e) { console.warn('generateMoreMilestones failed:', e); }
}

async function generateMoreShopItems() {
  if (!hasAnyApiKey()) return;
  const existingGenNames = (window._generatedShopIds||[]).map(id => {
    const s = SHOP.find(x=>x.id===id); return s ? s.name : id;
  }).join(', ') || 'none';
  const prompt = `You are generating new purchasable upgrade items for the shop in "Infinite Craft", an idle crafting game.
Players combine elements (e.g. Water + Fire = Steam) to earn tokens, which they spend here on upgrades, boosts, cosmetics, and automation.

ALREADY IN SHOP — do NOT generate these again: ${existingGenNames}

Generate 4 NEW shop items in this EXACT JSON format (array only, no markdown, no preamble):
[{"id":"gen_item_XXXXXX","icon":"🎯","name":"Item Name","desc":"One sentence describing the exact benefit.","cost":500,"lvl":5,"prestige":0}]

RULES:
- id: start with "gen_item_" followed by a random 6-digit number (e.g. gen_item_847392) — must be unique
- icon: single relevant emoji
- cost: 100–15000 tokens (scale with power level)
- lvl: 1–60 (player level required to unlock)
- prestige: 0–5 (prestige tier required)
- name: 2–5 words, Title Case, creative and specific (e.g. "Alchemist's Lens", "Token Forge")
- desc: ONE sentence that clearly states the mechanical benefit with specific numbers where possible
  (e.g. "+25% token gain for 1 hour", "Reveals 3 unknown craft recipes", "Auto-clicks the last combo once every 10s")
- Variety is CRITICAL: mix utilities, passive boosts, timed consumables, cosmetics, and automation tools
  Do NOT generate 4 items of the same category
- Be inventive — do not just rename or slightly modify existing items

Return ONLY the JSON array.`;
  try {
    const raw  = await callLLM('generate', prompt, 400, 1.0);
    const arr  = JSON.parse(raw.replace(/```json|```/g,'').trim());
    if (!Array.isArray(arr)) return;
    let added = 0;
    arr.forEach(s => {
      if (!s.id||!s.name) return;
      if (SHOP.find(x=>x.id===s.id)) return;
      SHOP.push({ id:s.id, icon:s.icon||'🎁', name:s.name, desc:s.desc||'A special item.', cost:s.cost||500, lvl:s.lvl||1, prestige:s.prestige||0, max:1, needs:null, resetsOnPrestige:false });
      window._generatedShopIds.push(s.id);
      added++;
    });
    if (added > 0) {
      showTokenToast(`🛒 ${added} new shop items available!`);
      if (menuTab==='shop') renderShop();
      autoSave();
    }
  } catch(e) { console.warn('generateMoreShopItems failed:', e); }
}

// Trigger generation milestones
function checkGenerationTriggers() {
  // ── Quest generation: every 30 crafts ──────────────────────────────────
  if (totalCrafts > 0 && totalCrafts % 30 === 0) setTimeout(generateMoreQuests, 1500);

  // ── Milestone generation: every 15 discoveries ─────────────────────────
  if (firstDiscs.length > 0 && firstDiscs.length % 15 === 0) setTimeout(generateMoreMilestones, 2000);

  // ── Shop generation: every 200 tokens spent ─────────────────────────────
  if (totalSpent > 0 && totalSpent % 200 === 0) setTimeout(generateMoreShopItems, 2500);

  // ── Secret generation: every 20 discoveries ────────────────────────────
  if (firstDiscs.length > 0 && firstDiscs.length % 20 === 0) setTimeout(generateMoreSecrets, 3000);
}

// ─────────────────────────────────────────────────────────────
var menuExpanded = false;
function toggleFullscreen() {
  const panel = document.getElementById('menu-panel');
  const btn   = document.getElementById('fullscreen-btn');
  menuExpanded = !menuExpanded;
  if (menuExpanded) {
    panel.style.width     = '560px';
    panel.style.maxHeight = '90vh';
    panel.style.left      = '14px';
    if (btn) btn.textContent = '⊡';
    if (btn) btn.title = 'Shrink panel';
  } else {
    panel.style.width     = '';
    panel.style.maxHeight = '';
    panel.style.left      = '';
    if (btn) btn.textContent = '⛶';
    if (btn) btn.title = 'Expand panel';
  }
}

// ── Achievement Web Renderer ──────────────────────────────────
function renderAchievementWeb() {
  const wrap = document.getElementById('ach-web-wrap');
  if (!wrap) return;

  const CAT_COLORS = {
    craft:  '#10b981', // green
    disc:   '#8b5cf6', // purple
    econ:   '#f59e0b', // gold
    level:  '#3b82f6', // blue
    prest:  '#a855f7', // violet
    secret: '#ec4899', // pink
  };
  const CAT_NAMES = { craft:'⚗️ Crafting', disc:'✨ Discovery', econ:'🪙 Economy', level:'📈 Leveling', prest:'⭐ Prestige', secret:'🔐 Secrets' };

  // Filter
  const visible = ACH_FILTER === 'all' ? ACH_NODES
    : ACH_FILTER === 'done' ? ACH_NODES.filter(n => isAchUnlocked(n))
    : ACH_FILTER === 'todo' ? ACH_NODES.filter(n => !isAchUnlocked(n))
    : ACH_FILTER === 'secret' ? ACH_NODES.filter(n => n.secret)
    : ACH_NODES.filter(n => n.cat === ACH_FILTER);

  // Compute SVG bounds
  const allX = ACH_NODES.map(n=>n.x), allY = ACH_NODES.map(n=>n.y);
  const SVG_W = Math.max(...allX) + 120;
  const SVG_H = Math.max(...allY) + 120;

  let svgLines = '';
  let svgNodes = '';

  // Draw lines first (behind nodes)
  ACH_NODES.forEach(n => {
    n.req.forEach(reqId => {
      const src = ACH_NODES.find(x => x.id === reqId);
      if (!src) return;
      // Only draw if both ends are in filtered view (or always draw lines)
      const unlocked = isAchUnlocked(n) && isAchUnlocked(src);
      const color = unlocked ? (CAT_COLORS[n.cat] + 'cc') : '#88888844';
      svgLines += `<line x1="${src.x+50}" y1="${src.y+20}" x2="${n.x+50}" y2="${n.y+20}" stroke="${color}" stroke-width="${unlocked?2.5:1.5}" stroke-dasharray="${unlocked?'':'5,4'}"/>`;
    });
  });

  // Draw nodes
  ACH_NODES.forEach(n => {
    const unlocked = isAchUnlocked(n);
    const almost   = isSecretAlmostRevealed(n);
    const revealed = isSecretRevealed(n);
    const inFilter = visible.includes(n);

    let fill, stroke, opacity = 1, nodeIcon, nodeName;
    const col = CAT_COLORS[n.cat];

    if (!inFilter) {
      opacity = 0.25;
    }

    if (n.secret && !unlocked) {
      if (!revealed && !almost) {
        // Fully hidden
        fill = '#33333388'; stroke = '#55555555';
        nodeIcon = '???'; nodeName = '???';
      } else if (almost) {
        // Teaser — "?" bright
        fill = '#44224488'; stroke = col + '88';
        nodeIcon = '?'; nodeName = '? Secret';
      } else {
        // Revealed but not unlocked (prerequisites met, show name)
        fill = col + '33'; stroke = col + 'bb';
        nodeIcon = n.icon; nodeName = n.name;
      }
    } else if (unlocked) {
      fill = col + 'cc'; stroke = col;
      nodeIcon = n.icon; nodeName = n.name;
    } else {
      fill = '#22222266'; stroke = '#55555599';
      nodeIcon = n.icon; nodeName = n.name;
    }

    const x = n.x, y = n.y;
    svgNodes += `<g class="ach-node-wrap" data-id="${n.id}" opacity="${opacity}">
      <rect class="ach-node-bg" x="${x}" y="${y}" width="100" height="40"
        rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      ${unlocked ? `<rect x="${x+1}" y="${y+1}" width="98" height="6" rx="4" fill="${col}88"/>` : ''}
      <text x="${x+14}" y="${y+25}" font-size="14" dominant-baseline="middle">${nodeIcon}</text>
      <text x="${x+34}" y="${y+25}" font-size="9.5" fill="${stroke}" font-weight="${unlocked?'700':'500'}" dominant-baseline="middle" font-family="Roboto,sans-serif">${nodeName.length>9?nodeName.slice(0,9)+'…':nodeName}</text>
      ${unlocked ? `<text x="${x+90}" y="${y+14}" font-size="10" text-anchor="middle" fill="${col}">✓</text>` : ''}
    </g>`;
  });

  const tooltipHtml = `<div class="ach-tooltip" id="ach-tooltip">
    <div class="ach-tooltip-title" id="ach-tt-title"></div>
    <div class="ach-tooltip-desc" id="ach-tt-desc"></div>
    <div class="ach-tooltip-status" id="ach-tt-status"></div>
  </div>`;

  const filterBtns = ['all','craft','disc','econ','level','prest','secret','done','todo']
    .map(f => `<button class="ach-filter-btn${ACH_FILTER===f?' active':''}" onclick="setAchFilter('${f}')">${
      f==='all'?'All':f==='done'?'✅ Done':f==='todo'?'⬜ To Do':CAT_NAMES[f]||f
    }</button>`).join('');

  const legendItems = Object.entries(CAT_COLORS).map(([cat,col])=>
    `<span><span class="ach-legend-dot" style="background:${col}"></span>${CAT_NAMES[cat]||cat}</span>`
  ).join('');

  wrap.innerHTML = `
    <div class="ach-legend">${legendItems}
      <span><span class="ach-legend-dot" style="background:#ec4899"></span>🔐 Hidden secret</span>
    </div>
    <div id="ach-web-filter">${filterBtns}</div>
    <div style="overflow:auto;width:100%;height:calc(100% - 60px);cursor:grab" id="ach-scroll-inner">
      <svg id="ach-web-svg" width="${SVG_W}" height="${SVG_H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow-filter">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        ${svgLines}${svgNodes}
      </svg>
    </div>
    ${tooltipHtml}
  `;

  // Tooltip hover events
  setTimeout(() => {
    document.querySelectorAll('.ach-node-wrap').forEach(el => {
      const id = el.dataset.id;
      const n  = ACH_NODES.find(x => x.id === id);
      if (!n) return;
      el.addEventListener('mouseenter', ev => {
        const tt = document.getElementById('ach-tooltip');
        if (!tt) return;
        const unlocked  = isAchUnlocked(n);
        const almost    = isSecretAlmostRevealed(n);
        const revealed  = isSecretRevealed(n);
        let title, desc, status;
        if (n.secret && !unlocked) {
          if (!revealed && !almost) {
            title = '??? Secret Achievement';
            desc  = 'Keep crafting to uncover this secret…';
            status = '🔒 Hidden';
          } else if (almost) {
            title = '? Almost There!';
            desc  = 'You are getting close to unlocking a secret…';
            const missing = (n.secretTrigger||[]).filter(name=>!discovered.some(e=>e.name.toLowerCase()===name.toLowerCase()));
            status = '🔍 Still need: ' + missing.join(', ');
          } else {
            title = n.name;
            desc  = n.desc;
            const missing = (n.secretTrigger||[]).filter(name=>!discovered.some(e=>e.name.toLowerCase()===name.toLowerCase()));
            status = '⚡ Ready! Just craft: ' + missing.join(', ');
          }
        } else {
          title = n.name;
          desc  = n.desc;
          if (unlocked) {
            status = '✅ Completed!';
            if (n.reward && n.reward.tokens) status += ' (+' + n.reward.tokens + '🪙 earned)';
          } else if (n.goalType !== 'secret') {
            const cur = Math.min(getAchVal(n.goalType), n.goal);
            const pct = Math.round(cur / n.goal * 100);
            status = `📊 Progress: ${cur.toLocaleString()} / ${n.goal.toLocaleString()} (${pct}%)`;
          }
        }
        document.getElementById('ach-tt-title').textContent  = title;
        document.getElementById('ach-tt-desc').textContent   = desc;
        document.getElementById('ach-tt-status').textContent = status;
        tt.style.left = (ev.clientX + 14) + 'px';
        tt.style.top  = (ev.clientY - 20) + 'px';
        tt.classList.add('visible');
      });
      el.addEventListener('mousemove', ev => {
        const tt = document.getElementById('ach-tooltip');
        if (tt) { tt.style.left=(ev.clientX+14)+'px'; tt.style.top=(ev.clientY-20)+'px'; }
      });
      el.addEventListener('mouseleave', () => {
        const tt = document.getElementById('ach-tooltip');
        if (tt) tt.classList.remove('visible');
      });
    });
  }, 50);
}

function setAchFilter(f) {
  ACH_FILTER = f;
  renderAchievementWeb();
}

function initCanvas() {
  canvas.addEventListener('wheel', ev=>{
    ev.preventDefault();
    const r=canvas.getBoundingClientRect();
    const cx=ev.clientX-r.left, cy=ev.clientY-r.top;
    const factor = ev.deltaY<0 ? ZOOM_FACTOR : 1/ZOOM_FACTOR;
    const nz=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN_DYNAMIC,zoom*factor));
    panX=cx-(cx-panX)*nz/zoom; panY=cy-(cy-panY)*nz/zoom; zoom=nz;
    applyTransform();
  },{ passive:false });

  let panning=false, ps={x:0,y:0};
  canvas.addEventListener('mousedown',ev=>{
    if (ev.button!==0) return;
    if (ev.target!==canvas&&ev.target!==world) return;
    panning=true; ps={x:ev.clientX-panX,y:ev.clientY-panY};
    canvas.classList.add('panning');
  });
  document.addEventListener('mousemove',ev=>{
    if (!panning) return;
    panX=ev.clientX-ps.x; panY=ev.clientY-ps.y; applyTransform();
  });
  document.addEventListener('mouseup',()=>{
    if (panning){ panning=false; canvas.classList.remove('panning'); }
  });
}
function applyTransform() {
  world.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;
}
function toWorld(cx,cy) {
  const r=canvas.getBoundingClientRect();
  return { x:(cx-r.left-panX)/zoom, y:(cy-r.top-panY)/zoom };
}

// ─────────────────────────────────────────────────────────────
//  CONTROLS
// ─────────────────────────────────────────────────────────────
function toggleDarkMode() {
  darkMode=!darkMode;
  document.body.classList.toggle('dark',darkMode);
  document.getElementById('btn-dark').textContent=darkMode?'☀️':'🌙';
}
function initControls() {
  document.getElementById('btn-clear').addEventListener('click',clearCanvas);
  document.getElementById('btn-reset').addEventListener('click',resetGame);
}
function clearCanvas() {
  canvasEls.forEach(e=>e.el.remove()); canvasEls=[];
  document.getElementById('hint').style.display='';
}
function resetGame() {
  clearCanvas();
  discovered=[]; firstDiscs=[];
  tokens=0; xp=0; level=1; totalCrafts=0; totalSpent=0;
  totalTokensEarned=0; prestige=0; activeBoosters={};
  owned={}; pinnedQuests=new Set(); questDone=new Set();
  milestonesDone=new Set(); msProgress={};
  activePic='⚗️'; unlockedPics=new Set(['⚗️']); unlockedThemes=new Set();
  unlockedTextThemes=new Set(['default']);
  currentUnlockPrestigeView=1; shopSubTab='shop';
  clearInterval(autoCraftTimer); autoCraftTimer=null;
  clearInterval(coinMinerTimer); coinMinerTimer=null;
  clearInterval(petTimer); petTimer=null;
  clearInterval(labInternTimer); labInternTimer=null;
  clearInterval(boosterTickTimer); boosterTickTimer=null;
  clearInterval(passiveXPTimer); passiveXPTimer=null;
  if(petFoodTimer) clearTimeout(petFoodTimer); petFoodTimer=null; petFoodActive=false;
  clearTimeout(petRobotBoostTimer); petRobotBoostTimer=null; petRobotBoostActive=false;
  document.getElementById('auto-status').style.display='none';
  document.body.className=''; // remove themes
  secretsUnlocked = {}; secretsCount = 0;
  chainStepsCompleted = 0; chainFullCompleted = 0;
  generatedSecretsAdded = 0;
  chainStepProgress = {};
  CRAFT_CHAINS.forEach(c=>{ chainStepProgress[c.id]={completed:new Set(),revealed:1}; });
  activeTextTheme = 'default';
  // Reset shop sub-tab
  const ssi = document.getElementById('shop-inner');
  const sui = document.getElementById('unlocks-inner');
  if (ssi) ssi.style.display='';
  if (sui) sui.style.display='none';
  const sst1 = document.getElementById('sstab-shop');
  const sst2 = document.getElementById('sstab-unlocks');
  if (sst1) { sst1.classList.add('active'); }
  if (sst2) { sst2.classList.remove('active'); }
  initQuestProgress();
  STARTERS.forEach(e=>register(e.emoji,e.name,false));
  zoom=1; panX=0; panY=0; applyTransform();
  updateXPBar(); updateLevelHUD(); updateLogo(); renderSidebar(); renderShop(); renderQuests(); renderPinned();
  initMilestonesProgress();
  document.getElementById('hint').style.display='';
  localStorage.removeItem(SAVE_KEY);
  updateBoosterHUD();
}

// ─────────────────────────────────────────────────────────────
//  TOASTS
// ─────────────────────────────────────────────────────────────
var discTimer=null;
function showDiscoveryToast(label) {
  const el=document.getElementById('discovery-toast');
  el.textContent='✨ First Discovery! '+label;
  el.classList.add('on');
  clearTimeout(discTimer);
  discTimer=setTimeout(()=>el.classList.remove('on'),3000);
}
var tokTimer=null;
function showTokenToast(msg) {
  const el=document.getElementById('token-toast');
  el.textContent=msg;
  el.classList.add('on');
  clearTimeout(tokTimer);
  tokTimer=setTimeout(()=>el.classList.remove('on'),2200);
}
function showToastMsg(_, msg) { showTokenToast(msg); }
var errTimer=null;
function showErr(msg) {
  const el=document.getElementById('err-toast');
  el.textContent='⚠️ '+msg.slice(0,80);
  el.classList.add('on');
  clearTimeout(errTimer);
  errTimer=setTimeout(()=>el.classList.remove('on'),3200);
}

// ═════════════════════════════════════════════════════════════════════════
//  MULTI-PROVIDER LLM ENGINE
//  Routing:
//    craft    → Groq (primary) → Gemini → OpenRouter → HuggingFace → Cohere
//    generate → Gemini (primary) → OpenRouter → Groq → HuggingFace → Cohere
//  Each provider has its own rate-limit queue. On 429 the call auto-falls
//  through to the next provider so the game never stalls.
// ═════════════════════════════════════════════════════════════════════════

// ── Craft system prompt (used by all providers) ───────────────────────────