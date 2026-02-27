/**
 * PAC CLI — Command Line Interface
 *
 * Content script overlay for typed game commands.
 * Execution routed entirely through PAC.API async bridge (Phase 1).
 * Triggered via keybind:openCLI event (Phase 2).
 *
 * Command tiers:
 *   Tier 1 — Indexed (buy, reroll, level, lock, pass, pick, remove)
 *   Tier 2 — Named (sell, move, equip, combine) — need observation for name resolution
 *   Tier 3 — Info (gold, board, shop, items, team, phase, help) — read-only
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var API = PAC.API;

  var _overlayEl = null;
  var _inputEl = null;
  var _ghostEl = null;
  var _statusEl = null;
  var _cachedObs = null;
  var _currentGhost = '';
  var _isOpen = false;
  var _cursorX = -1;
  var _cursorY = -1;

  // Track cursor so CLI opens at pointer
  window.addEventListener('mousemove', function(e) {
    _cursorX = e.clientX;
    _cursorY = e.clientY;
  }, { passive: true });


  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fuzzy match a query against a list of candidate strings.
   * Returns { name, score } or null.
   */
  function _fuzzyBest(query, candidates) {
    if (!query || query.length < 1 || !candidates || candidates.length === 0) return null;
    var best = null, bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var score = PAC.Utils.fuzzyScore(query, candidates[i]);
      if (score > bestScore) { bestScore = score; best = candidates[i]; }
    }
    return bestScore > 0 ? { name: best, score: bestScore } : null;
  }

  /**
   * Get all fuzzy matches above threshold, sorted by score descending.
   */
  function _fuzzyAll(query, candidates) {
    if (!query || !candidates) return [];
    var results = [];
    for (var i = 0; i < candidates.length; i++) {
      var score = PAC.Utils.fuzzyScore(query, candidates[i]);
      if (score > 0) results.push({ name: candidates[i], score: score });
    }
    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  /**
   * Normalize name for comparison: lowercase, replace underscores with spaces, trim.
   */
  function _normName(s) {
    return (s || '').toLowerCase().replace(/_/g, ' ').trim();
  }

  /**
   * Extract display name from a shop/proposition entry (string or object).
   */
  function _entryName(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && entry.name) return entry.name;
    return '';
  }

  /**
   * Get board unit names from cached observation.
   */
  function _boardNames() {
    if (!_cachedObs || !_cachedObs.self || !_cachedObs.self.board) return [];
    return _cachedObs.self.board.map(function(u) { return u.name; });
  }

  /**
   * Get held item names from cached observation.
   */
  function _itemNames() {
    if (!_cachedObs || !_cachedObs.self || !_cachedObs.self.items) return [];
    return _cachedObs.self.items.map(function(i) { return _entryName(i); }).filter(Boolean);
  }

  /**
   * Find a board unit by fuzzy name match, optionally at a specific position.
   * Returns { unit, message } — unit is the matched unit object or null.
   */
  function _resolveUnit(name, posStr) {
    if (!_cachedObs || !_cachedObs.self || !_cachedObs.self.board) {
      return { unit: null, message: 'No board data available.' };
    }
    var board = _cachedObs.self.board;

    // If position specified, find unit at that position
    if (posStr) {
      var coords = _parseCoords(posStr);
      if (!coords) return { unit: null, message: 'Invalid position format. Use x,y (e.g. 3,1).' };
      for (var i = 0; i < board.length; i++) {
        if (board[i].positionX === coords.x && board[i].positionY === coords.y) {
          return { unit: board[i], message: null };
        }
      }
      return { unit: null, message: 'No unit at position (' + coords.x + ',' + coords.y + ').' };
    }

    // Fuzzy match against board unit names
    var candidates = board.map(function(u) { return u.name; });
    var match = _fuzzyBest(name, candidates);
    if (!match) {
      return { unit: null, message: 'No unit named "' + name + '" on board.' };
    }

    // Check for ambiguity (multiple units with same name)
    var matching = board.filter(function(u) { return u.name === match.name; });
    if (matching.length > 1) {
      var positions = matching.map(function(u) {
        return match.name + ' (' + u.positionX + ',' + u.positionY + ')';
      });
      return { unit: matching[0], message: 'Multiple matches: ' + positions.join(', ') + '. Using first.' };
    }

    return { unit: matching[0], message: null };
  }

  /**
   * Find a held item by fuzzy name match.
   * Returns { item, message } — item is the matched string or null.
   */
  function _resolveItem(name) {
    var items = _itemNames();
    if (items.length === 0) return { item: null, message: 'No items held.' };

    // Exact match first (normalized)
    var normQuery = _normName(name);
    for (var i = 0; i < items.length; i++) {
      if (_normName(items[i]) === normQuery) return { item: items[i], message: null };
    }

    // Fuzzy match
    var match = _fuzzyBest(name, items);
    if (!match) return { item: null, message: 'No item matching "' + name + '".' };
    return { item: match.name, message: null };
  }

  /**
   * Parse "x,y" coordinate string.
   */
  function _parseCoords(s) {
    var m = (s || '').match(/^(\d+)\s*,\s*(\d+)$/);
    if (!m) return null;
    var x = parseInt(m[1], 10), y = parseInt(m[2], 10);
    if (x < 0 || x > 7 || y < 0 || y > 3) return null;
    return { x: x, y: y };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  var COMMANDS = {
    // Tier 1 — Indexed
    'buy':     { tier: 1, aliases: ['b'],                 handler: _execBuy,     usage: 'buy <1-6>' },
    'reroll':  { tier: 1, aliases: ['refresh', 'r', 'd'], handler: _execSimple,  index: 6 },
    'level':   { tier: 1, aliases: ['levelup', 'l', 'f'], handler: _execSimple,  index: 7 },
    'lock':    { tier: 1, aliases: [],                     handler: _execSimple,  index: 8 },
    'pass':    { tier: 1, aliases: ['end', 'wait'],        handler: _execSimple,  index: 9 },
    'pick':    { tier: 1, aliases: ['p'],                  handler: _execPick,    usage: 'pick <1-6>' },
    'remove':  { tier: 1, aliases: ['rm'],                 handler: _execRemove,  usage: 'remove <1-6>' },

    // Tier 2 — Named
    'sell':    { tier: 2, aliases: [],  handler: _execSell,    usage: 'sell <name> [x,y]' },
    'move':    { tier: 2, aliases: [],  handler: _execMove,    usage: 'move <name> <x,y>' },
    'equip':   { tier: 2, aliases: [],  handler: _execEquip,   usage: 'equip <item> <x,y>' },
    'combine': { tier: 2, aliases: [],  handler: _execCombine, usage: 'combine <item1> <item2>' },
    'clear':   { tier: 2, aliases: ['clearall', 'ca'], handler: _execClear, usage: 'clear' },

    // Tier 3 — Info
    'gold':    { tier: 3, aliases: [],            handler: _infoGold },
    'board':   { tier: 3, aliases: [],            handler: _infoBoard },
    'shop':    { tier: 3, aliases: [],            handler: _infoShop },
    'items':   { tier: 3, aliases: [],            handler: _infoItems },
    'team':    { tier: 3, aliases: ['synergies'], handler: _infoTeam },
    'phase':   { tier: 3, aliases: [],            handler: _infoPhase },
    'help':    { tier: 3, aliases: ['?', 'h'],    handler: _infoHelp },
    'speed':   { tier: 3, aliases: ['anim', 'animation'], handler: _execSpeed, usage: 'speed [off|fast|normal|slow|<ms>]' },

    // Workspace
    'panel':     { tier: 2, aliases: ['pn'], handler: _execPanel, usage: 'panel <id> [x,y] [WxH] | panel close/closeall/list/reset' },
    'ui':        { tier: 1, aliases: [], handler: _execUI, usage: 'ui <on|off|toggle>' },
    'workspace': { tier: 2, aliases: ['ws', 'layout'], handler: _execWorkspace, usage: 'workspace save|load|list|delete|export|import <name>' }
  };

  // Reverse alias map: alias → canonical verb
  var ALIAS_MAP = {};
  var ALL_VERBS = [];  // For autocomplete

  (function _buildAliasMap() {
    var keys = Object.keys(COMMANDS);
    for (var i = 0; i < keys.length; i++) {
      var verb = keys[i];
      ALIAS_MAP[verb] = verb;
      ALL_VERBS.push(verb);
      var aliases = COMMANDS[verb].aliases;
      for (var j = 0; j < aliases.length; j++) {
        ALIAS_MAP[aliases[j]] = verb;
        ALL_VERBS.push(aliases[j]);
      }
    }
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1 HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _execSimple(args, obs, entry) {
    return _maskAndExec(entry.index);
  }

  function _execBuy(args, obs, entry) {
    if (args.length < 1) return Promise.resolve({ success: false, message: 'Usage: buy <1-6>' });
    var slot = parseInt(args[0], 10);
    if (isNaN(slot) || slot < 1 || slot > 6) return Promise.resolve({ success: false, message: 'Slot must be 1-6.' });
    return _maskAndExec(slot - 1); // 1-indexed → 0-indexed
  }

  function _execPick(args, obs, entry) {
    if (args.length < 1) return Promise.resolve({ success: false, message: 'Usage: pick <1-6>' });
    var idx = parseInt(args[0], 10);
    if (isNaN(idx) || idx < 1 || idx > 6) return Promise.resolve({ success: false, message: 'Pick must be 1-6.' });
    return _maskAndExec(79 + idx); // pick 1 = index 80
  }

  function _execRemove(args, obs, entry) {
    if (args.length < 1) return Promise.resolve({ success: false, message: 'Usage: remove <1-6>' });
    var idx = parseInt(args[0], 10);
    if (isNaN(idx) || idx < 1 || idx > 6) return Promise.resolve({ success: false, message: 'Slot must be 1-6.' });
    return _maskAndExec(73 + idx); // remove 1 = index 74
  }

  /**
   * Check mask then execute an indexed action.
   */
  function _maskAndExec(index) {
    return API.mask().then(function(mask) {
      if (!mask) return { success: false, message: 'Not in a game.' };
      if (mask[index] !== 1) {
        return API.phase().then(function(phase) {
          var reason = 'Action not available.';
          if (phase === 'combat' || phase === 'game_over' || phase === 'carousel' || phase === 'portal_select') {
            reason = 'Not available in ' + phase + ' phase.';
          } else if (index >= 0 && index <= 5) {
            reason = 'Can\'t afford this.';
          }
          return { success: false, message: reason };
        });
      }
      return API.exec(index).then(function(ok) {
        return { success: ok, message: ok ? 'OK' : 'Failed to send.' };
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2 HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _execSell(args, obs, entry) {
    if (args.length < 1) return Promise.resolve({ success: false, message: 'Usage: sell <name> [x,y]' });

    // Check if last arg is coordinates
    var posStr = null;
    var nameArgs = args.slice();
    if (args.length >= 2 && _parseCoords(args[args.length - 1])) {
      posStr = nameArgs.pop();
    }
    var name = nameArgs.join(' ');

    var resolved = _resolveUnit(name, posStr);
    if (!resolved.unit) return Promise.resolve({ success: false, message: resolved.message });

    return API.command('sell_unit', { unit_id: resolved.unit.id }).then(function(ok) {
      var msg = ok ? 'Sold ' + resolved.unit.name : 'Failed to sell.';
      if (resolved.message) msg += ' (' + resolved.message + ')';
      return { success: ok, message: msg };
    });
  }

  function _execMove(args, obs, entry) {
    if (args.length < 2) return Promise.resolve({ success: false, message: 'Usage: move <name> <x,y>' });

    var posStr = args[args.length - 1];
    var coords = _parseCoords(posStr);
    if (!coords) return Promise.resolve({ success: false, message: 'Invalid position. Use x,y (e.g. 3,1).' });

    var nameArgs = args.slice(0, -1);
    var name = nameArgs.join(' ');
    var resolved = _resolveUnit(name);
    if (!resolved.unit) return Promise.resolve({ success: false, message: resolved.message });

    return API.command('reposition', {
      unit_id: resolved.unit.id,
      x: coords.x,
      y: coords.y
    }).then(function(ok) {
      var msg = ok ? 'Moved ' + resolved.unit.name + ' → (' + coords.x + ',' + coords.y + ')' : 'Failed to move.';
      return { success: ok, message: msg };
    });
  }

  function _execEquip(args, obs, entry) {
    if (args.length < 2) return Promise.resolve({ success: false, message: 'Usage: equip <item> <x,y>' });

    var posStr = args[args.length - 1];
    var coords = _parseCoords(posStr);
    if (!coords) return Promise.resolve({ success: false, message: 'Invalid position. Use x,y (e.g. 2,2).' });

    var itemName = args.slice(0, -1).join(' ');
    var resolved = _resolveItem(itemName);
    if (!resolved.item) return Promise.resolve({ success: false, message: resolved.message });

    return API.command('equip_item', {
      item: resolved.item,
      x: coords.x,
      y: coords.y
    }).then(function(ok) {
      var msg = ok ? 'Equipped ' + resolved.item + ' at (' + coords.x + ',' + coords.y + ')' : 'Failed to equip.';
      return { success: ok, message: msg };
    });
  }

  function _execCombine(args, obs, entry) {
    if (args.length < 2) return Promise.resolve({ success: false, message: 'Usage: combine <item1> <item2>' });

    // Try splitting at each position to find two valid items
    var items = _itemNames();
    var bestSplit = null;

    for (var split = 1; split < args.length; split++) {
      var nameA = args.slice(0, split).join(' ');
      var nameB = args.slice(split).join(' ');
      var resA = _resolveItem(nameA);
      var resB = _resolveItem(nameB);
      if (resA.item && resB.item) {
        bestSplit = { a: resA.item, b: resB.item };
        break;
      }
    }

    if (!bestSplit) return Promise.resolve({ success: false, message: 'Could not resolve two items. Check names.' });

    return API.command('combine_items', {
      itemA: bestSplit.a,
      itemB: bestSplit.b
    }).then(function(ok) {
      var msg = ok ? 'Combined ' + bestSplit.a + ' + ' + bestSplit.b : 'Failed to combine.';
      return { success: ok, message: msg };
    });
  }

  function _execClear(args, obs, entry) {
    var count = PAC.State.state.teamTargets.length;
    if (count === 0) return Promise.resolve({ success: true, message: 'Tracker already empty.' });
    // Use exposed clearAll if available, otherwise do it directly
    if (PAC.UI.Sections.team && PAC.UI.Sections.team.clearAll) {
      PAC.UI.Sections.team.clearAll();
    } else {
      PAC.State.state.teamTargets = [];
      localStorage.setItem('pac_teamTargets', '[]');
      PAC.UI.Events.emit('state:teamChanged', { targets: [] });
    }
    return Promise.resolve({ success: true, message: 'Tracker cleared (' + count + ' target' + (count > 1 ? 's' : '') + ' removed).' });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3 HANDLERS (Info — read-only)
  // ═══════════════════════════════════════════════════════════════════════════

  function _infoGold(args, obs) {
    if (!obs || !obs.self) return Promise.resolve({ success: true, message: 'No data.' });
    return Promise.resolve({ success: true, message: '💰 Gold: ' + obs.self.gold + '  (Interest: ' + obs.self.interest + ')' });
  }

  function _infoBoard(args, obs) {
    if (!obs || !obs.self || !obs.self.board || obs.self.board.length === 0) {
      return Promise.resolve({ success: true, message: 'Board is empty.' });
    }
    var lines = obs.self.board.map(function(u) {
      var items = u.items && u.items.length > 0 ? ' [' + u.items.join(', ') + ']' : '';
      return u.name + ' ⭐' + u.stars + ' (' + u.positionX + ',' + u.positionY + ')' + items;
    });
    return Promise.resolve({ success: true, message: '📋 Board (' + lines.length + '):\n' + lines.join('\n') });
  }

  function _infoShop(args, obs) {
    if (!obs || !obs.self || !obs.self.shop) return Promise.resolve({ success: true, message: 'No shop data.' });
    var costs = obs.self.shop_costs || [];
    var lines = [];
    for (var i = 0; i < obs.self.shop.length; i++) {
      var name = _entryName(obs.self.shop[i]);
      if (!name || name === 'DEFAULT') { lines.push((i + 1) + ': (empty)'); continue; }
      var cost = costs[i] || '?';
      lines.push((i + 1) + ': ' + name + ' (' + cost + 'g)');
    }
    var locked = obs.self.shopLocked ? ' 🔒' : '';
    return Promise.resolve({ success: true, message: '🛒 Shop' + locked + ':\n' + lines.join('\n') });
  }

  function _infoItems(args, obs) {
    if (!obs || !obs.self || !obs.self.items || obs.self.items.length === 0) {
      return Promise.resolve({ success: true, message: 'No items held.' });
    }
    var names = obs.self.items.map(function(i) { return _entryName(i); }).filter(Boolean);
    return Promise.resolve({ success: true, message: '🎒 Items (' + names.length + '): ' + names.join(', ') });
  }

  function _infoTeam(args, obs) {
    if (!obs || !obs.self || !obs.self.synergies) return Promise.resolve({ success: true, message: 'No synergy data.' });
    var syns = obs.self.synergies;
    var keys = Object.keys(syns).filter(function(k) { return syns[k] > 0; });
    if (keys.length === 0) return Promise.resolve({ success: true, message: 'No active synergies.' });
    keys.sort(function(a, b) { return syns[b] - syns[a]; });
    var lines = keys.map(function(k) { return k + ': ' + syns[k]; });
    return Promise.resolve({ success: true, message: '⚔️ Synergies:\n' + lines.join('\n') });
  }

  function _infoPhase(args, obs) {
    if (!obs) return Promise.resolve({ success: true, message: 'No data.' });
    var g = obs.game || {};
    return Promise.resolve({
      success: true,
      message: '🎮 Phase: ' + obs.phase + '  |  Stage: ' + (g.stageLevel || '?') + '  |  Alive: ' + (g.playersAlive || '?')
    });
  }

  function _infoHelp() {
    var lines = [
      'buy <1-6>          Buy shop slot',
      'reroll (r/d)       Reroll shop',
      'level (l/f)        Buy XP',
      'lock               Toggle shop lock',
      'pass               End turn',
      'pick <1-6>         Pick proposition',
      'remove <1-6>       Remove from shop',
      'sell <name> [x,y]  Sell a unit',
      'move <name> <x,y>  Move a unit',
      'equip <item> <x,y> Equip item on unit',
      'combine <a> <b>    Combine two items',
      'clear (ca)         Clear all tracker targets',
      'speed [off|fast|normal|slow|<ms>]',
      'panel <id> [x,y] [WxH]  Open floating panel',
      'panel close/closeall/list/reset',
      'ui on|off|toggle    Phone hub visibility',
      'workspace save|load|list|delete|export|import',
      'gold/board/shop/items/team/phase — info'
    ];
    return Promise.resolve({ success: true, message: lines.join('\n') });
  }

  function _execSpeed(args, obs, entry) {
    var PRESETS = {
      'off': '0', 'instant': '0', 'none': '0',
      'fast': '150',
      'normal': '300', 'default': '300',
      'slow': '600'
    };

    if (args.length === 0) {
      var current = localStorage.getItem('pac_animSpeed') || '300';
      return Promise.resolve({ success: true, message: 'Animation speed: ' + current + 'ms' });
    }

    var input = args[0].toLowerCase();
    var ms = PRESETS[input] || null;

    if (!ms) {
      var parsed = parseInt(input);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 5000) {
        ms = String(parsed);
      }
    }

    if (!ms) {
      return Promise.resolve({ success: false, message: 'Usage: speed [off|fast|normal|slow|<ms>]. Range: 0-5000.' });
    }

    localStorage.setItem('pac_animSpeed', ms);

    // Live update CSS variable on #pac-root
    var root = document.getElementById('pac-root');
    if (root) {
      root.style.setProperty('--pac-dur', ms + 'ms');
      root.style.setProperty('--pac-transition', ms + 'ms ease-out');
    }

    var label = '';
    Object.keys(PRESETS).forEach(function(k) {
      if (PRESETS[k] === ms && !label) label = ' (' + k + ')';
    });

    return Promise.resolve({ success: true, message: 'Animation speed: ' + ms + 'ms' + label });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE COMMAND HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  var _WS_SECTIONS = ['search', 'team', 'intel', 'analytics', 'chat', 'fishing', 'settings', 'keybinds', 'guide'];

  function _execPanel(args, obs, entry) {
    var ws = PAC.UI.Engine.Workspace;
    if (!ws) return Promise.resolve({ success: false, message: 'Workspace not loaded.' });

    if (args.length === 0) return Promise.resolve({ success: false, message: 'Usage: ' + entry.usage });

    var sub = args[0].toLowerCase();

    if (sub === 'close') {
      if (!args[1]) return Promise.resolve({ success: false, message: 'Usage: panel close <id|all>' });
      if (args[1] === 'all' || args[1] === 'closeall') {
        ws.closeAll();
        return Promise.resolve({ success: true, message: 'All panels closed.' });
      }
      var ok = ws.close(args[1]);
      return Promise.resolve(ok
        ? { success: true, message: args[1] + ' closed.' }
        : { success: false, message: 'No panel: ' + args[1] });
    }

    if (sub === 'closeall') {
      ws.closeAll();
      return Promise.resolve({ success: true, message: 'All panels closed.' });
    }

    if (sub === 'list') {
      var panels = ws.list();
      if (panels.length === 0) {
        return Promise.resolve({ success: true, message: 'No floating panels open.\nAvailable: ' + _WS_SECTIONS.join(', ') });
      }
      var lines = panels.map(function(p) {
        return p.id + ' — ' + p.x + ',' + p.y + ' ' + p.w + '×' + p.h + (p.minimized ? ' [min]' : '');
      });
      return Promise.resolve({ success: true, message: lines.join('\n') });
    }

    if (sub === 'reset') {
      ws.closeAll();
      ws.resetLayout();
      ws.setPhoneVisible(true);
      return Promise.resolve({ success: true, message: 'Workspace reset. Phone hub restored.' });
    }

    // Default: create panel
    var sectionId = sub;
    var x, y, w, h;

    if (args[1]) {
      var posMatch = args[1].match(/^(\d+),(\d+)$/);
      if (posMatch) { x = parseInt(posMatch[1]); y = parseInt(posMatch[2]); }
    }
    if (args[2]) {
      var sizeMatch = args[2].match(/^(\d+)x(\d+)$/i);
      if (sizeMatch) { w = parseInt(sizeMatch[1]); h = parseInt(sizeMatch[2]); }
    }

    var panel = ws.create(sectionId, x, y, w, h);
    if (!panel) return Promise.resolve({ success: false, message: 'Unknown section: ' + sectionId + '. Available: ' + _WS_SECTIONS.join(', ') });
    return Promise.resolve({ success: true, message: sectionId + ' opened at ' + panel.x + ',' + panel.y });
  }

  function _execUI(args, obs, entry) {
    var ws = PAC.UI.Engine.Workspace;
    if (!ws) return Promise.resolve({ success: false, message: 'Workspace not loaded.' });

    var sub = (args[0] || 'toggle').toLowerCase();

    if (sub === 'off' || sub === 'hide') {
      ws.setPhoneVisible(false);
      return Promise.resolve({ success: true, message: 'Phone hub hidden.' });
    }
    if (sub === 'on' || sub === 'show') {
      ws.setPhoneVisible(true);
      return Promise.resolve({ success: true, message: 'Phone hub visible.' });
    }
    if (sub === 'toggle') {
      var vis = !ws.isPhoneVisible();
      ws.setPhoneVisible(vis);
      return Promise.resolve({ success: true, message: 'Phone hub ' + (vis ? 'visible' : 'hidden') + '.' });
    }
    return Promise.resolve({ success: false, message: 'Usage: ui on|off|toggle' });
  }

  function _execWorkspace(args, obs, entry) {
    var ws = PAC.UI.Engine.Workspace;
    if (!ws) return Promise.resolve({ success: false, message: 'Workspace not loaded.' });

    var sub = (args[0] || '').toLowerCase();
    var name = args[1] || '';

    if (sub === 'save') {
      if (!name) return Promise.resolve({ success: false, message: 'Usage: workspace save <name>' });
      ws.savePreset(name);
      return Promise.resolve({ success: true, message: 'Preset "' + name + '" saved.' });
    }
    if (sub === 'load') {
      if (!name) return Promise.resolve({ success: false, message: 'Usage: workspace load <name>' });
      var ok = ws.loadPreset(name);
      return Promise.resolve(ok
        ? { success: true, message: 'Preset "' + name + '" loaded.' }
        : { success: false, message: 'No preset named "' + name + '".' });
    }
    if (sub === 'list') {
      var presets = ws.listPresets();
      if (presets.length === 0) return Promise.resolve({ success: true, message: 'No saved presets.' });
      return Promise.resolve({ success: true, message: 'Presets: ' + presets.join(', ') });
    }
    if (sub === 'delete' || sub === 'rm') {
      if (!name) return Promise.resolve({ success: false, message: 'Usage: workspace delete <name>' });
      ws.deletePreset(name);
      return Promise.resolve({ success: true, message: 'Preset "' + name + '" deleted.' });
    }
    if (sub === 'export') {
      var json = ws.exportLayout();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(json).catch(function() {});
        return Promise.resolve({ success: true, message: 'Layout JSON copied to clipboard.' });
      }
      return Promise.resolve({ success: true, message: json });
    }
    if (sub === 'import') {
      var jsonStr = args.slice(1).join(' ');
      if (!jsonStr) return Promise.resolve({ success: false, message: 'Usage: workspace import <json>' });
      try {
        ws.importLayout(jsonStr);
        return Promise.resolve({ success: true, message: 'Layout imported.' });
      } catch (e) {
        return Promise.resolve({ success: false, message: 'Invalid JSON: ' + e.message });
      }
    }
    return Promise.resolve({ success: false, message: 'Usage: ' + entry.usage });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND PARSER & EXECUTOR
  // ═══════════════════════════════════════════════════════════════════════════

  function _parseAndExecute(input) {
    var trimmed = input.trim().toLowerCase();
    if (!trimmed) return;

    var parts = trimmed.split(/\s+/);
    var verb = parts[0];
    var args = parts.slice(1);

    // Resolve aliases
    var canonical = ALIAS_MAP[verb];
    if (!canonical) {
      // Fuzzy match against known verbs
      var match = _fuzzyBest(verb, ALL_VERBS);
      if (match && match.score > 500) {
        _showStatus('Unknown command "' + verb + '". Did you mean "' + match.name + '"?', 'warning');
      } else {
        _showStatus('Unknown command "' + verb + '". Type "help" for commands.', 'error');
      }
      return;
    }

    var entry = COMMANDS[canonical];
    _showStatus('...', 'muted');

    // Execute handler
    var result = entry.handler(args, _cachedObs, entry);

    // All handlers return Promises
    Promise.resolve(result).then(function(res) {
      if (res.success) {
        _showStatus(res.message, 'success');
        // Refresh cache after successful game action (Tier 1 & 2)
        if (entry.tier <= 2) {
          API.obs().then(function(obs) {
            if (obs) _cachedObs = obs;
          }).catch(function() {});
        }
      } else {
        _showStatus(res.message, 'error');
      }
    }).catch(function(err) {
      _showStatus('Error: ' + (err.message || 'Unknown'), 'error');
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOCOMPLETE / GHOST TEXT
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateGhost(input) {
    var val = input.value;
    var parts = val.split(/\s+/);
    var verb = parts[0] || '';

    // ── No verb yet: autocomplete command name ──
    if (parts.length <= 1 && verb.length >= 1) {
      var match = _fuzzyBest(verb, ALL_VERBS);
      if (match && match.score > 300) {
        _currentGhost = match.name;
        _ghostEl.textContent = match.name;
        return;
      }
      _clearGhost();
      return;
    }

    // ── Have verb, autocomplete arguments ──
    var canonical = ALIAS_MAP[verb];
    if (!canonical) { _clearGhost(); return; }

    var lastArg = parts[parts.length - 1] || '';
    var candidates = null;

    switch (canonical) {
      case 'sell':
      case 'move':
        if (parts.length === 2) candidates = _boardNames();
        break;
      case 'equip':
        if (parts.length === 2) candidates = _itemNames();
        break;
      case 'combine':
        if (parts.length <= 3) candidates = _itemNames();
        break;
      case 'pick':
        if (parts.length === 2 && _cachedObs && _cachedObs.propositions) {
          var props = _cachedObs.propositions.pokemon.concat(
            _cachedObs.propositions.items,
            _cachedObs.propositions.pveRewards
          ).map(function(p) { return _entryName(p); }).filter(Boolean);
          if (props.length > 0) {
            var hint = props.map(function(p, i) { return (i + 1) + ':' + p; }).join('  ');
            _ghostEl.textContent = val + '  (' + hint + ')';
            _currentGhost = '';
            return;
          }
        }
        break;
      case 'buy':
        if (parts.length === 2 && _cachedObs && _cachedObs.self && _cachedObs.self.shop) {
          var costs = _cachedObs.self.shop_costs || [];
          var shopHints = [];
          for (var si = 0; si < _cachedObs.self.shop.length; si++) {
            var sn = _entryName(_cachedObs.self.shop[si]);
            if (sn && sn !== 'DEFAULT') {
              shopHints.push((si + 1) + ':' + sn + '(' + (costs[si] || '?') + 'g)');
            }
          }
          if (shopHints.length > 0) {
            _ghostEl.textContent = val + '  (' + shopHints.join('  ') + ')';
            _currentGhost = '';
            return;
          }
        }
        break;
      case 'panel':
        if (parts.length === 2) {
          // Suggest section IDs + subcommands
          var panelCmds = ['close', 'closeall', 'list', 'reset'].concat(
            PAC.UI.Engine.Workspace ? PAC.UI.Engine.Workspace.getSections() : _WS_SECTIONS
          );
          candidates = panelCmds;
        }
        if (parts.length === 3 && parts[1] === 'close') {
          // Suggest open panel IDs
          var ws = PAC.UI.Engine.Workspace;
          if (ws) {
            var openIds = ws.list().map(function(p) { return p.id; });
            openIds.push('all');
            candidates = openIds;
          }
        }
        break;
      case 'ui':
        if (parts.length === 2) candidates = ['on', 'off', 'toggle'];
        break;
      case 'workspace':
        if (parts.length === 2) candidates = ['save', 'load', 'list', 'delete', 'export', 'import'];
        if (parts.length === 3 && (parts[1] === 'load' || parts[1] === 'delete')) {
          var wsp = PAC.UI.Engine.Workspace;
          if (wsp) candidates = wsp.listPresets();
        }
        break;
    }

    // Fuzzy match last argument against candidates
    if (candidates && lastArg.length >= 1) {
      var argMatch = _fuzzyBest(lastArg, candidates);
      if (argMatch && argMatch.score > 300) {
        // Build ghost: everything typed so far with last word replaced by match
        var prefix = parts.slice(0, -1).join(' ') + ' ';
        _currentGhost = argMatch.name;
        _ghostEl.textContent = prefix + argMatch.name.toLowerCase();
        return;
      }
    }

    _clearGhost();
  }

  function _clearGhost() {
    _currentGhost = '';
    _ghostEl.textContent = '';
  }

  function _acceptGhost() {
    if (!_currentGhost) return false;
    var val = _inputEl.value;
    var parts = val.split(/\s+/);

    if (parts.length <= 1) {
      // Completing verb
      _inputEl.value = _currentGhost + ' ';
    } else {
      // Completing argument
      parts[parts.length - 1] = _currentGhost.toLowerCase();
      _inputEl.value = parts.join(' ') + ' ';
    }
    _clearGhost();
    return true;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS LINE
  // ═══════════════════════════════════════════════════════════════════════════

  function _showStatus(message, type) {
    if (!_statusEl) return;

    var color = 'rgba(255,255,255,0.5)';
    if (type === 'success') color = '#2ED573';
    else if (type === 'error') color = '#FF4757';
    else if (type === 'warning') color = '#FFA502';
    else if (type === 'muted') color = 'rgba(255,255,255,0.25)';

    // Multi-line: expand
    var isMultiLine = message.indexOf('\n') !== -1;
    _statusEl.style.maxHeight = isMultiLine ? 'min(200px, 40vh)' : '20px';
    _statusEl.style.overflowY = isMultiLine ? 'auto' : 'hidden';
    _statusEl.style.whiteSpace = isMultiLine ? 'pre' : 'nowrap';

    _statusEl.style.color = color;
    _statusEl.textContent = message;

    // Scroll to bottom for multi-line
    if (isMultiLine) {
      _statusEl.scrollTop = _statusEl.scrollHeight;
    }
  }

  function _showContextStatus() {
    // Show phase + gold as ambient context
    if (_cachedObs && _cachedObs.self) {
      var g = _cachedObs.game || {};
      _showStatus(
        (_cachedObs.phase || '?') + '  |  💰 ' + _cachedObs.self.gold +
        '  |  Lv' + (_cachedObs.self.level || '?') +
        '  |  Stage ' + (g.stageLevel || '?'),
        'muted'
      );
    } else {
      _showStatus('No game data. Are you in a match?', 'muted');
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CLI OVERLAY DOM
  // ═══════════════════════════════════════════════════════════════════════════

  function _create() {
    _destroy();

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id = 'pac-cli-backdrop';
    backdrop.style.cssText =
      'position:fixed;inset:0;z-index:2147483644;' +
      'background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('mousedown', function(e) {
      if (e.target === backdrop) _close();
    });

    // Container
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'pac-cli';
    _overlayEl.style.cssText =
      'position:fixed;z-index:2147483645;' +
      'background:rgba(10,12,18,0.96);' +
      'border:1px solid rgba(48,213,200,0.3);' +
      'border-radius:10px;' +
      'padding:8px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(48,213,200,0.15);' +
      'backdrop-filter:blur(12px);' +
      'width:420px;' +
      'font-family:monospace;';

    // Position at cursor (clamped to viewport), fallback to center
    var cliW = 420, cliH = 120; // approx height
    if (_cursorX >= 0 && _cursorY >= 0) {
      var cx = Math.max(8, Math.min(_cursorX - cliW / 2, window.innerWidth - cliW - 8));
      var cy = Math.max(8, Math.min(_cursorY - 20, window.innerHeight - cliH - 8));
      _overlayEl.style.left = cx + 'px';
      _overlayEl.style.top = cy + 'px';
    } else {
      _overlayEl.style.left = '50%';
      _overlayEl.style.top = '35%';
      _overlayEl.style.transform = 'translate(-50%,-50%)';
    }

    // Header
    var header = document.createElement('div');
    header.style.cssText =
      'font-size:10px;color:var(--pac-accent,#30D5C8);' +
      'margin-bottom:6px;' +
      'text-transform:uppercase;letter-spacing:0.05em;';
    header.textContent = '> PAC CLI';
    _overlayEl.appendChild(header);

    // Input wrapper
    var inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'position:relative;';
    _overlayEl.appendChild(inputWrap);

    // Ghost text
    _ghostEl = document.createElement('div');
    _ghostEl.style.cssText =
      'position:absolute;top:0;left:0;right:0;bottom:0;' +
      'padding:8px 10px;' +
      'font-size:13px;font-family:monospace;' +
      'color:rgba(48,213,200,0.3);' +
      'pointer-events:none;' +
      'white-space:nowrap;overflow:hidden;';
    inputWrap.appendChild(_ghostEl);

    // Input
    _inputEl = document.createElement('input');
    _inputEl.type = 'text';
    _inputEl.placeholder = 'type a command... (help for list)';
    _inputEl.autocomplete = 'off';
    _inputEl.style.cssText =
      'width:100%;box-sizing:border-box;' +
      'background:transparent;' +
      'border:1px solid rgba(255,255,255,0.1);' +
      'border-radius:6px;' +
      'color:#fff;font-size:13px;font-family:monospace;' +
      'padding:8px 10px;outline:none;' +
      'position:relative;z-index:1;';
    inputWrap.appendChild(_inputEl);

    // Status line
    _statusEl = document.createElement('div');
    _statusEl.style.cssText =
      'font-size:10px;font-family:monospace;' +
      'color:rgba(255,255,255,0.35);' +
      'margin-top:5px;padding:2px 4px;' +
      'max-height:20px;overflow:hidden;' +
      'white-space:nowrap;' +
      'transition:max-height 0.15s ease;' +
      'scrollbar-width:thin;scrollbar-color:rgba(48,213,200,0.3) transparent;';
    _overlayEl.appendChild(_statusEl);

    // Help line
    var helpLine = document.createElement('div');
    helpLine.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.2);margin-top:3px;';
    helpLine.textContent = 'Tab complete  │  Enter execute  │  Esc close';
    _overlayEl.appendChild(helpLine);

    // Assemble
    backdrop.appendChild(_overlayEl);
    document.body.appendChild(backdrop);

    // Wire events
    _inputEl.addEventListener('input', function() {
      _updateGhost(_inputEl);
      // Collapse status on new input
      if (_statusEl.style.maxHeight !== '20px') {
        _statusEl.style.maxHeight = '20px';
        _statusEl.style.overflowY = 'hidden';
        _statusEl.style.whiteSpace = 'nowrap';
      }
    });

    _inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        _acceptGhost();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        var cmd = _inputEl.value.trim();
        if (cmd) {
          _parseAndExecute(cmd);
          _inputEl.value = '';
          _clearGhost();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        _close();
        return;
      }
    });

    // Focus
    setTimeout(function() { _inputEl.focus(); }, 10);
  }

  function _destroy() {
    var backdrop = document.getElementById('pac-cli-backdrop');
    if (backdrop) backdrop.remove();
    _overlayEl = null;
    _inputEl = null;
    _ghostEl = null;
    _statusEl = null;
    _currentGhost = '';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // OPEN / CLOSE
  // ═══════════════════════════════════════════════════════════════════════════

  function _open() {
    if (_isOpen) {
      // Already open — focus input
      if (_inputEl) _inputEl.focus();
      return;
    }
    _isOpen = true;
    _create();

    // Fetch fresh observation for autocomplete and context
    API.obs().then(function(obs) {
      _cachedObs = obs;
      _showContextStatus();
    }).catch(function() {
      _cachedObs = null;
      _showContextStatus();
    });
  }

  function _close() {
    _isOpen = false;
    _destroy();
    _cachedObs = null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Engine.CLI = {
    open: _open,
    close: _close,
    isOpen: function() { return _isOpen; }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENER
  // ═══════════════════════════════════════════════════════════════════════════

  Events.on('keybind:openCLI', function() {
    if (_isOpen) { _close(); } else { _open(); }
  });

  if (PAC.DEBUG_MODE) console.log('PAC Engine: CLI loaded');
})();
