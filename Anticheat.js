// ═══════════════════════════════════════════════════════════════════════
//  ANTICHEAT.JS  —  Client-side integrity layer
//
//  Layers:
//    1. Save checksum   – detects direct localStorage edits
//    2. Value caps      – clamps/flags impossible numbers on load/import
//    3. Velocity guard  – detects stats that increase faster than possible
//    4. Leaderboard gate– blocks push if session is flagged as suspicious
//
//  NOTE: Client-side checks raise the bar for casual cheaters.
//  The real backstop is firestore.rules (server-side, cannot be bypassed).
// ═══════════════════════════════════════════════════════════════════════

const AC = (function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  //  ABSOLUTE MAX VALUES
  //  Ultra-generous ceilings — no legitimate player can exceed these
  //  without tens of thousands of hours of play.
  // ─────────────────────────────────────────────────────────────────────
  const MAX = {
    tokens:             500_000_000,
    xp:                  50_000_000,
    level:               100_000,
    totalCrafts:       5_000_000,
    totalSpent:        500_000_000,
    totalTokensEarned: 500_000_000,
    prestige:               10,
    firstDiscs:          50_000,
    discovered:         100_000,
    secretsCount:           200,
    chainStepsCompleted:  10_000,
    chainFullCompleted:    1_000,
  };

  // ─────────────────────────────────────────────────────────────────────
  //  VELOCITY LIMITS
  //  speed3 auto-crafter = 1 craft every 3s = 0.33/s.
  //  Robot pet + dual = maybe 0.5/s in bursts.
  //  Hard ceiling: 3/s (very generous headroom for lag, burst catches).
  // ─────────────────────────────────────────────────────────────────────
  const RATE = {
    maxCraftsPerSec:  3,       // crafts per second
    maxTokensPerSec:  5000,    // tokens per second (with all multipliers + pet food)
    minCheckInterval: 20,      // seconds between velocity snapshots
    gracePeriod:      12_000,  // ms after page load before checks start
  };

  // ─────────────────────────────────────────────────────────────────────
  //  INTERNAL STATE
  // ─────────────────────────────────────────────────────────────────────
  let _suspicious    = false;
  let _violations    = [];
  let _lastSnap      = null;   // { totalCrafts, totalTokensEarned, time }
  let _checkTimer    = null;

  // ─────────────────────────────────────────────────────────────────────
  //  FNV-1a  (fast, good avalanche, no dependencies)
  // ─────────────────────────────────────────────────────────────────────
  function _fnv(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  DEVICE KEY — stable per browser profile, used as HMAC salt
  // ─────────────────────────────────────────────────────────────────────
  function _deviceKey() {
    const STORE = '_ic_dk2';
    let k = localStorage.getItem(STORE);
    if (!k) {
      k = _fnv(
        navigator.userAgent +
        screen.width + 'x' + screen.height +
        (navigator.hardwareConcurrency || 2) +
        Date.now().toString(36)
      );
      try { localStorage.setItem(STORE, k); } catch(_) {}
    }
    return k;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  CHECKSUM
  //  Covers all economy + collection stats. The device key means the
  //  hash can't be reproduced on another machine (copy-paste attack).
  // ─────────────────────────────────────────────────────────────────────
  function _computeChecksum(d) {
    const payload = [
      d.tokens            | 0,
      d.xp                | 0,
      d.level             | 0,
      d.totalCrafts       | 0,
      d.totalSpent        | 0,
      d.totalTokensEarned | 0,
      d.prestige          | 0,
      (d.discovered  || []).length,
      (d.firstDiscs  || []).length,
      (d.questDone   || []).length,
      (d.milestonesDone || []).length,
    ].join('~');
    return _fnv(payload + _deviceKey());
  }

  // Attach checksum to a save object (call inside saveGame before writing)
  function stampSave(saveObj) {
    saveObj._cs = _computeChecksum(saveObj);
    return saveObj;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  VALIDATE SAVE  — returns { ok, reason }
  //  Used both on import AND on every loadGame call.
  // ─────────────────────────────────────────────────────────────────────
  function validateSave(d) {
    if (!d || typeof d !== 'object') return { ok: false, reason: 'null_data' };

    // ── 1. Checksum ───────────────────────────────────────────────────
    if (d._cs) {
      const expected = _computeChecksum(d);
      if (d._cs !== expected) {
        return { ok: false, reason: 'checksum_mismatch' };
      }
    }
    // If no _cs the save predates anti-cheat; skip checksum but still
    // run value-range checks below.

    // ── 2. Value-range checks ─────────────────────────────────────────
    const numFields = [
      ['tokens',             d.tokens,              0, MAX.tokens],
      ['xp',                 d.xp,                  0, MAX.xp],
      ['level',              d.level,                1, MAX.level],
      ['totalCrafts',        d.totalCrafts,          0, MAX.totalCrafts],
      ['totalSpent',         d.totalSpent,           0, MAX.totalSpent],
      ['totalTokensEarned',  d.totalTokensEarned,    0, MAX.totalTokensEarned],
      ['prestige',           d.prestige,             0, MAX.prestige],
      ['secretsCount',       d.secretsCount,         0, MAX.secretsCount],
      ['chainStepsCompleted',d.chainStepsCompleted,  0, MAX.chainStepsCompleted],
    ];

    for (const [name, val, min, max] of numFields) {
      if (val == null) continue;
      if (typeof val !== 'number' || isNaN(val) || val < min || val > max) {
        return { ok: false, reason: `out_of_range:${name}=${val}` };
      }
    }

    // ── 3. Collection size checks ─────────────────────────────────────
    if (Array.isArray(d.discovered)  && d.discovered.length  > MAX.discovered)  return { ok: false, reason: `too_many:discovered=${d.discovered.length}` };
    if (Array.isArray(d.firstDiscs)  && d.firstDiscs.length  > MAX.firstDiscs)  return { ok: false, reason: `too_many:firstDiscs=${d.firstDiscs.length}` };

    // ── 4. Logical consistency ────────────────────────────────────────
    if (d.totalSpent != null && d.totalTokensEarned != null) {
      if (d.totalSpent > d.totalTokensEarned + 1_000_000) {
        // spent more than earned (+ generous buffer for quest/milestone grants)
        return { ok: false, reason: `spent_gt_earned` };
      }
    }

    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  CLAMP SAVE  — silently clamp all values to safe bounds
  //  Used on imported saves so the game doesn't crash on huge numbers.
  // ─────────────────────────────────────────────────────────────────────
  function clampSave(d) {
    if (!d) return d;
    const clamp = (v, lo, hi) => (v == null ? v : Math.max(lo, Math.min(hi, Number(v) || 0)));
    d.tokens             = clamp(d.tokens,             0, MAX.tokens);
    d.xp                 = clamp(d.xp,                 0, MAX.xp);
    d.level              = clamp(d.level,               1, MAX.level);
    d.totalCrafts        = clamp(d.totalCrafts,         0, MAX.totalCrafts);
    d.totalSpent         = clamp(d.totalSpent,          0, MAX.totalSpent);
    d.totalTokensEarned  = clamp(d.totalTokensEarned,   0, MAX.totalTokensEarned);
    d.prestige           = clamp(d.prestige,            0, MAX.prestige);
    d.secretsCount       = clamp(d.secretsCount,        0, MAX.secretsCount);
    d.chainStepsCompleted= clamp(d.chainStepsCompleted, 0, MAX.chainStepsCompleted);
    d.chainFullCompleted = clamp(d.chainFullCompleted,  0, MAX.chainFullCompleted);
    return d;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  FLAG SESSION
  // ─────────────────────────────────────────────────────────────────────
  function _flag(reason) {
    _violations.push({ reason, at: Date.now() });
    console.warn('[AC] Integrity violation:', reason);

    // ── Log to Firestore for admin panel visibility ──────────────────
    try {
      if (typeof ADMIN !== 'undefined' && ADMIN.logViolation && window._db) {
        const uid      = window.AUTH_UID      || localStorage.getItem('ic_auth_uid')  || 'guest';
        const username = window.AUTH_USER     || localStorage.getItem('ic_auth_user') || 'guest';
        ADMIN.logViolation(uid, username, reason);
      }
    } catch (_) {}

    if (_suspicious) return; // already flagged — don't spam
    _suspicious = true;

    // Block leaderboard pushes in this session
    window._AC_SUSPICIOUS = true;

    // Persist flag log (last 10 violations, for future reference)
    try {
      const log = JSON.parse(localStorage.getItem('_ic_vlog') || '[]');
      log.push({ reason, at: new Date().toISOString() });
      localStorage.setItem('_ic_vlog', JSON.stringify(log.slice(-10)));
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────
  //  VELOCITY CHECK  — called on a timer
  // ─────────────────────────────────────────────────────────────────────
  function _velocityCheck() {
    try {
      // Guard: game globals may not be defined yet
      if (typeof totalCrafts === 'undefined') return;

      const now = Date.now();

      if (!_lastSnap) {
        _lastSnap = { totalCrafts, totalTokensEarned, time: now };
        return;
      }

      const dt = (now - _lastSnap.time) / 1000;
      if (dt < RATE.minCheckInterval) return;

      const craftDelta  = totalCrafts       - _lastSnap.totalCrafts;
      const tokenDelta  = totalTokensEarned - _lastSnap.totalTokensEarned;
      const craftRate   = craftDelta  / dt;
      const tokenRate   = tokenDelta  / dt;

      // Only flag if there's a meaningful number of events
      // (avoids false positives from a short burst during initial load)
      if (craftDelta > 5 && craftRate > RATE.maxCraftsPerSec) {
        _flag(`velocity:crafts=${craftRate.toFixed(2)}/s (${craftDelta} in ${dt.toFixed(0)}s)`);
      }
      if (tokenDelta > 500 && tokenRate > RATE.maxTokensPerSec) {
        _flag(`velocity:tokens=${tokenRate.toFixed(0)}/s (${tokenDelta} in ${dt.toFixed(0)}s)`);
      }

      _lastSnap = { totalCrafts, totalTokensEarned, time: now };
    } catch (_) {
      // globals not yet initialised — skip
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  SANITY CHECK  — verify in-memory game state values
  // ─────────────────────────────────────────────────────────────────────
  function _sanityCheck() {
    try {
      if (typeof totalCrafts === 'undefined') return;

      if (totalCrafts        > MAX.totalCrafts)        _flag(`insane:totalCrafts=${totalCrafts}`);
      if (totalTokensEarned  > MAX.totalTokensEarned)  _flag(`insane:totalTokensEarned=${totalTokensEarned}`);
      if (tokens             > MAX.tokens)             _flag(`insane:tokens=${tokens}`);
      if (prestige           > MAX.prestige)           _flag(`insane:prestige=${prestige}`);
      if (level              > MAX.level)              _flag(`insane:level=${level}`);
      if (typeof firstDiscs  !== 'undefined' && firstDiscs.length  > MAX.firstDiscs)  _flag(`insane:firstDiscs=${firstDiscs.length}`);
      if (typeof discovered  !== 'undefined' && discovered.length  > MAX.discovered)  _flag(`insane:discovered=${discovered.length}`);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────
  //  LEADERBOARD GATE
  //  Wrap pushLeaderboardStats to block if session is suspicious.
  //  Called after game init (since pushLeaderboardStats is defined later).
  // ─────────────────────────────────────────────────────────────────────
  function _hookLeaderboard() {
    if (typeof pushLeaderboardStats !== 'function') return;
    const _original = pushLeaderboardStats;
    window.pushLeaderboardStats = async function () {
      if (_suspicious || window._AC_SUSPICIOUS) {
        console.warn('[AC] Leaderboard push blocked: suspicious session');
        return;
      }
      return _original.apply(this, arguments);
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  START
  // ─────────────────────────────────────────────────────────────────────
  function start() {
    setTimeout(function () {
      _sanityCheck();
      _lastSnap = null; // reset so first snapshot is taken cleanly
      _checkTimer = setInterval(function () {
        _velocityCheck();
        _sanityCheck();
      }, RATE.minCheckInterval * 1000);
      // Hook leaderboard after everything is loaded
      _hookLeaderboard();
    }, RATE.gracePeriod);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────
  return {
    stampSave,
    validateSave,
    clampSave,
    isSuspicious: () => _suspicious,
    start,
  };
})();

// ── Auto-start after DOM ready ────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AC.start());
} else {
  AC.start();
}
