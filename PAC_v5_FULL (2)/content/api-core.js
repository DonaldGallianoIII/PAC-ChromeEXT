/**
 * PAC API Core — Game Interaction Engine
 *
 * Runs in PAGE CONTEXT (MAIN world). Injected by content/ui/engine/api.js
 * via <script> tag from web_accessible_resources.
 *
 * Extracted from agent-io.js v5 — all game logic, no training harness.
 *
 * Responsibilities:
 *   1. Find Colyseus room (shares via window.__pacRoom)
 *   2. Extract full game observations from room.state
 *   3. Execute actions via room.send()
 *   4. Detect game phases for action masking
 *   5. Respond to postMessage requests from content script bridge (PAC.API)
 *
 * Architecture:
 *   Content Script (api.js / PAC.API) ←postMessage→ This file (window.__AgentIO)
 *
 * Message Protocol (Colyseus — confirmed by discovery):
 *   SHOP {id: 0-5}               Buy pokemon from shop slot
 *   REFRESH                       Reroll shop
 *   LEVEL_UP                      Buy XP
 *   DRAG_DROP {x, y, id}          Move/place unit on grid
 *   SELL_POKEMON "unitId"          Sell a unit
 *   DRAG_DROP_COMBINE {itemA, itemB}  Combine two items
 *   DRAG_DROP_ITEM {zone, index, id}  Equip item on unit
 *   LOCK                          Toggle shop lock
 *   REMOVE_FROM_SHOP index        Remove from shop
 *   POKEMON_PROPOSITION "NAME"    Pick additional pokemon
 *   ITEM "NAME"                    Pick item reward / PVE reward
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0 — Extracted from agent-io.js v5
 */
