/**
 * PAC v5 — Game Interaction Handler
 *
 * Manages DOM overlays on the game page itself (not PAC panels).
 * Handles: mono-type shop blockers, random draft slot highlight,
 * copycat blockers, shop slot mapping.
 *
 * These manipulate the GAME's DOM, not #pac-root.
 */
(function() {
  'use strict';

  var state = PAC.State.state;
  var Events = PAC.UI.Events;
  var Utils = PAC.Utils;

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYSTROKE ISOLATION — Prevent PAC inputs from triggering game hotkeys
  // ═══════════════════════════════════════════════════════════════════════════
  // The game binds hotkeys (D = reroll, F = buy XP, etc.) on the document.
  // Any keystrokes inside PAC elements must be stopped from reaching the game.
  // Capture phase ensures we intercept before the game's listeners fire.

  var NAV_KEYS = { ArrowUp:1, ArrowDown:1, ArrowLeft:1, ArrowRight:1, Enter:1, Escape:1, Tab:1 };

  function _shouldIsolate(e) {
    var el = e.target;
    if (!el) return false;
    if (!_isInsidePAC(el)) return false;

    var tag = el.tagName;
    var isTextEntry = (tag === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') ||
                      tag === 'TEXTAREA' || el.isContentEditable;

    if (isTextEntry) {
      // Let nav keys flow through — autocomplete handles its own stopPropagation
      if (NAV_KEYS[e.key]) return false;
      // Block everything else (letters, numbers, etc.) so game hotkeys don't fire
      return true;
    }

    // Block navigation keys on selects and interactive PAC elements
    if (NAV_KEYS[e.key]) {
      if (tag === 'SELECT') return true;
      if (tag === 'BUTTON') return true;
      if (el.getAttribute('role') === 'listbox' || el.getAttribute('role') === 'option') return true;
      if (el.closest('.pac-autocomplete-dropdown')) return true;
    }

    return false;
  }

  function _isInsidePAC(el) {
    if (!el) return false;
    if (el.closest('#pac-root')) return true;
    if (el.closest('[id^="pac-"]')) return true;
    if (el.closest('.pac-autocomplete-dropdown')) return true;
    return false;
  }

  ['keydown', 'keyup', 'keypress'].forEach(function(eventType) {
    document.addEventListener(eventType, function(e) {
      if (_shouldIsolate(e)) {
        e.stopPropagation();
      }
    }, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MONO-TYPE SHOP BLOCKERS
  // ═══════════════════════════════════════════════════════════════════════════

  var _lastMonoShop = '';
  var _lastMonoType = '';

  Events.on('extraction:updated', _updateMonoBlockers);
  Events.on('state:monoTypeChanged', _updateMonoBlockers);

  function _clearMonoBlockers() {
    document.querySelectorAll('.pac-mono-blocker').forEach(function(el) { el.remove(); });
    // pac-highlight-slot cleanup handled by _clearHighlighters or natural DOM removal
  }

  function _updateMonoBlockers() {
    if (!state.monoTypeEnabled || !state.monoTypeSelected) {
      if (_lastMonoShop !== '' || _lastMonoType !== '') {
        _clearMonoBlockers();
        _lastMonoShop = '';
        _lastMonoType = '';
      }
      return;
    }

    // Get player's shop from extraction data (not DOM)
    var lastPoolData = PAC.State.lastPoolData;
    if (!lastPoolData || !state.playerName) return;
    var playerShop = (lastPoolData.playerShops && lastPoolData.playerShops[state.playerName]) || [];
    var typeStr = state.monoTypeSelected;

    // Build fingerprint from extraction data for change detection
    var shopFingerprint = playerShop.map(function(item) {
      return typeof item === 'string' ? item : (item && item.name ? item.name : '');
    }).join(',');

    if (shopFingerprint === _lastMonoShop && typeStr === _lastMonoType) return;
    _lastMonoShop = shopFingerprint;
    _lastMonoType = typeStr;

    // Only NOW touch the DOM — and only to apply/remove blockers
    var shopContainer = document.querySelector('ul.game-pokemons-store');
    if (!shopContainer) return;

    var slots = shopContainer.querySelectorAll('div.my-box.clickable.game-pokemon-portrait');
    if (!slots.length) return;

    _clearMonoBlockers();

    // Use data-driven type lookup instead of reading synergy icons from DOM
    var Data = PAC.Data;
    slots.forEach(function(slot) {
      var nameEl = slot.querySelector('.game-pokemon-portrait-name');
      var nameStr = nameEl ? nameEl.textContent.trim() : '';
      if (!nameStr || nameStr === 'DEFAULT') return;

      var lookupKey = nameStr.toUpperCase().replace(/[^A-Z0-9]/g, '');
      var pokemonInfo = Data.POKEMON_DATA[lookupKey];
      if (!pokemonInfo) return;

      var types = pokemonInfo.types || [];
      var hasType = types.indexOf(typeStr.toLowerCase()) !== -1;
      if (!hasType) {
        slot.classList.add('pac-highlight-slot');
        var blocker = document.createElement('div');
        blocker.className = 'pac-mono-blocker';
        blocker.innerHTML = '🚫';
        blocker.title = 'Not ' + typeStr.toUpperCase() + ' type';
        blocker.style.cssText =
          'position: absolute; z-index: 999999; pointer-events: auto; cursor: not-allowed; ' +
          'display: flex; align-items: center; justify-content: center; ' +
          'font-size: 32px; background: rgba(0,0,0,0.7); border: 2px solid rgba(239,68,68,0.6); ' +
          'border-radius: 8px; ' +
          'top: -5px; left: -5px; right: -5px; bottom: -5px;';

        // Prevent click-through
        blocker.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
        });

        slot.appendChild(blocker);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RANDOM DRAFT — Slot highlighting
  // ═══════════════════════════════════════════════════════════════════════════

  Events.on('extraction:updated', _updateDraftSlot);

  function _clearDraftHighlight() {
    document.querySelectorAll('.pac-draft-highlight').forEach(function(el) { el.remove(); });
  }

  function _updateDraftSlot() {
    if (!state.randomDraftEnabled) {
      _clearDraftHighlight();
      return;
    }

    var shopContainer = document.querySelector('ul.game-pokemons-store');
    if (!shopContainer) return;

    var slots = shopContainer.querySelectorAll('div.my-box.clickable.game-pokemon-portrait');
    if (!slots.length) return;

    // Detect new shop (compare to last shop snapshot)
    var currentShop = Array.from(slots).map(function(slot) {
      var nameEl = slot.querySelector('.game-pokemon-portrait-name');
      return nameEl ? nameEl.textContent.trim() : '';
    });

    var isNewShop = !state.randomDraftLastShop ||
      JSON.stringify(currentShop) !== JSON.stringify(state.randomDraftLastShop);

    if (isNewShop) {
      // Pick a random slot
      var filledSlots = [];
      currentShop.forEach(function(name, idx) {
        if (name && name !== 'DEFAULT') filledSlots.push(idx);
      });

      if (filledSlots.length > 0) {
        state.randomDraftChosenSlot = filledSlots[Math.floor(Math.random() * filledSlots.length)];
      }
      state.randomDraftLastShop = currentShop;
    }

    if (!isNewShop) return;

    _clearDraftHighlight();

    if (state.randomDraftChosenSlot !== null && slots[state.randomDraftChosenSlot]) {
      var chosenSlot = slots[state.randomDraftChosenSlot];
      chosenSlot.classList.add('pac-highlight-slot');

      var highlight = document.createElement('div');
      highlight.className = 'pac-draft-highlight';
      highlight.style.cssText =
        'position: absolute; z-index: 999998; pointer-events: none; ' +
        'border: 3px solid #eab308; border-radius: 8px; ' +
        'box-shadow: 0 0 16px rgba(234,179,8,0.5), inset 0 0 8px rgba(234,179,8,0.2); ' +
        'animation: pac-pulse 1.5s ease-in-out infinite; ' +
        'top: -4px; left: -4px; right: -4px; bottom: -4px;';

      chosenSlot.appendChild(highlight);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COPYCAT — Block UNCONTESTED shop slots (no other player has the family)
  // ═══════════════════════════════════════════════════════════════════════════

  var _lastCopycatFingerprint = '';

  Events.on('extraction:updated', _updateCopycatBlockers);

  function _clearCopycatBlockers() {
    document.querySelectorAll('.pac-copycat-blocker').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.pac-copycat-slot').forEach(function(el) { el.classList.remove('pac-copycat-slot'); });
  }

  /**
   * Build a Set of ALL Pokemon names (full evo families) owned by
   * ANY player other than self. If anyone has Charmeleon, the entire
   * Charmander/Charmeleon/Charizard family is in the set.
   */
  function _getOtherPlayersPokemon() {
    var contestedSet = new Set();
    var lastPoolData = PAC.State.lastPoolData;
    if (!lastPoolData || !state.playerName) return contestedSet;

    var allBoards  = lastPoolData.playerBoards  || {};
    var allBenches = lastPoolData.playerBenches || {};

    // All player names except self
    var otherPlayers = new Set();
    Object.keys(allBoards).forEach(function(n) { otherPlayers.add(n); });
    Object.keys(allBenches).forEach(function(n) { otherPlayers.add(n); });
    otherPlayers.delete(state.playerName);

    otherPlayers.forEach(function(playerName) {
      var board = allBoards[playerName] || [];
      var bench = allBenches[playerName] || [];
      board.concat(bench).forEach(function(unit) {
        var unitName = typeof unit === 'string' ? unit : (unit && unit.name ? unit.name : '');
        if (!unitName) return;
        var baseName = unitName.toUpperCase();
        var baseForm = Utils.getBaseForm(baseName);
        var family = Utils.getEvolutionFamily(baseForm);
        family.forEach(function(f) { contestedSet.add(f); });
      });
    });

    return contestedSet;
  }

  function _updateCopycatBlockers() {
    if (!state.copycatEnabled) {
      if (_lastCopycatFingerprint !== '') {
        _clearCopycatBlockers();
        _lastCopycatFingerprint = '';
      }
      return;
    }

    var lastPoolData = PAC.State.lastPoolData;
    if (!lastPoolData || !state.playerName) return;

    // Fingerprint: player's shop + other players' board/bench composition
    var playerShop = (lastPoolData.playerShops && lastPoolData.playerShops[state.playerName]) || [];
    var shopStr = playerShop.map(function(item) {
      return typeof item === 'string' ? item : (item && item.name ? item.name : '');
    }).join(',');

    // Other players' board/bench — what copycat actually checks
    var otherStr = '';
    var allBoards = lastPoolData.playerBoards || {};
    var allBenches = lastPoolData.playerBenches || {};
    var names = Object.keys(allBoards).sort();
    for (var i = 0; i < names.length; i++) {
      if (names[i] === state.playerName) continue;
      var b = allBoards[names[i]] || [];
      var bn = allBenches[names[i]] || [];
      otherStr += names[i] + ':';
      otherStr += b.filter(Boolean).map(function(u) { return (u.name || '') + (u.stars || 1); }).join(',');
      otherStr += '/';
      otherStr += bn.filter(Boolean).map(function(u) { return (u.name || '') + (u.stars || 1); }).join(',');
      otherStr += '|';
    }

    var fp = shopStr + '||' + otherStr;
    if (fp === _lastCopycatFingerprint) return;
    _lastCopycatFingerprint = fp;

    // Set of all Pokemon ANY other player has (full evo families)
    var contestedPokemon = _getOtherPlayersPokemon();

    // Find shop slot DOM elements
    var shopContainer = document.querySelector('ul.game-pokemons-store');
    if (!shopContainer) return;
    var slots = shopContainer.querySelectorAll('div.my-box.clickable.game-pokemon-portrait');

    _clearCopycatBlockers();

    var blockedCount = 0;

    slots.forEach(function(slot) {
      var nameEl = slot.querySelector('.game-pokemon-portrait-name');
      var nameStr = nameEl ? nameEl.textContent.trim() : '';
      if (!nameStr || nameStr === 'DEFAULT') return;

      var pokeName = nameStr.toUpperCase().replace(/[^A-Z0-9]/g, '');

      // Check if this Pokemon's evo family is contested (at least one other player has it)
      var baseForm = Utils.getBaseForm(pokeName);
      var family = Utils.getEvolutionFamily(baseForm);
      var isContested = family.some(function(f) { return contestedPokemon.has(f); });

      if (!isContested) {
        // BLOCK — nobody else has this family
        slot.classList.add('pac-highlight-slot');
        slot.classList.add('pac-copycat-slot');

        var blocker = document.createElement('div');
        blocker.className = 'pac-copycat-blocker';
        blocker.innerHTML = '<span>🚫</span><span style="font-size: 10px; margin-top: 2px;">Uncontested</span>';
        blocker.title = 'No other player has ' + pokeName;
        blocker.style.cssText =
          'position: absolute; z-index: 999999; pointer-events: auto; cursor: not-allowed; ' +
          'display: flex; flex-direction: column; align-items: center; justify-content: center; ' +
          'font-size: 24px; background: rgba(0,0,0,0.7); border: 2px solid rgba(168,85,247,0.6); ' +
          'border-radius: 8px; color: #a855f7; ' +
          'top: -5px; left: -5px; right: -5px; bottom: -5px;';

        blocker.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
        });

        slot.appendChild(blocker);
        blockedCount++;
      }
    });

    // Update copycat status text (in team section)
    var statusEl = document.getElementById('pac-team-copycatStatus');
    if (statusEl) {
      var available = slots.length - blockedCount;
      if (contestedPokemon.size === 0) {
        statusEl.textContent = '⚠️ No player data yet';
      } else if (available === 0) {
        statusEl.textContent = '😿 No contested Pokémon in shop!';
      } else if (blockedCount === 0) {
        statusEl.textContent = '😺 All Pokémon are contested!';
      } else {
        statusEl.textContent = '🐱 ' + available + ' contested, ' + blockedCount + ' blocked';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP on new game / mode disable
  // ═══════════════════════════════════════════════════════════════════════════

  Events.on('extraction:newGame', function() {
    _clearMonoBlockers();
    _clearDraftHighlight();
    _clearCopycatBlockers();
    state.randomDraftLastShop = null;
    state.randomDraftChosenSlot = null;
  });

  Events.on('state:monoTypeChanged', function(data) {
    _lastMonoShop = '';
    _lastMonoType = '';
    if (!data || !data.type) _clearMonoBlockers();
  });

  Events.on('state:draftChanged', function(data) {
    if (!data || !data.enabled) {
      _clearDraftHighlight();
      state.randomDraftChosenSlot = null;
      state.randomDraftLastShop = null;
    }
  });

  Events.on('state:copycatChanged', function(data) {
    _lastCopycatFingerprint = '';
    if (!data || !data.enabled) _clearCopycatBlockers();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REFRESH BLOCKER — Positioned over refresh button (v3 port)
  // ═══════════════════════════════════════════════════════════════════════════

  var blockerEl = null;
  var blockerNameEl = null;
  var blockerStyleInjected = false;

  function _injectBlockerStyles() {
    if (blockerStyleInjected) return;
    blockerStyleInjected = true;

    var style = document.createElement('style');
    style.textContent =
      '#pac-refresh-blocker {' +
        'position:fixed;z-index:2147483647;' +
        'background:rgba(239,68,68,0.95);border:3px solid #fbbf24;border-radius:12px;' +
        'display:none;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:8px;padding:16px;' +
        'box-shadow:0 0 30px rgba(251,191,36,0.8),0 0 60px rgba(239,68,68,0.6);' +
        'animation:pac-blockerPulse 0.3s ease-in-out infinite alternate;' +
        'cursor:default;user-select:none;' +
      '}' +
      '#pac-refresh-blocker.visible { display:flex; }' +
      '@keyframes pac-blockerPulse {' +
        'from { box-shadow:0 0 30px rgba(251,191,36,0.8),0 0 60px rgba(239,68,68,0.6);transform:scale(1); }' +
        'to { box-shadow:0 0 40px rgba(251,191,36,1),0 0 80px rgba(239,68,68,0.8);transform:scale(1.02); }' +
      '}' +
      '#pac-refresh-blocker .blocker-title {' +
        'font-size:14px;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;text-shadow:0 0 10px rgba(0,0,0,0.5);' +
      '}' +
      '#pac-refresh-blocker .blocker-pokemon {' +
        'font-size:18px;font-weight:800;color:white;text-shadow:0 0 10px rgba(0,0,0,0.5);' +
      '}' +
      '#pac-refresh-blocker .blocker-dismiss {' +
        'position:absolute;top:-12px;right:-12px;width:28px;height:28px;' +
        'background:#1e293b;border:2px solid #fbbf24;border-radius:50%;' +
        'color:#fbbf24;font-size:16px;font-weight:700;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;transition:all 0.15s;' +
      '}' +
      '#pac-refresh-blocker .blocker-dismiss:hover {' +
        'background:#fbbf24;color:#1e293b;transform:scale(1.1);' +
      '}' +

      /* ── Shop slot highlighters ── */
      '.pac-highlight-slot {' +
        'position:relative !important;overflow:visible !important;' +
      '}' +
      '.pac-target-highlighter {' +
        'position:absolute;pointer-events:none;z-index:9999;border-radius:8px;' +
        'top:-4px;left:-4px;right:-4px;bottom:-4px;' +
        'border:4px solid var(--pac-target-color,#fbbf24);' +
        'background:var(--pac-target-color-bg,rgba(251,191,36,0.45));' +
        'box-shadow:0 0 20px var(--pac-target-color,#fbbf24),inset 0 0 30px var(--pac-target-color-bg,rgba(251,191,36,0.35));' +
        'animation:pac-targetPulse 1s ease-in-out infinite;' +
        'overflow:hidden;' +
      '}' +
      '.pac-target-highlighter::after {' +
        'content:"";position:absolute;' +
        'top:-100px;left:-100px;right:-100px;bottom:-100px;' +
        'background:repeating-linear-gradient(' +
          '135deg,' +
          'transparent 0px,' +
          'transparent 8px,' +
          'rgba(255,255,255,0.15) 10px,' +
          'rgba(255,255,255,0.35) 14px,' +
          'rgba(255,255,255,0.15) 18px,' +
          'transparent 20px,' +
          'transparent 40px' +
        ');' +
        'animation:pac-crtShimmer 1.2s linear infinite;' +
      '}' +
      '.pac-team-highlighter {' +
        'position:absolute;pointer-events:none;z-index:9999;border-radius:8px;' +
        'top:-4px;left:-4px;right:-4px;bottom:-4px;' +
        'border:4px solid var(--pac-team-color,#FF1493);' +
        'background:var(--pac-team-color-bg,rgba(255,20,147,0.45));' +
        'box-shadow:0 0 20px var(--pac-team-color,#FF1493),inset 0 0 30px var(--pac-team-color-bg,rgba(255,20,147,0.35));' +
        'animation:pac-teamPulse 1s ease-in-out infinite;' +
        'overflow:hidden;' +
      '}' +
      '.pac-team-highlighter::after {' +
        'content:"";position:absolute;' +
        'top:-100px;left:-100px;right:-100px;bottom:-100px;' +
        'background:repeating-linear-gradient(' +
          '135deg,' +
          'transparent 0px,' +
          'transparent 8px,' +
          'rgba(255,255,255,0.12) 10px,' +
          'rgba(255,255,255,0.3) 14px,' +
          'rgba(255,255,255,0.12) 18px,' +
          'transparent 20px,' +
          'transparent 40px' +
        ');' +
        'animation:pac-crtShimmer 1.2s linear infinite;' +
      '}' +
      '.pac-target-highlighter.also-team {' +
        'border:4px solid;' +
        'border-image:linear-gradient(45deg,var(--pac-target-color,#fbbf24),var(--pac-team-color,#FF1493)) 1;' +
        'box-shadow:0 0 20px var(--pac-target-color,#fbbf24),0 0 20px var(--pac-team-color,#FF1493);' +
      '}' +
      '@keyframes pac-targetPulse { 0%,100%{opacity:0.85;} 50%{opacity:1;} }' +
      '@keyframes pac-teamPulse { 0%,100%{opacity:0.85;} 50%{opacity:1;} }' +
      '@keyframes pac-crtShimmer { 0%{transform:translate(0,0);} 100%{transform:translate(40px,40px);} }';

    document.head.appendChild(style);
  }

  function _createBlockerDOM() {
    if (blockerEl) return;
    _injectBlockerStyles();

    blockerEl = document.createElement('div');
    blockerEl.id = 'pac-refresh-blocker';
    blockerEl.innerHTML =
      '<div class="blocker-title">⚠️ TARGET FOUND ⚠️</div>' +
      '<div class="blocker-pokemon" id="pac-blocker-name">—</div>' +
      '<button class="blocker-dismiss" id="pac-blocker-dismiss" title="Dismiss">×</button>';

    document.body.appendChild(blockerEl);

    blockerNameEl = blockerEl.querySelector('#pac-blocker-name');

    var dismissBtn = blockerEl.querySelector('#pac-blocker-dismiss');
    dismissBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _hideRefreshBlocker(true);
    });
  }

  function _showRefreshBlocker(pokemonName) {
    _createBlockerDOM();

    var refreshBtn = document.querySelector('button.bubbly.blue.refresh-button');
    if (!blockerEl || !refreshBtn) return;

    // Position over the refresh button
    var rect = refreshBtn.getBoundingClientRect();
    var padding = 20;

    blockerEl.style.left = (rect.left - padding) + 'px';
    blockerEl.style.top = (rect.top - padding) + 'px';
    blockerEl.style.width = (rect.width + padding * 2) + 'px';
    blockerEl.style.height = (rect.height + padding * 2) + 'px';
    blockerEl.style.minWidth = '150px';
    blockerEl.style.minHeight = '80px';

    blockerNameEl.textContent = pokemonName;
    blockerEl.classList.add('visible');

    state.refreshBlockerVisible = true;
    state.refreshBlockerTrigger = pokemonName;

    if (PAC.DEBUG_MODE) console.log('🛑 BLOCKER: ' + pokemonName + ' in shop — covering refresh button');
  }

  function _hideRefreshBlocker(userDismissed) {
    if (!blockerEl) return;
    blockerEl.classList.remove('visible');

    if (userDismissed && state.refreshBlockerTrigger) {
      state.refreshBlockerDismissed = state.refreshBlockerTrigger;
    } else {
      state.refreshBlockerDismissed = null;
    }

    state.refreshBlockerVisible = false;
    state.refreshBlockerTrigger = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOP SLOT HIGHLIGHTERS — Glow on target Pokemon in shop (v3 port)
  // ═══════════════════════════════════════════════════════════════════════════

  function _clearHighlighters() {
    document.querySelectorAll('.pac-target-highlighter, .pac-team-highlighter').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.pac-highlight-slot').forEach(function(el) { el.classList.remove('pac-highlight-slot'); });
  }

  function _updateHighlighters(playerShop) {
    _clearHighlighters();
    _injectBlockerStyles();

    if (!playerShop || playerShop.length === 0) return;

    // Filter out DEFAULT (empty/purchased) slots to match DOM indices
    var slotMapping = playerShop
      .filter(function(n) { return n && n !== 'DEFAULT'; })
      .map(function(n) { return n.toUpperCase(); });

    var shopContainer = document.querySelector('ul.game-pokemons-store');
    if (!shopContainer) return;

    var shopSlots = shopContainer.querySelectorAll('div.my-box.clickable.game-pokemon-portrait');
    if (!shopSlots.length) return;

    // Build main target family
    var mainFamily = [];
    if (state.targetPokemon) {
      var baseForm = Utils.getBaseForm(state.targetPokemon);
      mainFamily = Utils.getEvolutionFamily(baseForm);
    }

    // Build team target families
    var teamFamilies = [];
    if (state.teamTargets && state.teamTargets.length > 0) {
      for (var i = 0; i < state.teamTargets.length; i++) {
        var t = state.teamTargets[i];
        if (!t.enabled) continue;
        var tBase = Utils.getBaseForm(t.pokemon);
        var tFamily = Utils.getEvolutionFamily(tBase);
        for (var f = 0; f < tFamily.length; f++) {
          teamFamilies.push(tFamily[f]);
        }
      }
    }

    if (mainFamily.length === 0 && teamFamilies.length === 0) return;

    var dittoInShop = slotMapping.indexOf('DITTO') !== -1;

    shopSlots.forEach(function(slot, index) {
      var pokeName = slotMapping[index];
      if (!pokeName) return;

      var isMain = mainFamily.indexOf(pokeName) !== -1 ||
        (dittoInShop && pokeName === 'DITTO' && mainFamily.length > 0);
      var isTeam = teamFamilies.indexOf(pokeName) !== -1 ||
        (dittoInShop && pokeName === 'DITTO' && teamFamilies.length > 0);

      if (!isMain && !isTeam) return;

      // Make slot a positioning context
      slot.classList.add('pac-highlight-slot');

      var hl = document.createElement('div');

      if (isMain) {
        hl.className = 'pac-target-highlighter';
        if (isTeam) hl.classList.add('also-team');
        hl.style.setProperty('--pac-target-color', '#fbbf24');
        hl.style.setProperty('--pac-target-color-bg', 'rgba(251,191,36,0.45)');
      } else {
        hl.className = 'pac-team-highlighter';
        hl.style.setProperty('--pac-team-color', '#FF1493');
        hl.style.setProperty('--pac-team-color-bg', 'rgba(255,20,147,0.45)');
      }

      // Append as child of slot — moves with DOM automatically
      slot.appendChild(hl);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOP SCAN — Blocker + Highlighter trigger on extraction
  // ═══════════════════════════════════════════════════════════════════════════

  var _lastHighlighterShop = '';

  Events.on('extraction:updated', _checkShopForTargets);
  Events.on('state:targetChanged', function() { _lastHighlighterShop = ''; });
  Events.on('state:teamChanged', function() { _lastHighlighterShop = ''; });

  function _checkShopForTargets(data) {
    if (!data || !data.playerShops || !state.playerName) {
      if (_lastHighlighterShop !== '') {
        _clearHighlighters();
        _lastHighlighterShop = '';
      }
      if (state.refreshBlockerVisible) _hideRefreshBlocker(false);
      return;
    }

    var playerShop = data.playerShops[state.playerName];
    var shopStr = playerShop ? playerShop.map(function(item) {
      return typeof item === 'string' ? item : (item && item.name ? item.name : '');
    }).join(',') : '';

    // Skip if shop hasn't changed
    if (shopStr === _lastHighlighterShop) return;
    _lastHighlighterShop = shopStr;

    // ── Highlighters (always update) ──
    if (playerShop && (state.targetPokemon || (state.teamTargets && state.teamTargets.length > 0))) {
      _updateHighlighters(playerShop);
    } else {
      _clearHighlighters();
    }

    // ── Refresh blocker ──
    if (!playerShop || playerShop.length === 0) {
      if (state.refreshBlockerVisible) _hideRefreshBlocker(false);
      return;
    }
    if (!state.teamTargets || state.teamTargets.length === 0) {
      if (state.refreshBlockerVisible) _hideRefreshBlocker(false);
      return;
    }

    var blockerTrigger = null;

    // Check team targets
    for (var i = 0; i < state.teamTargets.length; i++) {
      var target = state.teamTargets[i];
      if (!target.enabled) continue;

      var baseForm = Utils.getBaseForm(target.pokemon);
      var family = Utils.getEvolutionFamily(baseForm);

      for (var j = 0; j < playerShop.length; j++) {
        var shopPoke = playerShop[j] ? playerShop[j].toUpperCase() : '';
        if (family.indexOf(shopPoke) !== -1) {
          blockerTrigger = shopPoke;
          break;
        }
      }
      if (blockerTrigger) break;
    }

    // Check main target too
    if (!blockerTrigger && state.targetPokemon) {
      var mainBase = Utils.getBaseForm(state.targetPokemon);
      var mainFamily = Utils.getEvolutionFamily(mainBase);
      for (var k = 0; k < playerShop.length; k++) {
        var sp = playerShop[k] ? playerShop[k].toUpperCase() : '';
        if (mainFamily.indexOf(sp) !== -1) {
          blockerTrigger = sp;
          break;
        }
      }
    }

    // Also check Ditto at stage 6+
    if (!blockerTrigger && state.dittoEnabled) {
      for (var d = 0; d < playerShop.length; d++) {
        if (playerShop[d] && playerShop[d].toUpperCase() === 'DITTO') {
          blockerTrigger = 'DITTO';
          break;
        }
      }
    }

    // Show/hide logic
    if (blockerTrigger && !state.refreshBlockerVisible) {
      if (blockerTrigger !== state.refreshBlockerDismissed) {
        _showRefreshBlocker(blockerTrigger);
      }
    } else if (!blockerTrigger && state.refreshBlockerVisible) {
      _hideRefreshBlocker(false);
    } else if (!blockerTrigger && state.refreshBlockerDismissed) {
      state.refreshBlockerDismissed = null;
    }
  }

  // Reset on new game
  Events.on('extraction:newGame', function() {
    _hideRefreshBlocker(false);
    _clearHighlighters();
    state.refreshBlockerDismissed = null;
    _lastHighlighterShop = '';
    _lastMonoShop = '';
    _lastMonoType = '';
    _lastCopycatFingerprint = '';
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RIGHT-CLICK QUICK ADD
  // ═══════════════════════════════════════════════════════════════════════════

  var quickAddEl = null;
  var quickAddAC = null;

  function _createQuickAdd(x, y) {
    _destroyQuickAdd();

    var Data = PAC.Data;

    // Container
    quickAddEl = document.createElement('div');
    quickAddEl.id = 'pac-quick-add';
    quickAddEl.style.cssText =
      'position:fixed;z-index:2147483645;' +
      'background:rgba(10,12,18,0.96);' +
      'border:1px solid rgba(48,213,200,0.3);' +
      'border-radius:10px;' +
      'padding:8px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(48,213,200,0.15);' +
      'backdrop-filter:blur(12px);' +
      'width:240px;';

    // Position — keep on screen
    var left = Math.min(x, window.innerWidth - 260);
    var top = Math.min(y, window.innerHeight - 60);
    quickAddEl.style.left = left + 'px';
    quickAddEl.style.top = top + 'px';

    // Input wrapper (for ghost text overlay)
    var inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'position:relative;';

    // Ghost text (behind input)
    var ghost = document.createElement('div');
    ghost.style.cssText =
      'position:absolute;top:0;left:0;right:0;bottom:0;' +
      'padding:8px 10px;' +
      'font-size:13px;font-family:inherit;' +
      'color:rgba(48,213,200,0.35);' +
      'pointer-events:none;' +
      'white-space:nowrap;overflow:hidden;';
    inputWrap.appendChild(ghost);

    var currentGhost = '';

    // Actual input (transparent bg so ghost shows through)
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add or "remove name"...';
    input.style.cssText =
      'width:100%;box-sizing:border-box;' +
      'background:transparent;' +
      'border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:6px;' +
      'color:#fff;font-size:13px;' +
      'padding:8px 10px;outline:none;' +
      'font-family:inherit;' +
      'position:relative;z-index:1;';
    inputWrap.appendChild(input);

    quickAddEl.appendChild(inputWrap);

    // Help text
    var help = document.createElement('div');
    help.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.25);margin-top:4px;padding:0 2px;font-family:monospace;';
    help.innerHTML = 'Tab to complete &nbsp;\u2502&nbsp; "remove name" to untrack';
    quickAddEl.appendChild(help);

    document.body.appendChild(quickAddEl);

    // Focus immediately
    setTimeout(function() { input.focus(); }, 10);

    // Attach autocomplete
    quickAddAC = PAC.UI.Components.Autocomplete.attach(input, {
      maxResults: 8,
      onSelect: function(selected) {
        _quickAddToTracker(selected);
        _destroyQuickAdd();
      },
      onClear: function() {}
    });

    // Ghost text + visual feedback on input
    input.addEventListener('input', function() {
      var val = input.value.trim();

      if (/^remove\s/i.test(val) || /^remove$/i.test(val)) {
        input.style.borderColor = 'rgba(255,71,87,0.5)';
        input.style.color = '#FF4757';
        currentGhost = '';
        ghost.textContent = '';
        // Hide autocomplete dropdown in remove mode
        var dd = document.querySelector('.pac-autocomplete-dropdown');
        if (dd) dd.style.display = 'none';
      } else {
        input.style.borderColor = 'rgba(255,255,255,0.1)';
        input.style.color = '#fff';

        // Fuzzy ghost text
        if (val.length >= 2) {
          var match = PAC.Utils.fuzzyMatch(val);
          if (match) {
            currentGhost = match.name;
            ghost.textContent = match.name.toLowerCase();
          } else {
            currentGhost = '';
            ghost.textContent = '';
          }
        } else {
          currentGhost = '';
          ghost.textContent = '';
        }
      }
    });

    // Keyboard: Tab to accept ghost, Escape to close, Enter for remove
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (currentGhost) {
          input.value = currentGhost.toLowerCase();
          currentGhost = '';
          ghost.textContent = '';
          // Trigger input event so autocomplete updates
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        _destroyQuickAdd();
      }
      if (e.key === 'Enter') {
        var val = input.value.trim();
        var removeMatch = val.match(/^remove\s+(.+)/i);
        if (removeMatch) {
          e.preventDefault();
          e.stopPropagation();
          _quickRemoveFromTracker(removeMatch[1].trim());
          _destroyQuickAdd();
        }
      }
    });

    // Close on click outside (delayed so the opening click doesn't immediately close)
    setTimeout(function() {
      document.addEventListener('mousedown', _quickAddOutsideClick);
    }, 50);
  }

  function _quickAddOutsideClick(e) {
    if (quickAddEl && !quickAddEl.contains(e.target) && !e.target.closest('.pac-autocomplete-dropdown')) {
      _destroyQuickAdd();
    }
  }

  function _destroyQuickAdd() {
    document.removeEventListener('mousedown', _quickAddOutsideClick);
    if (quickAddAC) { quickAddAC.destroy(); quickAddAC = null; }
    if (quickAddEl) { quickAddEl.remove(); quickAddEl = null; }
  }

  function _quickAddToTracker(selected) {
    var Data = PAC.Data;
    var normalizedName = selected.name.toUpperCase();
    var alreadyTracked = state.teamTargets.some(function(t) { return t.pokemon === normalizedName; });

    if (!alreadyTracked) {
      var pokemonData = Data.POKEMON_DATA[normalizedName];
      if (pokemonData) {
        var baseForm = Utils.getBaseForm(normalizedName);
        var evolutionChain = Data.EVOLUTION_CHAINS[baseForm];
        var evo = 'twoStar';
        if (evolutionChain && evolutionChain[0] && evolutionChain[0].maxStars === 3) {
          evo = 'threeStar';
        }

        state.teamTargets.push({
          id: Date.now() + Math.random(),
          pokemon: normalizedName,
          displayName: selected.name,
          rarity: pokemonData.rarity,
          evo: evo,
          isWild: Utils.isWildPokemon ? Utils.isWildPokemon(normalizedName) : false,
          enabled: true,
          copiesTaken: 0
        });
        PAC.State.saveTeamTargets();
        Events.emit('state:teamChanged', { targets: state.teamTargets });
      }
    }
  }

  function _quickRemoveFromTracker(name) {
    var normalized = name.toUpperCase();
    var idx = -1;

    // 1. Exact match against tracked targets
    for (var i = 0; i < state.teamTargets.length; i++) {
      if (state.teamTargets[i].pokemon === normalized) {
        idx = i;
        break;
      }
    }

    // 2. Fuzzy match against tracked targets
    if (idx === -1) {
      var bestScore = 0;
      for (var j = 0; j < state.teamTargets.length; j++) {
        var score = PAC.Utils.fuzzyScore(normalized, state.teamTargets[j].pokemon);
        if (score > bestScore) { bestScore = score; idx = j; }
      }
      if (bestScore < 500) idx = -1; // Threshold to avoid garbage matches
    }

    if (idx !== -1) {
      var removed = state.teamTargets[idx];
      state.teamTargets.splice(idx, 1);
      PAC.State.saveTeamTargets();
      Events.emit('state:teamChanged', { targets: state.teamTargets });
      if (PAC.UI.Components.Notification) {
        PAC.UI.Components.Notification.show('Removed ' + (removed.displayName || name), 'info');
      }
    } else {
      if (PAC.UI.Components.Notification) {
        PAC.UI.Components.Notification.show(name + ' not tracked', 'warn');
      }
    }
  }

  // Alt+Right-click quick add — plain right-click stays with the game
  document.addEventListener('mousedown', function(e) {
    if (e.button !== 2 || !e.altKey) return;
    if (e.target.closest('#pac-root') || e.target.closest('#pac-quick-add')) return;

    e.preventDefault();
    e.stopPropagation();
    _createQuickAdd(e.clientX, e.clientY);
  }, true);

  // Block context menu when Alt is held so it doesn't pop over the quick-add
  document.addEventListener('contextmenu', function(e) {
    if (e.altKey) e.preventDefault();
  }, true);

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Game interaction handler loaded');
})();
