/**
 * PAC v5 — CMD Section
 * Terminal-styled control center.
 *
 * Two sections:
 *   Apps     — toggle optional app icons onto the home grid
 *   Proof    — search a Pokémon, see the full math breakdown
 *
 * Persists toggle state to localStorage ('pac_cmd_state').
 * Emits 'cmd:appToggled' events.
 */
(function() {
  'use strict';

  var CMD_STORAGE_KEY = 'pac_cmd_state';
  var Events = PAC.UI.Events;

  var OPTIONAL_APPS = [
    { key: 'team',      label: 'Modes',         emoji: '🎮' },
    { key: 'intel',     label: 'Intel',         emoji: '🔍' },
    { key: 'analytics', label: 'Analytics',     emoji: '📈' },
    { key: 'chat',      label: 'Chat',          emoji: '💬' },
    { key: 'fishing',   label: 'Fishing',       emoji: '🐟' },
    { key: 'keybinds',  label: 'Keybinds',      emoji: '⌨️' },
    { key: 'gamepad',   label: 'Gamepad',       emoji: '🕹️' },
    { key: 'feedback',  label: 'Deuce222x',     emoji: '🤖' },
    { key: 'settings',  label: 'Settings',      emoji: '⚙️' }
  ];

  var HUNT_DISCLAIMER_KEY = 'pac_huntDisclaimerAccepted';

  var cmdState = null;
  var proofAC = null;

  PAC.UI.Sections.cmd = {
    render: function(container) {
      cmdState = _loadState();

      container.innerHTML =
        /* Terminal header */
        '<div style="font-family:\'Courier New\',monospace;padding:4px 8px;' +
          'background:rgba(48,213,200,0.08);border-radius:6px;margin-bottom:12px;' +
          'border:1px solid rgba(48,213,200,0.15);">' +
          '<span style="color:var(--pac-accent);font-size:11px;font-weight:700;">pac@v' + PAC.VERSION + '</span>' +
          '<span style="color:var(--pac-text-muted);font-size:11px;"> ~ configure your dashboard</span>' +
        '</div>' +

        /* ── Apps Section ──────────────────────────── */
        '<div class="pac-group">' +
          '<div style="font-family:\'Courier New\',monospace;font-size:10px;' +
            'text-transform:uppercase;letter-spacing:0.1em;color:var(--pac-accent);' +
            'margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(48,213,200,0.2);">' +
            '> APPS' +
          '</div>' +
          OPTIONAL_APPS.map(function(app) {
            var isOn = cmdState.apps[app.key] || false;
            return _buildToggleRow(app.emoji + ' ' + app.label, 'app-' + app.key, isOn);
          }).join('') +
        '</div>' +

        /* ── Embedded Section ──────────────────────── */
        '<div class="pac-group">' +
          '<div style="font-family:\'Courier New\',monospace;font-size:10px;' +
            'text-transform:uppercase;letter-spacing:0.1em;color:#fbbf24;' +
            'margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(251,191,36,0.3);">' +
            '> EMBEDDED <span style="color:rgba(251,191,36,0.5);text-transform:none;letter-spacing:normal">(game interaction)</span>' +
          '</div>' +
          '<div id="pac-cmd-hunt-row">' +
            _buildToggleRow('🎯 Hunt Mode', 'embedded-hunt', cmdState.embedded && cmdState.embedded.hunt || false) +
          '</div>' +
          '<div id="pac-cmd-hunt-desc" style="font-family:\'Courier New\',monospace;font-size:9px;color:rgba(255,255,255,0.3);' +
            'padding:2px 0 4px 0;line-height:1.4;">' +
            'Assisted rolling — human pace (Alt+X)' +
          '</div>' +
          '<div style="height:4px"></div>' +
          _buildToggleRow('⌨️ Shop Hotkeys', 'embedded-hotkeys', cmdState.embedded && cmdState.embedded.hotkeys || false) +
          '<div style="font-family:\'Courier New\',monospace;font-size:9px;color:rgba(255,255,255,0.3);' +
            'padding:2px 0 4px 0;line-height:1.4;">' +
            'Press 1-6 to buy shop slots (top row or numpad)' +
          '</div>' +
        '</div>' +

        /* ── Math Proof Section ────────────────────── */
        '<div class="pac-group">' +
          '<div style="font-family:\'Courier New\',monospace;font-size:10px;' +
            'text-transform:uppercase;letter-spacing:0.1em;color:var(--pac-accent);' +
            'margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(48,213,200,0.2);">' +
            '> MATH PROOF <span style="color:var(--pac-text-muted);text-transform:none;letter-spacing:normal">(show your work)</span>' +
          '</div>' +
          '<input type="text" id="pac-cmd-proof-input" placeholder="Search Pokémon..." autocomplete="off" ' +
            'style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);' +
            'border-radius:6px;color:#fff;font-size:12px;font-family:\'Courier New\',monospace;padding:8px 10px;outline:none;margin-bottom:8px">' +
          '<div id="pac-cmd-proof-output" style="font-family:\'Courier New\',monospace;font-size:11px;' +
            'color:rgba(255,255,255,0.5);padding:8px;text-align:center;">Type a name to see the math</div>' +
        '</div>' +

        /* ── User Guide Button ─────────────────────── */
        '<div style="padding:4px 0;">' +
          '<button id="pac-cmd-guide-btn" style="' +
            'width:100%;padding:8px;font-family:\'Courier New\',monospace;font-size:11px;' +
            'background:rgba(48,213,200,0.06);border:1px solid rgba(48,213,200,0.2);' +
            'border-radius:6px;color:rgba(48,213,200,0.7);cursor:pointer;' +
            'transition:all 0.15s;">' +
            '📖 Open User Guide' +
          '</button>' +
        '</div>' +

        /* Footer */
        '<div style="font-family:\'Courier New\',monospace;font-size:10px;' +
          'color:var(--pac-text-muted);padding:8px;text-align:center;">' +
          'Toggles save automatically' +
        '</div>';

      // ── Wire Toggle Events ────────────────────────
      container.querySelectorAll('.pac-cmd-toggle').forEach(function(toggle) {
        toggle.addEventListener('change', function() {
          var id = toggle.dataset.toggleId;
          var isOn = toggle.checked;

          if (id.indexOf('app-') === 0) {
            var appKey = id.replace('app-', '');
            cmdState.apps[appKey] = isOn;
            _saveState();
            Events.emit('cmd:appToggled', { app: appKey, enabled: isOn });
          }

          if (id === 'embedded-hotkeys') {
            cmdState.embedded.hotkeys = isOn;
            _saveState();
            Events.emit('cmd:hotkeysToggled', { enabled: isOn });
          }

          if (id === 'embedded-hunt') {
            if (isOn) {
              // Check if disclaimer already accepted
              if (localStorage.getItem(HUNT_DISCLAIMER_KEY) === 'true') {
                cmdState.embedded.hunt = true;
                _saveState();
                Events.emit('cmd:huntToggled', { enabled: true });
                _updateHuntTurboVisual();
              } else {
                // Revert toggle until disclaimer is accepted
                toggle.checked = false;
                _showHuntDisclaimer(function() {
                  // Accepted
                  toggle.checked = true;
                  cmdState.embedded.hunt = true;
                  _saveState();
                  Events.emit('cmd:huntToggled', { enabled: true });
                  _updateHuntTurboVisual();
                });
              }
            } else {
              cmdState.embedded.hunt = false;
              _saveState();
              Events.emit('cmd:huntToggled', { enabled: false });
              _updateHuntTurboVisual();
            }
          }
        });
      });

      // ── Turbo Visual State ──────────────────────────
      _updateHuntTurboVisual();
      Events.on('hunt:turboChanged', _updateHuntTurboVisual);

      // ── User Guide Button ─────────────────────────
      var guideBtn = container.querySelector('#pac-cmd-guide-btn');
      if (guideBtn) {
        guideBtn.addEventListener('click', function() {
          if (PAC.UI.Panels.EULA && PAC.UI.Panels.EULA.showGuide) {
            PAC.UI.Panels.EULA.showGuide();
          }
        });
      }

      // ── Math Proof Autocomplete ───────────────────
      var proofInput = container.querySelector('#pac-cmd-proof-input');
      var proofOutput = container.querySelector('#pac-cmd-proof-output');

      proofAC = PAC.UI.Components.Autocomplete.attach(proofInput, {
        maxResults: 8,
        onSelect: function(selected) {
          proofInput.value = selected.name;
          _renderProof(selected, proofOutput);
        },
        onClear: function() {
          proofOutput.innerHTML = '<span style="color:rgba(255,255,255,0.5)">Type a name to see the math</span>';
        }
      });

      // Re-render on extraction updates (pool changes)
      Events.on('extraction:updated', function() {
        if (proofInput.value.trim()) {
          // Re-trigger proof with current selection
          var name = proofInput.value.trim().toUpperCase();
          var pokemonData = PAC.Data.POKEMON_DATA[name];
          if (pokemonData) {
            var baseForm = PAC.Utils.getBaseForm(name);
            _renderProof({
              name: proofInput.value.trim(),
              rarity: pokemonData.rarity,
              baseForm: baseForm,
              isWild: PAC.Utils.isWildPokemon ? PAC.Utils.isWildPokemon(name) : false,
              family: PAC.Utils.getEvolutionFamily(baseForm)
            }, proofOutput);
          }
        }
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MATH PROOF RENDERER
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderProof(selected, output) {
    var state = PAC.State.state;
    var Data = PAC.Data;
    var Utils = PAC.Utils;
    var lastPoolData = PAC.State.lastPoolData;

    var name = selected.name.toUpperCase();
    var pokemonData = Data.POKEMON_DATA[name];
    if (!pokemonData) {
      output.innerHTML = _line('error', '✗ Unknown Pokémon: ' + selected.name);
      return;
    }

    var rarity = pokemonData.rarity;
    var baseForm = Utils.getBaseForm(name);
    var family = Utils.getEvolutionFamily(baseForm);
    var chain = Data.EVOLUTION_CHAINS[baseForm];
    var maxStars = (chain && chain[0] && chain[0].maxStars) ? chain[0].maxStars : 3;
    var evo = maxStars === 2 ? 'twoStar' : 'threeStar';
    var copiesNeeded = maxStars === 2 ? 3 : 9;
    var isWild = Utils.isWildPokemon ? Utils.isWildPokemon(name) : false;

    var html = '';

    // Header
    html += _line('accent', '═══ PROOF: ' + selected.name + ' ═══');
    html += _line('muted', 'Rarity: ' + rarity + ' | Evo: ' + maxStars + '★ | Wild: ' + (isWild ? 'YES' : 'NO'));
    html += _line('muted', 'Family: [' + family.join(', ') + ']');
    html += _spacer();

    // Availability
    if (Utils.checkPokemonAvailability) {
      var avail = Utils.checkPokemonAvailability(name, state.activeRegionalPokemon, state.activeAdditionalPokemon);
      if (!avail.available) {
        html += _line('red', '✗ UNAVAILABLE: ' + (avail.reason || 'Not in current game pool'));
        html += _line('muted', 'Per-slot: 0% | Per-refresh: 0%');
        output.innerHTML = html;
        return;
      }
      html += _line('green', '✓ Available in current game pool');
    }

    // Not in pool rarity check
    if (!Data.POOL_RARITIES || !Data.POOL_RARITIES.includes(rarity)) {
      html += _line('red', '✗ Rarity "' + rarity + '" not in shop pool');
      output.innerHTML = html;
      return;
    }

    html += _spacer();

    // Level & rarity chance
    var level = state.level || 7;
    var shopOdds = Data.SHOP_ODDS[level];
    var rarityPct = shopOdds[rarity] || 0;
    var rarityChance = rarityPct / 100;

    html += _line('accent', '── STEP 1: Rarity Chance ──');
    html += _line('white', 'Level ' + level + ' → ' + rarity + ' odds = ' + rarityPct + '%');
    html += _kv('rarityChance', rarityPct + '% = ' + rarityChance.toFixed(4));
    html += _spacer();

    // Pool math
    var totalPools = PAC.Calc.calculateTotalPool();
    var pool = totalPools[rarity];
    var maxPool = evo === 'twoStar' ? Data.POOL_COPIES[rarity].twoStar : Data.POOL_COPIES[rarity].threeStar;

    // Copies taken
    var copiesTaken = 0;
    if (lastPoolData && lastPoolData.pokemonCounts) {
      family.forEach(function(f) {
        var cnt = lastPoolData.pokemonCounts[f] || 0;
        if (cnt > 0) copiesTaken += cnt * (Utils.getEvolutionCost ? Utils.getEvolutionCost(f) : 1);
      });
    }
    var poolRemaining = Math.max(0, maxPool - copiesTaken);

    html += _line('accent', '── STEP 2: Pool ──');
    html += _kv('maxCopies', maxPool + ' (base pool for ' + evo.replace('Star', '★') + ' ' + rarity + ')');
    html += _kv('copiesTaken', copiesTaken + ' (all players, star-weighted)');
    html += _kv('poolRemaining', poolRemaining + ' = max(' + maxPool + ' - ' + copiesTaken + ', 0)');
    html += _spacer();
    html += _line('yellow', '* Opponent shop contents were previously included in');
    html += _line('yellow', '  copiesTaken and pool reductions. The game environment');
    html += _line('yellow', '  no longer exposes opponent shops, so these values now');
    html += _line('yellow', '  reflect boards + benches only. Your shop still counts.');
    html += _spacer();

    // Pool reductions
    var visibleTwoStar = 0, visibleThreeStar = 0;
    if (lastPoolData && lastPoolData.poolReductions && lastPoolData.poolReductions[rarity]) {
      visibleTwoStar = lastPoolData.poolReductions[rarity].twoStar || 0;
      visibleThreeStar = lastPoolData.poolReductions[rarity].threeStar || 0;
    }

    // Wild calculations
    var totalWildCounts = PAC.Calc.calculateWildCounts();
    var wildCountsForRarity = totalWildCounts[rarity] || { twoStar: 0, threeStar: 0 };
    var wildBoost = state.pveRoundEnabled ? (0.05 + (state.wildUnitsOwned * 0.01)) : (state.wildUnitsOwned * 0.01);
    if (isNaN(wildBoost)) wildBoost = 0;

    html += _line('accent', '── STEP 3: Per-Slot Probability ──');

    var perSlot = 0;

    if (isWild) {
      var totalWildCopiesBefore = evo === 'twoStar'
        ? wildCountsForRarity.twoStar * (Data.POOL_COPIES[rarity] ? Data.POOL_COPIES[rarity].twoStar : 0)
        : wildCountsForRarity.threeStar * (Data.POOL_COPIES[rarity] ? Data.POOL_COPIES[rarity].threeStar : 0);
      var wildScouted = (state.wildUnitsTaken && state.wildUnitsTaken[rarity]) ? state.wildUnitsTaken[rarity] : 0;
      var totalWildCopies = Math.max(1, totalWildCopiesBefore - wildScouted);

      html += _line('yellow', '🌿 WILD PATH');
      html += _kv('wildBoost', (wildBoost * 100).toFixed(1) + '% (PvE: ' + (state.pveRoundEnabled ? 'ON +5%' : 'OFF') + ', owned: ' + state.wildUnitsOwned + ' × 1%)');
      html += _kv('wildPool', totalWildCopies + ' total wild copies (' + totalWildCopiesBefore + ' - ' + wildScouted + ' scouted)');
      html += _kv('targetInPool', poolRemaining + ' / ' + totalWildCopies);
      html += _spacer();
      html += _line('white', 'Formula: wildBoost × rarityChance × (target / wildPool)');

      if (wildBoost > 0 && totalWildCopies > 0 && poolRemaining > 0) {
        perSlot = wildBoost * rarityChance * (poolRemaining / totalWildCopies);
        html += _line('white', '= ' + wildBoost.toFixed(4) + ' × ' + rarityChance.toFixed(4) + ' × (' + poolRemaining + '/' + totalWildCopies + ')');
      }
    } else {
      var relevantPool = evo === 'twoStar' ? pool.twoStarTotal : pool.threeStarTotal;
      var otherPool = evo === 'twoStar' ? pool.threeStarTotal : pool.twoStarTotal;
      relevantPool = Math.max(0, relevantPool - (evo === 'twoStar' ? visibleTwoStar : visibleThreeStar));
      otherPool = Math.max(0, otherPool - (evo === 'twoStar' ? visibleThreeStar : visibleTwoStar));
      var totalPoolSize = relevantPool + otherPool;

      html += _line('white', '📦 NORMAL PATH');
      html += _kv('relevantPool', relevantPool + ' (' + evo.replace('Star', '★') + ' copies for ' + rarity + ')');
      html += _kv('otherPool', otherPool + ' (other evo tier)');
      html += _kv('totalPoolSize', totalPoolSize + ' = ' + relevantPool + ' + ' + otherPool);
      if (visibleTwoStar || visibleThreeStar) {
        html += _kv('reductions', '-' + visibleTwoStar + ' vis 2★, -' + visibleThreeStar + ' vis 3★');
      }
      html += _kv('wildPenalty', (wildBoost * 100).toFixed(1) + '% (slots stolen by wild)');
      html += _spacer();
      html += _line('white', 'Formula: (1 - wildBoost) × rarityChance × (target / pool)');

      if (poolRemaining > 0 && totalPoolSize > 0) {
        perSlot = (1 - wildBoost) * rarityChance * (poolRemaining / totalPoolSize);
        html += _line('white', '= ' + (1 - wildBoost).toFixed(4) + ' × ' + rarityChance.toFixed(4) + ' × (' + poolRemaining + '/' + totalPoolSize + ')');
      }
    }

    html += _kv('perSlot', (perSlot * 100).toFixed(4) + '%', 'accent');
    html += _spacer();

    // Per refresh
    var perRefresh = 1 - Math.pow(1 - perSlot, 6);
    html += _line('accent', '── STEP 4: Per-Refresh (6 slots) ──');
    html += _line('white', 'Formula: 1 - (1 - perSlot)^6');
    html += _line('white', '= 1 - (1 - ' + perSlot.toFixed(6) + ')^6');
    html += _line('white', '= 1 - ' + Math.pow(1 - perSlot, 6).toFixed(6));
    html += _kv('perRefresh', (perRefresh * 100).toFixed(2) + '%', 'accent');
    html += _spacer();

    // Confidence
    var conf = state.confidencePercent || 50;
    var confDecimal = (100 - conf) / 100;
    var rolls = perRefresh > 0 ? Math.max(1, Math.ceil(Math.log(confDecimal) / Math.log(1 - perRefresh))) : Infinity;
    var gold = isFinite(rolls) ? rolls * 1 : Infinity;

    html += _line('accent', '── STEP 5: Confidence (' + conf + '%) ──');
    html += _line('white', 'Formula: ⌈log(1 - conf) / log(1 - rate)⌉');
    html += _line('white', '= ⌈log(' + confDecimal.toFixed(2) + ') / log(' + (1 - perRefresh).toFixed(6) + ')⌉');
    html += _kv('rolls', isFinite(rolls) ? rolls : '∞', 'accent');
    html += _kv('gold', isFinite(gold) ? gold + 'g' : '∞', 'accent');

    html += _spacer();
    html += _line('muted', '═══ END PROOF ═══');

    output.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROOF HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  var COLORS = {
    accent: 'color:var(--pac-accent,#30D5C8)',
    white:  'color:rgba(255,255,255,0.85)',
    muted:  'color:rgba(255,255,255,0.4)',
    green:  'color:#2ecc71',
    red:    'color:#ff4757',
    yellow: 'color:#fbbf24'
  };

  function _line(color, text) {
    return '<div style="' + (COLORS[color] || COLORS.white) + ';padding:1px 0;white-space:pre-wrap;word-break:break-all">' + text + '</div>';
  }

  function _kv(key, value, valColor) {
    return '<div style="display:flex;justify-content:space-between;padding:1px 0">' +
      '<span style="color:rgba(255,255,255,0.5)">' + key + '</span>' +
      '<span style="' + (COLORS[valColor] || COLORS.white) + ';font-weight:600">' + value + '</span>' +
    '</div>';
  }

  function _spacer() {
    return '<div style="height:6px"></div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TURBO VISUAL STATE
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateHuntTurboVisual() {
    var isTurbo = PAC.UI.Engine.Hunt && PAC.UI.Engine.Hunt.isTurbo && PAC.UI.Engine.Hunt.isTurbo();
    var huntEnabled = cmdState && cmdState.embedded && cmdState.embedded.hunt;
    var showTurbo = isTurbo && huntEnabled;

    // Update the hunt row label color
    var row = document.getElementById('pac-cmd-hunt-row');
    if (row) {
      var labelSpan = row.querySelector('span');
      if (labelSpan) {
        labelSpan.style.color = showTurbo ? '#ef4444' : 'rgba(255,255,255,0.7)';
        labelSpan.textContent = showTurbo ? '⚡ Hunt Mode — TURBO' : '🎯 Hunt Mode';
      }
    }

    // Update description text
    var desc = document.getElementById('pac-cmd-hunt-desc');
    if (desc) {
      desc.style.color = showTurbo ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.3)';
      desc.textContent = showTurbo ? 'Turbo rolling — 11ms tick (Alt+X)' : 'Assisted rolling — human pace (Alt+X)';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOGGLE ROW BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildToggleRow(label, toggleId, isOn) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:6px 0;font-family:\'Courier New\',monospace;">' +
      '<span style="font-size:12px;color:rgba(255,255,255,0.7);">' + label + '</span>' +
      '<label class="pac-toggle" style="flex-shrink:0">' +
        '<input type="checkbox" class="pac-cmd-toggle" data-toggle-id="' + toggleId + '"' +
          (isOn ? ' checked' : '') + '>' +
        '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
      '</label>' +
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function _loadState() {
    try {
      var raw = localStorage.getItem(CMD_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var apps = parsed.apps || {};
        OPTIONAL_APPS.forEach(function(a) { if (apps[a.key] === undefined) apps[a.key] = false; });
        var embedded = parsed.embedded || {};
        if (embedded.hunt === undefined) embedded.hunt = false;
        if (embedded.hotkeys === undefined) embedded.hotkeys = false;
        return { apps: apps, embedded: embedded };
      }
    } catch(e) {}

    var apps = {};
    OPTIONAL_APPS.forEach(function(a) { apps[a.key] = false; });
    return { apps: apps, embedded: { hunt: false, hotkeys: false } };
  }

  function _saveState() {
    try {
      localStorage.setItem(CMD_STORAGE_KEY, JSON.stringify(cmdState));
    } catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUNT DISCLAIMER MODAL
  // ═══════════════════════════════════════════════════════════════════════════

  function _showHuntDisclaimer(onAccept) {
    var overlay = document.createElement('div');
    overlay.id = 'pac-hunt-disclaimer-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:rgba(0,0,0,0.85);z-index:99999999;display:flex;' +
      'align-items:center;justify-content:center;pointer-events:auto;';

    var modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--pac-bg-primary,#0a0c12);border:1px solid rgba(251,191,36,0.4);' +
      'border-radius:var(--pac-radius-xl,12px);max-width:580px;width:90vw;' +
      'max-height:85vh;overflow-y:auto;padding:var(--pac-sp-xl,24px);' +
      'box-shadow:0 0 40px rgba(251,191,36,0.15),0 8px 32px rgba(0,0,0,0.6);' +
      'font-family:var(--pac-font-family,\'Courier New\',monospace);' +
      'color:var(--pac-text-primary,#fff);';

    modal.innerHTML =
      '<div style="font-size:var(--pac-font-xl,18px);font-weight:700;margin-bottom:var(--pac-sp-lg,16px);text-align:center;">' +
        '🎯 Hunt Mode — Embedded Feature' +
      '</div>' +
      '<div style="font-size:var(--pac-font-sm,12px);color:rgba(251,191,36,0.8);text-align:center;margin-bottom:var(--pac-sp-lg,16px);">Read before enabling</div>' +

      _disclaimerSection('⚙️ What Hunt Mode Does',
        'Hunt Mode automates <strong>shop rolling and purchasing</strong> by interacting directly with the game\'s DOM (Document Object Model). ' +
        'When active, it clicks the refresh button and shop slots on your behalf to find and buy target Pokémon.',
        'rgba(48,213,200,0.6)') +

      _disclaimerSection('🔧 How It Works — isTrusted: true',
        'PAC uses the browser\'s native <strong><code>.click()</code></strong> method on DOM elements. ' +
        'This produces events with <strong><code>isTrusted: true</code></strong>, meaning the browser marks them as ' +
        'identical to real user-initiated clicks.<br><br>' +
        'No game code is modified. No packets are forged. No memory is manipulated. ' +
        'The game receives the exact same signal it would from your mouse — PAC just decides <em>when</em> and <em>where</em> to click.',
        'rgba(48,213,200,0.6)') +

      _disclaimerSection('🧩 Third-Party Tool',
        'PAC is an <strong>independent, third-party tool</strong> created by <strong>@Deuce222X</strong>. ' +
        'It is not developed, endorsed, or maintained by the Pokémon Auto Chess developers. ' +
        'PAC operates entirely client-side within your browser.',
        'rgba(255,255,255,0.2)') +

      _disclaimerSection('⚠️ Feature May Be Removed',
        'While this feature is <strong>currently allowed</strong>, it exists at the discretion of the PAC developers and could be ' +
        '<strong>modified, restricted, or removed at any time</strong> in a future update without prior notice. ' +
        'Do not rely on its permanent availability.',
        'rgba(251,191,36,0.5)') +

      _disclaimerSection('🎮 Use Responsibly',
        'You are choosing to enable this feature of your own volition. Use it at your own discretion. ' +
        'Be mindful of the competitive environment and other players.',
        'rgba(251,191,36,0.5)') +

      '<div style="margin-top:var(--pac-sp-lg,16px);display:flex;flex-direction:column;gap:var(--pac-sp-sm,8px);">' +
        _disclaimerCheckbox('hunt-disc-1', 'I understand Hunt Mode clicks DOM elements using isTrusted: true events') +
        _disclaimerCheckbox('hunt-disc-2', 'I understand PAC is a third-party tool and this feature may be removed at any time') +
        _disclaimerCheckbox('hunt-disc-3', 'I accept responsibility for my use of this feature') +
      '</div>' +

      '<div style="display:flex;gap:8px;margin-top:var(--pac-sp-lg,16px);">' +
        '<button id="pac-hunt-disc-cancel" style="' +
          'flex:1;padding:var(--pac-sp-md,12px);font-size:var(--pac-font-md,14px);' +
          'font-family:\'Courier New\',monospace;background:rgba(255,255,255,0.05);' +
          'border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:rgba(255,255,255,0.6);cursor:pointer;">' +
          'Cancel' +
        '</button>' +
        '<button id="pac-hunt-disc-accept" disabled style="' +
          'flex:2;padding:var(--pac-sp-md,12px);font-size:var(--pac-font-md,14px);' +
          'font-family:\'Courier New\',monospace;font-weight:700;' +
          'background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.4);' +
          'border-radius:8px;color:#fbbf24;cursor:pointer;opacity:0.5;">' +
          'I Understand — Enable Hunt Mode' +
        '</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Checkbox logic
    var checks = modal.querySelectorAll('.pac-hunt-disc-check');
    var acceptBtn = modal.querySelector('#pac-hunt-disc-accept');
    var cancelBtn = modal.querySelector('#pac-hunt-disc-cancel');

    checks.forEach(function(cb) {
      cb.addEventListener('change', function() {
        var allChecked = Array.from(checks).every(function(c) { return c.checked; });
        acceptBtn.disabled = !allChecked;
        acceptBtn.style.opacity = allChecked ? '1' : '0.5';
      });
    });

    acceptBtn.addEventListener('click', function() {
      if (acceptBtn.disabled) return;
      localStorage.setItem(HUNT_DISCLAIMER_KEY, 'true');
      overlay.remove();
      onAccept();
    });

    cancelBtn.addEventListener('click', function() {
      overlay.remove();
    });
  }

  function _disclaimerSection(title, body, accentColor) {
    var borderColor = accentColor || 'rgba(255,255,255,0.15)';
    return '<div style="margin-bottom:var(--pac-sp-md,8px);padding:var(--pac-sp-md,8px);' +
      'background:rgba(255,255,255,0.03);border-left:3px solid ' + borderColor + ';border-radius:var(--pac-radius-sm,4px);">' +
      '<div style="font-weight:600;margin-bottom:var(--pac-sp-xs,4px);font-size:12px;">' + title + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.6;">' + body + '</div></div>';
  }

  function _disclaimerCheckbox(id, label) {
    return '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:4px 0;">' +
      '<input type="checkbox" class="pac-hunt-disc-check" id="pac-' + id + '" style="' +
        'width:16px;height:16px;min-width:16px;margin-top:2px;flex-shrink:0;cursor:pointer;' +
        'accent-color:#2ecc71;color-scheme:dark;">' +
      '<span style="font-size:11px;color:rgba(255,255,255,0.7);line-height:1.4;">' + label + '</span></label>';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC: Read CMD state (used by phone-hub on init)
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.CMD = {
    getState: function() {
      if (!cmdState) cmdState = _loadState();
      return cmdState;
    },
    isHuntEnabled: function() {
      if (!cmdState) cmdState = _loadState();
      return !!(cmdState.embedded && cmdState.embedded.hunt);
    },
    isHotkeysEnabled: function() {
      if (!cmdState) cmdState = _loadState();
      return !!(cmdState.embedded && cmdState.embedded.hotkeys);
    },
    STORAGE_KEY: CMD_STORAGE_KEY
  };

  if (PAC.DEBUG_MODE) console.log('PAC Sections: CMD loaded');
})();
