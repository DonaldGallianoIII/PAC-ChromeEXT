/**
 * PAC v4 — Hunt Engine v5
 *
 * Reads shop from extraction data (Colyseus state), clicks DOM slots.
 * Cooldown-based 11ms loop. Scans every tick for instant buys.
 *
 * Data source: PAC.State.lastPoolData.playerShops[playerName]
 * Buy mechanism: DOM click on shopSlots[index]
 *
 * Commands:
 *   <pokemon> <qty> <budget>
 *   team <budget>
 *
 * Hotkeys:
 *   Alt+X     — Open hunt input / abort
 *   Escape    — Abort / close input
 */
(function() {
  'use strict';

  var state = PAC.State.state;
  var Events = PAC.UI.Events;
  var Data = PAC.Data;
  var Utils = PAC.Utils;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  var RARITY_COST = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    ultra: 5
  };

  var SELECTORS = {
    shopContainer: 'ul.game-pokemons-store',
    shopSlot: 'div.my-box.clickable.game-pokemon-portrait',
    refreshButton: 'button.bubbly.blue.refresh-button',
    goldDisplay: '.toast-player-income span'
  };

  // ── Speed Profiles ──────────────────────────────────────────────────────
  var PROFILE = {
    standard: { tick: 1200, cooldownRoll: 2,  cooldownBuy: 1  },   // ~1.2s human pace
    turbo:    { tick: 11,   cooldownRoll: 20, cooldownBuy: 5  }    // 11ms machine pace
  };

  // Session-only turbo state (never persisted — resets on reload)
  var turboUnlocked = false;

  function _getProfile() {
    return turboUnlocked ? PROFILE.turbo : PROFILE.standard;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUNT STATE
  // ═══════════════════════════════════════════════════════════════════════════

  var hunt = {
    active: false,
    intervalId: null,

    // Config
    targets: [],
    qty: 1,
    budget: 10,
    isTeamHunt: false,

    // Runtime
    spent: 0,
    bought: 0,
    rollCount: 0,
    reservedGold: 1,
    cooldown: 0,
    firstTick: true,
    lastShopStr: ''   // Track shop changes for logging
  };

  var huntInputEl = null;
  var statusEl = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Engine.Hunt = {
    isActive: function() { return hunt.active; },
    isTurbo: function() { return turboUnlocked; },
    getState: function() { return { active: hunt.active, turbo: turboUnlocked, spent: hunt.spent, bought: hunt.bought, rollCount: hunt.rollCount, budget: hunt.budget }; },
    abort: _abort,
    start: function(config) {
      // Gate behind CMD toggle
      if (!PAC.UI.CMD || !PAC.UI.CMD.isHuntEnabled()) {
        PAC.UI.Components.Notification.show('Hunt Mode disabled — enable in CMD', 'warning', 2000);
        return;
      }
      if (config.isTeamHunt) _startTeamHunt(config.budget);
      else _startSingleHunt(config.target, config.qty, config.budget);
    },
    toggleInput: function() {
      if (!PAC.UI.CMD || !PAC.UI.CMD.isHuntEnabled()) {
        PAC.UI.Components.Notification.show('Hunt Mode disabled — enable in CMD', 'warning', 2000);
        return;
      }
      if (hunt.active) { _abort(); return; }
      _createHuntInput(window.innerWidth / 2 - 140, window.innerHeight / 2 - 40);
    },
    toggleTurbo: function() {
      if (!PAC.UI.CMD || !PAC.UI.CMD.isHuntEnabled()) return;
      turboUnlocked = !turboUnlocked;
      if (hunt.active) _startInterval();
      Events.emit('hunt:turboChanged', { turbo: turboUnlocked });
      var msg = turboUnlocked ? '⚡ TURBO UNLOCKED' : '🐢 Standard mode';
      var type = turboUnlocked ? 'warning' : 'info';
      PAC.UI.Components.Notification.show(msg, type, 1500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOP READING — FROM EXTRACTION DATA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns array of uppercase pokemon names from extraction data.
   * Filters out DEFAULT/empty. Indices match DOM shopSlot elements.
   */
  function _getShopFromExtraction() {
    var poolData = PAC.State.lastPoolData;
    if (!poolData || !poolData.playerShops || !state.playerName) return null;

    var raw = poolData.playerShops[state.playerName];
    if (!raw || !raw.length) return null;

    var filtered = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      var name = '';
      if (typeof item === 'string') {
        name = item.trim().toUpperCase();
      } else if (item && item.name) {
        name = item.name.trim().toUpperCase();
      }
      if (name && name !== 'DEFAULT') {
        filtered.push(name);
      }
    }
    return filtered.length > 0 ? filtered : null;
  }

  /**
   * Get DOM shop slots for clicking.
   */
  function _getDOMSlots() {
    var container = document.querySelector(SELECTORS.shopContainer);
    if (!container) return null;
    var slots = container.querySelectorAll(SELECTORS.shopSlot);
    return slots.length > 0 ? slots : null;
  }

  function _findTarget(shopNames) {
    for (var s = 0; s < shopNames.length; s++) {
      var name = shopNames[s];

      // Ditto is always a buy — wildcard for any target
      if (name === 'DITTO') {
        return { slotIndex: s, name: 'DITTO', cost: 5 };
      }

      for (var t = 0; t < hunt.targets.length; t++) {
        var target = hunt.targets[t];
        if (target.family.indexOf(name) !== -1) {
          return { slotIndex: s, name: name, cost: target.cost };
        }
      }
    }
    return null;
  }

  function _getCurrentGold() {
    var el = document.querySelector(SELECTORS.goldDisplay);
    if (!el) return null;
    var num = parseInt(el.textContent, 10);
    return isNaN(num) ? null : num;
  }

  function _clickRefresh() {
    var btn = document.querySelector(SELECTORS.refreshButton);
    if (!btn) return false;
    btn.click();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11ms TICK
  // ═══════════════════════════════════════════════════════════════════════════

  function _tick() {
    if (!hunt.active) return;

    // Read shop from extraction data
    var shop = _getShopFromExtraction();
    if (!shop) return;  // No data yet

    // Debug: first tick + shop changes
    var shopStr = shop.join(',');
    if (hunt.firstTick) {
      console.log('[Hunt] First tick shop: ' + shopStr);
      console.log('[Hunt] Targets: ' + hunt.targets.map(function(t) { return t.name + '=[' + t.family.join('/') + ']'; }).join(', '));
      hunt.firstTick = false;
      hunt.lastShopStr = shopStr;
    } else if (shopStr !== hunt.lastShopStr) {
      console.log('[Hunt] Shop changed: ' + shopStr);
      hunt.lastShopStr = shopStr;
    }

    // ── Always scan for targets (even during cooldown) ───────
    var match = _findTarget(shop);

    if (match) {
      // During cooldown, we see the target but DON'T buy yet —
      // extraction data is stale and this could be the same slot we just clicked.
      // Wait for shop data to refresh before acting.
      if (hunt.cooldown > 0) {
        hunt.cooldown--;
        return;
      }

      // Can we afford it?
      if (hunt.spent + match.cost > hunt.budget) {
        _end('budget');
        return;
      }

      // Click the DOM slot
      var slots = _getDOMSlots();
      if (!slots || !slots[match.slotIndex]) {
        console.log('[Hunt] DOM slot ' + match.slotIndex + ' not found, skipping');
        return;
      }

      console.log('[Hunt] BUY: ' + match.name + ' slot ' + match.slotIndex);
      Events.emit('hunt:found', { pokemon: match.name, slot: match.slotIndex });

      slots[match.slotIndex].click();

      hunt.spent += match.cost;
      hunt.bought++;
      hunt.cooldown = _getProfile().cooldownBuy;

      Events.emit('hunt:bought', {
        pokemon: match.name,
        cost: match.cost,
        bought: hunt.bought,
        qty: hunt.qty
      });

      _updateStatus();

      // Done?
      if (!hunt.isTeamHunt && hunt.bought >= hunt.qty) {
        _end('success');
        return;
      }

      return;
    }

    // ── Cooldown active — wait (already scanned above) ───────
    if (hunt.cooldown > 0) {
      hunt.cooldown--;
      return;
    }

    // ── No target, no cooldown — ROLL ────────────────────────
    var rollCost = 1;
    if (hunt.spent + rollCost + hunt.reservedGold > hunt.budget) {
      _end('budget');
      return;
    }

    var gold = _getCurrentGold();
    if (gold !== null && gold < rollCost) {
      _end('broke');
      return;
    }

    if (_clickRefresh()) {
      hunt.spent += rollCost;
      hunt.rollCount++;
      hunt.cooldown = _getProfile().cooldownRoll;

      Events.emit('hunt:roll', {
        spent: hunt.spent,
        budget: hunt.budget,
        rollCount: hunt.rollCount
      });

      _updateStatus();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START / END
  // ═══════════════════════════════════════════════════════════════════════════

  function _startSingleHunt(pokemon, qty, budget) {
    pokemon = pokemon.toUpperCase();

    var pokemonData = Data.POKEMON_DATA[pokemon];
    if (!pokemonData) {
      PAC.UI.Components.Notification.show('Unknown: ' + pokemon, 'error');
      return;
    }

    var rarity = pokemonData.rarity || pokemonData;
    var cost = RARITY_COST[rarity] || 1;
    var baseForm = Utils.getBaseForm(pokemon);
    var family = Utils.getEvolutionFamily(baseForm);

    console.log('[Hunt] === SINGLE HUNT ===');
    console.log('[Hunt] Target: ' + pokemon + ' ×' + qty + ' / ' + budget + 'g');
    console.log('[Hunt] Rarity: ' + rarity + ', Cost: ' + cost);
    console.log('[Hunt] Family:', family);

    _reset();
    hunt.targets = [{ name: pokemon, rarity: rarity, cost: cost, family: family }];
    hunt.qty = qty;
    hunt.budget = budget;
    hunt.reservedGold = cost;
    hunt.isTeamHunt = false;
    hunt.active = true;

    _startInterval();

    Events.emit('hunt:started', { target: pokemon, qty: qty, budget: budget, isTeamHunt: false });
    PAC.UI.Components.Notification.show('🎯 ' + pokemon + ' ×' + qty + ' / ' + budget + 'g', 'info', 1500);
    _showStatus();
  }

  function _startTeamHunt(budget) {
    var teamTargets = (state.teamTargets || []).filter(function(t) { return t.enabled; });

    if (teamTargets.length === 0) {
      PAC.UI.Components.Notification.show('No targets in tracker!', 'error');
      return;
    }

    var targets = [];
    var maxCost = 1;

    teamTargets.forEach(function(t) {
      var rarity = t.rarity || 'common';
      var cost = RARITY_COST[rarity] || 1;
      if (cost > maxCost) maxCost = cost;
      var baseForm = Utils.getBaseForm(t.pokemon);
      targets.push({
        name: t.pokemon,
        rarity: rarity,
        cost: cost,
        family: Utils.getEvolutionFamily(baseForm)
      });
    });

    console.log('[Hunt] === TEAM HUNT ===');
    console.log('[Hunt] Targets: ' + targets.length + ' / ' + budget + 'g');
    targets.forEach(function(t) { console.log('[Hunt]   ' + t.name + ' (' + t.rarity + ' $' + t.cost + ') [' + t.family.join('/') + ']'); });

    _reset();
    hunt.targets = targets;
    hunt.qty = Infinity;
    hunt.budget = budget;
    hunt.reservedGold = maxCost;
    hunt.isTeamHunt = true;
    hunt.active = true;

    _startInterval();

    Events.emit('hunt:started', { target: null, qty: null, budget: budget, isTeamHunt: true });
    PAC.UI.Components.Notification.show('🎯 Team Hunt (' + targets.length + ') / ' + budget + 'g', 'info', 1500);
    _showStatus();
  }

  function _end(reason) {
    _stopInterval();
    hunt.active = false;

    console.log('[Hunt] === END: ' + reason + ' ===');
    console.log('[Hunt] Bought: ' + hunt.bought + ' | Spent: ' + hunt.spent + 'g | Rolls: ' + hunt.rollCount);

    var messages = {
      success: '🎉 Done! ×' + hunt.bought + ' | ' + hunt.spent + 'g | ' + hunt.rollCount + ' rolls',
      budget:  '💰 Budget hit. ×' + hunt.bought + ' | ' + hunt.spent + 'g | ' + hunt.rollCount + ' rolls',
      broke:   '💸 No gold! ×' + hunt.bought + ' | ' + hunt.spent + 'g | ' + hunt.rollCount + ' rolls',
      aborted: '⛔ Aborted. ×' + hunt.bought + ' | ' + hunt.spent + 'g | ' + hunt.rollCount + ' rolls',
      error:   '❌ Error. ×' + hunt.bought + ' | ' + hunt.spent + 'g | ' + hunt.rollCount + ' rolls'
    };

    Events.emit('hunt:complete', { reason: reason, bought: hunt.bought, spent: hunt.spent, rollCount: hunt.rollCount });

    var type = reason === 'success' ? 'success' : reason === 'aborted' ? 'warning' : 'info';
    PAC.UI.Components.Notification.show(messages[reason] || messages.error, type, 3000);
    _hideStatus();
  }

  function _abort() {
    if (hunt.active) _end('aborted');
  }

  function _reset() {
    hunt.spent = 0;
    hunt.bought = 0;
    hunt.rollCount = 0;
    hunt.cooldown = 0;
    hunt.firstTick = true;
    hunt.lastShopStr = '';
  }

  function _startInterval() {
    _stopInterval();
    var profile = _getProfile();
    hunt.intervalId = setInterval(_tick, profile.tick);
    if (PAC.DEBUG_MODE) console.log('[Hunt] Tick rate: ' + profile.tick + 'ms (' + (turboUnlocked ? 'TURBO' : 'standard') + ')');
  }

  function _stopInterval() {
    if (hunt.intervalId) {
      clearInterval(hunt.intervalId);
      hunt.intervalId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUZZY MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  var _pokemonNames = null;  // Lazy cache

  function _getPokemonNames() {
    if (_pokemonNames) return _pokemonNames;
    _pokemonNames = Object.keys(Data.POKEMON_DATA);
    return _pokemonNames;
  }

  /**
   * Score how well `query` matches `name` (higher = better).
   * Handles prefix, substring, and typo tolerance.
   */
  function _fuzzyScore(query, name) {
    return PAC.Utils.fuzzyScore(query, name);
  }

  /**
   * Find best fuzzy match for a query string.
   * Returns { name, score } or null.
   */
  function _fuzzyMatch(query) {
    return PAC.Utils.fuzzyMatch(query);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUNT INPUT UI (Alt+X) — with ghost text + Tab completion
  // ═══════════════════════════════════════════════════════════════════════════

  var _currentGhost = '';  // Current ghost suggestion

  function _createHuntInput(x, y) {
    _destroyHuntInput();

    huntInputEl = document.createElement('div');
    huntInputEl.id = 'pac-hunt-input';
    huntInputEl.style.cssText =
      'position:fixed;z-index:2147483645;' +
      'background:rgba(10,12,18,0.96);' +
      'border:1px solid rgba(48,213,200,0.3);' +
      'border-radius:10px;' +
      'padding:8px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(48,213,200,0.15);' +
      'backdrop-filter:blur(12px);' +
      'width:300px;';

    var left = Math.min(x, window.innerWidth - 320);
    var top = Math.min(y, window.innerHeight - 100);
    huntInputEl.style.left = left + 'px';
    huntInputEl.style.top = top + 'px';

    // Header
    var header = document.createElement('div');
    header.style.cssText =
      'font-size:10px;color:var(--pac-accent,#30D5C8);' +
      'margin-bottom:6px;font-family:monospace;' +
      'text-transform:uppercase;letter-spacing:0.05em;';
    header.textContent = '🎯 Hunt Mode';
    huntInputEl.appendChild(header);

    // Input wrapper (for ghost text overlay)
    var inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'position:relative;';
    huntInputEl.appendChild(inputWrap);

    // Ghost text (behind input)
    var ghost = document.createElement('div');
    ghost.id = 'pac-hunt-ghost';
    ghost.style.cssText =
      'position:absolute;top:0;left:0;right:0;bottom:0;' +
      'padding:8px 10px;' +
      'font-size:13px;font-family:inherit;' +
      'color:rgba(48,213,200,0.35);' +
      'pointer-events:none;' +
      'white-space:nowrap;overflow:hidden;';
    inputWrap.appendChild(ghost);

    // Actual input
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'pokemon qty gold  |  team gold';
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

    // Help text
    var help = document.createElement('div');
    help.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);margin-top:5px;font-family:monospace;';
    help.innerHTML = 'Tab to complete &nbsp;│&nbsp; Enter to hunt';
    huntInputEl.appendChild(help);

    document.body.appendChild(huntInputEl);
    setTimeout(function() { input.focus(); }, 10);

    _currentGhost = '';

    // ── Update ghost text on every keystroke ──────────────────
    input.addEventListener('input', function() {
      var val = input.value;
      var parts = val.split(/\s+/);
      var firstWord = parts[0] || '';

      // Only fuzzy match the first word (pokemon name), and only if no spaces yet
      if (parts.length <= 1 && firstWord.length >= 2 && firstWord.toLowerCase() !== 'team') {
        var match = _fuzzyMatch(firstWord);
        if (match) {
          _currentGhost = match.name;
          // Show ghost: the matched name (with typed portion invisible via spacing)
          ghost.textContent = match.name.toLowerCase();
        } else {
          _currentGhost = '';
          ghost.textContent = '';
        }
      } else {
        _currentGhost = '';
        ghost.textContent = '';
      }
    });

    // ── Keyboard: Tab to accept, Enter to go, Escape to bail ─
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (_currentGhost) {
          var parts = input.value.split(/\s+/);
          parts[0] = _currentGhost.toLowerCase();
          input.value = parts.join(' ');
          _currentGhost = '';
          ghost.textContent = '';
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        var cmd = input.value.trim();
        _destroyHuntInput();
        if (cmd) _parseAndStartHunt(cmd);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        _destroyHuntInput();
      }
    });

    setTimeout(function() {
      document.addEventListener('mousedown', _huntInputOutsideClick);
    }, 50);
  }

  function _huntInputOutsideClick(e) {
    if (huntInputEl && !huntInputEl.contains(e.target)) _destroyHuntInput();
  }

  function _destroyHuntInput() {
    document.removeEventListener('mousedown', _huntInputOutsideClick);
    if (huntInputEl) { huntInputEl.remove(); huntInputEl = null; }
    _currentGhost = '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND PARSING
  // ═══════════════════════════════════════════════════════════════════════════

  function _parseAndStartHunt(cmd) {
    cmd = cmd.toLowerCase().replace(/^\/hunt\s*/i, '').trim();

    var teamMatch = cmd.match(/^team\s+(\d+)g?$/i);
    if (teamMatch) {
      _startTeamHunt(parseInt(teamMatch[1], 10));
      return;
    }

    var parts = cmd.split(/\s+/);
    if (parts.length === 3) {
      var pokemon = parts[0].toUpperCase();
      var qty = parseInt(parts[1], 10);
      var budget = parseInt(parts[2].replace(/g$/i, ''), 10);

      if (!isNaN(qty) && !isNaN(budget) && qty > 0 && budget > 0) {
        // Try exact match first, then fuzzy resolve
        if (!Data.POKEMON_DATA[pokemon]) {
          var fuzzy = _fuzzyMatch(pokemon);
          if (fuzzy) {
            console.log('[Hunt] Fuzzy resolved: ' + pokemon + ' → ' + fuzzy.name + ' (score ' + fuzzy.score + ')');
            pokemon = fuzzy.name;
          }
        }
        _startSingleHunt(pokemon, qty, budget);
        return;
      }
    }

    PAC.UI.Components.Notification.show('Bad syntax: name qty gold', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOTKEYS
  // ═══════════════════════════════════════════════════════════════════════════

  document.addEventListener('keydown', function(e) {
    // ── Escape — close hunt input or abort hunt ──────────────────
    if (e.key === 'Escape') {
      if (huntInputEl) {
        _destroyHuntInput();
        e.preventDefault();
      } else if (hunt.active) {
        _abort();
        e.preventDefault();
      }
    }
  }, true);

  // ── Keybind event listeners (routed from keybind engine) ──────
  Events.on('keybind:toggleHunt', function() {
    PAC.UI.Engine.Hunt.toggleInput();
  });

  Events.on('keybind:toggleTurbo', function() {
    PAC.UI.Engine.Hunt.toggleTurbo();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOP HOTKEYS (1-6) — Buy shop slots via keyboard
  // ═══════════════════════════════════════════════════════════════════════════

  var HOTKEY_MAP = {
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5
  };

  var NUMPAD_MAP = {
    'Numpad1': 0, 'Numpad2': 1, 'Numpad3': 2, 'Numpad4': 3, 'Numpad5': 4, 'Numpad6': 5
  };

  document.addEventListener('keydown', function(e) {
    // Don't fire in input fields
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    // Don't fire with modifiers (those are other hotkeys)
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    // Gate behind CMD toggle
    if (!PAC.UI.CMD || !PAC.UI.CMD.isHotkeysEnabled()) return;

    // Resolve slot index from key or numpad code
    var slotIndex = HOTKEY_MAP[e.key];
    if (slotIndex === undefined) slotIndex = NUMPAD_MAP[e.code];
    if (slotIndex === undefined) return;

    // Find and click the shop slot — use ALL children for stable indexing
    var container = document.querySelector(SELECTORS.shopContainer);
    if (!container) return;

    // Get all slot positions (li or direct children), not just filled ones
    var allSlots = container.children;
    if (!allSlots || !allSlots[slotIndex]) return;

    // Look for a clickable portrait inside this positional slot
    var clickable = allSlots[slotIndex].querySelector(SELECTORS.shopSlot);
    if (!clickable) return; // Empty slot, nothing to buy

    e.preventDefault();
    e.stopPropagation();

    clickable.click();

    if (PAC.DEBUG_MODE) console.log('[Hotkeys] Clicked shop slot ' + (slotIndex + 1));
  }, true);

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS INDICATOR
  // ═══════════════════════════════════════════════════════════════════════════

  function _showStatus() {
    _hideStatus();

    var isTurbo = turboUnlocked;
    var borderColor = isTurbo ? 'rgba(239,68,68,0.6)' : 'rgba(48,213,200,0.4)';
    var glowColor = isTurbo ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.5)';

    statusEl = document.createElement('div');
    statusEl.id = 'pac-hunt-status';
    statusEl.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483645;' +
      'background:rgba(10,12,18,0.95);' +
      'border:1px solid ' + borderColor + ';' +
      'border-radius:8px;' +
      'padding:6px 14px;' +
      'font-family:monospace;font-size:12px;color:#fff;' +
      'box-shadow:0 4px 16px ' + glowColor + ';' +
      'display:flex;align-items:center;gap:8px;' +
      'pointer-events:auto;';

    var modeLabel = isTurbo
      ? '<span style="color:#ef4444;font-size:10px;font-weight:700;">⚡TURBO</span>'
      : '';

    statusEl.innerHTML =
      '<span style="color:' + (isTurbo ? '#ef4444' : 'var(--pac-accent,#30D5C8)') + ';">🎯</span>' +
      modeLabel +
      '<span id="pac-hunt-status-text">0/' + hunt.budget + 'g</span>' +
      '<button id="pac-hunt-abort" style="' +
        'background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);' +
        'border-radius:4px;color:#ef4444;cursor:pointer;' +
        'padding:1px 6px;font-size:10px;font-family:monospace;"' +
      '>ESC</button>';

    document.body.appendChild(statusEl);

    var abortBtn = document.querySelector('#pac-hunt-abort');
    if (abortBtn) abortBtn.addEventListener('click', _abort);
  }

  function _updateStatus() {
    var el = document.querySelector('#pac-hunt-status-text');
    if (!el) return;
    el.textContent = hunt.spent + '/' + hunt.budget + 'g | ×' + hunt.bought + ' | ' + hunt.rollCount + 'r';
  }

  function _hideStatus() {
    if (statusEl) { statusEl.remove(); statusEl = null; }
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Hunt loaded');

  // Abort active hunt if toggled off via CMD
  Events.on('cmd:huntToggled', function(data) {
    if (!data.enabled && hunt.active) {
      _abort();
      PAC.UI.Components.Notification.show('Hunt Mode disabled', 'warning', 1500);
    }
  });
})();
