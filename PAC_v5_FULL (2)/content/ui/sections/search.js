/**
 * PAC v4.1 — Search Section
 * Unified search → results panel. Merges target + pool + results.
 *
 * Default view: Search bar + Results + Confidence slider.
 * Display modules toggled via CMD panel:
 *   levelRarityEvo, ownedScouted, poolRarityRate, wildMechanics, dittoAutoScout
 */
(function() {
  'use strict';

  var els = {};
  var state, Data, Utils;
  var autocompleteInstance = null;
  var trackerIndex = -1; // Active highlight index in team tracker
  var undoStack = [];    // Last 5 deleted targets for ← undo
  var UNDO_MAX = 5;

  function _refs() {
    state = PAC.State.state;
    Data = PAC.Data;
    Utils = PAC.Utils;
  }

  PAC.UI.Sections.search = {
    render: function(container) {
      _refs();

      container.innerHTML =
        /* ═══ Search Bar (always visible) ═══════════════════════ */
        '<div class="pac-group" style="position:relative">' +
          '<input type="text" id="pac-search-input" placeholder="Search Pokémon..." ' +
            'style="font-size:14px;padding:10px 12px;">' +
        '</div>' +

        /* ═══ Per Refresh Rate (always visible) ═══════════════════ */
        '<div class="pac-group" id="pac-search-results-block">' +
          '<div class="pac-stat">' +
            '<span class="pac-stat-label">Per Refresh</span>' +
            '<span class="pac-stat-value pac-stat-value--accent" id="pac-search-rate">—</span>' +
          '</div>' +
        '</div>' +

        /* Rolls + Gold pills */
        '<div class="pac-group">' +
          '<div class="pac-row">' +
            '<div class="pac-pill pac-pill--accent">' +
              '<div class="pac-pill-label" id="pac-search-conf-pct">' + state.confidencePercent + '% Confidence</div>' +
              '<div class="pac-pill-value" id="pac-search-rolls">—</div>' +
            '</div>' +
            '<div class="pac-pill pac-pill--accent">' +
              '<div class="pac-pill-label" id="pac-search-gold-label">Gold (' + state.confidencePercent + '%)</div>' +
              '<div class="pac-pill-value" id="pac-search-gold">—</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Status message */
        '<div id="pac-search-status" class="pac-hint"></div>' +

        /* ═══ Confidence slider (always visible) ═══════════════ */
        '<div class="pac-group">' +
          '<div class="pac-stat" style="margin-bottom:6px">' +
            '<span class="pac-stat-label">Confidence</span>' +
            '<span class="pac-stat-value pac-stat-value--accent" id="pac-search-conf-label">' + state.confidencePercent + '%</span>' +
          '</div>' +
          '<div style="position:relative;height:24px;transition:height 0.15s ease">' +
            '<div id="pac-conf-bar" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:12px;overflow:hidden"></div>' +
            '<input type="range" id="pac-search-confidence" min="1" max="99" value="' + state.confidencePercent + '" ' +
              'style="position:absolute;top:0;left:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1">' +
          '</div>' +
        '</div>' +

        /* ═══ Team Tracker (always visible when targets exist) ═══ */
        '<div id="pac-search-tracker"></div>' +

        '';

      // ── Cache Refs ──────────────────────────────────────────────
      els.input = container.querySelector('#pac-search-input');
      els.rate = container.querySelector('#pac-search-rate');
      els.confLabel = container.querySelector('#pac-search-conf-label');
      els.confidence = container.querySelector('#pac-search-confidence');
      els.confBar = container.querySelector('#pac-conf-bar');
      els.confPct = container.querySelector('#pac-search-conf-pct');
      els.rolls = container.querySelector('#pac-search-rolls');
      els.goldLabel = container.querySelector('#pac-search-gold-label');
      els.gold = container.querySelector('#pac-search-gold');
      els.status = container.querySelector('#pac-search-status');

      // Display module refs
      // (Display module refs removed — math proof lives in CMD now)
      els.container = container;
      els.tracker = container.querySelector('#pac-search-tracker');

      // ── Delegated click handler for tracker ─────────────────────
      // Attached ONCE to the container — survives innerHTML re-renders
      // (at 11ms polling, per-button listeners get nuked before click completes)
      els.tracker.addEventListener('click', function(e) {
        // Remove button
        var removeBtn = e.target.closest('.pac-tracker-remove');
        if (removeBtn) {
          var id = parseFloat(removeBtn.dataset.id);
          var removed = state.teamTargets.find(function(t) { return t.id === id; });
          if (removed && removed.locked) return;
          if (removed) {
            undoStack.push(removed);
            if (undoStack.length > UNDO_MAX) undoStack.shift();
          }
          state.teamTargets = state.teamTargets.filter(function(t) { return t.id !== id; });
          PAC.State.saveTeamTargets();
          PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
          if (els.input) els.input.value = '';
          if (removed && state.targetPokemon === Utils.getBaseForm(removed.pokemon)) {
            state.targetPokemon = '';
            state.targetPokemonDisplayName = '';
            state.evolutionFamily = [];
            els.rate.textContent = '—';
            els.rolls.textContent = '—';
            els.gold.textContent = '—';
            els.status.textContent = '';
            els.status.style.display = 'none';
          }
          if (trackerIndex >= state.teamTargets.length) trackerIndex = state.teamTargets.length - 1;
          els._lastTrackerHtml = ''; // Invalidate cache so re-render goes through
          _renderTracker();
          return;
        }
        // Lock/star button
        var lockBtn = e.target.closest('.pac-tracker-lock');
        if (lockBtn) {
          var idx = parseInt(lockBtn.dataset.idx, 10);
          if (idx >= 0 && idx < state.teamTargets.length) {
            state.teamTargets[idx].locked = !state.teamTargets[idx].locked;
            PAC.State.saveTeamTargets();
            els._lastTrackerHtml = '';
            _renderTracker();
          }
          return;
        }
      });

      // ── Autocomplete ────────────────────────────────────────────
      autocompleteInstance = PAC.UI.Components.Autocomplete.attach(els.input, {
        onSelect: _onPokemonSelected,
        onClear: _onPokemonCleared,
        onKeyNav: _onTrackerKeyNav,
        maxResults: 15
      });

      // ── Confidence Slider ───────────────────────────────────────
      // ── Confidence Slider (health bar bubble) ──────────────────
      function _paintSliderFill() {
        if (!els.confBar || !els.confidence) return;
        var pct = ((els.confidence.value - els.confidence.min) / (els.confidence.max - els.confidence.min)) * 100;
        var isActive = els.confidence.classList.contains('pac-slider--active');
        var swirlColors = isActive
          ? '#5ef5e8, #30D5C8, #2af5dc, #30D5C8, #5ef5e8'
          : '#30D5C8, #1a9e94, #26c4b8, #1a9e94, #30D5C8';
        var shine = 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)';
        var swirl = 'linear-gradient(90deg, ' + swirlColors + ')';
        var empty = 'rgba(0,0,0,0.5)';
        var lo = Math.max(0, pct - 1);
        var hi = Math.min(100, pct + 1);
        els.confBar.style.background =
          shine + ', ' +
          'linear-gradient(to right, transparent ' + lo + '%, ' + empty + ' ' + hi + '%), ' +
          swirl;
        els.confBar.style.backgroundSize = '100% 100%, 100% 100%, 200% 100%';
        els.confBar.style.animation = 'pac-healthbar-swirl 2s linear infinite';
        // Grow on active
        if (isActive) {
          els.confBar.parentElement.style.height = '30px';
          els.confBar.style.boxShadow = '0 0 16px rgba(48,213,200,0.25)';
        } else {
          els.confBar.parentElement.style.height = '24px';
          els.confBar.style.boxShadow = 'none';
        }
      }

      els.confidence.addEventListener('input', function() {
        var c = parseInt(els.confidence.value, 10);
        state.confidencePercent = c;
        els.confLabel.textContent = c + '%';
        els.confPct.textContent = c + '% Confidence';
        els.goldLabel.textContent = 'Gold (' + c + '%)';
        _paintSliderFill();
        _recalculate();
        PAC.UI.Events.emit('state:confidenceChanged', { confidence: c });
      });

      els.confidence.addEventListener('mousedown', function() {
        els.confidence.classList.add('pac-slider--active');
        _paintSliderFill();
      });
      els.confidence.addEventListener('mouseup', function() {
        els.confidence.classList.remove('pac-slider--active');
        _paintSliderFill();
      });
      els.confidence.addEventListener('mouseleave', function() {
        els.confidence.classList.remove('pac-slider--active');
        _paintSliderFill();
      });

      // Initial fill paint
      _paintSliderFill();

      // (Level, rarity, evo, wild config — all auto-detected from extraction + pokemon data)
      // (Manual overrides removed — math proof in CMD shows the work)

      // ── Listen for extraction updates ───────────────────────────
      PAC.UI.Events.on('extraction:updated', function(data) {
        if (!data) return;
        if (data.ownedCount !== undefined) {
          state.copiesTaken = data.ownedCount;
        }
        if (data.stage !== undefined) {
          state.currentStage = data.stage;
        }
        _recalculate();
      });

      // ── Listen for external team changes (quick-add, etc) ──────
      PAC.UI.Events.on('state:teamChanged', function() {
        _renderTracker();
        _recalculate();
      });


      // Render any persisted team targets
      _renderTracker();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // POKEMON SELECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _onPokemonSelected(selected) {
    _refs();

    // Show results

    // ── Auto-add to team tracker if not already there ──────
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
        PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
      }
    }

    // Update state from selection
    state.targetPokemon = selected.baseForm;
    state.targetPokemonDisplayName = selected.name;
    state.targetRarity = selected.rarity;
    state.targetIsWild = selected.isWild;
    state.evolutionFamily = selected.family;
    state.targetPokemonRarity = selected.rarity;

    // Auto-determine evo from pokemon data
    var chain = Data.EVOLUTION_CHAINS[selected.baseForm];
    if (chain && chain[0]) {
      state.targetEvo = chain[0].maxStars === 2 ? 'twoStar' : 'threeStar';
    }

    // Reset copies taken for new target
    state.copiesTaken = 0;

    _recalculate();

    // Emit events for other panels (team, intel)
    PAC.UI.Events.emit('state:targetChanged');
    PAC.UI.Events.emit('state:pokemonSelected', {
      name: selected.name,
      baseForm: selected.baseForm,
      rarity: selected.rarity,
      isWild: selected.isWild
    });
    PAC.UI.Events.emit('pool:targetSelected', { name: selected.name });

    // Clear search bar for next input — tracker handles persistence
    if (els.input) els.input.value = '';

    // Render tracker cards (shows the just-added target)
    _renderTracker();
  }

  function _onPokemonCleared() {
    trackerIndex = -1;
    state.targetPokemon = '';
    state.targetPokemonDisplayName = '';
    state.evolutionFamily = [];
    els.rate.textContent = '—';
    els.rolls.textContent = '—';
    els.gold.textContent = '—';
    els.status.textContent = '';
    els.status.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  function _recalculate() {
    _refs();

    var result = null;

    // Only calc single-target stats if a target is actually selected
    if (state.targetPokemon) {
      result = PAC.Calc.calculate();
      _displayResults(result);
    } else {
      // No target — show dashes for single-target stats
      els.rate.textContent = '—';
      els.rolls.textContent = '—';
      els.gold.textContent = '—';
      if (els.status) { els.status.textContent = ''; els.status.style.display = 'none'; }
    }

    // Always render tracker (has its own team math)
    _renderTracker();

    // Emit for footer + team panel
    var rateStr = result && result.perRefresh !== undefined ? result.perRefresh.toFixed(2) : '0';
    var poolStr = result ? result.targetCopies + '/' + result.maxTargetCopies : '—';
    var rarityStr = result && result.rarityChance !== undefined ? result.rarityChance.toFixed(1) : '0';

    PAC.UI.Events.emit('state:resultsCalculated', {
      rate: rateStr,
      pool: poolStr,
      rarityRate: rarityStr
    });
  }

  function _displayResults(r) {
    if (!r) return;

    // Per Refresh
    var rate = r.perRefresh !== undefined ? r.perRefresh : 0;
    els.rate.textContent = rate.toFixed(2) + '%';

    // Color code the rate
    if (rate >= 20) {
      els.rate.style.color = 'var(--pac-green, #2ecc71)';
    } else if (rate >= 10) {
      els.rate.style.color = 'var(--pac-accent)';
    } else if (rate > 0) {
      els.rate.style.color = 'var(--pac-orange, #f39c12)';
    } else {
      els.rate.style.color = 'var(--pac-red, #ff4757)';
    }

    // Confidence-based rolls + gold
    var conf = state.confidencePercent;
    var decimal = rate / 100;
    var rolls = decimal > 0 ? Math.max(1, Math.ceil(Math.log(1 - conf / 100) / Math.log(1 - decimal))) : Infinity;
    var gold = isFinite(rolls) ? Math.round(rolls * 1) : '∞';

    els.rolls.textContent = isFinite(rolls) ? rolls + ' rolls' : '∞';
    els.gold.textContent = isFinite(rolls) ? gold + 'g' : '∞';

    // Status messages
    var statusParts = [];
    if (r.isMaxed) statusParts.push('✅ Target MAXED');
    if (r.notAvailable) statusParts.push('⚠ ' + (r.availabilityReason || 'Not available'));
    if (r.wildTargetImpossible) statusParts.push('🌿 Wild target not in pool');
    if (r.targetCopies === 0 && !r.isMaxed) statusParts.push('⚠ 0 copies remaining');

    if (statusParts.length > 0) {
      els.status.textContent = statusParts.join(' · ');
      els.status.style.display = 'block';
    } else {
      els.status.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM TRACKER (inline in Search panel)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKER KEYBOARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  function _onTrackerKeyNav(dir) {
    _refs();

    // Undo always works, even with empty list
    if (dir === 'left' && undoStack.length > 0) {
      var restored = undoStack.pop();
      state.teamTargets.push(restored);
      PAC.State.saveTeamTargets();
      PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });
      trackerIndex = state.teamTargets.length - 1;
      _renderTracker();
      return;
    }

    if (!state.teamTargets || state.teamTargets.length === 0) {
      trackerIndex = -1;
      return;
    }

    var count = state.teamTargets.length;

    if (dir === 'down') {
      trackerIndex = Math.min(trackerIndex + 1, count - 1);
      _renderTracker();
    } else if (dir === 'up') {
      trackerIndex = Math.max(trackerIndex - 1, -1);
      _renderTracker();
    } else if (dir === 'right' && trackerIndex >= 0 && trackerIndex < count) {
      // Block delete if locked
      if (state.teamTargets[trackerIndex].locked) return;

      // Delete highlighted target — push to undo stack
      var removed = state.teamTargets[trackerIndex];
      undoStack.push(removed);
      if (undoStack.length > UNDO_MAX) undoStack.shift();

      state.teamTargets.splice(trackerIndex, 1);
      PAC.State.saveTeamTargets();
      PAC.UI.Events.emit('state:teamChanged', { targets: state.teamTargets });

      // Clear search bar and hide results
      if (els.input) els.input.value = '';

      // If we removed the active target, clear target state
      if (removed && state.targetPokemon === Utils.getBaseForm(removed.pokemon)) {
        state.targetPokemon = '';
        state.targetPokemonDisplayName = '';
        state.evolutionFamily = [];
        els.rate.textContent = '—';
        els.rolls.textContent = '—';
        els.gold.textContent = '—';
        els.status.textContent = '';
        els.status.style.display = 'none';
      }

      // Adjust index after removal
      if (state.teamTargets.length === 0) {
        trackerIndex = -1;
      } else if (trackerIndex >= state.teamTargets.length) {
        trackerIndex = state.teamTargets.length - 1;
      }
      _renderTracker();
    } else if (dir === 'enter' && trackerIndex >= 0 && trackerIndex < count) {
      // Select highlighted target as active search target
      var t = state.teamTargets[trackerIndex];
      var baseForm = Utils.getBaseForm(t.pokemon);
      _onPokemonSelected({
        name: t.pokemon,
        rarity: t.rarity,
        baseForm: baseForm,
        isWild: t.isWild,
        family: Utils.getEvolutionFamily(baseForm)
      });
    } else if (dir === 'dot' && trackerIndex >= 0 && trackerIndex < count) {
      // Toggle lock on highlighted target
      state.teamTargets[trackerIndex].locked = !state.teamTargets[trackerIndex].locked;
      PAC.State.saveTeamTargets();
      _renderTracker();
    }
  }

  function _renderTracker() {
    if (!els.tracker) return;
    _refs();

    if (!state.teamTargets || state.teamTargets.length === 0) {
      if (els._lastTrackerHtml !== '') {
        els._lastTrackerHtml = '';
        els.tracker.innerHTML = '';
      }
      return;
    }

    var html = '<div style="font-size:11px;font-weight:600;color:var(--pac-accent,#30D5C8);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Tracking</div>';

    var lastPoolData = PAC.State.lastPoolData;
    var playerUnits = [];
    if (lastPoolData && state.playerName) {
      var board = (lastPoolData.playerBoards && lastPoolData.playerBoards[state.playerName]) || [];
      var bench = (lastPoolData.playerBenches && lastPoolData.playerBenches[state.playerName]) || [];
      playerUnits = board.concat(bench);
    }

    // Precompute pool data for team rate calc
    var totalPools = PAC.Calc.calculateTotalPool ? PAC.Calc.calculateTotalPool() : null;
    var shopOdds = Data.SHOP_ODDS ? Data.SHOP_ODDS[state.level] : null;
    var wildBoost = state.pveRoundEnabled ? (0.05 + (state.wildUnitsOwned * 0.01)) : (state.wildUnitsOwned * 0.01);
    if (isNaN(wildBoost)) wildBoost = 0;

    var totalWildCounts = PAC.Calc.calculateWildCounts ? PAC.Calc.calculateWildCounts() : {};

    var teamPerRefreshRates = [];

    for (var i = 0; i < state.teamTargets.length; i++) {
      var t = state.teamTargets[i];

      // Pool math
      var baseForm = Utils.getBaseForm(t.pokemon);
      var family = Utils.getEvolutionFamily(baseForm);
      var chain = Data.EVOLUTION_CHAINS[baseForm];
      var maxStars = (chain && chain[0] && chain[0].maxStars) ? chain[0].maxStars : 3;
      var copiesNeeded = maxStars === 2 ? 3 : 9;
      var maxPool = t.evo === 'twoStar'
        ? (Data.POOL_COPIES[t.rarity] ? Data.POOL_COPIES[t.rarity].twoStar : 0)
        : (Data.POOL_COPIES[t.rarity] ? Data.POOL_COPIES[t.rarity].threeStar : 0);

      // Copies taken (all players)
      var copiesTaken = 0;
      if (lastPoolData && lastPoolData.pokemonCounts) {
        family.forEach(function(name) {
          var cnt = lastPoolData.pokemonCounts[name] || 0;
          if (cnt > 0) copiesTaken += cnt * (Utils.getEvolutionCost ? Utils.getEvolutionCost(name) : 1);
        });
      }
      var poolRemaining = Math.max(0, maxPool - copiesTaken);

      // Copies owned by player (star-weighted)
      var copiesOwned = 0;
      playerUnits.forEach(function(u) {
        if (u.name && family.indexOf(u.name.toUpperCase()) !== -1) {
          copiesOwned += u.stars === 3 ? 9 : u.stars === 2 ? 3 : 1;
        }
      });

      // Availability check — mirrors team panel
      var unavailable = false;
      var unavailableReason = '';
      if (Utils.checkPokemonAvailability) {
        var availability = Utils.checkPokemonAvailability(t.pokemon, state.activeRegionalPokemon, state.activeAdditionalPokemon);
        if (!availability.available) {
          unavailable = true;
          unavailableReason = availability.reason || 'Not available';
        }
      }

      // Not in pool rarity check
      if (!Data.POOL_RARITIES || !Data.POOL_RARITIES.includes(t.rarity)) {
        unavailable = true;
        unavailableReason = 'Not in pool';
      }

      // Per-target rate calc
      var perRefresh = 0;
      var isMaxed = copiesOwned >= copiesNeeded;

      if (!unavailable && !isMaxed && t.enabled && totalPools && shopOdds && poolRemaining > 0) {
        var pool = totalPools[t.rarity];
        if (pool) {
          var rarityChance = (shopOdds[t.rarity] || 0) / 100;

          // Pool reductions from extraction
          var visibleTwoStar = 0, visibleThreeStar = 0;
          if (lastPoolData && lastPoolData.poolReductions && lastPoolData.poolReductions[t.rarity]) {
            visibleTwoStar = lastPoolData.poolReductions[t.rarity].twoStar || 0;
            visibleThreeStar = lastPoolData.poolReductions[t.rarity].threeStar || 0;
          }

          var isWild = t.isWild || false;
          var perSlot;

          if (isWild) {
            // Wild pool calculation — separate denominator
            var wildCountsForRarity = totalWildCounts[t.rarity];
            if (wildCountsForRarity) {
              var totalWildCopiesBefore = t.evo === 'twoStar'
                ? wildCountsForRarity.twoStar * (Data.POOL_COPIES[t.rarity] ? Data.POOL_COPIES[t.rarity].twoStar : 0)
                : wildCountsForRarity.threeStar * (Data.POOL_COPIES[t.rarity] ? Data.POOL_COPIES[t.rarity].threeStar : 0);
              var wildScoutedForRarity = (state.wildUnitsTaken && state.wildUnitsTaken[t.rarity]) ? state.wildUnitsTaken[t.rarity] : 0;
              var totalWildCopies = Math.max(1, totalWildCopiesBefore - wildScoutedForRarity);
              var wildUnitsExist = t.evo === 'twoStar' ? wildCountsForRarity.twoStar > 0 : wildCountsForRarity.threeStar > 0;
              if (wildUnitsExist && totalWildCopies > 0 && wildBoost > 0) {
                perSlot = wildBoost * rarityChance * (poolRemaining / totalWildCopies);
              } else {
                perSlot = 0;
              }
            } else {
              perSlot = 0;
            }
          } else {
            // Non-wild — use relevant + other pool with reductions
            var relevantPool = t.evo === 'twoStar' ? pool.twoStarTotal : pool.threeStarTotal;
            var otherPool = t.evo === 'twoStar' ? pool.threeStarTotal : pool.twoStarTotal;
            relevantPool = Math.max(0, relevantPool - (t.evo === 'twoStar' ? visibleTwoStar : visibleThreeStar));
            otherPool = Math.max(0, otherPool - (t.evo === 'twoStar' ? visibleThreeStar : visibleTwoStar));
            var totalPoolSize = relevantPool + otherPool;
            if (totalPoolSize > 0) {
              perSlot = (1 - wildBoost) * rarityChance * (poolRemaining / totalPoolSize);
            } else {
              perSlot = 0;
            }
          }
          perRefresh = 1 - Math.pow(1 - perSlot, 6);
        }
      }
      teamPerRefreshRates.push(perRefresh);

      var isActive = state.targetPokemon === baseForm;
      var isKeyHighlight = i === trackerIndex;
      var rarityColor = 'var(--pac-rarity-' + t.rarity + ', #fff)';
      var borderColor = isKeyHighlight ? '#fbbf24' : isActive ? 'var(--pac-accent,#30D5C8)' : 'transparent';
      var bgColor = isKeyHighlight ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)';
      var dimStyle = (unavailable || isMaxed) ? 'opacity:0.4;' : '';

      // Show individual rate inline
      var rateStr = unavailable ? 'N/A' : (perRefresh * 100).toFixed(1) + '%';
      var rateColor = unavailable ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.4)';

      html += '<div class="pac-tracker-card" data-tracker-idx="' + i + '" style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:4px;' +
        dimStyle + 'background:' + bgColor + ';border-radius:6px;border-left:3px solid ' + borderColor + ';transition:background 0.15s,border-color 0.15s">' +
        // Lock star
        '<button class="pac-tracker-lock" data-idx="' + i + '" style="' +
          'background:none;border:none;font-size:12px;cursor:pointer;padding:0;line-height:1;' +
          'color:' + (t.locked ? '#fbbf24' : 'rgba(255,255,255,0.15)') + ';transition:color 0.15s' +
        '">' + (t.locked ? '★' : '☆') + '</button>' +
        // Name
        '<span style="flex:1;font-size:12px;font-weight:600;color:' + rarityColor + '">' + (t.displayName || t.pokemon) + '</span>' +
        // Rate
        '<span style="font-size:10px;color:' + rateColor + '">' + rateStr + '</span>' +
        // Pool
        '<span style="font-size:11px;color:rgba(255,255,255,0.5)">' +
          (unavailable ? '—' : isMaxed ? '<span style="color:var(--pac-green,#2ecc71)">MAX</span>' : poolRemaining + '/' + maxPool) +
        '</span>' +
        // Owned
        '<span style="font-size:11px;color:rgba(255,255,255,0.5)">' +
          (unavailable ? '—' : copiesOwned + '/' + copiesNeeded) +
        '</span>' +
        // Remove button (hidden if locked)
        '<button class="pac-tracker-remove" data-id="' + t.id + '" style="' +
          'background:none;border:none;font-size:14px;cursor:pointer;padding:0 2px;line-height:1;' +
          (t.locked ? 'visibility:hidden;width:0;padding:0;' : 'color:' + (isKeyHighlight ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.3)')) +
        '">' + (isKeyHighlight && !t.locked ? '→' : '×') + '</button>' +
      '</div>';
    }

    // ── Combined Team Stats ──────────────────────────────────
    if (state.teamTargets.length > 0 && teamPerRefreshRates.length > 0) {
      var pMissAll = 1;
      for (var r = 0; r < teamPerRefreshRates.length; r++) {
        pMissAll *= (1 - teamPerRefreshRates[r]);
      }
      var combinedRate = (1 - pMissAll) * 100;
      var conf = state.confidencePercent;
      var combinedDecimal = combinedRate / 100;
      var combinedRolls = combinedDecimal > 0 ? Math.max(1, Math.ceil(Math.log(1 - conf / 100) / Math.log(1 - combinedDecimal))) : Infinity;
      var combinedGold = isFinite(combinedRolls) ? Math.round(combinedRolls * 1) : '∞';

      // Color code
      var rateColor;
      if (combinedRate >= 20) rateColor = 'var(--pac-green, #2ecc71)';
      else if (combinedRate >= 10) rateColor = 'var(--pac-accent)';
      else if (combinedRate > 0) rateColor = 'var(--pac-orange, #f39c12)';
      else rateColor = 'var(--pac-red, #ff4757)';

      // Health bar gradient — use combined rate as fill %
      var barPct = Math.min(100, combinedRate);
      var barLo = Math.max(0, barPct - 1);
      var barHi = Math.min(100, barPct + 1);
      var barSwirl = 'linear-gradient(90deg, #30D5C8, #1a9e94, #26c4b8, #1a9e94, #30D5C8)';
      var barShine = 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 50%)';
      var barEmpty = 'rgba(0,0,0,0.5)';
      var barBg = barShine + ', linear-gradient(to right, transparent ' + barLo + '%, ' + barEmpty + ' ' + barHi + '%), ' + barSwirl;

      html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:11px;font-weight:600;color:var(--pac-accent,#30D5C8);text-transform:uppercase;letter-spacing:0.05em">Any Target</span>' +
          '<span style="font-size:14px;font-weight:700;color:' + rateColor + '">' + combinedRate.toFixed(2) + '%</span>' +
        '</div>' +
        // Team health bar
        '<div id="pac-team-healthbar" style="' +
          'width:100%;height:20px;border-radius:10px;margin-bottom:8px;overflow:hidden;' +
          'background:' + barBg + ';' +
          'background-size:100% 100%, 100% 100%, 200% 100%;' +
          'animation:pac-healthbar-swirl 2s linear infinite' +
        '"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<div style="flex:1;background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 10px;text-align:center">' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.4)">' + conf + '% Confidence</div>' +
            '<div style="font-size:13px;font-weight:600;color:var(--pac-text,#fff)">' + (isFinite(combinedRolls) ? combinedRolls + ' rolls' : '∞') + '</div>' +
          '</div>' +
          '<div style="flex:1;background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 10px;text-align:center">' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.4)">Gold (' + conf + '%)</div>' +
            '<div style="font-size:13px;font-weight:600;color:var(--pac-text,#fff)">' + (isFinite(combinedRolls) ? combinedGold + 'g' : '∞') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // Dirty check — skip innerHTML if nothing changed (prevents mid-click DOM nuke)
    if (html === els._lastTrackerHtml) return;
    els._lastTrackerHtml = html;

    els.tracker.innerHTML = html;

    // (Click handlers delegated to els.tracker — see render() init)

    // Scroll highlighted card into view
    if (trackerIndex >= 0) {
      var activeCard = els.tracker.querySelector('[data-tracker-idx="' + trackerIndex + '"]');
      if (activeCard) activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL KEY INTERCEPTOR — catches arrows even when input isn't focused
  // ═══════════════════════════════════════════════════════════════════════════

  var searchPanelActive = false;

  PAC.UI.Events.on('slideout:opened', function(data) {
    searchPanelActive = data && data.id === 'search';
  });
  PAC.UI.Events.on('slideout:closed', function() {
    searchPanelActive = false;
  });

  document.addEventListener('keydown', function(e) {
    if (!searchPanelActive) return;

    // Don't intercept if user is typing in an input (autocomplete handles that)
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    var handled = false;

    if (e.key === 'ArrowDown') {
      _onTrackerKeyNav('down');
      handled = true;
    } else if (e.key === 'ArrowUp') {
      _onTrackerKeyNav('up');
      handled = true;
    } else if (e.key === 'ArrowRight') {
      _onTrackerKeyNav('right');
      handled = true;
    } else if (e.key === 'ArrowLeft') {
      _onTrackerKeyNav('left');
      handled = true;
    } else if (e.key === '\\') {
      _onTrackerKeyNav('dot');
      handled = true;
    } else if (e.key === 'Enter') {
      _onTrackerKeyNav('enter');
      handled = true;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Any printable character → focus the search input so typing works
      var input = document.querySelector('#pac-search-input');
      if (input) {
        input.focus();
        // Don't prevent default — let the character type into the input
        return;
      }
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true); // useCapture = true → fires before game handlers

  if (PAC.DEBUG_MODE) console.log('PAC Sections: Search loaded');
})();