(function() {
  'use strict';

  // Guard against double-injection
  if (window.__PACApiCore) {
    if (window.__AgentIO && window.__AgentIO._cleanup) {
      console.log('⚡ [API Core] Re-injection detected — cleaning up old instance');
      window.__AgentIO._cleanup();
    } else {
      console.log('⚡ [API Core] Already running and no cleanup available — skipping');
      return;
    }
  }
  window.__PACApiCore = true;


  // ════════════════════════════════════════
  // CONFIG
  // ════════════════════════════════════════
  var CONFIG = {
    DEBUG: false,
    ROOM_SEARCH_COOLDOWN_MS: 3000
  };

  // Bridge-delivered data (received from content script via PAC_API_INIT)
  var _pokemonData = null;   // PAC.Data.POKEMON_DATA mirror
  var _playerName = null;    // PAC.State.state.playerName mirror


  // ════════════════════════════════════════
  // LOGGING
  // ════════════════════════════════════════
  function log() {
    if (!CONFIG.DEBUG) return;
    var args = ['⚡ [API]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function warn() {
    var args = ['⚡ [API] ⚠️'].concat(Array.prototype.slice.call(arguments));
    console.warn.apply(console, args);
  }


  // ════════════════════════════════════════
  // COLYSEUS UTILITIES
  // ════════════════════════════════════════

  // Get length of a Colyseus collection (ArraySchema, MapSchema, or plain array)
  function colLen(col) {
    if (!col) return 0;
    if (col.items && typeof col.items.length === 'number') return col.items.length;
    if (typeof col.length === 'number') return col.length;
    if (typeof col.size === 'number') return col.size;
    return 0;
  }

  // Convert a Colyseus collection to a plain array
  function colArray(col) {
    if (!col) return [];
    if (col.items && col.items.length > 0) return Array.from(col.items);
    if (col.length > 0) return Array.from(col);
    if (typeof col[Symbol.iterator] === 'function') {
      var arr = []; col.forEach(function(v) { arr.push(v); });
      return arr;
    }
    return [];
  }

  // Check if a DOM element is actually visible on screen (not hidden/zero-size)
  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }


  // ════════════════════════════════════════
  // MODULE 1: ROOM FINDER
  // ════════════════════════════════════════
  var Room = (function() {
    var _room = null;
    var _lastSearchFail = 0;
    var _myPlayer = null;
    var _myPlayerId = null;

    function findRoom(obj, depth, visited) {
      if (depth > 10 || !obj || visited.has(obj)) return null;
      visited.add(obj);
      if (obj.sessionId && obj.state) return obj;
      for (var key in obj) {
        try {
          var val = obj[key];
          if (typeof val === 'object') {
            var found = findRoom(val, depth + 1, visited);
            if (found) return found;
          }
        } catch (e) {}
      }
      return null;
    }

    function get() {
      if (_room && _room.sessionId && _room.state) return _room;

      // Fast path: check shared reference (may be set by us or other scripts)
      if (window.__pacRoom && window.__pacRoom.sessionId && window.__pacRoom.state) {
        _room = window.__pacRoom;
        log('Room acquired from __pacRoom cache');
        return _room;
      }

      // Throttle expensive window search
      var now = Date.now();
      if (now - _lastSearchFail < CONFIG.ROOM_SEARCH_COOLDOWN_MS) return null;

      // Fallback: search window tree
      _room = findRoom(window, 0, new Set());
      if (!_room) {
        _lastSearchFail = now;
        return null;
      }

      // Share for other scripts (backward compat)
      window.__pacRoom = _room;

      _myPlayer = null;
      _myPlayerId = null;
      log('Room found! sessionId:', _room.sessionId);
      return _room;
    }

    function getMyPlayer() {
      var room = get();
      if (!room) return null;
      if (_myPlayer) return _myPlayer;

      var players = Array.from(room.state.players.$items.values());

      // Strategy 1: Player name (from content script bridge)
      if (_playerName) {
        for (var i = 0; i < players.length; i++) {
          if (players[i].name === _playerName) {
            _myPlayer = players[i];
            _myPlayerId = players[i].id;
            log('Found self via playerName:', _myPlayer.name);
            return _myPlayer;
          }
        }
      }

      // Strategy 2: sessionId match
      for (var i = 0; i < players.length; i++) {
        if (players[i].id === room.sessionId) {
          _myPlayer = players[i];
          _myPlayerId = players[i].id;
          log('Found self via sessionId:', _myPlayer.name);
          return _myPlayer;
        }
      }

      // Strategy 3: DOM name match
      var nameEl = document.querySelector('.player-information');
      if (nameEl) {
        var domName = nameEl.textContent.trim();
        for (var i = 0; i < players.length; i++) {
          if (domName.indexOf(players[i].name) !== -1) {
            _myPlayer = players[i];
            _myPlayerId = players[i].id;
            log('Found self via DOM name match:', _myPlayer.name);
            return _myPlayer;
          }
        }
      }

      // Strategy 4: Firebase UID heuristic (28+ chars, no dashes = human)
      for (var i = 0; i < players.length; i++) {
        var pid = players[i].id;
        if (pid.length > 25 && pid.indexOf('-') === -1) {
          _myPlayer = players[i];
          _myPlayerId = players[i].id;
          log('Found self via Firebase UID heuristic:', _myPlayer.name);
          return _myPlayer;
        }
      }

      // Last resort
      if (players.length > 0) {
        _myPlayer = players[0];
        warn('Could not identify self, defaulting to player[0]:', _myPlayer.name);
        return _myPlayer;
      }

      return null;
    }

    function send(type, data) {
      var room = get();
      if (!room) {
        warn('Cannot send — no room');
        return false;
      }
      try {
        room.send(type, data);
        log('📤 Sent:', type, JSON.stringify(data));
        return true;
      } catch (e) {
        warn('Send failed:', type, e.message);
        return false;
      }
    }

    function reset() {
      _room = null;
      _myPlayer = null;
      _myPlayerId = null;
      _lastSearchFail = 0;
      log('Room cache cleared');
    }

    // Force re-identify on name change
    function clearPlayer() {
      _myPlayer = null;
      _myPlayerId = null;
    }

    return { get: get, getMyPlayer: getMyPlayer, send: send, reset: reset, clearPlayer: clearPlayer };
  })();


  // ════════════════════════════════════════
  // MODULE 2: PHASE DETECTOR
  // ════════════════════════════════════════
  var Phase = (function() {
    var PHASES = {
      UNKNOWN:      'unknown',
      SHOP:         'shop',
      COMBAT:       'combat',
      PORTAL:       'portal_select',
      PICK_POKEMON: 'pick_pokemon',
      PICK_ITEM:    'pick_item',
      CAROUSEL:     'carousel',
      GAME_OVER:    'game_over'
    };

    var _lastPhase = PHASES.UNKNOWN;

    function detect() {
      var room = Room.get();
      if (!room) return PHASES.UNKNOWN;

      var me = Room.getMyPlayer();
      if (!me) return PHASES.UNKNOWN;

      // Check if game is over
      if (!me.alive) return PHASES.GAME_OVER;

      var state = room.state;

      // Check for carousel (floating items during shared pick phase)
      if (state.floatingItems && state.floatingItems.$items) {
        var floatCount = 0;
        state.floatingItems.$items.forEach(function() { floatCount++; });
        if (floatCount > 0) return PHASES.CAROUSEL;
      }

      // Check for portals
      if (state.portals && state.portals.$items) {
        var portalCount = 0;
        state.portals.$items.forEach(function() { portalCount++; });
        if (portalCount > 0) return PHASES.PORTAL;
      }

      // Check proposition modals — must be physically VISIBLE in DOM,
      // not just present. Game pre-renders modals hidden during fights.
      if (colLen(me.pokemonsProposition) > 0) {
        var el = document.querySelector('.game-pokemons-proposition');
        if (el && isVisible(el)) {
          return PHASES.PICK_POKEMON;
        }
      }

      // Item proposition + PVE rewards use the same modal
      if (colLen(me.itemsProposition) > 0 || colLen(me.pveRewardsPropositions) > 0) {
        var el = document.querySelector('.game-items-proposition');
        if (el && isVisible(el)) {
          return PHASES.PICK_ITEM;
        }
      }

      // Default: shop (always active, even during fight animations)
      return PHASES.SHOP;
    }

    function hasChanged() {
      var current = detect();
      if (current !== _lastPhase) {
        var old = _lastPhase;
        _lastPhase = current;
        return { changed: true, from: old, to: current };
      }
      return { changed: false, current: current };
    }

    return { detect: detect, hasChanged: hasChanged, PHASES: PHASES };
  })();


  // ════════════════════════════════════════
  // MODULE 3: POKEMON TYPE DATABASE
  // ════════════════════════════════════════
  /**
   * Reads _pokemonData (delivered by content script bridge).
   * Falls back to runtime board scanning if bridge data unavailable.
   */
  var TypeDB = (function() {
    var _cachedDB = null;

    function getFullDB() {
      if (_cachedDB) return _cachedDB;

      if (_pokemonData) {
        _cachedDB = {};
        var keys = Object.keys(_pokemonData);
        for (var i = 0; i < keys.length; i++) {
          var name = keys[i];
          var entry = _pokemonData[name];
          _cachedDB[name] = {
            types: entry.types || [],
            rarity: entry.rarity || 'unknown',
            stars: entry.stars || 1,
            additional: entry.additional || false,
            regional: entry.regional || false
          };
        }
        log('TypeDB: Loaded', keys.length, 'entries from bridge data');
        return _cachedDB;
      }

      return null;
    }

    function getTypes(name) {
      if (_pokemonData && _pokemonData[name]) {
        return _pokemonData[name].types || [];
      }
      var upper = name.toUpperCase();
      if (_pokemonData && _pokemonData[upper]) {
        return _pokemonData[upper].types || [];
      }
      return null;
    }

    /**
     * Build a runtime type cache from board scanning (fallback only).
     * Only used if bridge data is not available.
     */
    function buildRuntimeCache(state) {
      if (_pokemonData) return {};

      var cache = {};
      state.players.$items.forEach(function(player) {
        if (player.board && player.board.$items) {
          player.board.$items.forEach(function(unit) {
            if (unit.name && unit.types && !cache[unit.name]) {
              cache[unit.name] = Array.from(unit.types);
            }
          });
        }
      });
      return cache;
    }

    // Invalidate cache when new pokemon data arrives from bridge
    function invalidate() {
      _cachedDB = null;
    }

    return { getFullDB: getFullDB, getTypes: getTypes, buildRuntimeCache: buildRuntimeCache, invalidate: invalidate };
  })();


  // ════════════════════════════════════════
  // MODULE 4: OBSERVATION EXTRACTOR
  // ════════════════════════════════════════
  var Observer = (function() {

    function extractUnit(unit) {
      return {
        id: unit.id,
        name: unit.name,
        types: unit.types ? Array.from(unit.types) : [],
        rarity: unit.rarity,
        stars: unit.stars || 1,
        evolution: unit.evolution || null,
        positionX: unit.positionX,
        positionY: unit.positionY,
        items: unit.items ? Array.from(unit.items) : [],
        atk: unit.atk,
        def: unit.def,
        speDef: unit.speDef,
        hp: unit.hp,
        maxHP: unit.maxHP,
        speed: unit.speed,
        range: unit.range,
        critChance: unit.critChance,
        critPower: unit.critPower,
        pp: unit.pp,
        maxPP: unit.maxPP,
        ap: unit.ap,
        luck: unit.luck,
        skill: unit.skill,
        passive: unit.passive,
        shiny: unit.shiny || false
      };
    }

    function extractSynergies(player) {
      var synergies = {};
      if (player.synergies && player.synergies.$items) {
        player.synergies.$items.forEach(function(count, type) {
          synergies[type] = count;
        });
      }
      return synergies;
    }

    function extractBoard(player) {
      var units = [];
      if (player.board && player.board.$items) {
        player.board.$items.forEach(function(unit) {
          units.push(extractUnit(unit));
        });
      }
      return units;
    }

    function extractShop(player) {
      if (player.shop && player.shop.items) {
        return Array.from(player.shop.items);
      }
      return [];
    }

    function extractItems(player) {
      if (player.items && player.items.items) {
        return Array.from(player.items.items);
      }
      return [];
    }

    function extractHistory(player) {
      if (player.history && player.history.items) {
        return Array.from(player.history.items).map(function(h) {
          return {
            id: h.id,
            name: h.name,
            result: h.result,
            weather: h.weather
          };
        });
      }
      return [];
    }

    function extractSelfState(me) {
      var shopItems = extractShop(me);
      var RARITY_COST_MAP = { common: 1, uncommon: 2, rare: 3, epic: 4, ultra: 5,
                              legendary: 10, unique: 3, hatch: 4, special: 1 };
      var db = _pokemonData || {};
      var shopCosts = shopItems.map(function(item) {
        var name = typeof item === 'string' ? item : (item && item.name ? item.name : '');
        var upper = name.toUpperCase();
        if (db[upper] && db[upper].rarity) {
          return RARITY_COST_MAP[db[upper].rarity] || 1;
        }
        return 1;
      });

      return {
        id: me.id,
        name: me.name,
        level: me.experienceManager ? me.experienceManager.level : null,
        experience: me.experienceManager ? me.experienceManager.experience : null,
        expNeeded: me.experienceManager ? me.experienceManager.expNeeded : null,
        hp: me.life,
        gold: me.money,
        streak: me.streak,
        interest: me.interest,
        maxInterest: me.maxInterest,
        alive: me.alive,
        rank: me.rank,
        boardSize: me.boardSize,
        shopLocked: me.shopLocked,
        shopFreeRolls: me.shopFreeRolls,
        rerollCount: me.rerollCount,
        totalMoneyEarned: me.totalMoneyEarned,
        totalPlayerDamageDealt: me.totalPlayerDamageDealt,
        board: extractBoard(me),
        shop: shopItems,
        shop_costs: shopCosts,
        items: extractItems(me),
        synergies: extractSynergies(me),
        history: extractHistory(me),
        opponentId: me.opponentId,
        opponentName: me.opponentName,
        regionalPokemons: me.regionalPokemons ? Array.from(me.regionalPokemons.items || []) : [],
        map: me.map
      };
    }

    function extractOpponentState(player) {
      return {
        id: player.id,
        name: player.name,
        level: player.experienceManager ? player.experienceManager.level : null,
        hp: player.life,
        gold: player.money,
        streak: player.streak,
        alive: player.alive,
        rank: player.rank,
        boardSize: player.boardSize,
        board: extractBoard(player),
        synergies: extractSynergies(player),
        items: extractItems(player)
      };
    }

    function extractPropositions(me) {
      var result = {
        pokemon: [],
        items: [],
        pveRewards: []
      };

      result.pokemon = colArray(me.pokemonsProposition);
      result.items = colArray(me.itemsProposition);
      result.pveRewards = colArray(me.pveRewardsPropositions);

      return result;
    }

    /**
     * Extract minigame state: avatar position, floating items, portals.
     * Used during carousel and portal phases.
     */
    function extractMinigame(state, me) {
      var result = { avatar: null, rivals: [], floatingItems: [], portals: [] };

      // Extract ALL avatars — ours + rivals
      if (state.avatars && state.avatars.$items) {
        state.avatars.$items.forEach(function(av) {
          var info = {
            id: av.id,
            x: av.x, y: av.y,
            targetX: av.targetX, targetY: av.targetY,
            timer: av.timer || 0,
            itemId: av.itemId || '',
            portalId: av.portalId || ''
          };
          if (av.id === me.id) {
            result.avatar = info;
          } else {
            result.rivals.push(info);
          }
        });
      }

      // Extract floating items (carousel)
      if (state.floatingItems && state.floatingItems.$items) {
        state.floatingItems.$items.forEach(function(fi) {
          result.floatingItems.push({
            id: fi.id,
            name: fi.name,
            x: fi.x, y: fi.y,
            claimed: !!(fi.avatarId && fi.avatarId !== '')
          });
        });
      }

      // Extract portals
      if (state.portals && state.portals.$items) {
        state.portals.$items.forEach(function(p) {
          var portalInfo = {
            id: p.id,
            x: p.x, y: p.y,
            map: p.map || '',
            claimed: !!(p.avatarId && p.avatarId !== '')
          };
          if (state.symbols && state.symbols.$items) {
            var synergies = [];
            state.symbols.$items.forEach(function(sym) {
              if (sym.portalId === p.id) {
                synergies.push(sym.synergy);
              }
            });
            portalInfo.synergies = synergies;
          }
          result.portals.push(portalInfo);
        });
      }

      return result;
    }

    /**
     * Build the full observation object.
     */
    function getObservation() {
      var room = Room.get();
      if (!room) return null;

      var me = Room.getMyPlayer();
      if (!me) return null;

      var state = room.state;

      // Runtime type cache only if bridge data unavailable
      var typeCache = TypeDB.buildRuntimeCache(state);

      // Collect all opponents
      var opponents = [];
      state.players.$items.forEach(function(player) {
        if (player.id !== me.id) {
          opponents.push(extractOpponentState(player));
        }
      });

      var phase = Phase.detect();

      // Extract minigame data (carousel items, portals, avatar position)
      var minigame = null;
      if (phase === Phase.PHASES.CAROUSEL || phase === Phase.PHASES.PORTAL) {
        minigame = extractMinigame(state, me);
      }

      return {
        type: 'observation',
        player_id: me.id,
        timestamp: Date.now(),
        phase: phase,
        game: {
          stageLevel: state.stageLevel,
          phaseEnum: state.phase,
          weather: state.weather,
          gameMode: state.gameMode,
          playersAlive: opponents.filter(function(o) { return o.alive; }).length + (me.alive ? 1 : 0)
        },
        self: extractSelfState(me),
        opponents: opponents,
        propositions: extractPropositions(me),
        minigame: minigame,
        action_mask: buildActionMask(me, phase, state),
        pokemon_types: typeCache
      };
    }

    return { getObservation: getObservation };
  })();


  // ════════════════════════════════════════
  // MODULE 5: ACTION MASK BUILDER
  // ════════════════════════════════════════
  /**
   * Action space layout (flat vector, 8×4 = 32-cell grid):
   *   [0-5]   SHOP slots 0-5     (buy pokemon)
   *   [6]     REFRESH             (reroll shop)
   *   [7]     LEVEL_UP            (buy XP)
   *   [8]     LOCK                (toggle shop lock)
   *   [9]     END_TURN            (do nothing / pass)
   *   [10-41] MOVE: 32 grid cells (8×4)
   *   [42-73] SELL: sell unit at grid position 0-31
   *   [74-79] REMOVE_FROM_SHOP 0-5
   *   [80-85] PICK_PROPOSITION 0-5
   *   [86-91] COMBINE_ITEMS: up to 6 pairs
   *
   * Total: 92 actions
   */
  var ACTION_SPACE_SIZE = 92;

  function buildActionMask(me, phase, state) {
    var mask = new Array(ACTION_SPACE_SIZE);
    for (var i = 0; i < ACTION_SPACE_SIZE; i++) mask[i] = 0;

    if (phase === Phase.PHASES.GAME_OVER || phase === Phase.PHASES.COMBAT) {
      mask[9] = 1; // END_TURN always valid
      return mask;
    }

    if (phase === Phase.PHASES.PICK_POKEMON || phase === Phase.PHASES.PICK_ITEM) {
      var propCount = Math.max(
        colLen(me.pokemonsProposition),
        colLen(me.itemsProposition),
        colLen(me.pveRewardsPropositions)
      );
      for (var p = 0; p < Math.min(propCount, 6); p++) {
        mask[80 + p] = 1;
      }
      return mask;
    }

    if (phase === Phase.PHASES.PORTAL || phase === Phase.PHASES.CAROUSEL) {
      mask[9] = 1;
      return mask;
    }

    // ── SHOP PHASE ──
    var gold = me.money || 0;
    var shop = me.shop && me.shop.items ? Array.from(me.shop.items) : [];
    var boardUnits = [];
    if (me.board && me.board.$items) {
      me.board.$items.forEach(function(u) { boardUnits.push(u); });
    }

    // [0-5] Shop buy — cost-aware
    var RARITY_COST = { common: 1, uncommon: 2, rare: 3, epic: 4, ultra: 5,
                        legendary: 10, unique: 3, hatch: 4, special: 1 };
    var db = _pokemonData || {};
    for (var s = 0; s < Math.min(shop.length, 6); s++) {
      if (shop[s] && shop[s] !== 'DEFAULT') {
        var shopName = typeof shop[s] === 'string' ? shop[s] : (shop[s].name || '');
        var shopCost = 1;
        var upperName = shopName.toUpperCase();
        if (db[upperName] && db[upperName].rarity) {
          shopCost = RARITY_COST[db[upperName].rarity] || 1;
        }
        if (gold >= shopCost) mask[s] = 1;
      }
    }

    // [6] Refresh
    if (gold >= 1) mask[6] = 1;
    if (me.shopFreeRolls > 0) mask[6] = 1;

    // [7] Level up
    if (gold >= 4) mask[7] = 1;

    // [8] Lock — always valid during shop
    mask[8] = 1;

    // [9] End turn / pass — always valid
    mask[9] = 1;

    // [10-41] Move: only mark EMPTY grid cells as valid destinations (8×4)
    if (boardUnits.length > 0) {
      var occupiedCells = {};
      for (var occ = 0; occ < boardUnits.length; occ++) {
        var occIdx = boardUnits[occ].positionY * 8 + boardUnits[occ].positionX;
        occupiedCells[occIdx] = true;
      }
      for (var m = 0; m < 32; m++) {
        if (!occupiedCells[m]) mask[10 + m] = 1;
      }
    }

    // [42-73] Sell: valid for each occupied grid cell (8×4)
    for (var u = 0; u < boardUnits.length; u++) {
      var unit = boardUnits[u];
      var cellIdx = unit.positionY * 8 + unit.positionX;
      if (cellIdx >= 0 && cellIdx < 32) {
        mask[42 + cellIdx] = 1;
      }
    }

    // [74-79] Remove from shop
    for (var r = 0; r < Math.min(shop.length, 6); r++) {
      if (shop[r] && shop[r] !== 'DEFAULT') mask[74 + r] = 1;
    }

    // [86-91] Item combinations
    var items = me.items && me.items.items ? Array.from(me.items.items) : [];
    if (items.length >= 2) {
      var combos = Math.min(Math.floor(items.length * (items.length - 1) / 2), 6);
      for (var c = 0; c < combos; c++) mask[86 + c] = 1;
    }

    return mask;
  }


  // ════════════════════════════════════════
  // MODULE 6: ACTION EXECUTOR
  // ════════════════════════════════════════
  var Executor = (function() {

    function cellToXY(cellIndex) {
      return { x: cellIndex % 8, y: Math.floor(cellIndex / 8) };
    }

    function execute(actionIndex) {
      if (actionIndex < 0 || actionIndex >= ACTION_SPACE_SIZE) {
        warn('Invalid action index:', actionIndex);
        return false;
      }

      var me = Room.getMyPlayer();
      if (!me) {
        warn('No player — cannot execute');
        return false;
      }

      // [0-5] Buy from shop
      if (actionIndex >= 0 && actionIndex <= 5) {
        return Room.send('SHOP', { id: actionIndex });
      }

      // [6] Refresh
      if (actionIndex === 6) return Room.send('REFRESH');

      // [7] Level up
      if (actionIndex === 7) return Room.send('LEVEL_UP');

      // [8] Lock shop
      if (actionIndex === 8) return Room.send('LOCK');

      // [9] End turn / pass
      if (actionIndex === 9) return true;

      // [10-41] Move unit to grid cell (8×4=32)
      if (actionIndex >= 10 && actionIndex <= 41) {
        var destCell = actionIndex - 10;
        var dest = cellToXY(destCell);

        var unitToMove = null;
        if (me.board && me.board.$items) {
          me.board.$items.forEach(function(unit) {
            if (!unitToMove && (unit.positionX !== dest.x || unit.positionY !== dest.y)) {
              unitToMove = unit;
            }
          });
        }

        if (unitToMove) {
          return Room.send('DRAG_DROP', { x: dest.x, y: dest.y, id: unitToMove.id });
        }
        warn('No unit to move to cell', destCell);
        return false;
      }

      // [42-73] Sell unit at grid cell (8×4=32)
      if (actionIndex >= 42 && actionIndex <= 73) {
        var sellCell = actionIndex - 42;
        var sellPos = cellToXY(sellCell);

        var unitToSell = null;
        if (me.board && me.board.$items) {
          me.board.$items.forEach(function(unit) {
            if (unit.positionX === sellPos.x && unit.positionY === sellPos.y) {
              unitToSell = unit;
            }
          });
        }

        if (unitToSell) return Room.send('SELL_POKEMON', unitToSell.id);
        warn('No unit at cell', sellCell, 'to sell');
        return false;
      }

      // [74-79] Remove from shop
      if (actionIndex >= 74 && actionIndex <= 79) {
        return Room.send('REMOVE_FROM_SHOP', actionIndex - 74);
      }

      // [80-85] Pick proposition
      if (actionIndex >= 80 && actionIndex <= 85) {
        return executePick(me, actionIndex - 80);
      }

      // [86-91] Combine items
      if (actionIndex >= 86 && actionIndex <= 91) {
        return executeCombine(me, actionIndex - 86);
      }

      warn('Unhandled action index:', actionIndex);
      return false;
    }

    function executePick(me, pickIndex) {
      var pokeArr = colArray(me.pokemonsProposition);
      var itemArr = colArray(me.itemsProposition);
      var pveArr = colArray(me.pveRewardsPropositions);

      log('🎯 executePick(' + pickIndex + '):',
        'poke:', pokeArr.length, 'items:', itemArr.length, 'pve:', pveArr.length);

      if (pokeArr.length > pickIndex) {
        var prop = pokeArr[pickIndex];
        var name = typeof prop === 'string' ? prop : (prop.name || String(prop));
        log('🎯 PICK POKEMON:', name);
        return Room.send('POKEMON_PROPOSITION', name);
      }

      if (itemArr.length > pickIndex) {
        var iName = typeof itemArr[pickIndex] === 'string' ? itemArr[pickIndex] : (itemArr[pickIndex].name || String(itemArr[pickIndex]));
        log('🎯 PICK ITEM:', iName);
        return Room.send('ITEM', iName);
      }

      if (pveArr.length > pickIndex) {
        var rName = typeof pveArr[pickIndex] === 'string' ? pveArr[pickIndex] : (pveArr[pickIndex].name || String(pveArr[pickIndex]));
        log('🎯 PICK PVE REWARD:', rName);
        return Room.send('ITEM', rName);
      }

      warn('No proposition at index', pickIndex,
        'poke:', pokeArr.length, 'items:', itemArr.length, 'pve:', pveArr.length);
      return false;
    }

    function executeCombine(me, comboIndex) {
      var items = me.items && me.items.items ? Array.from(me.items.items) : [];
      if (items.length < 2) {
        warn('Not enough items to combine');
        return false;
      }

      var pairs = [];
      for (var i = 0; i < items.length; i++) {
        for (var j = i + 1; j < items.length; j++) {
          pairs.push([items[i], items[j]]);
        }
      }

      if (comboIndex >= pairs.length) {
        warn('Combo index', comboIndex, 'out of range');
        return false;
      }

      var pair = pairs[comboIndex];
      return Room.send('DRAG_DROP_COMBINE', { itemA: pair[0], itemB: pair[1] });
    }

    return { execute: execute };
  })();


  // ════════════════════════════════════════
  // MODULE 7: PURSUIT SYSTEM
  // ════════════════════════════════════════
  var _pursuitTimer = null;
  var _pursuitTargetId = null;
  var _pursuitType = null;
  var PURSUIT_INTERVAL = 35;  // Re-send VECTOR every 35ms (~28/sec)

  function getMyAvatar() {
    var room = Room.get();
    var me = Room.getMyPlayer();
    if (!room || !me || !room.state.avatars || !room.state.avatars.$items) return null;
    var found = null;
    room.state.avatars.$items.forEach(function(av) {
      if (av.id === me.id) found = av;
    });
    return found;
  }

  function sendVector(targetX, targetY) {
    var avatar = getMyAvatar();
    if (!avatar) { warn('sendVector: no avatar'); return false; }
    var vx = targetX - avatar.x;
    var vy = -(targetY - avatar.y);  // Y flipped for Phaser space
    log('🏃 vec (' + Math.round(avatar.x) + ',' + Math.round(avatar.y) + ') → (' + Math.round(targetX) + ',' + Math.round(targetY) + ')');
    Room.send('VECTOR', { x: vx, y: vy });
    return true;
  }

  function startPursuit(targetId, type) {
    stopPursuit();
    _pursuitTargetId = targetId;
    _pursuitType = type || 'item';
    log('🎯 Pursuit START: ' + _pursuitType + ' ' + targetId);
    pursuitTick();
    _pursuitTimer = setInterval(pursuitTick, PURSUIT_INTERVAL);
  }

  function stopPursuit() {
    if (_pursuitTimer) {
      clearInterval(_pursuitTimer);
      _pursuitTimer = null;
    }
    if (_pursuitTargetId) {
      log('🎯 Pursuit STOP: ' + _pursuitTargetId);
    }
    _pursuitTargetId = null;
    _pursuitType = null;
  }

  function pursuitTick() {
    var room = Room.get();
    if (!room || !room.state) { stopPursuit(); return; }

    var avatar = getMyAvatar();
    if (!avatar) { stopPursuit(); return; }

    // Check if we already grabbed something
    if (avatar.itemId && avatar.itemId !== '') {
      log('🎯 Pursuit SUCCESS: grabbed item ' + avatar.itemId);
      stopPursuit();
      return;
    }
    if (avatar.portalId && avatar.portalId !== '') {
      log('🎯 Pursuit SUCCESS: entered portal ' + avatar.portalId);
      stopPursuit();
      return;
    }

    // Phase changed away from minigame
    var phase = Phase.detect();
    if (phase !== Phase.PHASES.CAROUSEL && phase !== Phase.PHASES.PORTAL) {
      log('🎯 Pursuit ABORT: phase changed to ' + phase);
      stopPursuit();
      return;
    }

    // Find target's CURRENT position
    var target = null;
    if (_pursuitType === 'item' && room.state.floatingItems && room.state.floatingItems.$items) {
      room.state.floatingItems.$items.forEach(function(fi) {
        if (fi.id === _pursuitTargetId) target = fi;
      });
    }
    if (_pursuitType === 'portal' && room.state.portals && room.state.portals.$items) {
      room.state.portals.$items.forEach(function(p) {
        if (p.id === _pursuitTargetId) target = p;
      });
    }

    if (!target) {
      log('🎯 Pursuit LOST: target ' + _pursuitTargetId + ' gone');
      stopPursuit();
      return;
    }

    // Target claimed by someone else
    if (target.avatarId && target.avatarId !== '') {
      log('🎯 Pursuit STOLEN: ' + _pursuitTargetId + ' claimed by ' + target.avatarId);
      stopPursuit();
      return;
    }

    // Send vector toward target's current position
    sendVector(target.x, target.y);
  }


  // ════════════════════════════════════════
  // MODULE 8: NAMED COMMAND DISPATCH
  // ════════════════════════════════════════
  var BOARD_WIDTH = 8;

  function command(type, payload) {
    payload = payload || {};

    switch (type) {
      case 'equip_item':
        // {item: "MYSTIC_WATER", x: 2, y: 2}
        var equipIndex = payload.x + payload.y * BOARD_WIDTH;
        Room.send('DRAG_DROP_ITEM', {
          zone: 'board-zone',
          index: equipIndex,
          id: payload.item
        });
        log('⚔️ Equip', payload.item, 'on (' + payload.x + ',' + payload.y + ') idx=' + equipIndex);
        return true;

      case 'reposition':
        // {unit_id: "abc123", x: 2, y: 0}
        Room.send('DRAG_DROP', {
          x: payload.x,
          y: payload.y,
          id: payload.unit_id
        });
        log('📐 Reposition', payload.unit_id, '→ (' + payload.x + ',' + payload.y + ')');
        return true;

      case 'combine_items':
        // {itemA: "FOSSIL_STONE", itemB: "MYSTIC_WATER"}
        Room.send('DRAG_DROP_COMBINE', {
          itemA: payload.itemA,
          itemB: payload.itemB
        });
        log('🔨 Combine', payload.itemA, '+', payload.itemB);
        return true;

      case 'sell_unit':
        // {unit_id: "abc123"}
        Room.send('SELL_POKEMON', payload.unit_id);
        log('💰 Sell', payload.unit_id);
        return true;

      case 'move_to':
        // {targetX, targetY, targetId?, targetType?}
        if (payload.targetId) {
          startPursuit(payload.targetId, payload.targetType || 'item');
        } else {
          sendVector(payload.targetX, payload.targetY);
        }
        return true;

      case 'stop_pursuit':
        stopPursuit();
        return true;

      case 'game_control':
        // {command: "start_queue" | "ready_check" | "reset"}
        if (payload.command === 'reset') {
          Room.reset();
          log('Game control: reset');
        } else {
          log('Game control:', payload.command, '— not yet implemented');
        }
        return true;

      default:
        warn('Unknown command type:', type);
        return false;
    }
  }


  // ════════════════════════════════════════
  // BRIDGE LISTENER (postMessage from content script)
  // ════════════════════════════════════════
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data) return;

    // ── Init: receive POKEMON_DATA + playerName from content script ──
    if (event.data.type === 'PAC_API_INIT') {
      if (event.data.pokemonData) {
        _pokemonData = event.data.pokemonData;
        TypeDB.invalidate();  // Rebuild cache with new data
        log('📦 Received POKEMON_DATA from bridge (' + Object.keys(_pokemonData).length + ' entries)');
      }
      if (event.data.playerName) {
        _playerName = event.data.playerName;
        Room.clearPlayer();  // Re-identify with new name
        log('👤 Received playerName from bridge:', _playerName);
      }
      return;
    }

    // ── Config update: playerName changed mid-session ──
    if (event.data.type === 'PAC_API_CONFIG_UPDATE') {
      if (event.data.playerName !== undefined) {
        _playerName = event.data.playerName;
        Room.clearPlayer();  // Re-identify with new name
        log('👤 Player name updated:', _playerName);
      }
      return;
    }

    // ── API request from content script bridge ──
    if (event.data.type === 'PAC_API_REQUEST') {
      var req = event.data;
      var result;
      var error = null;

      try {
        switch (req.method) {
          case 'status':
            var me = Room.getMyPlayer();
            result = {
              roomFound: !!Room.get(),
              player: me ? me.name : null,
              phase: Phase.detect(),
              config: CONFIG
            };
            break;
          case 'obs':
            result = Observer.getObservation();
            break;
          case 'phase':
            result = Phase.detect();
            break;
          case 'mask':
            var me2 = Room.getMyPlayer();
            if (!me2) { result = null; }
            else { result = buildActionMask(me2, Phase.detect(), Room.get().state); }
            break;
          case 'typeDB':
            result = TypeDB.getFullDB();
            break;
          case 'getTypes':
            result = TypeDB.getTypes(req.args[0]);
            break;
          case 'exec':
            result = Executor.execute(req.args[0]);
            break;
          case 'send':
            result = Room.send(req.args[0], req.args[1]);
            break;
          case 'command':
            result = command(req.args[0], req.args[1]);
            break;
          case 'startPursuit':
            startPursuit(req.args[0], req.args[1]);
            result = true;
            break;
          case 'stopPursuit':
            stopPursuit();
            result = true;
            break;
          case 'reset':
            Room.reset();
            result = true;
            break;
          default:
            error = 'Unknown method: ' + req.method;
        }
      } catch (e) {
        error = e.message;
        warn('Bridge request failed:', req.method, e.message);
      }

      window.postMessage({
        type: 'PAC_API_RESPONSE',
        callId: req.callId,
        result: result,
        error: error
      }, '*');
      return;
    }
  });


  // ════════════════════════════════════════
  // PUBLIC API (window.__AgentIO — synchronous)
  // ════════════════════════════════════════
  window.__AgentIO = {
    status: function() {
      var me = Room.getMyPlayer();
      return {
        roomFound: !!Room.get(),
        player: me ? me.name : null,
        phase: Phase.detect(),
        config: CONFIG
      };
    },

    obs: function() { return Observer.getObservation(); },
    send: function(type, data) { return Room.send(type, data); },
    exec: function(actionIndex) { return Executor.execute(actionIndex); },
    phase: function() { return Phase.detect(); },
    mask: function() {
      var me = Room.getMyPlayer();
      if (!me) return null;
      return buildActionMask(me, Phase.detect(), Room.get().state);
    },

    command: function(type, payload) { return command(type, payload); },

    startPursuit: function(targetId, type) { startPursuit(targetId, type); },
    stopPursuit: function() { stopPursuit(); },

    config: function(key, value) {
      if (value !== undefined) CONFIG[key] = value;
      return CONFIG[key];
    },

    reset: function() {
      Room.reset();
    },

    _cleanup: function() {
      log('🧹 Full cleanup starting...');
      stopPursuit();
      Room.reset();
      window.__PACApiCore = false;
      log('🧹 Cleanup complete — ready for re-injection');
    },

    typeDB: function() { return TypeDB.getFullDB(); },
    getTypes: function(name) { return TypeDB.getTypes(name); },

    ACTION_SPACE_SIZE: ACTION_SPACE_SIZE,
    PHASES: Phase.PHASES
  };


  // ════════════════════════════════════════
  // BOOT
  // ════════════════════════════════════════
  log('Initialized! Action space:', ACTION_SPACE_SIZE);

  // Signal to content script bridge that core is ready
  window.postMessage({ type: 'PAC_API_CORE_READY' }, '*');

  log('Ready. Use window.__AgentIO.status() to check state.');

})();
