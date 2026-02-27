/**
 * PAC v5 — Team Panel
 *
 * Multi-target tracker with per-target probability,
 * combined probability, and challenge mode sub-panels.
 *
 * Sub-sections (collapsible):
 * - Team Target List (always visible)
 * - Combined Probability
 * - Mono-Type Mode
 * - Random Draft
 * - Copycat
 * - MLG Mode
 */
(function() {
  'use strict';

  var Data = PAC.Data;
  var Utils = PAC.Utils;
  var state = PAC.State.state;

  var els = {};
  var autocomplete = null;
  var lastTeamFingerprint = '';

  PAC.UI.Sections.team = {
    render: function(body) {
      body.innerHTML =
        /* ── Clear All Targets ─────────────────────────── */
        '<div style="display: flex; justify-content: flex-end; margin-bottom: var(--pac-sp-sm);">' +
          '<button class="pac-btn pac-btn--danger" id="pac-team-clearAll" style="font-size: var(--pac-font-2xs); padding: var(--pac-sp-2xs) var(--pac-sp-sm);">🗑 Clear All Targets</button>' +
        '</div>' +

        /* ── Mono-Type Mode ─────────────────────────── */
        '<div class="pac-collapsible" id="pac-team-monoSection">' +
          '<button class="pac-collapsible__trigger">' +
            '<span>🔮 Mono-Type Mode</span>' +
            '<span class="pac-collapsible__arrow">▶</span>' +
          '</button>' +
          '<div class="pac-collapsible__body">' +
            '<div id="pac-team-monoStatus" style="font-size: var(--pac-font-xs); color: var(--pac-text-muted); margin-bottom: var(--pac-sp-sm);">Select a type to block others in shop</div>' +
            '<div id="pac-team-monoGrid" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--pac-sp-2xs);"></div>' +
            '<div style="margin-top: var(--pac-sp-sm); display: flex; gap: var(--pac-sp-xs);">' +
              '<button class="pac-btn pac-btn--ghost" id="pac-team-monoSpin" style="flex: 1;">🎰 Spin Wheel</button>' +
              '<button class="pac-btn pac-btn--danger" id="pac-team-monoClear" style="flex: 1;">Clear</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ── Random Draft ───────────────────────────── */
        '<div class="pac-collapsible" id="pac-team-draftSection">' +
          '<button class="pac-collapsible__trigger">' +
            '<span>🎲 Random Draft</span>' +
            '<span class="pac-collapsible__arrow">▶</span>' +
          '</button>' +
          '<div class="pac-collapsible__body">' +
            '<div style="font-size: var(--pac-font-xs); color: var(--pac-text-muted); margin-bottom: var(--pac-sp-sm);">Randomly picks one shop slot — you MUST buy it!</div>' +
            '<div style="display: flex; gap: var(--pac-sp-xs);">' +
              '<button class="pac-btn pac-btn--primary" id="pac-team-draftToggle" style="flex: 1;">Start Draft</button>' +
            '</div>' +
            '<div id="pac-team-draftStatus" style="font-size: var(--pac-font-xs); color: var(--pac-text-secondary); margin-top: var(--pac-sp-sm);"></div>' +
          '</div>' +
        '</div>' +

        /* ── Copycat ────────────────────────────────── */
        '<div class="pac-collapsible" id="pac-team-copycatSection">' +
          '<button class="pac-collapsible__trigger">' +
            '<span>🐱 Copycat</span>' +
            '<span class="pac-collapsible__arrow">▶</span>' +
          '</button>' +
          '<div class="pac-collapsible__body">' +
            '<div style="font-size: var(--pac-font-xs); color: var(--pac-text-muted); margin-bottom: var(--pac-sp-sm);">Copy the strongest opponent\'s team — only buy their Pokemon!</div>' +
            '<div style="display: flex; gap: var(--pac-sp-xs);">' +
              '<button class="pac-btn pac-btn--primary" id="pac-team-copycatToggle" style="flex: 1;">Start Copycat</button>' +
            '</div>' +
            '<div id="pac-team-copycatStatus" style="font-size: var(--pac-font-xs); color: var(--pac-text-secondary); margin-top: var(--pac-sp-sm);"></div>' +
          '</div>' +
        '</div>' +

        /* ── MLG Mode ───────────────────────────────── */
        '<div class="pac-collapsible" id="pac-team-mlgSection">' +
          '<button class="pac-collapsible__trigger">' +
            '<span>🔥 MLG Mode</span>' +
            '<span class="pac-collapsible__arrow">▶</span>' +
          '</button>' +
          '<div class="pac-collapsible__body">' +
            '<div style="font-size: var(--pac-font-xs); color: var(--pac-text-muted); margin-bottom: var(--pac-sp-sm);">360 NO SCOPE effects on evolution 🎺💀</div>' +
            '<div style="display: flex; gap: var(--pac-sp-xs);">' +
              '<button class="pac-btn pac-btn--primary" id="pac-team-mlgToggle" style="flex: 1;">Activate MLG</button>' +
            '</div>' +
            '<div id="pac-team-mlgStatus" style="font-size: var(--pac-font-xs); color: var(--pac-text-secondary); margin-top: var(--pac-sp-sm);"></div>' +
          '</div>' +
        '</div>';

      // Cache refs (modes only)
      els.monoGrid = body.querySelector('#pac-team-monoGrid');
      els.monoStatus = body.querySelector('#pac-team-monoStatus');
      els.monoSpin = body.querySelector('#pac-team-monoSpin');
      els.monoClear = body.querySelector('#pac-team-monoClear');
      els.clearAll = body.querySelector('#pac-team-clearAll');
      els.draftToggle = body.querySelector('#pac-team-draftToggle');
      els.draftStatus = body.querySelector('#pac-team-draftStatus');
      els.copycatToggle = body.querySelector('#pac-team-copycatToggle');
      els.copycatStatus = body.querySelector('#pac-team-copycatStatus');
      els.mlgToggle = body.querySelector('#pac-team-mlgToggle');
      els.mlgStatus = body.querySelector('#pac-team-mlgStatus');

      // Collapsible toggles
      body.querySelectorAll('.pac-collapsible__trigger').forEach(function(trigger) {
        trigger.addEventListener('click', function() {
          trigger.closest('.pac-collapsible').classList.toggle('pac-collapsible--open');
        });
      });

      // Mono-type grid
      _buildMonoTypeGrid();

      // Mono controls
      els.monoSpin.addEventListener('click', _spinMonoWheel);
      els.monoClear.addEventListener('click', _clearMonoType);

      // Clear all targets
      els.clearAll.addEventListener('click', _clearAllTargets);

      // Challenge mode toggles
      els.draftToggle.addEventListener('click', _toggleDraft);
      els.copycatToggle.addEventListener('click', _toggleCopycat);
      els.mlgToggle.addEventListener('click', _toggleMLG);

      // Load saved team targets
      PAC.State.loadTeamTargets();

      // Listen for events that should trigger recalculation
      PAC.UI.Events.on('state:targetChanged', _updateDisplay);
      PAC.UI.Events.on('state:poolChanged', _updateDisplay);
      PAC.UI.Events.on('state:wildChanged', _updateDisplay);
      PAC.UI.Events.on('extraction:updated', _updateDisplay);
      PAC.UI.Events.on('state:confidenceChanged', _updateDisplay);

      // Initial render
      _updateDisplay();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM TARGET MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function _addTeamTarget(pokemonName) {
    var normalizedName = pokemonName.toUpperCase();

    // Check duplicate
    if (state.teamTargets.some(function(t) { return t.pokemon === normalizedName; })) {
      PAC.UI.Components.Notification.show('Already in team!', 'warning');
      return;
    }

    // Validate
    var pokemonData = Data.POKEMON_DATA[normalizedName];
    if (!pokemonData) {
      PAC.UI.Components.Notification.show('Pokemon not found!', 'error');
      return;
    }

    var rarity = pokemonData.rarity;
    var baseForm = Utils.getBaseForm(normalizedName);
    var evolutionChain = Data.EVOLUTION_CHAINS[baseForm];
    var evo = 'twoStar';
    if (evolutionChain && evolutionChain[0] && evolutionChain[0].maxStars === 3) {
      evo = 'threeStar';
    }

    var target = {
      id: Date.now() + Math.random(),
      pokemon: normalizedName,
      displayName: pokemonName,
      rarity: rarity,
      evo: evo,
      isWild: Utils.isWildPokemon(normalizedName),
      enabled: true,
      copiesTaken: 0
    };

    state.teamTargets.push(target);
    PAC.State.saveTeamTargets();
    _updateDisplay();
    PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
    PAC.UI.Components.Notification.show(pokemonName + ' added to team!', 'success');
  }

  function _removeTeamTarget(id) {
    state.teamTargets = state.teamTargets.filter(function(t) { return t.id !== id; });
    PAC.State.saveTeamTargets();
    _updateDisplay();
    PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
  }

  function _toggleTeamTarget(id) {
    var target = state.teamTargets.find(function(t) { return t.id === id; });
    if (target) {
      target.enabled = !target.enabled;
      PAC.State.saveTeamTargets();
      _updateDisplay();
      PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
    }
  }

  function _toggleTeamWild(id) {
    var target = state.teamTargets.find(function(t) { return t.id === id; });
    if (target) {
      target.isWild = !target.isWild;
      PAC.State.saveTeamTargets();
      lastTeamFingerprint = '';
      _updateDisplay();
    }
  }

  function _setActiveTarget(id) {
    var target = state.teamTargets.find(function(t) { return t.id === id; });
    if (!target) return;

    // Push to main state
    state.targetPokemon = target.pokemon;
    state.targetPokemonDisplayName = target.displayName;
    state.targetRarity = target.rarity;
    state.targetEvo = target.evo;
    state.targetIsWild = target.isWild;
    state.copiesTaken = target.copiesTaken;

    // Notify other panels
    PAC.UI.Events.emit('state:targetChanged', {
      level: state.level,
      rarity: state.targetRarity,
      evo: state.targetEvo
    });
    PAC.UI.Events.emit('state:pokemonSelected', {
      name: target.displayName,
      baseForm: target.pokemon,
      rarity: target.rarity,
      isWild: target.isWild
    });

    _updateDisplay();
    PAC.UI.Components.Notification.show(target.displayName + ' set as active target', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM STATS CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  function _calculateTeamStats() {
    var results = [];
    var combinedMissProb = 1.0;
    var lastPoolData = PAC.State.lastPoolData;

    var playerBoard = (lastPoolData && lastPoolData.playerBoards && lastPoolData.playerBoards[state.playerName]) ? lastPoolData.playerBoards[state.playerName] : [];
    var playerBench = (lastPoolData && lastPoolData.playerBenches && lastPoolData.playerBenches[state.playerName]) ? lastPoolData.playerBenches[state.playerName] : [];
    var playerUnits = playerBoard.concat(playerBench);

    for (var i = 0; i < state.teamTargets.length; i++) {
      var target = state.teamTargets[i];

      if (!target.enabled) {
        results.push({ target: target, perRefresh: 0, expected: Infinity, disabled: true });
        continue;
      }

      if (!Data.POOL_RARITIES.includes(target.rarity)) {
        results.push({ target: target, perRefresh: 0, expected: Infinity, notInPool: true });
        continue;
      }

      // Availability check
      var availability = Utils.checkPokemonAvailability(target.pokemon, state.activeRegionalPokemon, state.activeAdditionalPokemon);
      if (!availability.available) {
        results.push({ target: target, perRefresh: 0, expected: Infinity, notInPool: true, availabilityReason: availability.reason });
        continue;
      }

      var baseForm = Utils.getBaseForm(target.pokemon);
      var family = Utils.getEvolutionFamily(baseForm);
      var evolutionChain = Data.EVOLUTION_CHAINS[baseForm];
      var maxStars = (evolutionChain && evolutionChain[0] && evolutionChain[0].maxStars) ? evolutionChain[0].maxStars : 3;
      var copiesNeeded = maxStars === 2 ? 3 : 9;

      // Copies taken from live data (family aggregation)
      var copiesTaken = 0;
      if (lastPoolData && lastPoolData.pokemonCounts) {
        family.forEach(function(formName) {
          var formCount = lastPoolData.pokemonCounts[formName] || 0;
          if (formCount > 0) {
            copiesTaken += formCount * Utils.getEvolutionCost(formName);
          }
        });
      }

      // Copies owned (star-weighted)
      var copiesOwned = 0;
      if (state.playerName && playerUnits.length > 0) {
        playerUnits.forEach(function(unit) {
          if (unit.name && family.includes(unit.name.toUpperCase())) {
            copiesOwned += unit.stars === 3 ? 9 : unit.stars === 2 ? 3 : 1;
          }
        });
      }

      var isMaxed = copiesOwned >= copiesNeeded;
      var maxTargetCopies = target.evo === 'twoStar' ? Data.POOL_COPIES[target.rarity].twoStar : Data.POOL_COPIES[target.rarity].threeStar;

      if (isMaxed) {
        results.push({
          target: target, perRefresh: 0, expected: Infinity,
          maxCopies: maxTargetCopies, copiesTaken: 0, poolRemaining: 0,
          copiesOwned: copiesOwned, copiesNeeded: copiesNeeded,
          isMaxed: true, isImpossible: false, isDanger: false
        });
        continue;
      }

      // Pool math (mirrors calculator.js logic)
      var totalPool = PAC.Calc.calculateTotalPool();
      var totalWildCounts = PAC.Calc.calculateWildCounts();
      var pool = totalPool[target.rarity];
      var rarityOdds = Data.SHOP_ODDS[state.level];
      var rarityChance = rarityOdds[target.rarity] / 100;

      var poolRemaining = Math.max(0, maxTargetCopies - copiesTaken);
      var targetCopies = poolRemaining;

      var availableToPlayer = poolRemaining + copiesOwned;
      var isImpossible = availableToPlayer < copiesNeeded;
      var isDanger = !isImpossible && availableToPlayer < copiesNeeded + 2;

      // Pool reductions from extraction
      var visibleTwoStar = 0, visibleThreeStar = 0;
      if (lastPoolData && lastPoolData.poolReductions && lastPoolData.poolReductions[target.rarity]) {
        visibleTwoStar = lastPoolData.poolReductions[target.rarity].twoStar || 0;
        visibleThreeStar = lastPoolData.poolReductions[target.rarity].threeStar || 0;
      }

      var relevantPool = target.evo === 'twoStar' ? pool.twoStarTotal : pool.threeStarTotal;
      var otherPool = target.evo === 'twoStar' ? pool.threeStarTotal : pool.twoStarTotal;
      relevantPool = Math.max(0, relevantPool - (target.evo === 'twoStar' ? visibleTwoStar : visibleThreeStar));
      otherPool = Math.max(0, otherPool - (target.evo === 'twoStar' ? visibleThreeStar : visibleTwoStar));
      var totalPoolSize = relevantPool + otherPool;

      // Wild calculation
      var wildCountsForRarity = totalWildCounts[target.rarity] || { twoStar: 0, threeStar: 0 };
      var poolCopiesForRarity = Data.POOL_COPIES[target.rarity] || { twoStar: 0, threeStar: 0 };
      var totalWildCopiesBefore = target.evo === 'twoStar' ?
        wildCountsForRarity.twoStar * poolCopiesForRarity.twoStar :
        wildCountsForRarity.threeStar * poolCopiesForRarity.threeStar;
      var wildScoutedForRarity = state.wildUnitsTaken[target.rarity] || 0;
      var totalWildCopies = Math.max(0, totalWildCopiesBefore - wildScoutedForRarity);

      var wildBoost = state.pveRoundEnabled ? (0.05 + (state.wildUnitsOwned * 0.01)) : (state.wildUnitsOwned * 0.01);
      var safeWildBoost = isNaN(wildBoost) ? 0 : wildBoost;

      var perSlotProb = 0;
      if (target.isWild) {
        var wildUnitsExist = target.evo === 'twoStar' ? wildCountsForRarity.twoStar > 0 : wildCountsForRarity.threeStar > 0;
        if (wildUnitsExist && totalWildCopies > 0 && safeWildBoost > 0) {
          perSlotProb = safeWildBoost * rarityChance * (targetCopies / totalWildCopies);
        }
      } else {
        if (targetCopies > 0 && totalPoolSize > 0) {
          perSlotProb = (1 - safeWildBoost) * rarityChance * (targetCopies / totalPoolSize);
        }
      }

      var perRefresh = 1 - Math.pow(1 - perSlotProb, 6);
      var confidenceDecimal = (100 - state.confidencePercent) / 100;
      var expectedForConf = perRefresh > 0 ? Math.log(confidenceDecimal) / Math.log(1 - perRefresh) : Infinity;

      results.push({
        target: target, perRefresh: perRefresh, expected: expectedForConf,
        maxCopies: maxTargetCopies, copiesTaken: copiesTaken, poolRemaining: poolRemaining,
        copiesOwned: copiesOwned, copiesNeeded: copiesNeeded,
        isMaxed: false, isImpossible: isImpossible, isDanger: isDanger
      });

      if (perRefresh > 0) {
        combinedMissProb *= (1 - perRefresh);
      }
    }

    var combinedHitProb = 1 - combinedMissProb;
    return {
      individual: results,
      combined: { prob: combinedHitProb, expected: combinedHitProb > 0 ? 1 / combinedHitProb : Infinity }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateDisplay() {
    // Team list and stats are now handled by search panel tracker
    return;
  }

  function _statCell(label, value, color) {
    var colorStyle = color ? 'color: ' + color + ';' : '';
    return '<div style="text-align: center;">' +
      '<div style="color: var(--pac-text-muted); font-size: var(--pac-font-2xs);">' + label + '</div>' +
      '<div style="font-weight: 600; ' + colorStyle + '">' + value + '</div>' +
    '</div>';
  }

  function _attachListEvents() {
    if (!els.list) return;
    els.list.querySelectorAll('.pac-team-enable').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        _toggleTeamTarget(parseFloat(e.target.dataset.id));
      });
    });

    // Wild checkboxes
    els.list.querySelectorAll('.pac-team-wild').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        _toggleTeamWild(parseFloat(e.target.dataset.id));
      });
    });

    // Remove buttons
    els.list.querySelectorAll('.pac-team-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _removeTeamTarget(parseFloat(e.target.dataset.id));
      });
    });

    // Name click = set active
    els.list.querySelectorAll('.pac-team-name').forEach(function(name) {
      name.addEventListener('click', function(e) {
        e.stopPropagation();
        _setActiveTarget(parseFloat(e.target.dataset.id));
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MONO-TYPE MODE
  // ═══════════════════════════════════════════════════════════════════════════

  var POKEMON_TYPES = [
    { name: 'Normal', color: '#A8A77A' },
    { name: 'Fire', color: '#EE8130' },
    { name: 'Water', color: '#6390F0' },
    { name: 'Electric', color: '#F7D02C' },
    { name: 'Grass', color: '#7AC74C' },
    { name: 'Ice', color: '#96D9D6' },
    { name: 'Fighting', color: '#C22E28' },
    { name: 'Poison', color: '#A33EA1' },
    { name: 'Ground', color: '#E2BF65' },
    { name: 'Flying', color: '#A98FF3' },
    { name: 'Psychic', color: '#F95587' },
    { name: 'Bug', color: '#A6B91A' },
    { name: 'Rock', color: '#B6A136' },
    { name: 'Ghost', color: '#735797' },
    { name: 'Dragon', color: '#6F35FC' },
    { name: 'Dark', color: '#705746' },
    { name: 'Steel', color: '#B7B7CE' },
    { name: 'Fairy', color: '#D685AD' }
  ];

  function _buildMonoTypeGrid() {
    if (!els.monoGrid) return;
    els.monoGrid.innerHTML = POKEMON_TYPES.map(function(t) {
      var textColor = ['Electric', 'Ice', 'Normal', 'Steel', 'Fairy', 'Ground'].indexOf(t.name) >= 0 ? '#000' : '#fff';
      return '<button class="pac-mono-btn" data-type="' + t.name + '" style="' +
        'background: ' + t.color + '; color: ' + textColor + '; ' +
        'padding: var(--pac-sp-2xs) var(--pac-sp-xs); border-radius: var(--pac-radius-sm); ' +
        'font-size: var(--pac-font-2xs); font-weight: 600; cursor: pointer; ' +
        'border: 2px solid transparent; transition: all var(--pac-dur-fast) var(--pac-ease);' +
      '">' + t.name + '</button>';
    }).join('');

    els.monoGrid.addEventListener('click', function(e) {
      var btn = e.target.closest('.pac-mono-btn');
      if (!btn) return;
      _selectMonoType(btn.dataset.type);
    });
  }

  function _selectMonoType(type) {
    state.monoTypeEnabled = true;
    state.monoTypeSelected = type;

    // Update button visual
    els.monoGrid.querySelectorAll('.pac-mono-btn').forEach(function(btn) {
      var isSelected = btn.dataset.type === type;
      btn.style.borderColor = isSelected ? '#fff' : 'transparent';
      btn.style.transform = isSelected ? 'scale(1.1)' : 'scale(1)';
    });

    els.monoStatus.textContent = 'Active: ' + type + ' only — non-' + type + ' blocked in shop!';
    els.monoStatus.style.color = 'var(--pac-green)';

    PAC.UI.Events.emit('state:monoTypeChanged', { type: type });
    PAC.UI.Components.Notification.show('Mono-Type: ' + type + ' activated!', 'success');
  }

  function _spinMonoWheel() {
    var type = POKEMON_TYPES[Math.floor(Math.random() * POKEMON_TYPES.length)].name;
    _selectMonoType(type);
  }

  function _clearMonoType() {
    state.monoTypeEnabled = false;
    state.monoTypeSelected = null;

    els.monoGrid.querySelectorAll('.pac-mono-btn').forEach(function(btn) {
      btn.style.borderColor = 'transparent';
      btn.style.transform = 'scale(1)';
    });

    els.monoStatus.textContent = 'Select a type to block others in shop';
    els.monoStatus.style.color = 'var(--pac-text-muted)';

    PAC.UI.Events.emit('state:monoTypeChanged', { type: null });
    PAC.UI.Components.Notification.show('Mono-Type cleared', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHALLENGE MODES (Stubs — game extraction wiring in Phase 4)
  // ═══════════════════════════════════════════════════════════════════════════

  function _toggleDraft() {
    state.randomDraftEnabled = !state.randomDraftEnabled;
    els.draftToggle.textContent = state.randomDraftEnabled ? 'Stop Draft' : 'Start Draft';
    els.draftToggle.classList.toggle('pac-btn--danger', state.randomDraftEnabled);
    els.draftToggle.classList.toggle('pac-btn--primary', !state.randomDraftEnabled);
    els.draftStatus.textContent = state.randomDraftEnabled ? 'Draft active — random slot highlighted each refresh' : '';
    PAC.UI.Events.emit('state:draftChanged', { enabled: state.randomDraftEnabled });
  }

  function _toggleCopycat() {
    state.copycatEnabled = !state.copycatEnabled;
    els.copycatToggle.textContent = state.copycatEnabled ? 'Stop Copycat' : 'Start Copycat';
    els.copycatToggle.classList.toggle('pac-btn--danger', state.copycatEnabled);
    els.copycatToggle.classList.toggle('pac-btn--primary', !state.copycatEnabled);
    els.copycatStatus.textContent = state.copycatEnabled ? 'Copycat active — only matching Pokemon allowed' : '';
    PAC.UI.Events.emit('state:copycatChanged', { enabled: state.copycatEnabled });
  }

  function _toggleMLG() {
    state.mlgModeEnabled = !state.mlgModeEnabled;
    els.mlgToggle.textContent = state.mlgModeEnabled ? '🔥 DEACTIVATE 🔥' : 'Activate MLG';
    els.mlgToggle.classList.toggle('pac-btn--danger', state.mlgModeEnabled);
    els.mlgToggle.classList.toggle('pac-btn--primary', !state.mlgModeEnabled);
    els.mlgStatus.textContent = state.mlgModeEnabled ? '🎺 360 NO SCOPE ACTIVE — Evolution effects ARMED 💀' : '';
    PAC.UI.Events.emit('state:mlgChanged', { enabled: state.mlgModeEnabled });
    if (state.mlgModeEnabled) {
      PAC.UI.Components.Notification.show('🔥 MLG MODE ACTIVATED - 360 NO SCOPE', 'success', 4000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR ALL TARGETS
  // ═══════════════════════════════════════════════════════════════════════════

  function _clearAllTargets() {
    var count = state.teamTargets.length;
    if (count === 0) {
      PAC.UI.Components.Notification.show('No targets to clear', 'info', 1500);
      return count;
    }
    state.teamTargets = [];
    localStorage.setItem('pac_teamTargets', '[]');
    PAC.UI.Events.emit('state:teamChanged', { targets: [] });
    _updateDisplay();
    PAC.UI.Components.Notification.show('Cleared ' + count + ' target' + (count > 1 ? 's' : ''), 'info', 1500);
    return count;
  }

  // Expose for CLI / keybind access
  PAC.UI.Sections.team.clearAll = _clearAllTargets;

  PAC.UI.Events.on('keybind:clearTracker', function() {
    _clearAllTargets();
  });

  if (PAC.DEBUG_MODE) console.log('PAC Panels: Team loaded');
})();
