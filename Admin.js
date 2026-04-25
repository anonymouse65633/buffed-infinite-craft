// ═══════════════════════════════════════════════════════════════════════
//  ADMIN.JS  —  Infinite Craft Full Admin Panel  (v2)
//
//  !! SETUP: Add your username to ADMIN_USERNAMES below !!
//
//  New in v2:
//    • Players tab: live search with playtime / warnings / sus / rank shown inline
//    • Ranks tab: preset + custom ranks, assign to players
//    • Shop Admin tab: force-add custom shop items, limited-time shop toggle
//    • Debug tab: fake players, test tools, data export, quick resets
//    • Delete Account action (removes all Firestore data for a player)
//    • Reset Stats presets on player editor
// ═══════════════════════════════════════════════════════════════════════

// ── !! CONFIGURE YOUR ADMIN USERNAME(S) HERE !! ─────────────────────────
const ADMIN_USERNAMES = ['joshua_johnson'];   // ← replace with YOUR username
// ─────────────────────────────────────────────────────────────────────────

// ── Preset rank definitions (shown in Ranks tab, editable) ──────────────
const PRESET_RANKS = [
  { key:'owner',     name:'Owner',      emoji:'👑', color:'#ff4757', order:0 },
  { key:'admin',     name:'Admin',      emoji:'🛡️', color:'#ef4444', order:1 },
  { key:'developer', name:'Developer',  emoji:'💻', color:'#9333ea', order:2 },
  { key:'moderator', name:'Moderator',  emoji:'🔧', color:'#f59e0b', order:3 },
  { key:'helper',    name:'Helper',     emoji:'💚', color:'#10b981', order:4 },
  { key:'vip',       name:'VIP',        emoji:'💎', color:'#4dc6ec', order:5 },
  { key:'legend',    name:'Legend',     emoji:'⭐', color:'#ffd700', order:6 },
  { key:'op',        name:'OP',         emoji:'⚡', color:'#fb923c', order:7 },
];

