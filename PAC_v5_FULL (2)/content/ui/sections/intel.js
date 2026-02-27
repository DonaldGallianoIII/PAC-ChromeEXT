/**
 * PAC v4 — Counter Intelligence Panel
 *
 * Displays all players' boards and benches.
 * Highlights contested pokemon (overlapping with your targets).
 * Shows pool remaining per unit with color coding.
 * Accordion-style per-player.
 */
(function() {
  'use strict';

  var containerEl = null;
  var expandedPlayers = new Set();
  var lastFingerprint = '';

  PAC.UI.Sections.intel = {
    render: function(body) {
      body.innerHTML =
        '<div id="pac-intel-players" style="font-size: var(--pac-font-sm);">' +
          '<div style="color: var(--pac-text-muted); padding: var(--pac-sp-md); text-align: center;">Waiting for game data...</div>' +
        '</div>';

      containerEl = body.querySelector('#pac-intel-players');

      PAC.UI.Events.on('extraction:updated', _updateDisplay);
      PAC.UI.Events.on('state:teamChanged', function() { lastFingerprint = ''; _updateDisplay(); });
      PAC.UI.Events.on('state:pokemonSelected', function() { lastFingerprint = ''; _updateDisplay(); });
    }
  };

  function _updateDisplay() {
    if (!containerEl) return;
    var lastPoolData = PAC.State.lastPoolData;
    var state = PAC.State.state;
    var Utils = PAC.Utils;
    var Data  = PAC.Data;

    if (!lastPoolData || !lastPoolData.playerBoards) {
      containerEl.innerHTML = '<div style="color: var(--pac-text-muted); padding: var(--pac-sp-md); text-align: center;">Waiting for game data...</div>';
      return;
    }

    // Gather all player names
    var allNames = new Set();
    var sources = [lastPoolData.playerBoards, lastPoolData.playerBenches];
    sources.forEach(function(src) {
      if (src) Object.keys(src).forEach(function(n) { allNames.add(n); });
    });

    if (allNames.size === 0) {
      containerEl.innerHTML = '<div style="color: var(--pac-text-muted); padding: var(--pac-sp-md); text-align: center;">No players detected</div>';
      return;
    }

    var sorted = Array.from(allNames).sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });

    // Gather target families for contested checking
    var targetFamilies = (state.teamTargets || [])
      .filter(function(t) { return t.enabled; })
      .map(function(t) {
        return { family: Utils.getEvolutionFamily(Utils.getBaseForm(t.pokemon)), pokemon: t.pokemon };
      });

    if (state.targetPokemon) {
      var mainFam = Utils.getEvolutionFamily(Utils.getBaseForm(state.targetPokemon));
      if (!targetFamilies.some(function(t) { return t.pokemon === state.targetPokemon; })) {
        targetFamilies.push({ family: mainFam, pokemon: state.targetPokemon });
      }
    }

    // Dirty check — include actual board/bench data, not just names
    var fp = JSON.stringify({
      players: sorted,
      boards: lastPoolData.playerBoards,
      benches: lastPoolData.playerBenches,
      targets: targetFamilies.map(function(t) { return t.pokemon; }),
      mainTarget: state.targetPokemon,
      counts: lastPoolData.pokemonCounts
    });
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;

    // Render
    var html = sorted.map(function(playerName) {
      var board = (lastPoolData.playerBoards && lastPoolData.playerBoards[playerName]) || [];
      var bench = (lastPoolData.playerBenches && lastPoolData.playerBenches[playerName]) || [];
      var allUnits = board.concat(bench);
      var isYou = playerName === state.playerName;
      var isExpanded = expandedPlayers.has(playerName);

      // Player level
      var level = (lastPoolData.playerLevels && lastPoolData.playerLevels[playerName]) || null;

      // Contested check — does this player have any of your target families?
      var isContested = false;
      var contestedFamilies = new Set();
      if (!isYou && targetFamilies.length > 0) {
        allUnits.forEach(function(unit) {
          var uName = (unit.name || '').toUpperCase();
          targetFamilies.forEach(function(target) {
            if (target.family.indexOf(uName) !== -1) {
              isContested = true;
              target.family.forEach(function(f) { contestedFamilies.add(f); });
            }
          });
        });
      }

      // Units with pool remaining
      var unitsHtml = allUnits.map(function(unit) {
        var uName = (unit.name || '').toUpperCase();
        var stars = '';
        for (var s = 0; s < (unit.stars || 1); s++) stars += '★';
        var isUC = contestedFamilies.has(uName);

        // Pool remaining calculation
        var poolTag = '';
        var baseForm = Utils.getBaseForm(uName);
        var pokemonData = Data.POKEMON_DATA;
        var rarity = pokemonData && pokemonData[baseForm] ? pokemonData[baseForm].rarity : null;
        var POOL_COPIES = Data.POOL_COPIES;
        var EVOLUTION_CHAINS = Data.EVOLUTION_CHAINS;

        if (rarity && POOL_COPIES && POOL_COPIES[rarity]) {
          var chain = EVOLUTION_CHAINS && EVOLUTION_CHAINS[baseForm];
          var maxStars = chain && chain[0] && chain[0].maxStars ? chain[0].maxStars : 3;
          var poolMax = maxStars === 2
            ? POOL_COPIES[rarity].twoStar
            : POOL_COPIES[rarity].threeStar;

          // Count all copies taken from this family globally
          var family = Utils.getEvolutionFamily(baseForm);
          var copiesTaken = 0;
          if (lastPoolData.pokemonCounts) {
            for (var fi = 0; fi < family.length; fi++) {
              var fName = family[fi];
              var fCount = lastPoolData.pokemonCounts[fName] || 0;
              if (fCount > 0) {
                copiesTaken += fCount * Utils.getEvolutionCost(fName);
              }
            }
          }

          var poolRemaining = Math.max(0, poolMax - copiesTaken);
          var pct = poolRemaining / poolMax;
          var poolColor = pct < 0.3 ? 'var(--pac-red, #f44336)' : (pct < 0.7 ? '#ff9800' : 'var(--pac-text-muted)');

          poolTag = ' <span style="font-size:10px;color:' + poolColor + ';">(' + poolRemaining + '/' + poolMax + ')</span>';
        }

        var unitColor = isUC ? 'var(--pac-red, #ff9800)' : 'var(--pac-text-secondary)';
        return '<span style="color:' + unitColor + ';margin-right:var(--pac-sp-xs);white-space:nowrap;">' +
          uName + ' <span style="color:#fbbf24;font-size:10px;">' + stars + '</span>' + poolTag +
          '</span>';
      }).join('');

      if (!unitsHtml) unitsHtml = '<span style="color:var(--pac-text-muted);font-style:italic;">No units</span>';

      var borderColor = isContested ? 'var(--pac-red, #ff9800)' : (isYou ? 'var(--pac-accent)' : 'var(--pac-border-primary)');
      var levelStr = level ? ' Lv.' + level : '';

      return '<div class="pac-collapsible' + (isExpanded ? ' pac-collapsible--open' : '') + '" data-player="' + playerName + '" ' +
        'style="border-color:' + borderColor + ';">' +
        '<button class="pac-collapsible__trigger pac-intel-trigger" data-player="' + playerName + '">' +
          '<span>' +
            (isYou ? '👤 ' : '') +
            (isContested ? '⚔️ ' : '') +
            playerName +
            '<span style="color:var(--pac-text-muted);font-weight:normal;"> (' + allUnits.length + ')' + levelStr + '</span>' +
          '</span>' +
          '<span class="pac-collapsible__arrow">▶</span>' +
        '</button>' +
        '<div class="pac-collapsible__body" style="font-size:var(--pac-font-xs);">' +
          '<div style="line-height:1.8;">' + unitsHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    containerEl.innerHTML = html;

    // Re-attach accordion handlers
    containerEl.querySelectorAll('.pac-intel-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function() {
        var pName = trigger.dataset.player;
        var parent = trigger.parentElement;
        if (expandedPlayers.has(pName)) {
          expandedPlayers.delete(pName);
          parent.classList.remove('pac-collapsible--open');
        } else {
          expandedPlayers.add(pName);
          parent.classList.add('pac-collapsible--open');
        }
      });
    });
  }

  if (PAC.DEBUG_MODE) {
    if (PAC.DEBUG_MODE) console.log('PAC Panels: Intel loaded');
  }
})();
