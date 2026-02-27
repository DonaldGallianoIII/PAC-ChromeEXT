/**
 * PAC v4.1 — Fishing Section
 * Rod selection, Mantyke/Octillery/Remoraid auto-detect, odds with
 * Remoraid pre-roll (Mantine OR wild boost), fishable pool display.
 */
(function() {
  'use strict';

  var els = {};
  var state, Data, Utils;

  function _refs() {
    state = PAC.State.state;
    Data  = PAC.Data;
    Utils = PAC.Utils;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS — Correct v3.2.2 odds
  // ═══════════════════════════════════════════════════════════════════════════

  var FISHING_ODDS = {
    old:   { common: 35, uncommon: 10, rare: 0,  epic: 0,  special: 55, specialName: 'Magikarp' },
    good:  { common: 25, uncommon: 30, rare: 10, epic: 0,  special: 35, specialName: 'Feebas' },
    super: { common: 5,  uncommon: 25, rare: 25, epic: 10, special: 35, specialName: 'Wishiwashi' }
  };

  var MANTINE_REMORAID_RATE = 0.33;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION ENTRY
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Sections.fishing = {
    render: function(container) {
      _refs();

      container.innerHTML =
        /* ── Rod Selection ──────────────────────────── */
        '<div class="pac-group">' +
          '<div style="font-size:12px;font-weight:600;color:var(--pac-text-primary);margin-bottom:8px">🎣 Rod Selection</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="pac-btn pac-btn--ghost pac-rod-btn pac-rod-btn--active" data-rod="none">None</button>' +
            '<button class="pac-btn pac-btn--ghost pac-rod-btn" data-rod="old">Old</button>' +
            '<button class="pac-btn pac-btn--ghost pac-rod-btn" data-rod="good">Good</button>' +
            '<button class="pac-btn pac-btn--ghost pac-rod-btn" data-rod="super">Super</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:2px;font-size:9px;color:var(--pac-text-muted);padding:6px 8px;margin-top:6px;background:var(--pac-bg-glass);border-radius:4px">' +
            '<span>Water (3) → Old Rod</span>' +
            '<span>Water (6) → Good Rod</span>' +
            '<span>Water (9) → Super Rod</span>' +
          '</div>' +
        '</div>' +

        /* ── Auto-Detected Status ──────────────────── */
        '<div class="pac-group">' +
          '<div style="display:flex;gap:8px;font-size:12px;color:var(--pac-text-muted);flex-wrap:wrap">' +
            '<span>🐟 Mantyke: <strong id="pac-fishing-mantyke">No</strong></span>' +
            '<span>| 🐙 Octillery: <strong id="pac-fishing-octillery">No</strong></span>' +
            '<span>| Remoraid: <strong id="pac-fishing-remoraid">0</strong></span>' +
          '</div>' +
        '</div>' +

        /* ── Odds Display ──────────────────────────── */
        '<div id="pac-fishing-odds" class="pac-group">' +
          '<div style="color:var(--pac-text-muted);text-align:center;padding:12px;">Select a rod to see catch rates.</div>' +
        '</div>' +

        /* ── Fishable Pool Display ─────────────────── */
        '<div id="pac-fishing-pool" class="pac-group">' +
        '</div>';

      // Cache refs
      els.mantyke     = container.querySelector('#pac-fishing-mantyke');
      els.octillery   = container.querySelector('#pac-fishing-octillery');
      els.remoraid    = container.querySelector('#pac-fishing-remoraid');
      els.oddsContent = container.querySelector('#pac-fishing-odds');
      els.poolContent = container.querySelector('#pac-fishing-pool');

      // Rod buttons
      container.querySelectorAll('.pac-rod-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          state.fishingRod = btn.dataset.rod;
          container.querySelectorAll('.pac-rod-btn').forEach(function(b) {
            b.classList.remove('pac-rod-btn--active');
          });
          btn.classList.add('pac-rod-btn--active');
          _renderOdds();
        });
      });

      // Listen for extraction updates (auto-detect Mantyke/Octillery/Remoraid)
      PAC.UI.Events.on('extraction:updated', function(data) {
        _updateFishingState(data);
      });

      // Restore rod selection
      if (state.fishingRod && state.fishingRod !== 'none') {
        var activeBtn = container.querySelector('.pac-rod-btn[data-rod="' + state.fishingRod + '"]');
        if (activeBtn) {
          container.querySelectorAll('.pac-rod-btn').forEach(function(b) { b.classList.remove('pac-rod-btn--active'); });
          activeBtn.classList.add('pac-rod-btn--active');
          _renderOdds();
        }
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-DETECTION (Extraction Loop)
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateFishingState(data) {
    _refs();
    if (!data) return;

    if (data.playerBoards && state.playerName) {
      var myBoard = data.playerBoards[state.playerName] || [];
      var myBench = (data.playerBenches && data.playerBenches[state.playerName]) || [];
      var allUnits = myBoard.concat(myBench);

      var hadMantyke    = state.fishingMantyke;
      var hadOctillery  = state.fishingOctilleryLocked;
      var hadRemoraids  = state.fishingRemoraidsOwned;

      state.fishingMantyke = allUnits.some(function(u) {
        var n = (u.name || '').toUpperCase();
        return n === 'MANTYKE' || n === 'MANTINE';
      });

      state.fishingOctilleryLocked = allUnits.some(function(u) {
        return (u.name || '').toUpperCase() === 'OCTILLERY';
      });

      state.fishingRemoraidsOwned = allUnits.filter(function(u) {
        return (u.name || '').toUpperCase() === 'REMORAID';
      }).length;

      // Update status text
      if (els.mantyke)   els.mantyke.textContent   = state.fishingMantyke ? 'Yes (+33%)' : 'No';
      if (els.octillery) els.octillery.textContent  = state.fishingOctilleryLocked ? 'Yes (locked)' : 'No';
      if (els.remoraid)  els.remoraid.textContent   = state.fishingRemoraidsOwned;

      // Re-render odds if anything changed
      var changed = (hadMantyke !== state.fishingMantyke) ||
                    (hadOctillery !== state.fishingOctilleryLocked) ||
                    (hadRemoraids !== state.fishingRemoraidsOwned);
      if (changed && state.fishingRod && state.fishingRod !== 'none') {
        _renderOdds();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REMORAID PRE-ROLL CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  function _calcRemoraid() {
    _refs();

    // Wild boost (same formula as main calculator)
    var wildBoost = state.pveRoundEnabled
      ? (0.05 + (state.wildUnitsOwned * 0.01))
      : (state.wildUnitsOwned * 0.01);

    // OR probability: P = 1 - P(miss Mantine) × P(miss Wild)
    var chance = 0;
    if (state.fishingMantyke && wildBoost > 0) {
      chance = 1 - ((1 - MANTINE_REMORAID_RATE) * (1 - wildBoost));
    } else if (state.fishingMantyke) {
      chance = MANTINE_REMORAID_RATE;
    } else if (wildBoost > 0) {
      chance = wildBoost;
    }

    var potential  = chance;
    var effective  = state.fishingOctilleryLocked ? 0 : chance;
    var nonFactor  = 1 - effective;

    return {
      potential:  potential,
      effective:  effective,
      nonFactor:  nonFactor,
      wildBoost:  wildBoost,
      locked:     state.fishingOctilleryLocked
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FISHABLE POOL BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  function _getFishableWaterPokemon() {
    _refs();
    var fishable = { common: [], uncommon: [], rare: [], epic: [] };
    var pokemonData = Data.POKEMON_DATA;

    var names = Object.keys(pokemonData);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var pd   = pokemonData[name];
      if (!pd.types || pd.types.indexOf('water') === -1) continue;
      if (!fishable.hasOwnProperty(pd.rarity)) continue;

      // Base forms only
      var baseForm = Utils.getBaseForm(name);
      if (baseForm !== name) continue;

      // Skip regional / additional (base pool only)
      if (pd.regional || pd.additional) continue;

      fishable[pd.rarity].push(_formatName(name));
    }

    // Sort alpha
    var rarities = Object.keys(fishable);
    for (var r = 0; r < rarities.length; r++) {
      fishable[rarities[r]].sort();
    }
    return fishable;
  }

  function _formatName(n) {
    return n.charAt(0) + n.slice(1).toLowerCase();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER ODDS + POOL
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderOdds() {
    _refs();
    var rod = state.fishingRod || 'none';

    if (rod === 'none') {
      els.oddsContent.innerHTML = '<div style="color:var(--pac-text-muted);text-align:center;padding:12px;">Select a rod to see catch rates.</div>';
      els.poolContent.innerHTML = '';
      return;
    }

    var odds = FISHING_ODDS[rod];
    var remo = _calcRemoraid();
    var nf   = remo.nonFactor;

    // ── Remoraid section ─────────────────────────────────────────────────
    var remoHtml = '';
    if (remo.potential > 0 || remo.locked) {
      var pctStr = (remo.effective * 100).toFixed(1);
      var potStr = (remo.potential * 100).toFixed(1);

      remoHtml =
        '<div style="margin-bottom:10px;padding:8px 10px;border-radius:6px;font-size:12px;' +
          'background:' + (remo.locked ? 'rgba(239,68,68,0.12)' : 'rgba(100,181,246,0.12)') + ';' +
          'border:1px solid ' + (remo.locked ? 'rgba(239,68,68,0.3)' : 'rgba(100,181,246,0.3)') + '">' +
          '🐟 <strong>Remoraid pre-roll:</strong> ' +
          (remo.locked
            ? '<span style="color:var(--pac-red);font-weight:700;">LOCKED</span> (Octillery on board) — would be ' + potStr + '%'
            : '<span style="font-weight:700;">' + pctStr + '%</span>') +
          _remoSources(remo) +
        '</div>';
    }

    // ── Odds table ───────────────────────────────────────────────────────
    var RARITY_COLORS = {
      common: '#9e9e9e', uncommon: '#4caf50', rare: '#2196f3', epic: '#9c27b0'
    };
    var rarities = ['common', 'uncommon', 'rare', 'epic'];
    var tableRows = '';

    for (var i = 0; i < rarities.length; i++) {
      var r    = rarities[i];
      var base = odds[r];
      var adj  = (base * nf).toFixed(1);
      var col  = RARITY_COLORS[r];
      tableRows +=
        '<tr>' +
          '<td style="color:' + col + ';font-weight:600;text-transform:capitalize">' + r + '</td>' +
          '<td style="text-align:right">' + base + '%</td>' +
          '<td style="text-align:right;font-weight:600;color:var(--pac-text-primary)">' + adj + '%</td>' +
        '</tr>';
    }

    // Special catch row
    tableRows +=
      '<tr style="border-top:1px solid var(--pac-border)">' +
        '<td style="color:#ff9800;font-weight:600">⭐ ' + odds.specialName + '</td>' +
        '<td style="text-align:right">' + odds.special + '%</td>' +
        '<td style="text-align:right;font-weight:600;color:var(--pac-text-primary)">' + (odds.special * nf).toFixed(1) + '%</td>' +
      '</tr>';

    var tableHtml =
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr style="border-bottom:1px solid var(--pac-border)">' +
          '<th style="text-align:left;padding:4px 6px;color:var(--pac-text-muted);font-weight:600">Rarity</th>' +
          '<th style="text-align:right;padding:4px 6px;color:var(--pac-text-muted);font-weight:600">Base</th>' +
          '<th style="text-align:right;padding:4px 6px;color:var(--pac-text-muted);font-weight:600">Adj.</th>' +
        '</tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>';

    var adjNote = remo.effective > 0
      ? '<div style="font-size:10px;color:var(--pac-text-muted);margin-top:6px;text-align:center;font-style:italic">' +
        'Adjusted = Base × ' + (nf * 100).toFixed(1) + '% (after Remoraid pre-roll)</div>'
      : '';

    els.oddsContent.innerHTML =
      '<div style="font-size:12px;font-weight:600;color:var(--pac-text-primary);margin-bottom:8px">' +
        '🎰 ' + rod.charAt(0).toUpperCase() + rod.slice(1) + ' Rod — Catch Rates</div>' +
      remoHtml + tableHtml + adjNote;

    // ── Fishable pool ────────────────────────────────────────────────────
    _renderPool(odds, nf);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FISHABLE POOL
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderPool(odds, nonFactor) {
    var fishable = _getFishableWaterPokemon();
    var availableRarities = [];
    if (odds.common > 0)   availableRarities.push('common');
    if (odds.uncommon > 0) availableRarities.push('uncommon');
    if (odds.rare > 0)     availableRarities.push('rare');
    if (odds.epic > 0)     availableRarities.push('epic');

    if (availableRarities.length === 0) {
      els.poolContent.innerHTML = '';
      return;
    }

    var RARITY_COLORS = {
      common: '#9e9e9e', uncommon: '#4caf50', rare: '#2196f3', epic: '#9c27b0'
    };

    var html = '<div style="font-size:12px;font-weight:600;color:var(--pac-text-primary);margin-bottom:8px">🐟 Fishable Pokémon</div>';

    for (var i = 0; i < availableRarities.length; i++) {
      var r       = availableRarities[i];
      var pokemon = fishable[r];
      if (!pokemon || pokemon.length === 0) continue;

      var baseChance = odds[r];
      var adjChance  = baseChance * nonFactor;
      var perMon     = pokemon.length > 0 ? (adjChance / pokemon.length) : 0;
      var col        = RARITY_COLORS[r];

      html +=
        '<div style="margin-bottom:10px">' +
          '<div style="font-size:11px;font-weight:600;color:' + col + ';margin-bottom:4px;' +
            'padding-bottom:2px;border-bottom:1px solid var(--pac-border);text-transform:capitalize">' +
            r + ' — ' + adjChance.toFixed(1) + '% (' + pokemon.length + ' species, ~' + perMon.toFixed(2) + '% each)</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">';

      for (var p = 0; p < pokemon.length; p++) {
        html +=
          '<span style="font-size:10px;padding:2px 6px;background:var(--pac-bg-glass);' +
            'border-radius:3px;border:1px solid var(--pac-border);color:var(--pac-text-primary);' +
            'cursor:default" title="~' + perMon.toFixed(2) + '% catch rate">' +
            pokemon[p] +
          '</span>';
      }

      html += '</div></div>';
    }

    els.poolContent.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _remoSources(remo) {
    var parts = [];
    if (state.fishingMantyke)  parts.push('Mantine 33%');
    if (remo.wildBoost > 0)    parts.push('Wild ' + (remo.wildBoost * 100).toFixed(1) + '%');
    if (parts.length === 0)    return '';
    return ' <span style="font-size:10px;color:var(--pac-text-muted)">(' + parts.join(' + ') + ')</span>';
  }

  if (PAC.DEBUG_MODE) console.log('PAC Sections: Fishing loaded');
})();
