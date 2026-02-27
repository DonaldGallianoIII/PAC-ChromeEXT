/**
 * PAC v5 — Detection Scanner
 *
 * Attaches mouseenter listeners on portal icons in the game DOM.
 * When user hovers, waits 150ms for tooltip to render, then reads
 * .game-regional-pokemons / .game-additional-pokemons panels.
 *
 * Updates state.activeRegionalPokemon, state.activeAdditionalPokemon,
 * state.portalRegionals, state.wildRegionals, state.round5/8/11Enabled,
 * state.round5/8/11AddPicks, state.wildAddPicks.
 *
 * Polls every 2s to attach listeners (icons may not exist on first load).
 */
(function() {
  'use strict';

  var Utils = PAC.Utils;
  var Data = PAC.Data;
  var state = PAC.State.state;
  var Events = PAC.UI.Events;
  var lastKnownStage = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVER POPUP — asks user to pick when multiple matches found
  // ═══════════════════════════════════════════════════════════════════════════

  var _resolverEl = null;

  function _showResolver() {
    // Gather all unresolved slots from both regional and additional
    var unresolved = [];

    (state.regionalSlots || []).forEach(function(slot, idx) {
      if (!slot.resolved && slot.matches.length > 1) {
        unresolved.push({ slot: slot, idx: idx, type: 'regional' });
      }
    });

    (state.additionalSlots || []).forEach(function(slot, idx) {
      if (!slot.resolved && slot.matches.length > 1) {
        unresolved.push({ slot: slot, idx: idx, type: 'additional' });
      }
    });

    // Nothing to resolve — dismiss if open
    if (unresolved.length === 0) {
      _dismissResolver();
      return;
    }

    // Build or reuse container
    if (!_resolverEl) {
      _resolverEl = document.createElement('div');
      _resolverEl.className = 'pac-resolver';
      document.body.appendChild(_resolverEl);
    }

    var html = '<div class="pac-resolver-title">🎯 Identify Pokemon</div>';

    var rarityColors = {
      common: '#a0a0a0', uncommon: '#3bc95e', rare: '#41bfcc',
      epic: '#927fff', ultra: '#ef4444'
    };

    unresolved.forEach(function(item) {
      var slot = item.slot;
      var rColor = rarityColors[slot.rarity] || '#fff';
      var label = item.type === 'regional' ? '🌍 Regional' : '🎯 Additional';
      label += ' — <span class="pac-resolver-rarity" style="color:' + rColor + '">' + slot.rarity + '</span>';
      label += ' [' + slot.types.join(', ') + ']';

      html += '<div class="pac-resolver-slot">';
      html += '<div class="pac-resolver-label">' + label + '</div>';
      html += '<div class="pac-resolver-btns">';

      slot.matches.forEach(function(name) {
        html += '<button class="pac-resolver-btn" data-type="' + item.type + '" data-idx="' + item.idx + '" data-name="' + name + '">';
        html += name;
        html += '</button>';
      });

      html += '</div></div>';
    });

    _resolverEl.innerHTML = html;

    // Delegated click handler
    _resolverEl.onclick = function(e) {
      var btn = e.target.closest('.pac-resolver-btn');
      if (!btn) return;

      var slotType = btn.dataset.type;
      var idx = parseInt(btn.dataset.idx, 10);
      var name = btn.dataset.name;

      PAC.UI.Panels.Detection.resolveSlot(slotType, idx, name);

      if (PAC.DEBUG_MODE) console.log('✅ PAC Detection: Resolved ' + slotType + ' slot ' + idx + ' → ' + name);

      // Re-render (may have more to resolve, or dismiss)
      _showResolver();
    };
  }

  function _dismissResolver() {
    if (_resolverEl && _resolverEl.parentNode) {
      _resolverEl.parentNode.removeChild(_resolverEl);
    }
    _resolverEl = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLOT EXTRACTION — reads tooltip DOM into structured slot objects
  // ═══════════════════════════════════════════════════════════════════════════

  function _slotKey(rarity, types) {
    return rarity + ':' + types.slice().sort().join(',');
  }

  /**
   * Extract structured slots from a panel element.
   * Returns [{rarity, types, matches, resolved}]
   */
  function _extractSlotsFromPanel(panelDiv, isRegional) {
    var portraits = panelDiv.querySelectorAll('.game-pokemon-portrait');
    var slots = [];

    portraits.forEach(function(p) {
      var bgColor = p.style.backgroundColor;
      var rarity = Data.RARITY_COLORS[bgColor] || 'unknown';
      var typeIcons = p.querySelectorAll('.synergy-icon');
      var types = Array.from(typeIcons).map(function(icon) { return icon.alt.toLowerCase(); });

      // Find matching Pokemon
      var matches = Utils.identifyPokemonByTypesAndRarity(rarity, types, isRegional);

      if (matches.length > 0) {
        var resolved = null;

        if (matches.length === 1) {
          // Single match — auto-resolve
          resolved = matches[0];
        } else {
          // Multiple matches — find which are TRUE base forms
          var baseForms = matches.filter(function(name) {
            return Utils.getBaseForm(name) === name;
          });
          var evolvedForms = matches.filter(function(name) {
            return Utils.getBaseForm(name) !== name;
          });

          if (baseForms.length === 1 && evolvedForms.length > 0) {
            // Clear winner — only one base form
            resolved = baseForms[0];
            if (PAC.DEBUG_MODE) console.log('🔄 Auto-resolved to base form:', resolved);
          }
          // Multiple base forms = ambiguous, leave unresolved
        }

        slots.push({
          rarity: rarity,
          types: types,
          matches: matches,
          resolved: resolved
        });
      }
    });

    return slots;
  }

  /**
   * Get resolved Pokemon names from slot array.
   */
  function _getResolvedNames(slots) {
    if (!slots) return [];
    return slots
      .filter(function(s) { return s.resolved; })
      .map(function(s) { return s.resolved; });
  }

  /**
   * Merge new slots with existing, preserving already-resolved entries.
   * If replaceAll is true (regionals), replace entirely with fresh scan.
   */
  function _mergeSlots(existing, newSlots, replaceAll) {
    if (!existing || existing.length === 0) return newSlots;
    if (!newSlots || newSlots.length === 0) return existing;

    if (replaceAll) {
      // Carry over resolved values from existing slots that match new ones
      var existingByKey = {};
      existing.forEach(function(s) {
        if (s.resolved) {
          existingByKey[_slotKey(s.rarity, s.types)] = s.resolved;
        }
      });

      newSlots.forEach(function(slot) {
        var key = _slotKey(slot.rarity, slot.types);
        if (!slot.resolved && existingByKey[key]) {
          // Verify the previously resolved name is still a valid match
          if (slot.matches.indexOf(existingByKey[key]) !== -1) {
            slot.resolved = existingByKey[key];
          }
        }
      });

      return newSlots;
    }

    var existingKeys = {};
    existing.forEach(function(s) { existingKeys[_slotKey(s.rarity, s.types)] = true; });

    newSlots.forEach(function(slot) {
      var key = _slotKey(slot.rarity, slot.types);
      if (!existingKeys[key]) {
        existing.push(slot);
        existingKeys[key] = true;
      }
    });

    return existing;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC DETECTION → POOL COUNTS (ported from v3.2.1 syncDetectionToPools)
  // ═══════════════════════════════════════════════════════════════════════════

  function _syncDetectionToPools() {
    var rarities = ['common', 'uncommon', 'rare', 'epic', 'ultra'];

    // Classify each resolved Pokemon: wild vs normal, 2★ vs 3★
    var detectedRegionals = { normal: {}, wild: {} };
    var detectedAdditional = { normal: {}, wild: {} };

    rarities.forEach(function(r) {
      detectedRegionals.normal[r] = { twoStar: 0, threeStar: 0 };
      detectedRegionals.wild[r] = { twoStar: 0, threeStar: 0 };
      detectedAdditional.normal[r] = { twoStar: 0, threeStar: 0 };
      detectedAdditional.wild[r] = { twoStar: 0, threeStar: 0 };
    });

    // Process regional slots
    (state.regionalSlots || []).forEach(function(slot) {
      if (!slot.resolved) return;
      var data = Data.POKEMON_DATA[slot.resolved];
      if (!data) return;
      var rarity = data.rarity;
      if (rarities.indexOf(rarity) === -1) return;

      var isWild = data.types && data.types.indexOf('wild') >= 0;
      var baseForm = Utils.getBaseForm(slot.resolved);
      var chain = Data.EVOLUTION_CHAINS[baseForm];
      var maxStars = (chain && chain[0]) ? chain[0].maxStars : 3;
      var starType = maxStars === 2 ? 'twoStar' : 'threeStar';

      if (isWild) {
        detectedRegionals.wild[rarity][starType]++;
      } else {
        detectedRegionals.normal[rarity][starType]++;
      }
    });

    // Process additional slots
    (state.additionalSlots || []).forEach(function(slot) {
      if (!slot.resolved) return;
      var data = Data.POKEMON_DATA[slot.resolved];
      if (!data) return;
      var rarity = data.rarity;
      if (rarities.indexOf(rarity) === -1) return;

      var isWild = data.types && data.types.indexOf('wild') >= 0;
      var baseForm = Utils.getBaseForm(slot.resolved);
      var chain = Data.EVOLUTION_CHAINS[baseForm];
      var maxStars = (chain && chain[0]) ? chain[0].maxStars : 3;
      var starType = maxStars === 2 ? 'twoStar' : 'threeStar';

      if (isWild) {
        detectedAdditional.wild[rarity][starType]++;
      } else {
        detectedAdditional.normal[rarity][starType]++;
      }
    });

    // ── Update state ─────────────────────────────────────────
    // Regional → portalRegionals (normal) + wildRegionals (wild)
    rarities.forEach(function(r) {
      state.portalRegionals[r].twoStar = detectedRegionals.normal[r].twoStar;
      state.portalRegionals[r].threeStar = detectedRegionals.normal[r].threeStar;
      state.wildRegionals[r].twoStar = detectedRegionals.wild[r].twoStar;
      state.wildRegionals[r].threeStar = detectedRegionals.wild[r].threeStar;
    });

    // Additional → round flags + counts (normal) + wildAddPicks (wild)
    var normalAddCounts = {
      uncommon: detectedAdditional.normal.uncommon.twoStar + detectedAdditional.normal.uncommon.threeStar,
      rare: detectedAdditional.normal.rare.twoStar + detectedAdditional.normal.rare.threeStar,
      epic: detectedAdditional.normal.epic.twoStar + detectedAdditional.normal.epic.threeStar
    };

    if (normalAddCounts.uncommon > 0) {
      state.round5Enabled = true;
      state.round5AddPicks = normalAddCounts.uncommon;
    }
    if (normalAddCounts.rare > 0) {
      state.round8Enabled = true;
      state.round8AddPicks = normalAddCounts.rare;
    }
    if (normalAddCounts.epic > 0) {
      state.round11Enabled = true;
      state.round11AddPicks = normalAddCounts.epic;
    }

    // Wild add picks
    state.wildAddPicks.uncommon = detectedAdditional.wild.uncommon.twoStar + detectedAdditional.wild.uncommon.threeStar;
    state.wildAddPicks.rare = detectedAdditional.wild.rare.twoStar + detectedAdditional.wild.rare.threeStar;
    state.wildAddPicks.epic = detectedAdditional.wild.epic.twoStar + detectedAdditional.wild.epic.threeStar;

    if (PAC.DEBUG_MODE) {
      console.log('🔄 Synced detection to pools:', {
        portalRegionals: state.portalRegionals,
        wildRegionals: state.wildRegionals,
        round5: { enabled: state.round5Enabled, picks: state.round5AddPicks },
        round8: { enabled: state.round8Enabled, picks: state.round8AddPicks },
        round11: { enabled: state.round11Enabled, picks: state.round11AddPicks },
        wildAddPicks: state.wildAddPicks
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTENER ATTACHMENT — polls every 2s to find portal icons in game DOM
  // ═══════════════════════════════════════════════════════════════════════════

  function _attachListeners() {

    // Regional icon
    if (!state.regionalListenerAttached) {
      var regionalIcon = document.querySelector('img[data-tooltip-id="game-regional-pokemons"]');
      if (regionalIcon) {
        regionalIcon.addEventListener('mouseenter', function() {
          setTimeout(function() {
            var div = document.querySelector('.game-regional-pokemons');
            if (div) {
              var newSlots = _extractSlotsFromPanel(div, true);
              if (newSlots.length > 0) {
                state.regionalSlots = _mergeSlots(state.regionalSlots, newSlots, true);
                state.activeRegionalPokemon = _getResolvedNames(state.regionalSlots);
                if (PAC.DEBUG_MODE) console.log('🌍 Regional detected:', state.activeRegionalPokemon);
                _syncDetectionToPools();
                _showResolver();
              }
            }
          }, 150);
        });
        state.regionalListenerAttached = true;
        if (PAC.DEBUG_MODE) console.log('👁️ Regional listener attached');
      }
    }

    // Additional icon
    if (!state.additionalListenerAttached) {
      var additionalIcon = document.querySelector('img[data-tooltip-id="game-additional-pokemons"]');
      if (additionalIcon) {
        additionalIcon.addEventListener('mouseenter', function() {
          setTimeout(function() {
            var div = document.querySelector('.game-additional-pokemons');
            if (div) {
              var newSlots = _extractSlotsFromPanel(div, false);
              if (newSlots.length > 0) {
                state.additionalSlots = _mergeSlots(state.additionalSlots, newSlots);
                state.activeAdditionalPokemon = _getResolvedNames(state.additionalSlots);
                if (PAC.DEBUG_MODE) console.log('🎯 Additional detected:', state.activeAdditionalPokemon);
                _syncDetectionToPools();
                _showResolver();
              }
            }
          }, 150);
        });
        state.additionalListenerAttached = true;
        if (PAC.DEBUG_MODE) console.log('👁️ Additional listener attached');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW GAME DETECTION — stage drops from mid-game back to start
  // ═══════════════════════════════════════════════════════════════════════════

  function _checkForNewGame() {
    var stage = state.currentStage;
    if (stage && lastKnownStage && lastKnownStage > 5 && stage <= 2) {
      if (PAC.DEBUG_MODE) console.log('🆕 New game detected (stage ' + lastKnownStage + ' → ' + stage + ')');
      _resetDetection();
    }
    lastKnownStage = stage;
  }

  function _resetDetection() {
    state.regionalSlots = [];
    state.additionalSlots = [];
    state.activeRegionalPokemon = [];
    state.activeAdditionalPokemon = [];
    state.regionalListenerAttached = false;
    state.additionalListenerAttached = false;
    state.round5Enabled = false;
    state.round8Enabled = false;
    state.round11Enabled = false;

    var rarities = ['common', 'uncommon', 'rare', 'epic', 'ultra'];
    rarities.forEach(function(r) {
      if (state.portalRegionals[r]) {
        state.portalRegionals[r].twoStar = 0;
        state.portalRegionals[r].threeStar = 0;
      }
      if (state.wildRegionals[r]) {
        state.wildRegionals[r].twoStar = 0;
        state.wildRegionals[r].threeStar = 0;
      }
    });
    state.wildAddPicks = { uncommon: 0, rare: 0, epic: 0 };

    _dismissResolver();
    lastKnownStage = null;
    if (PAC.DEBUG_MODE) console.log('🔄 Detection reset');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POLL LOOP — 2s interval to attach listeners + detect new games
  // ═══════════════════════════════════════════════════════════════════════════

  function _pollLoop() {
    _attachListeners();
    _checkForNewGame();
  }

  var _pollIntervalId = setInterval(_pollLoop, 2000);
  _pollLoop();

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Panels.Detection = {
    resolveSlot: function(slotType, index, pokemonName) {
      var slots = slotType === 'regional' ? state.regionalSlots : state.additionalSlots;
      if (slots[index]) {
        slots[index].resolved = pokemonName;
        if (slotType === 'regional') {
          state.activeRegionalPokemon = _getResolvedNames(state.regionalSlots);
        } else {
          state.activeAdditionalPokemon = _getResolvedNames(state.additionalSlots);
        }
        _syncDetectionToPools();
      }
    },

    resetDetection: _resetDetection,
    syncDetectionToPools: _syncDetectionToPools
  };

  // Reset on new game event
  Events.on('extraction:newGame', _resetDetection);

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Detection scanner loaded (v3.2.1 port)');
})();