const ADMIN = (() => {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────
  let _tab         = 'dashboard';
  let _panel       = null;
  let _unsubs      = [];
  let _playerCache = {};
  let _searchQ     = '';
  let _dmTarget    = null;
  let _editTarget  = null;
  let _searchDebounce = null;
  let _rankCache   = null;   // array of rank defs (preset + custom)

  // ─── Permission helpers ──────────────────────────────────────────────
  function isAdmin()  { return AUTH_USER && ADMIN_USERNAMES.includes(AUTH_USER); }
  function isOp()     { return !!window._ADMIN_OP_PERMS; }
  function hasPerm(p) { return isAdmin() || (window._ADMIN_OP_PERMS && window._ADMIN_OP_PERMS[p]); }
  function _db()      { return window._db || null; }

  // ─── Helpers ─────────────────────────────────────────────────────────
  function _ts(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  }
  function _ago(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  function _fmt(n) { return Number(n||0).toLocaleString(); }
  function _enc(s) { return String(s).replace(/[/\\.#$[\]\s]/g,'_').slice(0,200); }

  async function _log(action, details='') {
    const db = _db(); if (!db) return;
    try {
      await db.collection('admin_log').add({
        action, details,
        by: AUTH_USER || '?', uid: AUTH_UID || '?',
        at: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(_) {}
  }

  // ─── Rank helpers ─────────────────────────────────────────────────────
  async function _getRankDefs() {
    if (_rankCache) return _rankCache;
    const db = _db();
    let custom = [];
    if (db) {
      try {
        const snap = await db.collection('admin_ranks').get();
        custom = snap.docs.map(d => ({ ...d.data(), id: d.id, custom: true }));
      } catch(_) {}
    }
    _rankCache = [...PRESET_RANKS.map(r => ({ ...r, builtIn: true })), ...custom];
    return _rankCache;
  }

  async function _getPlayerRank(uid) {
    const db = _db(); if (!db || !uid) return null;
    try {
      const doc = await db.collection('player_ranks').doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch(_) { return null; }
  }

  async function assignRank(uid, username, rankKey) {
    const db = _db(); if (!db) return;
    const defs = await _getRankDefs();
    const rank = defs.find(r => r.key === rankKey);
    if (!rank) return;
    await db.collection('player_ranks').doc(uid).set({
      uid, username,
      rankKey: rank.key, rankName: rank.name,
      rankEmoji: rank.emoji, rankColor: rank.color,
      assignedBy: AUTH_USER,
      assignedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _log('ASSIGN_RANK', `${username} ← ${rank.emoji} ${rank.name}`);
    showTokenToast(`✅ ${rank.emoji} ${rank.name} assigned to ${username}`);
  }

  async function removeRank(uid, username) {
    const db = _db(); if (!db) return;
    await db.collection('player_ranks').doc(uid).delete();
    await _log('REMOVE_RANK', `${username} (${uid})`);
    showTokenToast(`✅ Rank removed from ${username}`);
  }

  async function createCustomRank(name, emoji, color) {
    const db = _db(); if (!db) return;
    const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g,'');
    await db.collection('admin_ranks').doc(key).set({
      key, name, emoji, color, order: 99, custom: true,
      createdBy: AUTH_USER,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    _rankCache = null; // invalidate cache
    await _log('CREATE_RANK', `${emoji} ${name} (${key})`);
    showTokenToast(`✅ Custom rank created: ${emoji} ${name}`);
    _renderTab();
  }

  async function deleteCustomRank(key) {
    if (!confirm(`Delete rank "${key}"? Players with this rank will lose it.`)) return;
    const db = _db(); if (!db) return;
    await db.collection('admin_ranks').doc(key).delete();
    _rankCache = null;
    await _log('DELETE_RANK', key);
    showTokenToast(`✅ Rank deleted: ${key}`);
    _renderTab();
  }

  // ─── Ban helpers ─────────────────────────────────────────────────────
  async function checkBan(uid) {
    const db = _db(); if (!db || !uid) return null;
    try {
      const doc = await db.collection('bans').doc(uid).get();
      if (!doc.exists) return null;
      const b = doc.data();
      if (!b.active) return null;
      if (b.expiresAt && b.expiresAt.toDate && b.expiresAt.toDate() < new Date()) {
        await db.collection('bans').doc(uid).update({ active: false });
        return null;
      }
      return b;
    } catch(_) { return null; }
  }

  async function banPlayer(uid, username, durationMs, reason) {
    const db = _db(); if (!db) return;
    const expiresAt = durationMs > 0 ? new Date(Date.now() + durationMs) : null;
    await db.collection('bans').doc(uid).set({
      uid, username, reason, active: true,
      permanent: durationMs <= 0, bannedBy: AUTH_USER,
      bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt ? firebase.firestore.Timestamp.fromDate(expiresAt) : null
    });
    await _log('BAN', `${username} (${uid}) — ${reason} — ${durationMs<=0?'permanent':Math.round(durationMs/3600000)+'h'}`);
    showTokenToast('🚫 Player banned: ' + username);
    _renderTab();
  }

  async function unbanPlayer(uid, username) {
    const db = _db(); if (!db) return;
    await db.collection('bans').doc(uid).update({ active: false });
    await _log('UNBAN', `${username} (${uid})`);
    showTokenToast('✅ Unbanned: ' + username);
    _renderTab();
  }

  // ─── Broadcast helpers ───────────────────────────────────────────────
  async function sendBroadcast(message, type='info') {
    const db = _db(); if (!db || !message.trim()) return;
    await db.collection('broadcasts').add({
      message: message.trim(), type, sentBy: AUTH_USER,
      sentAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _log('BROADCAST', message.trim());
    showTokenToast('📢 Broadcast sent!');
    _renderTab();
  }

  async function sendDM(uid, username, message) {
    const db = _db(); if (!db || !message.trim() || !uid) return;
    await db.collection('dms').doc(uid).collection('msgs').add({
      message: message.trim(), from: AUTH_USER, fromAdmin: true,
      sentAt: firebase.firestore.FieldValue.serverTimestamp(), read: false
    });
    await _log('DM', `To ${username} (${uid}): ${message.trim()}`);
    showTokenToast('💬 DM sent to ' + username);
    _renderTab();
  }

  // ─── Player helpers ──────────────────────────────────────────────────
  async function getPlayerData(uid) {
    const db = _db(); if (!db) return null;
    try {
      const doc = await db.collection('saves').doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch(_) { return null; }
  }

  async function setPlayerField(uid, username, field, value) {
    const db = _db(); if (!db) return;
    await db.collection('saves').doc(uid).update({ [field]: value });
    await _log('EDIT_PLAYER', `${username}.${field} = ${JSON.stringify(value)}`);
    showTokenToast(`✅ Updated ${field} for ${username}`);
  }

  async function givePlayerItem(uid, username, itemKey) {
    const db = _db(); if (!db) return;
    await db.collection('saves').doc(uid).update({ [`owned.${itemKey}`]: true });
    await _log('GIVE_ITEM', `${username} ← ${itemKey}`);
    showTokenToast(`✅ Gave ${itemKey} to ${username}`);
  }

  async function clearPlayerInventory(uid, username) {
    const db = _db(); if (!db) return;
    await db.collection('saves').doc(uid).update({ discovered: [], firstDiscs: [] });
    await _log('CLEAR_INVENTORY', `${username} (${uid})`);
    showTokenToast('🗑️ Cleared inventory for ' + username);
  }

  async function resetPlayerSave(uid, username) {
    if (!confirm(`WIPE ENTIRE SAVE for ${username}? This cannot be undone.`)) return;
    const db = _db(); if (!db) return;
    await db.collection('saves').doc(uid).delete();
    await _log('RESET_SAVE', `${username} (${uid})`);
    showTokenToast('💥 Save wiped for ' + username);
  }

  async function deleteAccount(uid, username) {
    if (!confirm(`DELETE ACCOUNT for "${username}"?\n\nThis removes:\n• Their account record\n• All saved game data\n• Leaderboard entry\n• Rank assignment\n\nThis CANNOT be undone.`)) return;
    if (!confirm(`FINAL CONFIRMATION: Really delete "${username}"?`)) return;
    const db = _db(); if (!db) return;
    try {
      const batch = db.batch();
      batch.delete(db.collection('accounts').doc(username));
      batch.delete(db.collection('saves').doc(uid));
      batch.delete(db.collection('leaderboard').doc(uid));
      batch.delete(db.collection('player_ranks').doc(uid));
      batch.delete(db.collection('bans').doc(uid));
      batch.delete(db.collection('ops').doc(uid));
      await batch.commit();
      await _log('DELETE_ACCOUNT', `${username} (${uid})`);
      showTokenToast(`🗑️ Account deleted: ${username}`);
      _editTarget = null;
      _renderTab();
    } catch(e) {
      showTokenToast('❌ Error: ' + e.message);
    }
  }

  async function resetPlayerStats(uid, username, what) {
    const db = _db(); if (!db) return;
    const updates = {};
    if (what === 'economy') {
      updates.tokens = 0; updates.totalTokensEarned = 0; updates.totalSpent = 0;
    } else if (what === 'progress') {
      updates.xp = 0; updates.level = 1; updates.prestige = 0;
    } else if (what === 'crafts') {
      updates.totalCrafts = 0; updates.discovered = []; updates.firstDiscs = [];
    } else if (what === 'all') {
      Object.assign(updates, {
        tokens:0, totalTokensEarned:0, totalSpent:0,
        xp:0, level:1, prestige:0,
        totalCrafts:0, discovered:[], firstDiscs:[],
        timePlayed:0, secretsCount:0
      });
    }
    if (!Object.keys(updates).length) return;
    if (!confirm(`Reset ${what} stats for ${username}?`)) return;
    await db.collection('saves').doc(uid).update(updates);
    await _log('RESET_STATS', `${username} — ${what}`);
    showTokenToast(`✅ Reset ${what} for ${username}`);
    // Refresh editor
    const fresh = await getPlayerData(uid);
    if (_editTarget) _editTarget.data = fresh || {};
    _renderTab();
  }

  // ─── Shop admin helpers ──────────────────────────────────────────────
  async function addAdminShopItem(item) {
    const db = _db(); if (!db) return;
    const id = 'admin_' + Date.now();
    await db.collection('admin_shop_items').doc(id).set({
      ...item, id,
      addedBy: AUTH_USER,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _log('ADD_SHOP_ITEM', `${item.emoji} ${item.name} (${item.limited?'limited':'regular'})`);
    showTokenToast(`✅ Shop item added: ${item.emoji} ${item.name}`);
    _renderTab();
  }

  async function removeAdminShopItem(id, limited=false) {
    if (!confirm('Remove this item from the shop? Players who already own it keep it.')) return;
    const db = _db(); if (!db) return;
    await db.collection('admin_shop_items').doc(id).delete();
    await _log('REMOVE_SHOP_ITEM', id);
    showTokenToast('✅ Shop item removed');
    _renderTab();
  }

  async function setLimitedShopActive(active) {
    const db = _db(); if (!db) return;
    await db.collection('game_config').doc('global').set(
      { limitedShopActive: active }, { merge: true }
    );
    await _log('LIMITED_SHOP', active ? 'ENABLED' : 'DISABLED');
    showTokenToast(active ? '🌟 Limited shop ENABLED' : '🔒 Limited shop DISABLED');
  }

  // ─── Combo helpers ───────────────────────────────────────────────────
  async function deleteCombo(key) {
    const db = _db(); if (!db) return;
    await db.collection('combos').doc(_enc(key)).delete();
    await _log('DELETE_COMBO', key);
    showTokenToast('🗑️ Combo deleted');
    _renderTab();
  }

  async function addCombo(a, b, emoji, name) {
    const db = _db(); if (!db) return;
    const key = [a,b].sort().join('|||');
    await db.collection('combos').doc(_enc(key)).set({
      emoji, name, discoverer: AUTH_USER + ' (admin)',
      at: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _log('ADD_COMBO', `${a} + ${b} = ${emoji} ${name}`);
    showTokenToast(`✅ Combo added: ${a} + ${b} = ${emoji} ${name}`);
    _renderTab();
  }

  // ─── World Firsts helpers ────────────────────────────────────────────
  async function revokeWorldFirst(name) {
    const db = _db(); if (!db) return;
    if (!confirm(`Revoke world first for "${name}"?`)) return;
    await db.collection('global_firsts').doc(_enc(name)).delete();
    await _log('REVOKE_WORLD_FIRST', name);
    showTokenToast('✅ World first revoked: ' + name);
    _renderTab();
  }

  async function deleteFeedEntry(docId) {
    const db = _db(); if (!db) return;
    await db.collection('global_feed').doc(docId).delete();
    showTokenToast('🗑️ Feed entry deleted');
    _renderTab();
  }

  // ─── OP helpers ──────────────────────────────────────────────────────
  async function opPlayer(uid, username, perms) {
    const db = _db(); if (!db) return;
    await db.collection('ops').doc(uid).set({
      uid, username, permissions: perms,
      grantedBy: AUTH_USER,
      grantedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await _log('OP', `${username} ← ${JSON.stringify(perms)}`);
    showTokenToast('✅ OP granted to ' + username);
    _renderTab();
  }

  async function deopPlayer(uid, username) {
    const db = _db(); if (!db) return;
    if (!confirm(`Remove all OP from ${username}?`)) return;
    await db.collection('ops').doc(uid).delete();
    await _log('DEOP', `${username} (${uid})`);
    showTokenToast('✅ OP removed from ' + username);
    _renderTab();
  }

  // ─── Game config helpers ─────────────────────────────────────────────
  async function setGameConfig(key, value) {
    const db = _db(); if (!db) return;
    await db.collection('game_config').doc('global').set({ [key]: value }, { merge: true });
    await _log('GAME_CONFIG', `${key} = ${JSON.stringify(value)}`);
    showTokenToast(`✅ Config updated: ${key}`);
  }

  async function forceShopRegen() {
    const db = _db(); if (!db) return;
    if (!confirm('Force-regenerate the global shop for ALL players?')) return;
    await db.collection('game_config').doc('global').set({
      shopRegenAt: firebase.firestore.FieldValue.serverTimestamp(),
      shopVersion: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await _log('FORCE_SHOP_REGEN', 'Admin triggered');
    showTokenToast('🛒 Shop regen triggered!');
  }

  // ─── Leaderboard helpers ─────────────────────────────────────────────
  async function removeLBEntry(uid, username) {
    const db = _db(); if (!db) return;
    if (!confirm(`Remove ${username} from leaderboard?`)) return;
    await db.collection('leaderboard').doc(uid).delete();
    await _log('REMOVE_LB', `${username} (${uid})`);
    showTokenToast('✅ Removed from leaderboard: ' + username);
    _renderTab();
  }

  async function setFeaturedBadge(uid, username, badge) {
    const db = _db(); if (!db) return;
    await db.collection('leaderboard').doc(uid).update({ featuredBadge: badge });
    await db.collection('saves').doc(uid).update({ featuredBadge: badge });
    await _log('SET_BADGE', `${username} ← ${badge}`);
    showTokenToast(`✅ Badge set for ${username}: ${badge}`);
    _renderTab();
  }

  // ─── Debug helpers ───────────────────────────────────────────────────
  async function addFakePlayers(count, statLevel) {
    const db = _db(); if (!db) return;
    const names = ['AlphaWizard','BetaCrafter','ChaosForge','DarkMatter','EchoBreaker',
      'FrostWeaver','GhostMage','HyperLab','IronCraft','JadeAlchemist','KryptoForge',
      'LunarMix','MythMaker','NeonCraft','OmegaBlend','PrismaLab','QuantumFuse',
      'RuneSmith','ShadowLab','TitanForge','UltraMix','VoidWalker','WraithCraft',
      'XenonLab','YggdrasilMage','ZenithCraft'];
    const mult = statLevel === 'low' ? 1 : statLevel === 'high' ? 50 : 10;
    const batch = db.batch();
    for (let i = 0; i < Math.min(count, 50); i++) {
      const uid = 'fake_' + Date.now() + '_' + i;
      const name = (names[i % names.length] || 'FakePlayer') + Math.floor(Math.random()*900+100);
      const crafts = Math.floor(Math.random() * 1000 * mult);
      batch.set(db.collection('leaderboard').doc(uid), {
        name, uid, isFake: true,
        totalCrafts: crafts,
        firstDiscoveries: Math.floor(crafts * 0.1),
        totalTokensEarned: crafts * 50,
        timePlayed: crafts * 30,
        prestige: Math.floor(Math.random() * 5),
        level: Math.floor(Math.random() * 100 * mult * 0.1 + 1),
        badges: [], featuredBadge: null,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(db.collection('accounts').doc(name.toLowerCase()), {
        displayName: name, uid, isFake: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
    await _log('ADD_FAKE_PLAYERS', `count=${count}, level=${statLevel}`);
    showTokenToast(`✅ Added ${count} fake players`);
    _renderTab();
  }

  async function removeFakePlayers() {
    if (!confirm('Remove ALL fake players from leaderboard and accounts?')) return;
    const db = _db(); if (!db) return;
    try {
      const [lbSnap, accSnap] = await Promise.all([
        db.collection('leaderboard').where('isFake','==',true).get(),
        db.collection('accounts').where('isFake','==',true).get()
      ]);
      const batch = db.batch();
      lbSnap.docs.forEach(d => batch.delete(d.ref));
      accSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await _log('REMOVE_FAKE_PLAYERS', `removed ${lbSnap.size} lb + ${accSnap.size} accounts`);
      showTokenToast(`✅ Removed ${lbSnap.size} fake players`);
      _renderTab();
    } catch(e) { showTokenToast('❌ ' + e.message); }
  }

  async function exportAllData() {
    const db = _db(); if (!db) return;
    showTokenToast('⏳ Exporting data…');
    try {
      const [accounts, saves, lb, bans, violations, ranks] = await Promise.all([
        db.collection('accounts').limit(500).get(),
        db.collection('saves').limit(500).get(),
        db.collection('leaderboard').limit(500).get(),
        db.collection('bans').limit(200).get(),
        db.collection('violations').limit(500).get(),
        db.collection('player_ranks').limit(500).get()
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        accounts:   accounts.docs.map(d=>({id:d.id,...d.data()})),
        saves:      saves.docs.map(d=>({id:d.id,...d.data()})),
        leaderboard:lb.docs.map(d=>({id:d.id,...d.data()})),
        bans:       bans.docs.map(d=>({id:d.id,...d.data()})),
        violations: violations.docs.map(d=>({id:d.id,...d.data()})),
        ranks:      ranks.docs.map(d=>({id:d.id,...d.data()}))
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'infinite_craft_export_' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showTokenToast('✅ Data exported!');
    } catch(e) { showTokenToast('❌ Export failed: ' + e.message); }
  }

  async function clearAllViolations() {
    if (!confirm('Clear ALL violations from the database?')) return;
    const db = _db(); if (!db) return;
    const snap = await db.collection('violations').limit(500).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    await _log('CLEAR_ALL_VIOLATIONS', `cleared ${snap.size}`);
    showTokenToast(`✅ Cleared ${snap.size} violations`);
    _renderTab();
  }

  // ─── CSS injection ───────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('admin-css')) return;
    const s = document.createElement('style');
    s.id = 'admin-css';
    s.textContent = `
/* ── Admin overlay ── */
#admin-overlay {
  position:fixed; inset:0; z-index:99999;
  background:var(--bg); color:var(--text);
  display:none; flex-direction:column;
  font-family:'Roboto',sans-serif; overflow:hidden;
}
#admin-overlay.open { display:flex; }
#admin-header {
  display:flex; align-items:center; gap:10px;
  padding:0 16px; height:52px;
  border-bottom:1px solid var(--border);
  background:var(--sb-bg); flex-shrink:0;
}
#admin-title { font-size:18px; font-weight:700; letter-spacing:-0.3px; }
#admin-close-btn {
  margin-left:auto; background:none; border:1px solid var(--border);
  border-radius:8px; color:var(--text); cursor:pointer;
  padding:5px 12px; font-size:13px; font-family:inherit;
}
#admin-close-btn:hover { background:rgba(255,60,60,0.15); border-color:#f66; }
#admin-user-pill {
  font-size:12px; background:var(--accent); color:#fff;
  border-radius:20px; padding:2px 10px; font-weight:600;
}
#admin-tabs {
  display:flex; gap:2px; padding:8px 10px 0;
  border-bottom:1px solid var(--border);
  background:var(--sb-bg); flex-shrink:0;
  overflow-x:auto; scrollbar-width:none;
}
#admin-tabs::-webkit-scrollbar { display:none; }
.admin-tab-btn {
  background:none; border:none; cursor:pointer;
  padding:6px 12px 8px; font-size:12px; font-weight:600;
  color:var(--text); opacity:0.5; border-bottom:2px solid transparent;
  white-space:nowrap; font-family:inherit;
  border-radius:6px 6px 0 0;
  transition:opacity 0.15s, border-color 0.15s;
}
.admin-tab-btn:hover  { opacity:0.8; }
.admin-tab-btn.active { opacity:1; border-bottom-color:var(--accent); }
#admin-content { flex:1; overflow-y:auto; padding:14px 16px; scrollbar-width:thin; }
.admin-card {
  background:var(--sb-bg); border:1px solid var(--border);
  border-radius:12px; padding:14px 16px; margin-bottom:12px;
}
.admin-card-title {
  font-size:14px; font-weight:700; margin-bottom:10px;
  display:flex; align-items:center; gap:6px;
}
.admin-stat-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  gap:10px; margin-bottom:14px;
}
.admin-stat-card {
  background:var(--sb-bg); border:1px solid var(--border);
  border-radius:10px; padding:12px 14px;
  display:flex; flex-direction:column; gap:4px;
}
.admin-stat-val { font-size:22px; font-weight:700; }
.admin-stat-lbl { font-size:11px; opacity:0.5; }
.admin-table { width:100%; border-collapse:collapse; font-size:13px; }
.admin-table th {
  text-align:left; padding:7px 10px; font-size:11px; font-weight:700;
  opacity:0.5; border-bottom:1px solid var(--border); white-space:nowrap;
}
.admin-table td { padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:middle; }
.admin-table tr:last-child td { border-bottom:none; }
.admin-table tr:hover td { background:rgba(128,128,128,0.06); }
.admin-input {
  background:var(--bg); border:1px solid var(--border);
  border-radius:8px; padding:7px 11px; font-size:13px;
  color:var(--text); font-family:inherit; width:100%;
  outline:none; transition:border-color 0.15s;
}
.admin-input:focus { border-color:var(--accent); }
.admin-input-sm { padding:4px 8px; font-size:12px; border-radius:6px; width:auto; }
.admin-select {
  background:var(--bg); border:1px solid var(--border);
  border-radius:8px; padding:7px 10px; font-size:13px;
  color:var(--text); font-family:inherit; outline:none; cursor:pointer;
}
.admin-btn {
  background:var(--accent); color:#fff; border:none;
  border-radius:8px; padding:7px 14px; font-size:13px;
  cursor:pointer; font-family:inherit; font-weight:600;
  transition:opacity 0.15s; white-space:nowrap;
}
.admin-btn:hover { opacity:0.85; }
.admin-btn.danger  { background:#ef4444; }
.admin-btn.warn    { background:#f59e0b; }
.admin-btn.success { background:#10b981; }
.admin-btn.ghost   { background:none; border:1px solid var(--border); color:var(--text); }
.admin-btn.purple  { background:#9333ea; }
.admin-btn.sm      { padding:4px 10px; font-size:12px; }
.admin-btn:disabled { opacity:0.4; cursor:not-allowed; }
.admin-search-row  { display:flex; gap:8px; margin-bottom:12px; align-items:center; flex-wrap:wrap; }
.admin-badge {
  display:inline-block; border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.admin-badge.red    { background:rgba(239,68,68,0.15); color:#ef4444; }
.admin-badge.green  { background:rgba(16,185,129,0.15); color:#10b981; }
.admin-badge.yellow { background:rgba(245,158,11,0.15); color:#f59e0b; }
.admin-badge.blue   { background:rgba(77,178,236,0.15); color:var(--accent); }
.admin-badge.grey   { background:rgba(128,128,128,0.12); color:#888; }
.admin-badge.purple { background:rgba(147,51,234,0.15); color:#9333ea; }
.admin-toggle { position:relative; display:inline-block; width:42px; height:22px; }
.admin-toggle input { opacity:0; width:0; height:0; }
.admin-toggle-slider {
  position:absolute; cursor:pointer; inset:0;
  background:#ccc; border-radius:22px; transition:0.2s;
}
.admin-toggle-slider:before {
  position:absolute; content:''; width:16px; height:16px;
  left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.2s;
}
.admin-toggle input:checked + .admin-toggle-slider { background:var(--accent); }
.admin-toggle input:checked + .admin-toggle-slider:before { transform:translateX(20px); }
.viol-row td { font-size:12px; }
.viol-sev-high  { color:#ef4444; font-weight:700; }
.viol-sev-med   { color:#f59e0b; font-weight:700; }
.viol-sev-low   { color:#10b981; }
.admin-player-profile {
  background:var(--sb-bg); border:1px solid var(--border);
  border-radius:12px; padding:16px; margin-bottom:12px;
}
.admin-player-name { font-size:18px; font-weight:700; margin-bottom:4px; }
.admin-player-uid  { font-size:11px; opacity:0.4; margin-bottom:12px; font-family:monospace; }
.admin-field-grid  { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.admin-field-row   { display:flex; flex-direction:column; gap:4px; }
.admin-field-lbl   { font-size:11px; opacity:0.5; font-weight:600; }
#admin-dm-msgs {
  max-height:200px; overflow-y:auto; border:1px solid var(--border);
  border-radius:8px; padding:8px; margin-bottom:8px;
  display:flex; flex-direction:column; gap:6px;
}
.dm-bubble { padding:6px 10px; border-radius:8px; font-size:13px; max-width:80%; }
.dm-bubble.from-admin  { background:var(--accent); color:#fff; align-self:flex-end; }
.dm-bubble.from-player { background:rgba(128,128,128,0.12); align-self:flex-start; }
.dm-bubble-time { font-size:10px; opacity:0.5; margin-top:2px; }
.admin-config-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 0; border-bottom:1px solid var(--border);
}
.admin-config-row:last-child { border-bottom:none; }
.admin-config-lbl  { font-size:14px; font-weight:600; }
.admin-config-desc { font-size:11px; opacity:0.5; margin-top:2px; }
.admin-log-row { font-size:12px; padding:5px 0; border-bottom:1px solid var(--border); display:flex; gap:10px; }
.admin-log-time { opacity:0.4; white-space:nowrap; }
.admin-log-action { font-weight:700; color:var(--accent); }
.admin-perm-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.admin-perm-item {
  display:flex; align-items:center; gap:6px; font-size:13px;
  background:rgba(128,128,128,0.06); border-radius:6px; padding:6px 10px;
}
.admin-section-title {
  font-size:12px; font-weight:700; opacity:0.4;
  text-transform:uppercase; letter-spacing:0.8px;
  margin:16px 0 8px;
}
.admin-alert { border-radius:8px; padding:10px 14px; font-size:13px; margin-bottom:10px; }
.admin-alert.info    { background:rgba(77,178,236,0.1); border:1px solid rgba(77,178,236,0.3); }
.admin-alert.warn    { background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); }
.admin-alert.danger  { background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); }
.admin-alert.success { background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); }
/* Rank pill */
.rank-pill {
  display:inline-flex; align-items:center; gap:4px;
  border-radius:20px; padding:2px 8px; font-size:11px; font-weight:700;
  border: 1px solid currentColor;
}
/* Player search suggestion rows */
.player-suggestion {
  display:flex; align-items:center; gap:8px;
  padding:8px 10px; border-bottom:1px solid var(--border);
  cursor:pointer; font-size:13px;
  transition:background 0.1s;
}
.player-suggestion:hover { background:rgba(128,128,128,0.08); }
.player-suggestion:last-child { border-bottom:none; }
.player-sug-name { font-weight:600; flex:1; }
.player-sug-meta { font-size:11px; opacity:0.5; display:flex; gap:8px; }
/* Shop item cards */
.shop-admin-item {
  display:flex; align-items:center; gap:10px;
  padding:10px; border:1px solid var(--border);
  border-radius:10px; margin-bottom:8px; font-size:13px;
}
.shop-admin-item-emoji { font-size:24px; flex-shrink:0; }
.shop-admin-item-info  { flex:1; }
.shop-admin-item-name  { font-weight:700; }
.shop-admin-item-desc  { font-size:11px; opacity:0.5; }
/* Debug grid */
.debug-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:10px;
}
.debug-card {
  background:var(--sb-bg); border:1px solid var(--border);
  border-radius:10px; padding:12px; display:flex;
  flex-direction:column; gap:8px;
}
.debug-card-title { font-size:13px; font-weight:700; }
.debug-card-desc  { font-size:11px; opacity:0.5; flex:1; }
/* Rank card */
.rank-card {
  display:flex; align-items:center; gap:10px;
  padding:10px 12px; border:1px solid var(--border);
  border-radius:10px; margin-bottom:6px;
}
.rank-card-swatch { width:16px; height:16px; border-radius:50%; flex-shrink:0; }
.rank-card-name   { font-weight:700; font-size:14px; flex:1; }
.rank-card-emoji  { font-size:20px; }
/* Effect checkbox row */
.effect-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:8px 0; }
.effect-item {
  display:flex; align-items:center; gap:6px; font-size:12px;
  padding:5px 8px; border-radius:6px; background:rgba(128,128,128,0.06);
}
@media (max-width:700px) {
  .admin-stat-grid { grid-template-columns:1fr 1fr; }
  .admin-field-grid { grid-template-columns:1fr; }
  .admin-perm-grid  { grid-template-columns:1fr; }
  .admin-table th:nth-child(n+4), .admin-table td:nth-child(n+4) { display:none; }
  .debug-grid { grid-template-columns:1fr; }
}
    `;
    document.head.appendChild(s);
  }

  // ─── Build overlay DOM ───────────────────────────────────────────────
  function _buildOverlay() {
    if (document.getElementById('admin-overlay')) return;
    const el = document.createElement('div');
    el.id = 'admin-overlay';
    el.innerHTML = `
<div id="admin-header">
  <span style="font-size:20px">🔧</span>
  <span id="admin-title">Infinite Craft — Admin Panel</span>
  <span id="admin-user-pill">👑 ${AUTH_USER}</span>
  <button id="admin-close-btn" onclick="ADMIN.close()">✕ Close Panel</button>
</div>
<div id="admin-tabs">
  <button class="admin-tab-btn" data-tab="dashboard"   onclick="ADMIN.switchTab('dashboard')">📊 Dashboard</button>
  <button class="admin-tab-btn" data-tab="players"     onclick="ADMIN.switchTab('players')">👥 Players</button>
  <button class="admin-tab-btn" data-tab="ranks"       onclick="ADMIN.switchTab('ranks')">🏷️ Ranks</button>
  <button class="admin-tab-btn" data-tab="shopAdmin"   onclick="ADMIN.switchTab('shopAdmin')">🛒 Shop Admin</button>
  <button class="admin-tab-btn" data-tab="violations"  onclick="ADMIN.switchTab('violations')">🚨 Violations</button>
  <button class="admin-tab-btn" data-tab="bans"        onclick="ADMIN.switchTab('bans')">🚫 Bans</button>
  <button class="admin-tab-btn" data-tab="broadcast"   onclick="ADMIN.switchTab('broadcast')">📢 Broadcast</button>
  <button class="admin-tab-btn" data-tab="dms"         onclick="ADMIN.switchTab('dms')">💬 DMs</button>
  <button class="admin-tab-btn" data-tab="leaderboard" onclick="ADMIN.switchTab('leaderboard')">🏆 Leaderboard</button>
  <button class="admin-tab-btn" data-tab="combos"      onclick="ADMIN.switchTab('combos')">🧪 Combos</button>
  <button class="admin-tab-btn" data-tab="worldfirsts" onclick="ADMIN.switchTab('worldfirsts')">🌍 World Firsts</button>
  <button class="admin-tab-btn" data-tab="gameconfig"  onclick="ADMIN.switchTab('gameconfig')">⚙️ Game Config</button>
  <button class="admin-tab-btn" data-tab="api"         onclick="ADMIN.switchTab('api')">🤖 API Monitor</button>
  <button class="admin-tab-btn" data-tab="ops"         onclick="ADMIN.switchTab('ops')">🛡️ OPs</button>
  <button class="admin-tab-btn" data-tab="auditlog"    onclick="ADMIN.switchTab('auditlog')">📋 Audit Log</button>
  <button class="admin-tab-btn" data-tab="debug"       onclick="ADMIN.switchTab('debug')" style="color:#f59e0b;opacity:0.7">🐛 Debug</button>
</div>
<div id="admin-content">
  <div style="text-align:center;padding:40px;opacity:0.4">Loading…</div>
</div>
    `;
    document.body.appendChild(el);
  }

  // ─── Tab rendering ───────────────────────────────────────────────────
  async function _renderTab() {
    const el = document.getElementById('admin-content');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;opacity:0.4">⏳ Loading…</div>';
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === _tab);
    });
    switch(_tab) {
      case 'dashboard':   el.innerHTML = await _tabDashboard();   break;
      case 'players':     await _renderPlayersTab(el);            break;
      case 'ranks':       el.innerHTML = await _tabRanks();       break;
      case 'shopAdmin':   el.innerHTML = await _tabShopAdmin();   break;
      case 'violations':  el.innerHTML = await _tabViolations();  break;
      case 'bans':        el.innerHTML = await _tabBans();        break;
      case 'broadcast':   el.innerHTML = await _tabBroadcast();   break;
      case 'dms':         el.innerHTML = await _tabDMs();         break;
      case 'leaderboard': el.innerHTML = await _tabLeaderboard(); break;
      case 'combos':      el.innerHTML = await _tabCombos();      break;
      case 'worldfirsts': el.innerHTML = await _tabWorldFirsts(); break;
      case 'gameconfig':  el.innerHTML = await _tabGameConfig();  break;
      case 'api':         el.innerHTML = await _tabAPI();         break;
      case 'ops':         el.innerHTML = await _tabOPs();         break;
      case 'auditlog':    el.innerHTML = await _tabAuditLog();    break;
      case 'debug':       el.innerHTML = await _tabDebug();       break;
      default: el.innerHTML = '<div style="padding:20px;opacity:0.5">Unknown tab</div>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: DASHBOARD
  // ─────────────────────────────────────────────────────────────────────
  async function _tabDashboard() {
    const db = _db();
    let totalPlayers=0, totalCombos=0, activeBans=0, recentViolations=0, totalWorldFirsts=0;
    if (db) {
      try {
        const [acc, cmb, bns, vio, wf] = await Promise.all([
          db.collection('accounts').get(),
          db.collection('combos').limit(1000).get(),
          db.collection('bans').where('active','==',true).get(),
          db.collection('violations').orderBy('at','desc').limit(50).get(),
          db.collection('global_firsts').limit(1000).get()
        ]);
        totalPlayers = acc.size; totalCombos = cmb.size;
        activeBans = bns.size; recentViolations = vio.size; totalWorldFirsts = wf.size;
      } catch(_){}
    }
    const recentViolHtml = db ? await (async () => {
      try {
        const snap = await db.collection('violations').orderBy('at','desc').limit(8).get();
        if (snap.empty) return '<div style="opacity:0.4;font-size:13px;padding:8px 0">No recent violations.</div>';
        return snap.docs.map(d => {
          const v = d.data();
          const sev = v.reason.includes('velocity')||v.reason.includes('insane') ? 'HIGH':'LOW';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
            <span><b>${v.username||'?'}</b> — <span class="viol-sev-${sev.toLowerCase()}">${v.reason}</span></span>
            <span style="opacity:0.4">${_ago(v.at)}</span>
          </div>`;
        }).join('');
      } catch(_) { return ''; }
    })() : '';
    const recentActHtml = db ? await (async () => {
      try {
        const snap = await db.collection('admin_log').orderBy('at','desc').limit(8).get();
        if (snap.empty) return '<div style="opacity:0.4;font-size:13px;padding:8px 0">No actions yet.</div>';
        return snap.docs.map(d => {
          const a = d.data();
          return `<div class="admin-log-row"><span class="admin-log-time">${_ago(a.at)}</span><span class="admin-log-action">${a.action}</span><span style="opacity:0.6">${a.details||''}</span></div>`;
        }).join('');
      } catch(_) { return ''; }
    })() : '';
    return `
<div class="admin-stat-grid">
  <div class="admin-stat-card"><div class="admin-stat-val">${_fmt(totalPlayers)}</div><div class="admin-stat-lbl">👥 Total Players</div></div>
  <div class="admin-stat-card"><div class="admin-stat-val">${_fmt(totalCombos)}</div><div class="admin-stat-lbl">🧪 Cached Combos</div></div>
  <div class="admin-stat-card"><div class="admin-stat-val" style="${activeBans>0?'color:#ef4444':''}">${activeBans}</div><div class="admin-stat-lbl">🚫 Active Bans</div></div>
  <div class="admin-stat-card"><div class="admin-stat-val" style="${recentViolations>0?'color:#f59e0b':''}">${recentViolations}</div><div class="admin-stat-lbl">🚨 Violations (last 50)</div></div>
  <div class="admin-stat-card"><div class="admin-stat-val">${_fmt(totalWorldFirsts)}</div><div class="admin-stat-lbl">🌍 World Firsts</div></div>
  <div class="admin-stat-card"><div class="admin-stat-val" style="color:var(--accent)">${AUTH_USER}</div><div class="admin-stat-lbl">👑 Logged in as</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="admin-card"><div class="admin-card-title">🚨 Recent Violations</div>${recentViolHtml}</div>
  <div class="admin-card"><div class="admin-card-title">📋 Recent Admin Actions</div>${recentActHtml}</div>
</div>
<div class="admin-card" style="margin-top:12px">
  <div class="admin-card-title">⚡ Quick Actions</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="admin-btn" onclick="ADMIN.switchTab('violations')">🚨 Violations</button>
    <button class="admin-btn warn" onclick="ADMIN.switchTab('bans')">🚫 Bans</button>
    <button class="admin-btn success" onclick="ADMIN.switchTab('broadcast')">📢 Broadcast</button>
    <button class="admin-btn ghost" onclick="ADMIN.switchTab('players')">👥 Players</button>
    <button class="admin-btn ghost" onclick="ADMIN.switchTab('ranks')">🏷️ Ranks</button>
    <button class="admin-btn ghost" onclick="ADMIN.switchTab('shopAdmin')">🛒 Shop</button>
    <button class="admin-btn purple" onclick="ADMIN.switchTab('debug')">🐛 Debug</button>
  </div>
</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: PLAYERS  (live search + stats)
  // ─────────────────────────────────────────────────────────────────────
  async function _renderPlayersTab(el) {
    let profileHtml = '';
    if (_editTarget) {
      const d = _editTarget.data || {};
      const rank = _editTarget.rank;
      const rankBadge = rank
        ? `<span class="rank-pill" style="color:${rank.rankColor};border-color:${rank.rankColor};background:${rank.rankColor}22">${rank.rankEmoji} ${rank.rankName}</span>`
        : '<span style="opacity:0.4;font-size:12px">No rank</span>';
      const defs = await _getRankDefs();
      const rankOptions = defs.map(r => `<option value="${r.key}" ${rank?.rankKey===r.key?'selected':''}>${r.emoji} ${r.name}</option>`).join('');
      profileHtml = `
<div class="admin-player-profile">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div>
      <div class="admin-player-name">👤 ${_editTarget.username} ${rankBadge}</div>
      <div class="admin-player-uid">UID: ${_editTarget.uid}</div>
    </div>
    <button class="admin-btn ghost sm" onclick="ADMIN._clearEditTarget()">← Back</button>
  </div>
  <div class="admin-section-title">🏷️ Rank</div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
    <select class="admin-select" id="player-rank-select" style="flex:1;max-width:220px">
      <option value="">— No Rank —</option>
      ${rankOptions}
    </select>
    <button class="admin-btn sm success" onclick="ADMIN._assignRank('${_editTarget.uid}','${_editTarget.username}')">✅ Assign</button>
    ${rank ? `<button class="admin-btn sm danger" onclick="ADMIN._removeRank('${_editTarget.uid}','${_editTarget.username}')">🗑️ Remove Rank</button>` : ''}
  </div>
  <div class="admin-section-title">Economy</div>
  <div class="admin-field-grid">
    ${_editField(_editTarget.uid,'tokens','🪙 Tokens',d.tokens,'number')}
    ${_editField(_editTarget.uid,'xp','⭐ XP',d.xp,'number')}
    ${_editField(_editTarget.uid,'level','📈 Level',d.level,'number')}
    ${_editField(_editTarget.uid,'prestige','🏆 Prestige',d.prestige,'number')}
    ${_editField(_editTarget.uid,'totalTokensEarned','💰 Total Earned',d.totalTokensEarned,'number')}
    ${_editField(_editTarget.uid,'totalCrafts','⚗️ Total Crafts',d.totalCrafts,'number')}
  </div>
  <div class="admin-section-title">Quick Actions</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <button class="admin-btn success sm" onclick="ADMIN._quickGiveTokens('${_editTarget.uid}','${_editTarget.username}')">💰 Give Tokens</button>
    <button class="admin-btn sm" onclick="ADMIN._quickGiveItem('${_editTarget.uid}','${_editTarget.username}')">🎁 Give Item</button>
    <button class="admin-btn sm warn" onclick="ADMIN._confirmClearInventory('${_editTarget.uid}','${_editTarget.username}')">🗑️ Clear Inventory</button>
    <button class="admin-btn sm" onclick="ADMIN._openDMTarget('${_editTarget.uid}','${_editTarget.username}')">💬 Send DM</button>
    <button class="admin-btn danger sm" onclick="ADMIN._openBanPrompt('${_editTarget.uid}','${_editTarget.username}')">🚫 Ban</button>
    <button class="admin-btn danger sm" onclick="ADMIN._confirmWipeSave('${_editTarget.uid}','${_editTarget.username}')">💥 Wipe Save</button>
  </div>
  <div class="admin-section-title">Reset Stats</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
    <button class="admin-btn warn sm" onclick="ADMIN._resetStats('${_editTarget.uid}','${_editTarget.username}','economy')">🪙 Reset Economy</button>
    <button class="admin-btn warn sm" onclick="ADMIN._resetStats('${_editTarget.uid}','${_editTarget.username}','progress')">📈 Reset Level/XP</button>
    <button class="admin-btn warn sm" onclick="ADMIN._resetStats('${_editTarget.uid}','${_editTarget.username}','crafts')">⚗️ Reset Crafts</button>
    <button class="admin-btn danger sm" onclick="ADMIN._resetStats('${_editTarget.uid}','${_editTarget.username}','all')">🔴 Full Reset</button>
  </div>
  <div class="admin-section-title">Collection Stats</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;font-size:13px">
    <div class="admin-stat-card"><div class="admin-stat-val">${_fmt((d.discovered||[]).length)}</div><div class="admin-stat-lbl">Elements</div></div>
    <div class="admin-stat-card"><div class="admin-stat-val">${_fmt((d.firstDiscs||[]).length)}</div><div class="admin-stat-lbl">Discoveries</div></div>
    <div class="admin-stat-card"><div class="admin-stat-val">${_fmt(Math.round((d.timePlayed||0)/60))}</div><div class="admin-stat-lbl">Mins Played</div></div>
  </div>
  <div class="admin-section-title" style="color:#ef4444">⚠️ Danger Zone</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="admin-btn danger sm" onclick="ADMIN._deleteAccount('${_editTarget.uid}','${_editTarget.username}')">🗑️ DELETE ACCOUNT</button>
  </div>
</div>`;
    }

    el.innerHTML = `
${profileHtml}
<div class="admin-card">
  <div class="admin-card-title">👥 Player Search</div>
  <div class="admin-search-row">
    <input class="admin-input" id="admin-player-search" placeholder="Type to search players…"
      value="${_searchQ}" style="max-width:320px"
      oninput="ADMIN._livePlayerSearch(this.value)">
    <button class="admin-btn ghost" onclick="ADMIN._loadAllPlayers()">Load All</button>
  </div>
  <div id="admin-player-results">
    <div style="opacity:0.4;font-size:13px;padding:8px 0">Type a username above to search, or click "Load All".</div>
  </div>
</div>`;
  }

  function _editField(uid, field, label, value, type) {
    const id = `ef-${field}`;
    return `<div class="admin-field-row">
      <div class="admin-field-lbl">${label}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="admin-input admin-input-sm" id="${id}" type="${type}" value="${value||0}" style="flex:1">
        <button class="admin-btn sm success" onclick="ADMIN._saveField('${uid}','${field}','${id}','${label}')">Save</button>
      </div>
    </div>`;
  }

  // ── Live player search ───────────────────────────────────────────────
  function _livePlayerSearch(q) {
    _searchQ = q;
    clearTimeout(_searchDebounce);
    if (!q.trim()) {
      const el = document.getElementById('admin-player-results');
      if (el) el.innerHTML = '<div style="opacity:0.4;font-size:13px;padding:8px 0">Type a username above to search.</div>';
      return;
    }
    const el = document.getElementById('admin-player-results');
    if (el) el.innerHTML = '<div style="opacity:0.4;font-size:13px;padding:8px 0">🔍 Searching…</div>';
    _searchDebounce = setTimeout(async () => {
      await _doLiveSearch(q.trim().toLowerCase());
    }, 350);
  }

  async function _doLiveSearch(q) {
    const el = document.getElementById('admin-player-results');
    if (!el) return;
    const db = _db();
    if (!db) { el.innerHTML='<div style="color:#ef4444">Firebase not connected.</div>'; return; }
    try {
      const snap = await db.collection('accounts')
        .orderBy('displayName')
        .startAt(q).endAt(q + '\uf8ff')
        .limit(15).get();
      if (snap.empty) { el.innerHTML='<div style="opacity:0.4;font-size:13px;padding:8px 0">No players found.</div>'; return; }
      const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Load stats in parallel
      const statsPromises = players.map(p => p.uid ? Promise.all([
        db.collection('saves').doc(p.uid).get(),
        db.collection('violations').where('uid','==',p.uid).limit(20).get(),
        db.collection('player_ranks').doc(p.uid).get()
      ]).catch(() => [null, null, null]) : Promise.resolve([null, null, null]));
      const statsResults = await Promise.all(statsPromises);
      let html = '';
      players.forEach((p, i) => {
        const [saveDoc, violSnap, rankDoc] = statsResults[i] || [];
        const save = saveDoc?.exists ? saveDoc.data() : null;
        const violCount = violSnap?.size || 0;
        const rank = rankDoc?.exists ? rankDoc.data() : null;
        const isSus = violCount >= 5;
        const timeMins = Math.round((save?.timePlayed || 0) / 60);
        const rankHtml = rank
          ? `<span class="rank-pill" style="color:${rank.rankColor};border-color:${rank.rankColor};background:${rank.rankColor}22;font-size:10px">${rank.rankEmoji} ${rank.rankName}</span>`
          : '';
        const violBadge = violCount > 0
          ? `<span class="admin-badge ${violCount>=5?'red':'yellow'}" style="font-size:10px">⚠️ ${violCount} warns</span>`
          : '';
        const susBadge = isSus ? '<span class="admin-badge red" style="font-size:10px">🚨 SUS</span>' : '';
        html += `<div class="player-suggestion" onclick="ADMIN._viewPlayer('${p.uid||''}','${p.displayName||p.id}')">
          <div class="player-sug-name">${p.displayName || p.id} ${rankHtml}</div>
          <div class="player-sug-meta">
            <span>Lv ${save?.level||1}</span>
            <span>⏱️ ${timeMins}m</span>
            ${violBadge}
            ${susBadge}
          </div>
          <button class="admin-btn sm ghost" style="flex-shrink:0" onclick="event.stopPropagation();ADMIN._openBanPrompt('${p.uid||''}','${p.displayName||p.id}')">🚫</button>
        </div>`;
      });
      el.innerHTML = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">${html}</div>`;
    } catch(e) { el.innerHTML = `<div style="color:#ef4444">Error: ${e.message}</div>`; }
  }

  async function _loadAllPlayers() {
    const el = document.getElementById('admin-player-results');
    if (!el) return;
    el.innerHTML = '<div style="opacity:0.4;font-size:13px;padding:8px 0">⏳ Loading…</div>';
    const db = _db(); if (!db) return;
    try {
      const snap = await db.collection('accounts').limit(100).get();
      if (snap.empty) { el.innerHTML='<div style="opacity:0.4;font-size:13px">No players yet.</div>'; return; }
      const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Load ranks for all in parallel
      const rankPromises = players.map(p => p.uid
        ? db.collection('player_ranks').doc(p.uid).get().catch(()=>null)
        : Promise.resolve(null));
      const rankResults = await Promise.all(rankPromises);
      let html = '';
      players.forEach((p, i) => {
        const rankDoc = rankResults[i];
        const rank = rankDoc?.exists ? rankDoc.data() : null;
        const rankHtml = rank
          ? `<span class="rank-pill" style="color:${rank.rankColor};border-color:${rank.rankColor};background:${rank.rankColor}22;font-size:10px">${rank.rankEmoji} ${rank.rankName}</span>`
          : '';
        html += `<div class="player-suggestion" onclick="ADMIN._viewPlayer('${p.uid||''}','${p.displayName||p.id}')">
          <div class="player-sug-name">${p.displayName||p.id} ${rankHtml}</div>
          <div class="player-sug-meta"><span style="font-family:monospace">${(p.uid||'').slice(0,10)}…</span></div>
          <button class="admin-btn sm ghost" style="flex-shrink:0" onclick="event.stopPropagation();ADMIN._openBanPrompt('${p.uid||''}','${p.displayName||p.id}')">🚫</button>
        </div>`;
      });
      el.innerHTML = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">${html}</div>`;
    } catch(e) { el.innerHTML=`<div style="color:#ef4444">Error: ${e.message}</div>`; }
  }

  async function _viewPlayer(uid, username) {
    const [data, rank] = await Promise.all([
      getPlayerData(uid) || {},
      _getPlayerRank(uid)
    ]);
    _editTarget = { uid, username, data: data || {}, rank };
    _tab = 'players';
    _renderTab();
  }

  function _clearEditTarget() { _editTarget = null; _renderTab(); }

  async function _saveField(uid, field, inputId, label) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const val = ['featuredBadge'].includes(field) ? inp.value : Number(inp.value);
    await setPlayerField(uid, _editTarget?.username||uid, field, val);
    if (_editTarget?.data) _editTarget.data[field] = val;
  }

  function _quickGiveTokens(uid, username) {
    const amount = parseInt(prompt(`Give how many tokens to ${username}?`) || '0');
    if (!amount || isNaN(amount)) return;
    const cur = _editTarget?.data?.tokens || 0;
    setPlayerField(uid, username, 'tokens', cur + amount);
    if (_editTarget?.data) _editTarget.data.tokens = cur + amount;
  }

  function _confirmClearInventory(uid, username) {
    if (!confirm(`Clear ALL discovered elements for ${username}?`)) return;
    clearPlayerInventory(uid, username);
  }
  function _confirmWipeSave(uid, username) { resetPlayerSave(uid, username); }
  function _quickGiveItem(uid, username) {
    const key = prompt(`Item key to give ${username}:\n(e.g. auto1, pet_robot, theme_dark)`);
    if (key?.trim()) givePlayerItem(uid, username, key.trim());
  }
  function _openDMTarget(uid, username) { _dmTarget = { uid, username }; _tab = 'dms'; _renderTab(); }
  function _openBanPrompt(uid, username) {
    const dur = prompt(`Ban ${username}?\n0=permanent, 1=1h, 6=6h, 24=24h, 168=7d, 720=30d`);
    if (dur === null) return;
    const reason = prompt('Reason (shown to player):') || 'Banned by admin.';
    const hours = parseFloat(dur);
    banPlayer(uid, username, hours<=0 ? -1 : hours*3600000, reason);
  }
  async function _assignRank(uid, username) {
    const sel = document.getElementById('player-rank-select');
    if (!sel) return;
    const key = sel.value;
    if (!key) { await removeRank(uid, username); }
    else { await assignRank(uid, username, key); }
    // Refresh
    _editTarget.rank = await _getPlayerRank(uid);
    _renderTab();
  }
  async function _removeRank(uid, username) {
    await removeRank(uid, username);
    _editTarget.rank = null;
    _renderTab();
  }
  async function _deleteAccount(uid, username) { await deleteAccount(uid, username); }
  async function _resetStats(uid, username, what) { await resetPlayerStats(uid, username, what); }
  function _setBadge(uid, username) {
    const badge = prompt(`Enter badge emoji for ${username}:`);
    if (badge) setFeaturedBadge(uid, username, badge);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: RANKS
  // ─────────────────────────────────────────────────────────────────────
  async function _tabRanks() {
    const db = _db();
    const defs = await _getRankDefs();

    // Preset ranks display
    const presetHtml = PRESET_RANKS.map(r => `
<div class="rank-card">
  <div class="rank-card-swatch" style="background:${r.color}"></div>
  <div class="rank-card-emoji">${r.emoji}</div>
  <div class="rank-card-name">${r.name}</div>
  <code style="font-size:11px;opacity:0.5;flex-shrink:0">${r.key}</code>
  <span class="admin-badge grey">Built-in</span>
</div>`).join('');

    // Custom ranks
    let customHtml = '';
    if (db) {
      try {
        const snap = await db.collection('admin_ranks').get();
        if (snap.empty) {
          customHtml = '<div style="opacity:0.4;font-size:13px;padding:8px 0">No custom ranks yet.</div>';
        } else {
          customHtml = snap.docs.map(doc => {
            const r = doc.data();
            return `<div class="rank-card">
              <div class="rank-card-swatch" style="background:${r.color||'#888'}"></div>
              <div class="rank-card-emoji">${r.emoji||'🏅'}</div>
              <div class="rank-card-name">${r.name}</div>
              <code style="font-size:11px;opacity:0.5;flex-shrink:0">${r.key}</code>
              <button class="admin-btn sm danger" onclick="ADMIN._deleteCustomRank('${r.key}')">🗑️</button>
            </div>`;
          }).join('');
        }
      } catch(e) { customHtml = `<div style="color:#ef4444">Error: ${e.message}</div>`; }
    }

    // Players with ranks
    let assignedHtml = '';
    if (db) {
      try {
        const snap = await db.collection('player_ranks').limit(100).get();
        if (snap.empty) {
          assignedHtml = '<tr><td colspan="5" style="opacity:0.4;padding:16px;text-align:center">No ranks assigned yet.</td></tr>';
        } else {
          assignedHtml = snap.docs.map(doc => {
            const r = doc.data();
            return `<tr>
              <td><b>${r.username||'?'}</b></td>
              <td><span class="rank-pill" style="color:${r.rankColor};border-color:${r.rankColor};background:${r.rankColor}22">${r.rankEmoji} ${r.rankName}</span></td>
              <td style="opacity:0.4;font-size:11px">${r.assignedBy||'?'}</td>
              <td style="opacity:0.4;font-size:11px">${_ago(r.assignedAt)}</td>
              <td>
                <button class="admin-btn sm ghost" onclick="ADMIN._viewPlayer('${r.uid}','${r.username||''}')">✏️ Edit</button>
                <button class="admin-btn sm danger" onclick="ADMIN._adminRemoveRank('${r.uid}','${r.username||''}')">🗑️ Remove</button>
              </td>
            </tr>`;
          }).join('');
        }
      } catch(e) { assignedHtml = `<tr><td colspan="5" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
    }

    const allRankOptions = defs.map(r => `<option value="${r.key}">${r.emoji} ${r.name}</option>`).join('');

    return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="admin-card">
    <div class="admin-card-title">⚙️ Preset Ranks</div>
    ${presetHtml}
  </div>
  <div class="admin-card">
    <div class="admin-card-title">✨ Custom Ranks</div>
    ${customHtml}
    <div class="admin-section-title" style="margin-top:14px">➕ Create New Rank</div>
    <div style="display:grid;grid-template-columns:1fr 60px 120px auto;gap:8px;align-items:end">
      <div><div class="admin-field-lbl" style="margin-bottom:4px">Name</div><input class="admin-input" id="rank-name" placeholder="VIP+"></div>
      <div><div class="admin-field-lbl" style="margin-bottom:4px">Emoji</div><input class="admin-input" id="rank-emoji" placeholder="🌟"></div>
      <div><div class="admin-field-lbl" style="margin-bottom:4px">Color</div><input type="color" id="rank-color" value="#4dc6ec" style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:none"></div>
      <button class="admin-btn success" onclick="ADMIN._createRank()">➕ Create</button>
    </div>
  </div>
</div>

<div class="admin-card">
  <div class="admin-card-title">👤 Assign Rank to Player</div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
    <input class="admin-input" id="rank-assign-username" placeholder="Username…" style="max-width:200px">
    <select class="admin-select" id="rank-assign-key">${allRankOptions}</select>
    <button class="admin-btn success" onclick="ADMIN._quickAssignRank()">✅ Assign</button>
  </div>
</div>

<div class="admin-card">
  <div class="admin-card-title">📋 Currently Ranked Players</div>
  <div style="overflow-x:auto">
    <table class="admin-table">
      <thead><tr><th>Player</th><th>Rank</th><th>Assigned By</th><th>When</th><th>Actions</th></tr></thead>
      <tbody>${assignedHtml}</tbody>
    </table>
  </div>
</div>`;
  }

  async function _createRank() {
    const name  = (document.getElementById('rank-name')?.value||'').trim();
    const emoji = (document.getElementById('rank-emoji')?.value||'').trim();
    const color = document.getElementById('rank-color')?.value || '#888';
    if (!name || !emoji) { showTokenToast('⚠️ Enter name and emoji'); return; }
    await createCustomRank(name, emoji, color);
  }

  async function _deleteCustomRank(key) { await deleteCustomRank(key); }

  async function _quickAssignRank() {
    const username = (document.getElementById('rank-assign-username')?.value||'').trim().toLowerCase();
    const rankKey  = document.getElementById('rank-assign-key')?.value;
    if (!username || !rankKey) { showTokenToast('⚠️ Enter username and select rank'); return; }
    const db = _db(); if (!db) return;
    const acc = await db.collection('accounts').doc(username).get();
    if (!acc.exists) { showTokenToast('❌ Player not found: ' + username); return; }
    const uid = acc.data().uid;
    await assignRank(uid, username, rankKey);
    _renderTab();
  }

  async function _adminRemoveRank(uid, username) {
    if (!confirm(`Remove rank from ${username}?`)) return;
    await removeRank(uid, username);
    _renderTab();
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: SHOP ADMIN
  // ─────────────────────────────────────────────────────────────────────
  async function _tabShopAdmin() {
    const db = _db();
    let cfg = {};
    let regularItems = [], limitedItems = [];
    if (db) {
      try {
        const [cfgDoc, snap] = await Promise.all([
          db.collection('game_config').doc('global').get(),
          db.collection('admin_shop_items').get()
        ]);
        cfg = cfgDoc.exists ? cfgDoc.data() : {};
        const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        regularItems = allItems.filter(i => !i.limited);
        limitedItems = allItems.filter(i => i.limited);
      } catch(_){}
    }

    const renderItems = (items) => items.map(item => `
<div class="shop-admin-item">
  <div class="shop-admin-item-emoji">${item.emoji||'📦'}</div>
  <div class="shop-admin-item-info">
    <div class="shop-admin-item-name">${item.name} <span style="font-size:11px;opacity:0.5">· 🪙 ${item.cost||0}</span></div>
    <div class="shop-admin-item-desc">${item.description||''}</div>
    ${item.effects ? `<div style="font-size:11px;opacity:0.4;margin-top:2px">Effects: ${Object.keys(item.effects).filter(k=>item.effects[k]).join(', ')}</div>` : ''}
  </div>
  <button class="admin-btn sm danger" onclick="ADMIN._removeShopItem('${item.id}',${item.limited})">🗑️</button>
</div>`).join('') || '<div style="opacity:0.4;font-size:13px;padding:8px 0">No items added yet.</div>';

    const limitedShopActive = cfg.limitedShopActive || false;

    return `
<div class="admin-card">
  <div class="admin-card-title">➕ Force Add Shop Item</div>
  <div class="admin-alert info" style="margin-bottom:12px">
    Items added here appear in the shop for all players. Players who purchase limited items keep them even when the limited shop is disabled.
  </div>
  <div style="display:grid;grid-template-columns:60px 1fr 1fr 120px;gap:8px;margin-bottom:8px">
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Emoji</div><input class="admin-input" id="si-emoji" placeholder="🎩"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Name</div><input class="admin-input" id="si-name" placeholder="Magic Hat"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Description</div><input class="admin-input" id="si-desc" placeholder="A mysterious hat…"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Cost (tokens)</div><input class="admin-input" id="si-cost" type="number" placeholder="500" value="500"></div>
  </div>
  <div class="admin-field-lbl" style="margin-bottom:6px">Effects</div>
  <div class="effect-grid">
    <label class="effect-item"><input type="checkbox" id="eff-bonus-tokens"> 🪙 Bonus Tokens on craft</label>
    <label class="effect-item"><input type="checkbox" id="eff-bonus-xp">     ⭐ Bonus XP on craft</label>
    <label class="effect-item"><input type="checkbox" id="eff-special-pet">  🐾 Special Pet</label>
    <label class="effect-item"><input type="checkbox" id="eff-cosmetic">     🎨 Cosmetic (visual only)</label>
    <label class="effect-item"><input type="checkbox" id="eff-custom">       ✏️ Custom Effect (see below)</label>
  </div>
  <div style="margin-top:8px">
    <div class="admin-field-lbl" style="margin-bottom:4px">Pet Name <span style="opacity:0.4">(if pet)</span></div>
    <input class="admin-input admin-input-sm" id="si-pet-name" placeholder="Fluffy" style="max-width:200px">
  </div>
  <div style="margin-top:8px">
    <div class="admin-field-lbl" style="margin-bottom:4px">Custom Effect Description</div>
    <input class="admin-input admin-input-sm" id="si-custom-effect" placeholder="Gives +10 tokens per discovery" style="max-width:400px">
  </div>
  <div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap">
    <label class="effect-item" style="border-radius:8px;padding:7px 12px;background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.3)">
      <input type="checkbox" id="si-limited"> 🌟 Add to Limited Shop instead
    </label>
    <button class="admin-btn success" onclick="ADMIN._addShopItem()">➕ Add to Shop</button>
  </div>
</div>

<div class="admin-card">
  <div class="admin-card-title">🛒 Regular Shop Items (Admin-Added)</div>
  ${renderItems(regularItems)}
</div>

<div class="admin-card">
  <div class="admin-card-title" style="justify-content:space-between">
    <span>🌟 Limited Shop</span>
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:12px;opacity:0.5">${limitedShopActive?'<span style="color:#10b981">● LIVE</span>':'<span style="opacity:0.4">○ Hidden</span>'}</span>
      <label class="admin-toggle">
        <input type="checkbox" ${limitedShopActive?'checked':''} onchange="ADMIN._setLimitedShop(this.checked)">
        <span class="admin-toggle-slider"></span>
      </label>
    </div>
  </div>
  <div class="admin-alert ${limitedShopActive?'success':'warn'}" style="margin-bottom:10px">
    ${limitedShopActive
      ? '✅ Limited shop is <b>LIVE</b> — players can see and buy limited items.'
      : '🔒 Limited shop is <b>HIDDEN</b> — items are not shown to players. Players who already bought items keep them.'}
  </div>
  ${renderItems(limitedItems)}
</div>`;
  }

  async function _addShopItem() {
    const emoji  = (document.getElementById('si-emoji')?.value||'').trim() || '📦';
    const name   = (document.getElementById('si-name')?.value||'').trim();
    const desc   = (document.getElementById('si-desc')?.value||'').trim();
    const cost   = parseInt(document.getElementById('si-cost')?.value||'500');
    const limited = document.getElementById('si-limited')?.checked || false;
    if (!name) { showTokenToast('⚠️ Enter item name'); return; }
    const effects = {
      bonusTokens:  document.getElementById('eff-bonus-tokens')?.checked || false,
      bonusXP:      document.getElementById('eff-bonus-xp')?.checked || false,
      specialPet:   document.getElementById('eff-special-pet')?.checked || false,
      cosmetic:     document.getElementById('eff-cosmetic')?.checked || false,
      custom:       document.getElementById('eff-custom')?.checked || false,
    };
    const petName      = (document.getElementById('si-pet-name')?.value||'').trim();
    const customEffect = (document.getElementById('si-custom-effect')?.value||'').trim();
    await addAdminShopItem({ emoji, name, description: desc, cost, effects, petName, customEffect, limited });
  }

  async function _removeShopItem(id) { await removeAdminShopItem(id); }
  async function _setLimitedShop(active) { await setLimitedShopActive(active); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: VIOLATIONS
  // ─────────────────────────────────────────────────────────────────────
  async function _tabViolations() {
    const db = _db();
    let rows = '';
    if (db) {
      try {
        const snap = await db.collection('violations').orderBy('at','desc').limit(100).get();
        if (snap.empty) {
          rows = '<tr><td colspan="6" style="opacity:0.4;padding:20px;text-align:center">No violations.</td></tr>';
        } else {
          rows = snap.docs.map(doc => {
            const v = doc.data();
            const sev = v.reason?.includes('velocity')||v.reason?.includes('insane')||v.reason?.includes('checksum') ? 'HIGH':'MED';
            return `<tr class="viol-row">
              <td class="viol-sev-${sev.toLowerCase()}">${sev}</td>
              <td><b>${v.username||'?'}</b></td>
              <td style="font-family:monospace;max-width:200px;overflow:hidden;text-overflow:ellipsis">${v.reason||''}</td>
              <td style="opacity:0.5">${_ago(v.at)}</td>
              <td style="font-family:monospace;font-size:10px;opacity:0.4">${(v.uid||'').slice(0,10)}…</td>
              <td><div style="display:flex;gap:5px">
                <button class="admin-btn sm" onclick="ADMIN._viewPlayer('${v.uid||''}','${v.username||'?'}')">👤</button>
                <button class="admin-btn sm danger" onclick="ADMIN._openBanPrompt('${v.uid||''}','${v.username||'?'}')">🚫</button>
                <button class="admin-btn sm ghost" onclick="ADMIN._dismissViolation('${doc.id}',this)">✓</button>
              </div></td>
            </tr>`;
          }).join('');
        }
      } catch(e) { rows = `<tr><td colspan="6" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
    }
    return `
<div class="admin-alert info">Violations are flagged by the Anticheat system.</div>
<div class="admin-card">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div class="admin-card-title" style="margin:0">🚨 Violations</div>
    <button class="admin-btn sm danger" onclick="ADMIN._clearAllViolations()">🗑️ Clear All</button>
  </div>
  <table class="admin-table">
    <thead><tr><th>Sev</th><th>Player</th><th>Reason</th><th>When</th><th>UID</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  async function _dismissViolation(docId, btn) {
    const db = _db(); if (!db) return;
    btn.disabled = true;
    try { await db.collection('violations').doc(docId).update({ dismissed: true, dismissedBy: AUTH_USER }); btn.closest('tr').style.opacity='0.3'; }
    catch(e) { btn.disabled=false; }
  }
  async function _clearAllViolations() { await clearAllViolations(); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: BANS
  // ─────────────────────────────────────────────────────────────────────
  async function _tabBans() {
    const db = _db();
    let rows = '';
    if (db) {
      try {
        const snap = await db.collection('bans').orderBy('bannedAt','desc').limit(100).get();
        if (snap.empty) {
          rows = '<tr><td colspan="6" style="opacity:0.4;padding:20px;text-align:center">No bans on record.</td></tr>';
        } else {
          rows = snap.docs.map(doc => {
            const b = doc.data();
            const active = b.active && (!b.expiresAt || b.expiresAt.toDate?.() > new Date());
            const expiry = b.permanent ? 'Permanent' : (b.expiresAt ? _ts(b.expiresAt) : '—');
            return `<tr>
              <td>${active ? '<span class="admin-badge red">ACTIVE</span>' : '<span class="admin-badge grey">LIFTED</span>'}</td>
              <td><b>${b.username||'?'}</b></td>
              <td style="max-width:180px;font-size:12px">${b.reason||'—'}</td>
              <td style="font-size:12px;opacity:0.6">${expiry}</td>
              <td style="font-size:12px;opacity:0.5">${b.bannedBy||'—'}</td>
              <td>${active?`<button class="admin-btn sm success" onclick="ADMIN._unban('${b.uid}','${b.username||''}')">✅ Unban</button>`:''}</td>
            </tr>`;
          }).join('');
        }
      } catch(e) { rows = `<tr><td colspan="6" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
    }
    return `
<div class="admin-card">
  <div class="admin-card-title">🚫 Issue New Ban</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;flex-wrap:wrap">
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Username</div><input class="admin-input" id="ban-username" placeholder="Username…"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Duration</div>
      <select class="admin-select" id="ban-duration" style="width:100%">
        <option value="3600000">1 Hour</option>
        <option value="21600000">6 Hours</option>
        <option value="86400000">24 Hours</option>
        <option value="604800000">7 Days</option>
        <option value="2592000000">30 Days</option>
        <option value="-1">Permanent</option>
      </select>
    </div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Reason</div><input class="admin-input" id="ban-reason" placeholder="Reason…"></div>
    <button class="admin-btn danger" onclick="ADMIN._issueBan()">🚫 Ban</button>
  </div>
</div>
<div class="admin-card">
  <div class="admin-card-title">📋 All Bans</div>
  <table class="admin-table">
    <thead><tr><th>Status</th><th>Player</th><th>Reason</th><th>Expires</th><th>By</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  async function _issueBan() {
    const username = (document.getElementById('ban-username')?.value||'').trim().toLowerCase();
    const duration = parseInt(document.getElementById('ban-duration')?.value||'-1');
    const reason   = (document.getElementById('ban-reason')?.value||'').trim() || 'Banned by admin.';
    if (!username) { showTokenToast('⚠️ Enter a username'); return; }
    const db = _db(); if (!db) return;
    const acc = await db.collection('accounts').doc(username).get();
    if (!acc.exists) { showTokenToast('❌ Player not found: ' + username); return; }
    await banPlayer(acc.data().uid, username, duration, reason);
  }
  function _unban(uid, username) {
    if (!confirm(`Unban ${username||uid}?`)) return;
    unbanPlayer(uid, username);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: BROADCAST
  // ─────────────────────────────────────────────────────────────────────
  async function _tabBroadcast() {
    const db = _db();
    let historyHtml = '';
    if (db) {
      try {
        const snap = await db.collection('broadcasts').orderBy('sentAt','desc').limit(20).get();
        historyHtml = snap.empty
          ? '<div style="opacity:0.4;font-size:13px;padding:8px 0">No broadcasts yet.</div>'
          : snap.docs.map(doc => {
            const b = doc.data();
            return `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span class="admin-badge ${b.type==='warning'?'yellow':b.type==='announcement'?'blue':'green'}">${b.type||'info'}</span>
                <span style="opacity:0.4;font-size:11px">${_ago(b.sentAt)} by ${b.sentBy||'?'}</span>
              </div>
              <div style="margin-top:4px">${b.message||''}</div>
            </div>`;
          }).join('');
      } catch(_){}
    }
    return `
<div class="admin-card">
  <div class="admin-card-title">📢 Send Global Broadcast</div>
  <textarea class="admin-input" id="broadcast-msg" rows="3" placeholder="Message to all players…" style="resize:vertical;margin-bottom:8px"></textarea>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <select class="admin-select" id="broadcast-type">
      <option value="info">ℹ️ Info</option>
      <option value="announcement">📣 Announcement</option>
      <option value="warning">⚠️ Warning</option>
    </select>
    <button class="admin-btn" onclick="ADMIN._sendBroadcast()">📢 Send to All Players</button>
  </div>
</div>
<div class="admin-card"><div class="admin-card-title">📋 History</div>${historyHtml}</div>`;
  }

  function _sendBroadcast() {
    const msg  = (document.getElementById('broadcast-msg')?.value||'').trim();
    const type = document.getElementById('broadcast-type')?.value || 'info';
    if (!msg) { showTokenToast('⚠️ Enter a message'); return; }
    if (!confirm(`Send broadcast to ALL players?\n"${msg}"`)) return;
    sendBroadcast(msg, type);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: DMs
  // ─────────────────────────────────────────────────────────────────────
  async function _tabDMs() {
    let convoHtml = '';
    if (_dmTarget) {
      const db = _db();
      let msgs = [];
      if (db) {
        try {
          const snap = await db.collection('dms').doc(_dmTarget.uid).collection('msgs').orderBy('sentAt','asc').limit(50).get();
          msgs = snap.docs.map(d=>d.data());
        } catch(_){}
      }
      const bubbles = msgs.map(m => `
        <div style="display:flex;flex-direction:column;align-items:${m.fromAdmin?'flex-end':'flex-start'}">
          <div class="dm-bubble ${m.fromAdmin?'from-admin':'from-player'}">${m.message||''}</div>
          <div class="dm-bubble-time">${m.fromAdmin?'Admin':'Player'} · ${_ago(m.sentAt)}</div>
        </div>`).join('');
      convoHtml = `
<div class="admin-card">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <button class="admin-btn ghost sm" onclick="ADMIN._clearDMTarget()">← Back</button>
    <div class="admin-card-title" style="margin:0">💬 DM: ${_dmTarget.username}</div>
  </div>
  <div id="admin-dm-msgs">${bubbles || '<div style="opacity:0.4;font-size:13px;text-align:center;padding:20px">No messages yet.</div>'}</div>
  <div style="display:flex;gap:8px">
    <input class="admin-input" id="dm-msg-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter') ADMIN._sendDM()">
    <button class="admin-btn" onclick="ADMIN._sendDM()">Send</button>
  </div>
</div>`;
    }
    return `
${convoHtml}
<div class="admin-card">
  <div class="admin-card-title">💬 Open DM</div>
  <div class="admin-search-row">
    <input class="admin-input" id="dm-search" placeholder="Username…" style="max-width:250px" onkeydown="if(event.key==='Enter') ADMIN._lookupDMPlayer()">
    <button class="admin-btn" onclick="ADMIN._lookupDMPlayer()">Open Chat</button>
  </div>
</div>`;
  }

  async function _lookupDMPlayer() {
    const username = (document.getElementById('dm-search')?.value||'').trim().toLowerCase();
    if (!username) return;
    const db = _db(); if (!db) return;
    const acc = await db.collection('accounts').doc(username).get();
    if (!acc.exists) { showTokenToast('❌ Player not found'); return; }
    _dmTarget = { uid: acc.data().uid, username };
    _renderTab();
  }
  function _clearDMTarget() { _dmTarget = null; _renderTab(); }
  async function _sendDM() {
    const msg = (document.getElementById('dm-msg-input')?.value||'').trim();
    if (!msg || !_dmTarget) return;
    await sendDM(_dmTarget.uid, _dmTarget.username, msg);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: LEADERBOARD
  // ─────────────────────────────────────────────────────────────────────
  async function _tabLeaderboard() {
    const db = _db();
    let rows = '';
    if (db) {
      try {
        const snap = await db.collection('leaderboard').orderBy('totalCrafts','desc').limit(50).get();
        if (snap.empty) {
          rows = '<tr><td colspan="8" style="opacity:0.4;padding:20px;text-align:center">No data yet.</td></tr>';
        } else {
          let rank = 1;
          rows = snap.docs.map(doc => {
            const p = doc.data();
            return `<tr>
              <td style="font-weight:700;opacity:0.6">#${rank++}</td>
              <td><b>${p.name||p.username||'?'}</b>${p.featuredBadge?` ${p.featuredBadge}`:''}</td>
              <td>${_fmt(p.totalCrafts)}</td>
              <td>${_fmt(p.firstDiscoveries||p.firstDiscs||0)}</td>
              <td>${_fmt(p.totalTokensEarned)}</td>
              <td>Lv${p.level||1} P${p.prestige||0}</td>
              <td>${p.isFake?'<span class="admin-badge yellow">FAKE</span>':''}</td>
              <td><div style="display:flex;gap:4px">
                <button class="admin-btn sm ghost" onclick="ADMIN._viewPlayer('${doc.id}','${p.name||p.username||''}')">✏️</button>
                <button class="admin-btn sm danger" onclick="ADMIN._removeLB('${doc.id}','${p.name||p.username||''}')">🗑️</button>
              </div></td>
            </tr>`;
          }).join('');
        }
      } catch(e) { rows = `<tr><td colspan="8" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
    }
    return `
<div class="admin-card">
  <div class="admin-card-title">🏆 Leaderboard</div>
  <div style="overflow-x:auto">
    <table class="admin-table">
      <thead><tr><th>#</th><th>Player</th><th>Crafts</th><th>Discoveries</th><th>Tokens</th><th>Level</th><th>Flag</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  }

  function _removeLB(uid, username) { removeLBEntry(uid, username); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: COMBOS
  // ─────────────────────────────────────────────────────────────────────
  async function _tabCombos() {
    const db = _db();
    let rows = '';
    const searchQ = _searchQ;
    if (db) {
      try {
        const snap = await db.collection('combos').limit(200).get();
        const all = snap.docs.map(d=>({id:d.id,...d.data()}))
          .filter(c => !searchQ || (c.name||'').toLowerCase().includes(searchQ.toLowerCase()));
        if (!all.length) {
          rows = '<tr><td colspan="5" style="opacity:0.4;padding:20px;text-align:center">No combos found.</td></tr>';
        } else {
          rows = all.slice(0,100).map(c => {
            const parts = (c.id||'').replace(/_+/g,' ').split('|||');
            return `<tr>
              <td>${c.emoji||''}</td>
              <td><b>${c.name||'?'}</b></td>
              <td style="font-size:11px;opacity:0.5">${parts.join(' + ')}</td>
              <td style="font-size:11px;opacity:0.4">${c.discoverer||'?'}</td>
              <td><button class="admin-btn sm danger" onclick="ADMIN._deleteCombo('${c.id}')">🗑️</button></td>
            </tr>`;
          }).join('');
        }
      } catch(e) { rows = `<tr><td colspan="5" style="color:#ef4444">Error: ${e.message}</td></tr>`; }
    }
    return `
<div class="admin-card">
  <div class="admin-card-title">➕ Add Manual Combo</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 60px 1fr auto;gap:8px;align-items:end">
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Element A</div><input class="admin-input" id="combo-a" placeholder="Fire"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Element B</div><input class="admin-input" id="combo-b" placeholder="Water"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Emoji</div><input class="admin-input" id="combo-emoji" placeholder="💨"></div>
    <div><div class="admin-field-lbl" style="margin-bottom:4px">Result</div><input class="admin-input" id="combo-name" placeholder="Steam"></div>
    <button class="admin-btn success" onclick="ADMIN._addCombo()">➕ Add</button>
  </div>
</div>
<div class="admin-card">
  <div class="admin-card-title">🧪 Combo Cache</div>
  <div class="admin-search-row">
    <input class="admin-input" id="combo-search" placeholder="Search combos…" value="${searchQ}" style="max-width:250px" oninput="ADMIN._comboSearch(this.value)">
  </div>
  <table class="admin-table">
    <thead><tr><th>Emoji</th><th>Name</th><th>Key</th><th>Discoverer</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  function _deleteCombo(key) {
    if (!confirm('Delete combo? Players get fresh AI result next time.')) return;
    deleteCombo(key);
  }
  function _addCombo() {
    const a=document.getElementById('combo-a')?.value?.trim();
    const b=document.getElementById('combo-b')?.value?.trim();
    const emoji=document.getElementById('combo-emoji')?.value?.trim();
    const name=document.getElementById('combo-name')?.value?.trim();
    if (!a||!b||!emoji||!name) { showTokenToast('⚠️ Fill all fields'); return; }
    addCombo(a,b,emoji,name);
  }
  function _comboSearch(q) {
    _searchQ = q;
    clearTimeout(_comboSearch._t);
    _comboSearch._t = setTimeout(()=>_renderTab(), 400);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: WORLD FIRSTS
  // ─────────────────────────────────────────────────────────────────────
  async function _tabWorldFirsts() {
    const db = _db();
    let firstsRows='', feedRows='';
    if (db) {
      try {
        const [firsts, feed] = await Promise.all([
          db.collection('global_firsts').orderBy('at','desc').limit(50).get(),
          db.collection('global_feed').orderBy('at','desc').limit(30).get()
        ]);
        firstsRows = firsts.docs.map(doc => {
          const d = doc.data();
          return `<tr><td>${d.emoji||''}</td><td><b>${d.name||'?'}</b></td><td>${d.discoverer||'?'}</td>
            <td style="opacity:0.4;font-size:11px">${_ago(d.at)}</td>
            <td><button class="admin-btn sm danger" onclick="ADMIN._revokeFirst('${d.name||''}')">🗑️</button></td></tr>`;
        }).join('') || '<tr><td colspan="5" style="opacity:0.4;padding:20px;text-align:center">None yet.</td></tr>';
        feedRows = feed.docs.map(doc => {
          const d = doc.data();
          return `<tr><td>${d.emoji||''} ${d.name||'?'}</td><td>${d.discoverer||'?'}</td>
            <td style="opacity:0.4;font-size:11px">${_ago(d.at)}</td>
            <td><button class="admin-btn sm danger" onclick="ADMIN._deleteFeed('${doc.id}')">🗑️</button></td></tr>`;
        }).join('') || '<tr><td colspan="4" style="opacity:0.4;padding:12px;text-align:center">Empty.</td></tr>';
      } catch(e) { firstsRows = `<tr><td colspan="5" style="color:#ef4444">${e.message}</td></tr>`; }
    }
    return `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
  <div class="admin-card">
    <div class="admin-card-title">🌍 World Firsts</div>
    <div style="max-height:400px;overflow-y:auto">
      <table class="admin-table"><thead><tr><th>Emoji</th><th>Name</th><th>Discoverer</th><th>When</th><th>Del</th></tr></thead><tbody>${firstsRows}</tbody></table>
    </div>
  </div>
  <div class="admin-card">
    <div class="admin-card-title">📡 Global Feed</div>
    <div style="max-height:400px;overflow-y:auto">
      <table class="admin-table"><thead><tr><th>Element</th><th>Player</th><th>When</th><th>Del</th></tr></thead><tbody>${feedRows}</tbody></table>
    </div>
  </div>
</div>`;
  }

  function _revokeFirst(name) { revokeWorldFirst(name); }
  function _deleteFeed(id)    { deleteFeedEntry(id); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: GAME CONFIG
  // ─────────────────────────────────────────────────────────────────────
  async function _tabGameConfig() {
    const db = _db();
    let cfg = {};
    if (db) {
      try { const doc = await db.collection('game_config').doc('global').get(); cfg = doc.data()||{}; }
      catch(_){}
    }
    const togRow = (key, label, desc) => `
<div class="admin-config-row">
  <div><div class="admin-config-lbl">${label}</div><div class="admin-config-desc">${desc}</div></div>
  <label class="admin-toggle"><input type="checkbox" ${cfg[key]?'checked':''} onchange="ADMIN._setCfg('${key}',this.checked)"><span class="admin-toggle-slider"></span></label>
</div>`;
    return `
<div class="admin-card">
  <div class="admin-card-title">🎮 Global Toggles</div>
  ${togRow('doubleXP','🌟 Double XP','Gives all players 2× XP on every craft.')}
  ${togRow('doubleTokens','🪙 Double Tokens','Gives all players 2× tokens on every craft.')}
  ${togRow('halfPriceShop','🛒 Half-Price Shop','All shop items cost 50% less.')}
  ${togRow('maintenanceMode','🔧 Maintenance Mode','Prevents new crafts.')}
  ${togRow('shopFrozen','❄️ Freeze Shop','Stops AI generating new shop items.')}
</div>
<div class="admin-card">
  <div class="admin-card-title">🛒 Shop</div>
  <button class="admin-btn warn" onclick="ADMIN._forceShopRegen()">🔄 Force Shop Regeneration</button>
</div>
<div class="admin-card">
  <div class="admin-card-title">📣 MOTD</div>
  <textarea class="admin-input" id="cfg-motd" rows="2" placeholder="Shown to players on login…" style="resize:vertical;margin-bottom:8px">${cfg.motd||''}</textarea>
  <button class="admin-btn" onclick="ADMIN._saveMOTD()">💾 Save MOTD</button>
</div>
<div class="admin-card">
  <div class="admin-card-title">🔢 Multipliers</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="admin-field-row">
      <div class="admin-field-lbl">XP Multiplier</div>
      <div style="display:flex;gap:6px"><input class="admin-input admin-input-sm" id="cfg-xp-mult" type="number" step="0.1" min="0.1" max="10" value="${cfg.xpMultiplier||1}" style="flex:1"><button class="admin-btn sm success" onclick="ADMIN._setCfgNum('xpMultiplier','cfg-xp-mult')">Set</button></div>
    </div>
    <div class="admin-field-row">
      <div class="admin-field-lbl">Token Multiplier</div>
      <div style="display:flex;gap:6px"><input class="admin-input admin-input-sm" id="cfg-tok-mult" type="number" step="0.1" min="0.1" max="10" value="${cfg.tokenMultiplier||1}" style="flex:1"><button class="admin-btn sm success" onclick="ADMIN._setCfgNum('tokenMultiplier','cfg-tok-mult')">Set</button></div>
    </div>
  </div>
</div>`;
  }

  function _setCfg(key, val) { setGameConfig(key, val); }
  function _setCfgNum(key, inputId) {
    const v = parseFloat(document.getElementById(inputId)?.value||'1');
    setGameConfig(key, v);
  }
  function _saveMOTD() { setGameConfig('motd', (document.getElementById('cfg-motd')?.value||'').trim()); }
  function _forceShopRegen() { forceShopRegen(); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: API MONITOR
  // ─────────────────────────────────────────────────────────────────────
  async function _tabAPI() {
    const providers = ['groq','gemini','openrouter','huggingface','cohere'];
    const keys = {
      groq: typeof GROQ_API_KEY!=='undefined'?GROQ_API_KEY:'',
      gemini: typeof GEMINI_API_KEY!=='undefined'?GEMINI_API_KEY:'',
      openrouter: typeof OPENROUTER_API_KEY!=='undefined'?OPENROUTER_API_KEY:'',
      huggingface: typeof HUGGINGFACE_API_KEY!=='undefined'?HUGGINGFACE_API_KEY:'',
      cohere: typeof COHERE_API_KEY!=='undefined'?COHERE_API_KEY:'',
    };
    const rows = providers.map(p => {
      const key = keys[p]||'';
      const ready = key && key.length>10 && !key.startsWith('YOUR_');
      const masked = ready ? key.slice(0,8)+'…'+key.slice(-4) : '(not set)';
      return `<tr>
        <td><b>${p}</b></td>
        <td>${ready?'<span class="admin-badge green">✓ Ready</span>':'<span class="admin-badge grey">Not set</span>'}</td>
        <td style="font-family:monospace;font-size:11px">${masked}</td>
        <td>${ready?`<button class="admin-btn sm ghost" onclick="ADMIN._testProvider('${p}')">🧪 Test</button>`:'—'}</td>
      </tr>`;
    }).join('');
    return `
<div class="admin-card">
  <div class="admin-card-title">🤖 LLM Providers</div>
  <table class="admin-table">
    <thead><tr><th>Provider</th><th>Status</th><th>Key</th><th>Test</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<div class="admin-card">
  <div class="admin-card-title">🧪 Test Craft</div>
  <div style="display:flex;gap:8px;align-items:center">
    <input class="admin-input admin-input-sm" id="test-el-a" placeholder="Fire" value="Fire" style="width:100px">
    <span style="opacity:0.5">+</span>
    <input class="admin-input admin-input-sm" id="test-el-b" placeholder="Water" value="Water" style="width:100px">
    <button class="admin-btn" onclick="ADMIN._testCraft()">🧪 Test</button>
    <span id="test-craft-result" style="font-size:13px;opacity:0.7"></span>
  </div>
</div>`;
  }

  async function _testProvider(provider) {
    showTokenToast('⏳ Testing ' + provider + '…');
    try {
      const p = window._providers?.[provider];
      if (!p) { showTokenToast('❌ Not accessible'); return; }
      const result = await p.call([{role:'user',content:'Reply with ONLY: ✅ OK'}], 10, 0);
      showTokenToast(`✅ ${provider}: ${result.slice(0,40)}`);
    } catch(e) { showTokenToast(`❌ ${provider}: ${e.message}`); }
  }

  async function _testCraft() {
    const a = document.getElementById('test-el-a')?.value || 'Fire';
    const b = document.getElementById('test-el-b')?.value || 'Water';
    const el = document.getElementById('test-craft-result');
    if (el) el.textContent = '⏳ Crafting…';
    try {
      const msgs = [{ role:'system', content: typeof SYSTEM_PROMPT!=='undefined'?SYSTEM_PROMPT:'' }, { role:'user', content: `${a} + ${b} = ?` }];
      const result = await callLLM('craft', msgs, 30, 1.0);
      if (el) el.textContent = '→ ' + result;
    } catch(e) { if (el) el.textContent = '❌ ' + e.message; }
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: OPs
  // ─────────────────────────────────────────────────────────────────────
  async function _tabOPs() {
    const db = _db();
    let opsRows = '';
    if (db) {
      try {
        const snap = await db.collection('ops').get();
        opsRows = snap.docs.map(doc => {
          const o = doc.data();
          const perms = o.permissions || {};
          return `<tr>
            <td><b>${o.username||'?'}</b></td>
            <td>${Object.keys(perms).filter(k=>perms[k]).map(k=>`<span class="admin-badge blue" style="margin:1px">${k}</span>`).join('')}</td>
            <td style="opacity:0.4;font-size:11px">${o.grantedBy||'?'} · ${_ago(o.grantedAt)}</td>
            <td><button class="admin-btn sm danger" onclick="ADMIN._deop('${doc.id}','${o.username||''}')">🗑️ Remove</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="opacity:0.4;padding:20px;text-align:center">No OPs.</td></tr>';
      } catch(e) { opsRows = `<tr><td colspan="4" style="color:#ef4444">${e.message}</td></tr>`; }
    }
    const perms = [
      ['canViewAdmin','👁️ View Admin'],['canBan','🚫 Ban'],['canGiveItems','🎁 Give Items'],
      ['canBroadcast','📢 Broadcast'],['canEditCombos','🧪 Combos'],
      ['canModerateLeaderboard','🏆 Leaderboard'],['canViewViolations','🚨 Violations'],
      ['canEditPlayers','✏️ Edit Players'],['canSendDMs','💬 DMs'],
    ];
    return `
<div class="admin-card">
  <div class="admin-card-title">➕ Grant OP</div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
    <input class="admin-input" id="op-username" placeholder="Username to OP…" style="max-width:220px">
    <button class="admin-btn success" onclick="ADMIN._grantOP()">🛡️ Grant OP</button>
  </div>
  <div class="admin-perm-grid">
    ${perms.map(([key,label])=>`<label class="admin-perm-item"><input type="checkbox" id="perm-${key}" checked style="margin:0"> <span>${label}</span></label>`).join('')}
  </div>
</div>
<div class="admin-card">
  <div class="admin-card-title">🛡️ Current OPs</div>
  <table class="admin-table"><thead><tr><th>Username</th><th>Permissions</th><th>Granted By</th><th>Action</th></tr></thead><tbody>${opsRows}</tbody></table>
</div>`;
  }

  async function _grantOP() {
    const username = (document.getElementById('op-username')?.value||'').trim().toLowerCase();
    if (!username) { showTokenToast('⚠️ Enter username'); return; }
    const db = _db(); if (!db) return;
    const acc = await db.collection('accounts').doc(username).get();
    if (!acc.exists) { showTokenToast('❌ Player not found'); return; }
    const uid = acc.data().uid;
    const perms = {};
    ['canViewAdmin','canBan','canGiveItems','canBroadcast','canEditCombos','canModerateLeaderboard','canViewViolations','canEditPlayers','canSendDMs']
      .forEach(k => { const cb = document.getElementById('perm-'+k); if (cb) perms[k]=cb.checked; });
    await opPlayer(uid, username, perms);
  }
  function _deop(uid, username) { deopPlayer(uid, username); }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: AUDIT LOG
  // ─────────────────────────────────────────────────────────────────────
  async function _tabAuditLog() {
    const db = _db();
    let rows = '';
    if (db) {
      try {
        const snap = await db.collection('admin_log').orderBy('at','desc').limit(100).get();
        rows = snap.docs.map(doc => {
          const a = doc.data();
          return `<tr>
            <td style="white-space:nowrap;opacity:0.5;font-size:11px">${_ts(a.at)}</td>
            <td style="color:var(--accent);font-weight:700">${a.action||'?'}</td>
            <td style="opacity:0.7">${a.by||'?'}</td>
            <td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.details||''}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="opacity:0.4;padding:20px;text-align:center">No actions logged yet.</td></tr>';
      } catch(e) { rows = `<tr><td colspan="4" style="color:#ef4444">${e.message}</td></tr>`; }
    }
    return `
<div class="admin-card">
  <div class="admin-card-title">📋 Admin Audit Log</div>
  <div style="overflow-x:auto">
    <table class="admin-table"><thead><tr><th>Time</th><th>Action</th><th>By</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAB: DEBUG  🐛
  // ─────────────────────────────────────────────────────────────────────
  async function _tabDebug() {
    const db = _db();
    let collSizes = {};
    if (db) {
      try {
        const colls = ['accounts','saves','leaderboard','bans','violations','combos','global_firsts','player_ranks','admin_shop_items'];
        const snaps = await Promise.all(colls.map(c => db.collection(c).limit(1000).get().catch(()=>null)));
        colls.forEach((c,i) => { collSizes[c] = snaps[i]?.size ?? '?'; });
      } catch(_){}
    }

    const sizeRows = Object.entries(collSizes).map(([k,v]) =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">
        <span style="font-family:monospace">${k}</span>
        <span style="font-weight:700">${v}</span>
      </div>`).join('');

    return `
<div class="admin-alert warn">⚠️ Debug tools can make irreversible changes. Use with caution.</div>

<div class="debug-grid">

  <div class="debug-card">
    <div class="debug-card-title">👥 Add Fake Players</div>
    <div class="debug-card-desc">Adds fake entries to leaderboard & accounts for testing UI.</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:6px;align-items:center">
        <input class="admin-input admin-input-sm" id="fake-count" type="number" value="10" min="1" max="50" style="width:60px">
        <span style="font-size:12px;opacity:0.5">players</span>
      </div>
      <select class="admin-select" id="fake-stat-level" style="font-size:12px">
        <option value="low">Low stats (new players)</option>
        <option value="mid" selected>Medium stats</option>
        <option value="high">High stats (veterans)</option>
      </select>
      <button class="admin-btn success sm" onclick="ADMIN._addFakePlayers()">➕ Add Fake Players</button>
    </div>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🗑️ Remove Fake Players</div>
    <div class="debug-card-desc">Removes ALL fake players (marked with isFake:true) from leaderboard and accounts.</div>
    <button class="admin-btn danger sm" onclick="ADMIN._removeFakePlayers()">🗑️ Remove All Fake Players</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">📤 Export All Data</div>
    <div class="debug-card-desc">Downloads all game data as JSON (accounts, saves, leaderboard, bans, violations).</div>
    <button class="admin-btn sm ghost" onclick="ADMIN._exportAllData()">📥 Export JSON</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🔔 Test Toast</div>
    <div class="debug-card-desc">Fire a test notification to check toast styling.</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <input class="admin-input admin-input-sm" id="toast-msg" placeholder="Test message…" value="Hello from admin! 👋">
      <button class="admin-btn sm" onclick="showTokenToast(document.getElementById('toast-msg').value||'Test!')">🔔 Show Toast</button>
    </div>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🎮 Set My Stats</div>
    <div class="debug-card-desc">Quickly modify your own tokens and XP for testing.</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;gap:6px">
        <input class="admin-input admin-input-sm" id="debug-tokens" type="number" placeholder="Tokens" style="flex:1">
        <button class="admin-btn sm success" onclick="ADMIN._setMyTokens()">Set 🪙</button>
      </div>
      <div style="display:flex;gap:6px">
        <input class="admin-input admin-input-sm" id="debug-xp" type="number" placeholder="XP" style="flex:1">
        <button class="admin-btn sm success" onclick="ADMIN._setMyXP()">Set ⭐</button>
      </div>
    </div>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🔄 Force LB Sync</div>
    <div class="debug-card-desc">Push your current stats to the leaderboard right now.</div>
    <button class="admin-btn sm ghost" onclick="typeof pushLeaderboardStats!=='undefined'&&pushLeaderboardStats().then(()=>showTokenToast('✅ Stats synced!'))">🔄 Sync My Stats</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🧹 Clear Combo Cache</div>
    <div class="debug-card-desc">Clears the local in-memory + localStorage combo cache (NOT the cloud cache).</div>
    <button class="admin-btn sm warn" onclick="ADMIN._clearLocalComboCache()">🧹 Clear Local Cache</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🚨 Clear All Violations</div>
    <div class="debug-card-desc">Removes all violation records from Firestore.</div>
    <button class="admin-btn sm danger" onclick="ADMIN._clearAllViolations()">🗑️ Clear Violations</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">🚫 Simulate Ban Screen</div>
    <div class="debug-card-desc">Shows what a banned player sees (reloads page to undo).</div>
    <button class="admin-btn sm danger" onclick="ADMIN._simulateBanScreen()">👁️ Preview Ban Screen</button>
  </div>

  <div class="debug-card">
    <div class="debug-card-title">📡 Test Broadcast</div>
    <div class="debug-card-desc">Triggers a test broadcast that shows as a toast instantly.</div>
    <button class="admin-btn sm" onclick="ADMIN._testBroadcast()">📡 Trigger Test Broadcast</button>
  </div>

</div>

<div class="admin-card" style="margin-top:12px">
  <div class="admin-card-title">📊 Collection Sizes</div>
  <div style="column-count:2;column-gap:24px">${sizeRows}</div>
</div>`;
  }

  function _addFakePlayers() {
    const count = parseInt(document.getElementById('fake-count')?.value||'10');
    const level = document.getElementById('fake-stat-level')?.value || 'mid';
    addFakePlayers(count, level);
  }
  function _removeFakePlayers() { removeFakePlayers(); }
  function _exportAllData() { exportAllData(); }

  function _setMyTokens() {
    const v = parseInt(document.getElementById('debug-tokens')?.value||'0');
    if (isNaN(v)) return;
    if (typeof tokens !== 'undefined') { window.tokens = v; }
    if (typeof AUTH_UID !== 'undefined' && AUTH_UID && _db()) {
      _db().collection('saves').doc(AUTH_UID).update({ tokens: v }).catch(()=>{});
    }
    showTokenToast(`✅ Tokens set to ${v}`);
  }

  function _setMyXP() {
    const v = parseInt(document.getElementById('debug-xp')?.value||'0');
    if (isNaN(v)) return;
    if (typeof xp !== 'undefined') { window.xp = v; }
    if (typeof AUTH_UID !== 'undefined' && AUTH_UID && _db()) {
      _db().collection('saves').doc(AUTH_UID).update({ xp: v }).catch(()=>{});
    }
    showTokenToast(`✅ XP set to ${v}`);
  }

  function _clearLocalComboCache() {
    if (typeof KNOWN_COMBOS !== 'undefined') { Object.keys(KNOWN_COMBOS).forEach(k => delete KNOWN_COMBOS[k]); }
    try { localStorage.removeItem('ic_combos'); } catch(_){}
    showTokenToast('✅ Local combo cache cleared!');
  }

  function _simulateBanScreen() {
    const card = document.getElementById('auth-card');
    const overlay = document.getElementById('auth-overlay');
    ADMIN.close();
    if (overlay) overlay.classList.add('open');
    if (card) card.innerHTML = `
      <div style="font-size:22px;margin-bottom:8px">🚫 Account Suspended</div>
      <div style="font-size:14px;opacity:0.7;margin-bottom:12px">You have been banned permanently.</div>
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;font-size:13px;margin-bottom:12px">
        <b>Reason:</b> This is a test ban preview from the admin panel.
      </div>
      <div style="font-size:12px;opacity:0.4">Reload the page to exit this preview.</div>`;
  }

  async function _testBroadcast() {
    const db = _db(); if (!db) { showTokenToast('❌ Firebase not connected'); return; }
    await db.collection('broadcasts').add({
      message: '🧪 This is a test broadcast from Admin at ' + new Date().toLocaleTimeString(),
      type: 'announcement', sentBy: AUTH_USER + ' (debug)',
      sentAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showTokenToast('📡 Test broadcast sent!');
  }

  // ─── Admin button injection ──────────────────────────────────────────
  function _injectAdminButton() {
    const attempt = () => {
      const tabBar = document.getElementById('main-menu-tabs');
      if (tabBar && !document.getElementById('mmtab-admin')) {
        const btn = document.createElement('button');
        btn.className = 'main-menu-tab-btn';
        btn.id = 'mmtab-admin';
        btn.textContent = '🔧 Admin';
        btn.onclick = () => { ADMIN.open(); };
        tabBar.appendChild(btn);
      } else if (!tabBar) { setTimeout(attempt, 300); }
    };
    attempt();
  }

  // ─── Broadcast checker ───────────────────────────────────────────────
  async function _checkBroadcasts() {
    const db = _db(); if (!db) return;
    try {
      const lastSeen = parseInt(localStorage.getItem('_ic_last_bc')||'0');
      const snap = await db.collection('broadcasts').orderBy('sentAt','desc').limit(5).get();
      let newest = lastSeen;
      snap.docs.forEach(doc => {
        const b = doc.data();
        const at = b.sentAt?.toMillis?.() || 0;
        if (at > lastSeen) {
          const icon = b.type==='warning'?'⚠️':b.type==='announcement'?'📣':'ℹ️';
          setTimeout(() => showTokenToast(`${icon} ${b.message}`, 5000), 1500);
          if (at > newest) newest = at;
        }
      });
      if (newest > lastSeen) localStorage.setItem('_ic_last_bc', String(newest));
    } catch(_){}
  }

  // ─── DM checker ──────────────────────────────────────────────────────
  async function _checkDMs() {
    const db = _db(); if (!db || !AUTH_UID) return;
    try {
      const snap = await db.collection('dms').doc(AUTH_UID).collection('msgs')
        .where('read','==',false).where('fromAdmin','==',true).limit(5).get();
      snap.docs.forEach(doc => {
        const m = doc.data();
        setTimeout(() => showTokenToast(`💬 Admin: ${m.message}`, 6000), 2000);
        doc.ref.update({ read: true }).catch(()=>{});
      });
    } catch(_){}
  }

  // ─── Ban check ───────────────────────────────────────────────────────
  async function checkLoginBan(uid) {
    const b = await checkBan(uid);
    if (!b) return false;
    const auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
    if (auth) auth.signOut().catch(()=>{});
    localStorage.removeItem('ic_auth_user');
    localStorage.removeItem('ic_auth_uid');
    const overlay = document.getElementById('auth-overlay');
    const card    = document.getElementById('auth-card');
    if (overlay) overlay.classList.add('open');
    if (card) {
      const expiry = b.permanent ? 'permanently' : `until ${b.expiresAt?.toDate?.().toLocaleString?.() || 'unknown'}`;
      card.innerHTML = `
        <div style="font-size:22px;margin-bottom:8px">🚫 Account Suspended</div>
        <div style="font-size:14px;opacity:0.7;margin-bottom:12px">You have been banned ${expiry}.</div>
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;font-size:13px;margin-bottom:12px">
          <b>Reason:</b> ${b.reason || 'No reason provided.'}
        </div>
        <div style="font-size:12px;opacity:0.4">If you believe this is a mistake, contact an admin.</div>`;
    }
    return true;
  }

  // ─── Check OP status ─────────────────────────────────────────────────
  async function _checkOPStatus() {
    const db = _db(); if (!db || !AUTH_UID) return;
    try {
      const doc = await db.collection('ops').doc(AUTH_UID).get();
      if (doc.exists) {
        window._ADMIN_OP_PERMS = doc.data().permissions || {};
        if (window._ADMIN_OP_PERMS.canViewAdmin) _injectAdminButton();
      }
    } catch(_){}
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────
  function open() {
    if (!isAdmin() && !isOp()) return;
    const el = document.getElementById('admin-overlay');
    if (el) { el.classList.add('open'); _renderTab(); }
  }

  function close() {
    const el = document.getElementById('admin-overlay');
    if (el) el.classList.remove('open');
  }

  function switchTab(tab) {
    _tab = tab; _editTarget = null; _searchQ = '';
    _renderTab();
  }

  async function init() {
    if (!AUTH_USER || !AUTH_UID) return;
    _injectCSS();
    _buildOverlay();
    if (isAdmin()) { _injectAdminButton(); console.log(`[Admin] Panel ready for ${AUTH_USER}`); }
    await _checkBroadcasts();
    await _checkDMs();
    if (!isAdmin()) await _checkOPStatus();
  }

  return {
    init, open, close, switchTab, checkLoginBan,
    _livePlayerSearch, _loadAllPlayers, _viewPlayer, _clearEditTarget,
    _saveField, _quickGiveTokens, _confirmClearInventory, _confirmWipeSave,
    _quickGiveItem, _openDMTarget, _openBanPrompt, _setBadge,
    _assignRank, _removeRank, _adminRemoveRank,
    _quickAssignRank, _createRank, _deleteCustomRank,
    _addShopItem, _removeShopItem, _setLimitedShop,
    _dismissViolation, _clearAllViolations, _unban, _issueBan,
    _sendBroadcast, _lookupDMPlayer, _clearDMTarget, _sendDM,
    _removeLB,
    _deleteCombo, _addCombo, _comboSearch,
    _revokeFirst, _deleteFeed,
    _setCfg, _setCfgNum, _saveMOTD, _forceShopRegen,
    _testProvider, _testCraft,
    _grantOP, _deop,
    _addFakePlayers, _removeFakePlayers, _exportAllData,
    _setMyTokens, _setMyXP, _clearLocalComboCache, _simulateBanScreen, _testBroadcast,
    _deleteAccount, _resetStats,
    logViolation: async (uid, username, reason) => {
      const db = _db(); if (!db) return;
      try {
        await db.collection('violations').add({
          uid, username, reason,
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch(_){}
    }
  };
})();
