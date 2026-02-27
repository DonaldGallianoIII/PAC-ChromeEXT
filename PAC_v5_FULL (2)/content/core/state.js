/**
 * PAC Live Data Calculator - State Management
 *
 * Central state object and localStorage persistence helpers.
 */
(function() {
  'use strict';

  // Runtime state variables (not persisted)
  PAC.State.extractionInterval = null;
  PAC.State.isMinimized = false;
  PAC.State.lastPoolData = null;
  PAC.State.currentPollSpeed = 11;
  PAC.State.liveTrackingActive = false;
  PAC.State.isConnected = false;

  // Optimization: Dirty check variables for DOM rendering
  PAC.State.lastCurrentHash = '';
  PAC.State.lastTeamFingerprint = '';

  // Main application state
  PAC.State.state = {
    level: 7,
    targetRarity: 'rare',
    targetEvo: 'threeStar',
    refreshes: 10,
    copiesTaken: 0,
    evolutionGoal: 'firstEvo',
    copiesOwned: 0,
    dittoEnabled: false,  // Disabled until stage 6
    targetIsWild: false,
    pveRoundEnabled: false,
    currentStage: null, // Auto-tracked from game
    wildUnitsOwned: 0,
    wildUnitsTaken: { common: 0, uncommon: 0, rare: 0, epic: 0, ultra: 0 },
    // Evolution family tracking (v2.5.0)
    targetPokemon: '',           // Base form being tracked
    targetPokemonDisplayName: '', // What user searched (may be evolved form)
    evolutionFamily: [],          // Cached family array
    round5Enabled: false,
    round5AddPicks: 8,
    round8Enabled: false,
    round8AddPicks: 8,
    round11Enabled: false,
    round11AddPicks: 8,
    portalRegionals: {
      common: { twoStar: 0, threeStar: 0 },
      uncommon: { twoStar: 0, threeStar: 0 },
      rare: { twoStar: 0, threeStar: 0 },
      epic: { twoStar: 0, threeStar: 0 },
      ultra: { twoStar: 0, threeStar: 0 }
    },
    wildAddPicks: { uncommon: 0, rare: 0, epic: 0 },
    wildRegionals: {
      common: { twoStar: 0, threeStar: 0 },
      uncommon: { twoStar: 0, threeStar: 0 },
      rare: { twoStar: 0, threeStar: 0 },
      epic: { twoStar: 0, threeStar: 0 },
      ultra: { twoStar: 0, threeStar: 0 }
    },
    // Live extraction
    autoScout: true,    // Always on — rule-based, not toggleable
    targetPokemonRarity: null, // Store the rarity for validation
    confidencePercent: 75, // Adjustable confidence threshold
    playerName: '', // Player's in-game name for flash alerts
    // Team tracking (v2.8.0)
    teamTargets: [], // Array of {id, pokemon, rarity, evo, isWild, enabled, copiesTaken}
    teamPanelExpanded: false,
    currentPanelExpanded: false,
    // Portal/Regional detection (v3.0.2)
    activeRegionalPokemon: [],  // Resolved Pokemon names in current region
    activeAdditionalPokemon: [], // Resolved Pokemon from add picks
    regionalSlots: [],  // [{rarity, types, matches: [...], resolved: null|'NAME'}]
    additionalSlots: [], // Same structure
    portalDetectionDone: false,   // Whether we've scanned this game
    // Refresh blocker (v3.0.2 personal)
    refreshBlockerEnabled: false,  // Controlled by experimental mode
    refreshBlockerVisible: false, // Whether blocker is currently showing
    refreshBlockerTrigger: null,  // What Pokemon triggered the blocker
    refreshBlockerDismissed: null, // Pokemon that was dismissed (don't show again until new target)
    // Detection listener flags
    regionalListenerAttached: false,
    additionalListenerAttached: false,
    // Experimental features
    experimentalMode: false,      // Unlocked with ALT+SHIFT+Y
    experimentalPending: false,   // Waiting for key combo
    monoTypeEnabled: false,       // Mono-type mode active
    monoTypeSelected: null,       // Selected type for mono-type mode
    lastShopData: null,           // Last known shop data for mono-type blocking

    // Random Draft challenge state
    randomDraftEnabled: false,    // Random draft mode active
    randomDraftChosenSlot: null,  // Index of the chosen slot (0-5)
    randomDraftSpinning: false,   // Whether spin animation is running
    randomDraftLastShop: null,    // Track shop state for purchase detection

    // Copycat challenge state
    copycatEnabled: false,        // Copycat mode active

    // MLG mode state
    mlgModeEnabled: false,        // 420 MLG mode active
    mlgLastBoardSnapshot: null,   // Track board for evolution detection

    // Fishing state
    fishingRod: 'none',           // none, old, good, super
    fishingMantyke: false,        // Mantyke/Mantine on board (+33% Remoraid) - AUTO-DETECTED
    fishingOctilleryLocked: false, // Octillery on board = no more Remoraid fishing - AUTO-DETECTED
    fishingRemoraidsOwned: 0,     // Count of Remoraid on board/bench - AUTO-DETECTED
    // Shop History / Roll Luck Tracker (v3.2.0)
    shopHistoryPanelExpanded: false,
    shopHistoryByPlayer: {},      // { playerName: { rollsByLevel: { level: { rollCount, pokemonSeen } }, currentLevel, lastSnapshot } }
    shopTrackingEnabled: true,    // Whether to track shops
    analyticsTab: 'live',         // 'live' or 'analytics'
    // Shop slot mapping for highlighting (v3.2.1)
    previousPlayerShop: null,     // Previous shop array for diff
    shopSlotMapping: [],          // Maps DOM slot index to pokemon name (null if empty)
    // Customization & Accessibility (v3.1.2)
    settingsPanelExpanded: false,
    customSettings: {
      backgroundColor: '#dce8ec',
      textColor: '#000000',
      accentColor: '#00bcd4',
      targetFlashColor: '#2bff00',
      teamFlashColor: '#0033ff',
      flashSpeed: 250,
      fontSize: 12,
      disableFlash: false
    }
  };

  // Shorthand reference to state for convenience
  var state = PAC.State.state;

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCALSTORAGE PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  const ROLL_HISTORY_KEY = 'pac_roll_history';
  var _saveRollTimer = null;

  function _doSaveRollHistory() {
    try {
      const data = {
        version: '3.2.1',
        timestamp: Date.now(),
        shopHistoryByPlayer: state.shopHistoryByPlayer
      };
      localStorage.setItem(ROLL_HISTORY_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('PAC: Failed to save roll history to localStorage', e);
    }
  }

  PAC.State.saveRollHistory = function() {
    if (_saveRollTimer) return;
    _saveRollTimer = setTimeout(function() {
      _saveRollTimer = null;
      _doSaveRollHistory();
    }, 3000);
  };

  window.addEventListener('beforeunload', function() {
    if (_saveRollTimer) {
      clearTimeout(_saveRollTimer);
      _saveRollTimer = null;
      _doSaveRollHistory();
    }
  });

  PAC.State.loadRollHistory = function() {
    try {
      const raw = localStorage.getItem(ROLL_HISTORY_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (data && data.shopHistoryByPlayer) {
        state.shopHistoryByPlayer = data.shopHistoryByPlayer;
        if (PAC.DEBUG_MODE) console.log('PAC: Loaded roll history from localStorage');
      }
    } catch (e) {
      console.warn('PAC: Failed to load roll history from localStorage', e);
    }
  };

  PAC.State.clearRollHistory = function() {
    if (_saveRollTimer) { clearTimeout(_saveRollTimer); _saveRollTimer = null; }
    state.shopHistoryByPlayer = {};
    try {
      localStorage.removeItem(ROLL_HISTORY_KEY);
    } catch (e) {
      console.warn('PAC: Failed to clear roll history from localStorage', e);
    }
  };

  PAC.State.savePlayerName = function() {
    try {
      if (state.playerName) {
        localStorage.setItem('pac_playerName', state.playerName);
      }
    } catch (e) {
      console.warn('PAC: Failed to save player name', e);
    }
  };

  PAC.State.loadPlayerName = function() {
    try {
      const saved = localStorage.getItem('pac_playerName');
      if (saved) {
        state.playerName = saved;
        return saved;
      }
    } catch (e) {
      console.warn('PAC: Failed to load player name', e);
    }
    return null;
  };

  PAC.State.saveTeamTargets = function() {
    try {
      localStorage.setItem('pac_teamTargets', JSON.stringify(state.teamTargets));
    } catch (e) {
      console.warn('PAC: Failed to save team targets', e);
    }
  };

  PAC.State.loadTeamTargets = function() {
    try {
      const saved = localStorage.getItem('pac_teamTargets');
      if (saved) {
        state.teamTargets = JSON.parse(saved);

        // Migration: Fix any targets with incorrect evo values or missing wild status
        let needsSave = false;
        state.teamTargets.forEach(target => {
          // Fix evo values
          const baseForm = PAC.Utils.getBaseForm(target.pokemon);
          const evolutionChain = PAC.Data.EVOLUTION_CHAINS[baseForm];
          if (evolutionChain && evolutionChain[0] && evolutionChain[0].maxStars !== undefined) {
            const correctEvo = evolutionChain[0].maxStars === 3 ? 'threeStar' : 'twoStar';
            if (target.evo !== correctEvo) {
              if (PAC.DEBUG_MODE) console.log('Migrating ' + target.pokemon + ': ' + target.evo + ' -> ' + correctEvo);
              target.evo = correctEvo;
              needsSave = true;
            }
          }

          // Fix wild status
          const shouldBeWild = PAC.Utils.isWildPokemon(target.pokemon);
          if (target.isWild !== shouldBeWild) {
            if (PAC.DEBUG_MODE) console.log('Migrating ' + target.pokemon + ': isWild ' + target.isWild + ' -> ' + shouldBeWild);
            target.isWild = shouldBeWild;
            needsSave = true;
          }
        });

        // Save if any migrations were applied
        if (needsSave) {
          PAC.State.saveTeamTargets();
          if (PAC.DEBUG_MODE) console.log('Saved migrated team targets');
        }

        return state.teamTargets;
      }
    } catch (e) {
      console.warn('PAC: Failed to load team targets', e);
    }
    return [];
  };

  if (PAC.DEBUG_MODE) console.log('PAC Core: State management loaded');
})();
