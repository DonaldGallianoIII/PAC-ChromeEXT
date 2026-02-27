/**
 * PAC v5 — Extraction Bridge
 *
 * Missing piece: Injects extractor.js into page context,
 * runs the polling loop, and bridges postMessage ↔ event bus.
 *
 * Flow:
 *   1. Inject extractor.js via <script> tag (web_accessible_resources)
 *   2. Poll on interval: postMessage PAC_EXTRACT_REQUEST
 *   3. Receive PAC_EXTRACT_RESPONSE → emit extraction:updated
 *   4. Listen for scout: events to control polling
 *
 * Auto-starts on load. Live tracking toggle pauses/resumes.
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var state = PAC.State.state;

  var pollInterval = null;
  var extractorInjected = false;
  var isPolling = false;
  var pollSpeed = 11; // Default
  var _lastFingerprint = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTOR INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectExtractor() {
    if (extractorInjected) return;

    try {
      var scriptUrl = chrome.runtime.getURL('content/extractor.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = function() {
        extractorInjected = true;
        if (PAC.DEBUG_MODE) console.log('PAC Bridge: Extractor injected');
      };
      script.onerror = function() {
        console.error('PAC Bridge: Failed to inject extractor');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch(e) {
      console.error('PAC Bridge: Injection error', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  function _startPolling() {
    if (isPolling) return;
    isPolling = true;

    // Inject extractor if not already done
    _injectExtractor();

    // Clear any existing interval
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(function() {
      window.postMessage({ type: 'PAC_EXTRACT_REQUEST' }, '*');
    }, pollSpeed);

    if (PAC.DEBUG_MODE) console.log('PAC Bridge: Polling started at', pollSpeed + 'ms');
  }

  function _stopPolling() {
    isPolling = false;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (PAC.DEBUG_MODE) console.log('PAC Bridge: Polling stopped');
  }

  function _restartPolling() {
    _stopPolling();
    _startPolling();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POOL REDUCTIONS: Compute from board/bench/shop data (bridge-side, has PAC.Data)
  // ═══════════════════════════════════════════════════════════════════════════

  function _computePoolReductions(data) {
    var reductions = {
      common: { twoStar: 0, threeStar: 0 },
      uncommon: { twoStar: 0, threeStar: 0 },
      rare: { twoStar: 0, threeStar: 0 },
      epic: { twoStar: 0, threeStar: 0 },
      ultra: { twoStar: 0, threeStar: 0 }
    };

    var pokemonData = PAC.Data.POKEMON_DATA;
    if (!pokemonData) return reductions;

    var allPlayers = Object.keys(data.playerBoards || {});
    allPlayers.forEach(function(name) {
      // Board + Bench: star-weighted
      var board = data.playerBoards[name] || [];
      var bench = (data.playerBenches && data.playerBenches[name]) || [];
      var units = board.concat(bench);

      units.forEach(function(unit) {
        if (!unit.name) return;
        var uName = unit.name.toUpperCase();
        var info = pokemonData[uName];
        if (!info) return;
        var rarity = info.rarity;
        if (!reductions[rarity]) return;

        var stars = unit.stars || 1;
        if (stars === 1) {
          reductions[rarity].twoStar += 1;
        } else if (stars === 2) {
          reductions[rarity].twoStar += 3;
        } else if (stars === 3) {
          reductions[rarity].threeStar += 9;
        }
      });

      // Shop: each item = 1 copy (always 1★ in shop)
      var shop = (data.playerShops && data.playerShops[name]) || [];
      shop.forEach(function(item) {
        var shopName = typeof item === 'string' ? item : (item && item.name ? item.name : '');
        if (!shopName) return;
        var sName = shopName.toUpperCase();
        var info = pokemonData[sName];
        if (!info) return;
        var rarity = info.rarity;
        if (!reductions[rarity]) return;
        reductions[rarity].twoStar += 1;
      });
    });

    return reductions;
  }

  function _isEmptyReductions(reductions) {
    // "Empty" = every rarity's twoStar and threeStar values are 0
    // This means the extractor didn't have access to POKEMON_DATA
    var rarities = ['common', 'uncommon', 'rare', 'epic', 'ultra'];
    for (var i = 0; i < rarities.length; i++) {
      var r = reductions[rarities[i]];
      if (!r) continue;
      if (r.twoStar !== 0 || r.threeStar !== 0) return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINGERPRINT: Authoritative change detection gate
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * AUTHORITATIVE GATE: This fingerprint must cover every data slice
   * that any extraction:updated consumer depends on.
   * Maintenance: If you add new payload fields consumers use,
   * add them here. See also extractor.js pre-filter (Step 12).
   *
   * Position within board/bench is intentionally not fingerprinted —
   * no consumer is position-dependent.
   *
   * CROSS-REFERENCE: extractor.js also has a conservative pre-filter FP
   * that is a strict subset of this fingerprint. If you add fields here,
   * consider whether the extractor FP should also include them.
   */
  function _buildFingerprint(data) {
    // Scalars (cheap)
    var parts = [
      data.stage || 0,
      data.level || 0,
      data.playerCount || 0,
      data.totalUnits || 0
    ];

    // Player levels — consumed by intel.js for per-player level display
    var levels = data.playerLevels || {};
    var levelKeys = Object.keys(levels).sort();
    for (var m = 0; m < levelKeys.length; m++) {
      parts.push('l' + levelKeys[m] + ':' + levels[levelKeys[m]]);
    }

    // Shop fingerprint — names joined per player (most volatile data)
    // Handles mixed string/object arrays from extractor
    var shops = data.playerShops || {};
    var shopKeys = Object.keys(shops).sort();
    for (var i = 0; i < shopKeys.length; i++) {
      var shop = shops[shopKeys[i]];
      if (shop) {
        parts.push(shopKeys[i] + ':' + shop.map(function(item) {
          return typeof item === 'string' ? item : (item && item.name ? item.name : '');
        }).join(','));
      }
    }

    // Board fingerprint — unit names + stars per player
    // .filter(Boolean) guards against potential null/undefined entries
    // Names required: sell Pikachu + buy Bulbasaur (same cost/star) =
    // same board length, same star levels, different Pokemon
    var boards = data.playerBoards || {};
    var boardKeys = Object.keys(boards).sort();
    for (var j = 0; j < boardKeys.length; j++) {
      var board = boards[boardKeys[j]];
      parts.push('b' + boardKeys[j] + ':' + board.filter(Boolean).map(function(u) {
        return (u.name || '') + (u.stars || 1);
      }).join(','));
    }

    // Bench fingerprint — same logic as board
    var benches = data.playerBenches || {};
    var benchKeys = Object.keys(benches).sort();
    for (var k = 0; k < benchKeys.length; k++) {
      var bench = benches[benchKeys[k]];
      parts.push('n' + benchKeys[k] + ':' + bench.filter(Boolean).map(function(u) {
        return (u.name || '') + (u.stars || 1);
      }).join(','));
    }

    return parts.join('|');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE BRIDGE: postMessage → Event Bus
  // ═══════════════════════════════════════════════════════════════════════════

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'PAC_EXTRACT_RESPONSE') return;

    var data = event.data.data;

    // NULL response = extractor running but no game room found
    if (!data) {
      Events.emit('extraction:noGame');
      return;
    }

    // Mark as connected
    PAC.State.isConnected = true;

    // ── Field normalization (extractor → PAC convention) ──────
    // Extractor uses 'currentStage', PAC uses 'stage'
    if (data.currentStage !== undefined) {
      data.stage = data.currentStage;
    }
    // Extractor uses 'localPlayerLevel', PAC uses 'level'
    if (data.localPlayerLevel !== undefined) {
      data.level = data.localPlayerLevel;
    }

    // Store raw pool data for calculator
    // ── Use extractor's poolReductions when available, fall back to bridge computation ──
    // Fail-safe: any malformed extractor data triggers bridge fallback
    // Note: poolReductions is not fingerprinted (Step 2) — changes propagate
    // because board/bench changes trigger the fingerprint gate.
    if (!data.poolReductions || _isEmptyReductions(data.poolReductions)) {
      data.poolReductions = _computePoolReductions(data);
    }
    PAC.State.lastPoolData = data;

    // ── Auto-Scout: Count owned/scouted copies of target ──────
    if (state.targetPokemon && state.autoScout && data.playerBoards) {
      var counts = _countTargetCopies(data);
      data.ownedCount = counts.owned;
      data.scoutedCount = counts.scouted;
      state.copiesTaken = counts.owned + counts.scouted;
    }

    // ── Auto-detect stage for Ditto ───────────────────────────
    if (data.stage !== undefined) {
      state.currentStage = data.stage;
      // Ditto auto-enables at stage 6+
      state.dittoEnabled = data.stage >= 6;
      // PvE round detection for wild boost
      state.pveRoundEnabled = PAC.Data.PVE_STAGES.has(data.stage);
    }

    // ── Auto-detect level ─────────────────────────────────────
    if (data.level !== undefined && state.playerName) {
      state.level = data.level;
    }

    // ── Wild Auto-Count: Stars owned + copies scouted ─────────
    if (state.playerName && (data.playerBoards || data.playerBenches)) {
      _countWildUnits(data);
    }

    // ── Enrichment for consumers ──────────────────────────────
    data.unitCount = data.totalUnits || 0;

    // ── Fingerprint gate: skip emit if nothing changed ───────
    var fingerprint = _buildFingerprint(data);
    if (fingerprint === _lastFingerprint) return;
    _lastFingerprint = fingerprint;

    // Emit to all listeners
    Events.emit('extraction:updated', data);

    // ── Forward sessionId to chat engine ──────────────────────
    if (data.sessionId) {
      console.log('[PAC Bridge] sessionId from extractor:', data.sessionId.slice(0, 12) + '…');
      window.postMessage({
        type: 'PAC_SESSION_DETECTED',
        sessionId: data.sessionId
      }, '*');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TARGET COPY COUNTING (Auto-Scout)
  // ═══════════════════════════════════════════════════════════════════════════

  function _countTargetCopies(data) {
    var owned = 0;
    var scouted = 0;

    if (!state.targetPokemon || !state.evolutionFamily) {
      return { owned: 0, scouted: 0 };
    }

    var family = state.evolutionFamily;
    var playerName = state.playerName;

    // Count across ALL players — board + bench
    var allPlayers = Object.keys(data.playerBoards || {});
    allPlayers.forEach(function(name) {
      var board = data.playerBoards[name] || [];
      var bench = (data.playerBenches && data.playerBenches[name]) || [];
      var units = board.concat(bench);

      units.forEach(function(unit) {
        if (!unit.name) return;
        var uName = unit.name.toUpperCase();
        if (family.indexOf(uName) === -1) return;

        // Star-weight: 1★=1 copy, 2★=3 copies, 3★=9 copies consumed from pool
        var stars = unit.stars || 1;
        var copies = stars === 1 ? 1 : (stars === 2 ? 3 : 9);

        if (name === playerName) {
          owned += copies;
        } else {
          scouted += copies;
        }
      });

      // Shop items — each is 1 copy from pool
      var shop = (data.playerShops && data.playerShops[name]) || [];
      shop.forEach(function(item) {
        var shopName = typeof item === 'string' ? item : (item && item.name ? item.name : '');
        if (!shopName) return;
        var sName = shopName.toUpperCase();
        if (family.indexOf(sName) === -1) return;

        if (name === playerName) {
          owned += 1;
        } else {
          scouted += 1;
        }
      });
    });

    return { owned: owned, scouted: scouted };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WILD AUTO-COUNTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Count wild stars on player's board/bench and wild copies on other players.
   * Updates state.wildUnitsOwned (total stars) and state.wildUnitsTaken (per-rarity copies).
   */
  function _countWildUnits(data) {
    var Utils = PAC.Utils;
    var Data = PAC.Data;
    var playerName = state.playerName;

    // ── Count wild STARS on player's board + bench ──────────────
    var playerBoard = (data.playerBoards && data.playerBoards[playerName]) || [];
    var playerBench = (data.playerBenches && data.playerBenches[playerName]) || [];
    var playerUnits = playerBoard.concat(playerBench);

    var wildStars = 0;
    for (var i = 0; i < playerUnits.length; i++) {
      var unit = playerUnits[i];
      if (unit.name && Utils.isWildPokemon(unit.name)) {
        wildStars += unit.stars || 1;
      }
    }

    if (wildStars !== state.wildUnitsOwned) {
      state.wildUnitsOwned = wildStars;
    }

    // ── Count wild COPIES on other players' boards + benches ────
    var wildCopiesByRarity = { common: 0, uncommon: 0, rare: 0, epic: 0, ultra: 0 };
    var allBoards = data.playerBoards || {};
    var allBenches = data.playerBenches || {};

    var allPlayerNames = Object.keys(allBoards);
    // Also grab any players only in benches
    var benchNames = Object.keys(allBenches);
    for (var b = 0; b < benchNames.length; b++) {
      if (allPlayerNames.indexOf(benchNames[b]) === -1) {
        allPlayerNames.push(benchNames[b]);
      }
    }

    for (var p = 0; p < allPlayerNames.length; p++) {
      var name = allPlayerNames[p];
      if (name === playerName) continue;

      var units = (allBoards[name] || []).concat(allBenches[name] || []);
      for (var u = 0; u < units.length; u++) {
        var wu = units[u];
        if (!wu.name || !Utils.isWildPokemon(wu.name)) continue;

        var baseForm = Utils.getBaseForm(wu.name.toUpperCase());
        var pokemonData = Data.POKEMON_DATA[baseForm];
        if (!pokemonData) continue;

        var rarity = pokemonData.rarity || pokemonData;
        if (!wildCopiesByRarity.hasOwnProperty(rarity)) continue;

        var stars = wu.stars || 1;
        // Convert stars to copy count: 1★=1, 2★=3, 3★=9
        var copies = stars === 3 ? 9 : stars === 2 ? 3 : 1;
        wildCopiesByRarity[rarity] += copies;
      }
    }

    // Update if changed
    var changed = false;
    var rarities = Object.keys(wildCopiesByRarity);
    for (var r = 0; r < rarities.length; r++) {
      if (state.wildUnitsTaken[rarities[r]] !== wildCopiesByRarity[rarities[r]]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      state.wildUnitsTaken = wildCopiesByRarity;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS (from Setup panel)
  // ═══════════════════════════════════════════════════════════════════════════

  Events.on('scout:liveChanged', function(data) {
    if (data.enabled) {
      _startPolling();
    } else {
      _stopPolling();
      PAC.State.isConnected = false;
    }
  });

  Events.on('scout:speedChanged', function(data) {
    pollSpeed = data.speed || 11;
    PAC.State.currentPollSpeed = pollSpeed;
    if (isPolling) _restartPolling();
  });

  Events.on('scout:nameChanged', function(data) {
    state.playerName = data.name;
    PAC.State.savePlayerName();
  });

  var _reinjectTimer = null;

  Events.on('scout:reinject', function() {
    if (_reinjectTimer) clearTimeout(_reinjectTimer);

    // Reset extractor in page context
    window.postMessage({ type: 'PAC_RESET' }, '*');
    extractorInjected = false;
    PAC.State.isConnected = false;
    PAC.State.lastPoolData = null;

    // Re-inject and restart (debounced)
    _reinjectTimer = setTimeout(function() {
      _reinjectTimer = null;
      _injectExtractor();
      if (isPolling) _restartPolling();
    }, 500);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-START
  // ═══════════════════════════════════════════════════════════════════════════

  // Always inject extractor on load
  _injectExtractor();

  // Auto-start polling (user can pause via Setup toggle)
  setTimeout(function() {
    _startPolling();
    PAC.State.liveTrackingActive = true;
    // Emit so Setup panel can reflect the initial state
    Events.emit('bridge:autoStarted');
  }, 1000);

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Extraction bridge loaded');
})();
