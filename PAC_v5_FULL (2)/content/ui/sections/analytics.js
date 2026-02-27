/**
 * PAC v4.1 — Analytics Panel
 *
 * Two tabs:
 *   Live — Real-time roll history by player
 *   Stats — Luck score, rarity charts, top pokemon
 *
 * Includes the shop tracking engine (trackShopRoll).
 * Fishing has been extracted to its own section (fishing.js).
 */
(function() {
  'use strict';

  var els = {};
  var activeTab = 'live';
  var state, Data, Utils;

  function _refs() {
    state = PAC.State.state;
    Data = PAC.Data;
    Utils = PAC.Utils;
  }

  PAC.UI.Sections.analytics = {
    render: function(body) {
      _refs();

      body.innerHTML =
        /* ── Tabs ──────────────────────────────────────── */
        '<div class="pac-tabs">' +
          '<button class="pac-tabs__btn pac-tabs__btn--active" data-tab="live">Live</button>' +
          '<button class="pac-tabs__btn" data-tab="stats">Stats</button>' +
        '</div>' +

        /* ── Live Tab ──────────────────────────────────── */
        '<div class="pac-tab-content pac-tab-content--active" id="pac-analytics-live">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--pac-sp-sm);">' +
            '<span style="font-size: var(--pac-font-xs); color: var(--pac-text-muted);">Roll history by player</span>' +
            '<button class="pac-btn pac-btn--ghost" id="pac-analytics-clearLive" style="font-size: var(--pac-font-2xs); padding: 2px 8px;">Clear</button>' +
          '</div>' +
          '<div id="pac-analytics-liveContent">' +
            '<div style="color: var(--pac-text-muted); text-align: center; padding: var(--pac-sp-lg);">No rolls tracked yet.<br>Enable Live Tracking in Setup.</div>' +
          '</div>' +
        '</div>' +

        /* ── Stats Tab ─────────────────────────────────── */
        '<div class="pac-tab-content" id="pac-analytics-stats">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--pac-sp-sm);">' +
            '<span style="font-size: var(--pac-font-xs); color: var(--pac-text-muted);">Session analytics</span>' +
            '<button class="pac-btn pac-btn--ghost" id="pac-analytics-clearAll" style="font-size: var(--pac-font-2xs); padding: 2px 8px;">Clear All</button>' +
          '</div>' +
          '<div id="pac-analytics-statsContent">' +
            '<div style="color: var(--pac-text-muted); text-align: center; padding: var(--pac-sp-lg);">Need roll data to analyze.<br>Play some rounds with Live Tracking ON.</div>' +
          '</div>' +
        '</div>';

      // Cache refs
      els.liveContent = body.querySelector('#pac-analytics-liveContent');
      els.statsContent = body.querySelector('#pac-analytics-statsContent');

      // Tab switching
      body.querySelectorAll('.pac-tabs__btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeTab = btn.dataset.tab;
          state.analyticsTab = activeTab;

          body.querySelectorAll('.pac-tabs__btn').forEach(function(b) { b.classList.remove('pac-tabs__btn--active'); });
          btn.classList.add('pac-tabs__btn--active');

          body.querySelector('#pac-analytics-live').classList.toggle('pac-tab-content--active', activeTab === 'live');
          body.querySelector('#pac-analytics-stats').classList.toggle('pac-tab-content--active', activeTab === 'stats');

          if (activeTab === 'stats') _renderAnalytics();
        });
      });

      // Clear buttons
      body.querySelector('#pac-analytics-clearLive').addEventListener('click', function() {
        state.shopHistoryByPlayer = {};
        PAC.State.clearRollHistory();
        _renderLive();
        PAC.UI.Components.Notification.show('Roll history cleared', 'success');
      });

      body.querySelector('#pac-analytics-clearAll').addEventListener('click', function() {
        state.shopHistoryByPlayer = {};
        PAC.State.clearRollHistory();
        _renderLive();
        _renderAnalytics();
        PAC.UI.Components.Notification.show('All history cleared', 'success');
      });

      // Listen for extraction updates to track rolls
      PAC.UI.Events.on('extraction:updated', _onExtractionData);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOP TRACKING ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  function _onExtractionData(data) {
    if (!data || !state.shopTrackingEnabled) return;

    if (data.playerShops) {
      Object.keys(data.playerShops).forEach(function(playerName) {
        var shopArray = data.playerShops[playerName];
        if (shopArray) {
          var shopNames = shopArray.map(function(p) {
            return typeof p === 'string' ? p : (p && p.name ? p.name : null);
          }).filter(function(n) { return n && n.toUpperCase() !== 'DEFAULT'; });

          _trackShopRoll(playerName, shopNames, state.level);
        }
      });
    }
  }

  function _trimPokemonSeen(levelData) {
    var seenKeys = Object.keys(levelData.pokemonSeen);
    if (seenKeys.length > 300) {
      var sorted = seenKeys.sort(function(a, b) {
        return levelData.pokemonSeen[b] - levelData.pokemonSeen[a];
      });
      var trimmed = {};
      for (var t = 0; t < 200 && t < sorted.length; t++) {
        trimmed[sorted[t]] = levelData.pokemonSeen[sorted[t]];
      }
      levelData.pokemonSeen = trimmed;
    }
  }

  function _trackShopRoll(playerName, shopArray, level) {
    if (!shopArray || shopArray.length === 0) return;
    level = level || 7;

    if (!state.shopHistoryByPlayer[playerName]) {
      state.shopHistoryByPlayer[playerName] = {
        rollsByLevel: {},
        currentLevel: level,
        lastSnapshot: []
      };
    }

    var playerData = state.shopHistoryByPlayer[playerName];
    playerData.currentLevel = level;

    if (!playerData.rollsByLevel[level]) {
      playerData.rollsByLevel[level] = { rollCount: 0, pokemonSeen: {} };
    }

    var levelData = playerData.rollsByLevel[level];

    if (!playerData.lastSnapshot || playerData.lastSnapshot.length === 0) {
      levelData.rollCount++;
      shopArray.forEach(function(name) {
        if (name) {
          var upper = name.toUpperCase();
          levelData.pokemonSeen[upper] = (levelData.pokemonSeen[upper] || 0) + 1;
        }
      });
      _trimPokemonSeen(levelData);
      playerData.lastSnapshot = shopArray;
      _renderLive();
      PAC.State.saveRollHistory();
      return;
    }

    var prevSet = {};
    playerData.lastSnapshot.forEach(function(n) { prevSet[n] = true; });
    var newCount = shopArray.filter(function(n) { return !prevSet[n]; }).length;

    if (newCount >= 3) {
      levelData.rollCount++;
      shopArray.forEach(function(name) {
        if (name) {
          var upper = name.toUpperCase();
          levelData.pokemonSeen[upper] = (levelData.pokemonSeen[upper] || 0) + 1;
        }
      });
      _trimPokemonSeen(levelData);
      _renderLive();
      PAC.State.saveRollHistory();
    }

    playerData.lastSnapshot = shopArray;

    // Cap player count — keep most active 16
    var playerNames = Object.keys(state.shopHistoryByPlayer);
    if (playerNames.length > 20) {
      var rollTotals = {};
      playerNames.forEach(function(name) {
        var total = 0;
        var entry = state.shopHistoryByPlayer[name];
        var levels = (entry && entry.rollsByLevel) || {};
        Object.keys(levels).forEach(function(k) { total += levels[k].rollCount; });
        rollTotals[name] = total;
      });
      var sortedPlayers = playerNames.sort(function(a, b) {
        return rollTotals[b] - rollTotals[a];
      });
      sortedPlayers.slice(16).forEach(function(name) {
        delete state.shopHistoryByPlayer[name];
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderLive() {
    if (!els.liveContent) return;

    var players = Object.keys(state.shopHistoryByPlayer);
    if (players.length === 0) {
      els.liveContent.innerHTML = '<div style="color: var(--pac-text-muted); text-align: center; padding: var(--pac-sp-lg);">No rolls tracked yet.</div>';
      return;
    }

    var html = players.sort().map(function(name) {
      var pd = state.shopHistoryByPlayer[name];
      var totalRolls = 0;
      Object.values(pd.rollsByLevel).forEach(function(ld) { totalRolls += ld.rollCount; });
      var isYou = name === state.playerName;

      return '<div style="padding: var(--pac-sp-xs) var(--pac-sp-sm); margin-bottom: var(--pac-sp-2xs); ' +
        'background: var(--pac-bg-glass); border-radius: var(--pac-radius-sm); border-left: 3px solid ' +
        (isYou ? 'var(--pac-accent)' : 'var(--pac-border-primary)') + ';">' +
        '<div style="display: flex; justify-content: space-between; font-size: var(--pac-font-sm);">' +
          '<span style="color: ' + (isYou ? 'var(--pac-accent)' : 'var(--pac-text-primary)') + ';">' +
            name + (isYou ? ' (You)' : '') +
          '</span>' +
          '<span style="color: var(--pac-text-muted);">' + totalRolls + ' rolls · Lv' + pd.currentLevel + '</span>' +
        '</div></div>';
    }).join('');

    els.liveContent.innerHTML = html;
  }

  function _renderAnalytics() {
    if (!els.statsContent) return;

    var players = Object.keys(state.shopHistoryByPlayer);
    if (players.length === 0) {
      els.statsContent.innerHTML = '<div style="color: var(--pac-text-muted); text-align: center; padding: var(--pac-sp-lg);">Need roll data to analyze.</div>';
      return;
    }

    var totalRolls = 0;
    var allSeen = {};
    players.forEach(function(name) {
      var pd = state.shopHistoryByPlayer[name];
      Object.values(pd.rollsByLevel).forEach(function(ld) {
        totalRolls += ld.rollCount;
        Object.keys(ld.pokemonSeen).forEach(function(poke) {
          allSeen[poke] = (allSeen[poke] || 0) + ld.pokemonSeen[poke];
        });
      });
    });

    var uniquePokemon = Object.keys(allSeen).length;
    var totalSightings = Object.values(allSeen).reduce(function(a, b) { return a + b; }, 0);

    var sorted = Object.entries(allSeen).sort(function(a, b) { return b[1] - a[1]; });
    var top10 = sorted.slice(0, 10);

    var topHtml = top10.map(function(entry, i) {
      var name = entry[0];
      var count = entry[1];
      var pct = ((count / totalSightings) * 100).toFixed(1);
      var rarity = (Data.POKEMON_DATA[name] || {}).rarity || 'common';
      return '<div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: var(--pac-font-xs);">' +
        '<span><span class="pac-badge pac-badge--' + rarity + '">' + (i + 1) + '</span> ' + name + '</span>' +
        '<span style="color: var(--pac-text-muted);">' + count + ' (' + pct + '%)</span></div>';
    }).join('');

    els.statsContent.innerHTML =
      '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--pac-sp-sm); margin-bottom: var(--pac-sp-md);">' +
        _statCard('Total Rolls', totalRolls) +
        _statCard('Unique Seen', uniquePokemon) +
        _statCard('Total Sightings', totalSightings) +
      '</div>' +
      '<div style="font-size:12px;font-weight:600;color:var(--pac-text-primary);margin-bottom:6px">Most Seen Pokemon</div>' +
      topHtml;
  }

  function _statCard(label, value) {
    return '<div style="text-align: center; padding: var(--pac-sp-sm); background: var(--pac-bg-glass); border-radius: var(--pac-radius-sm);">' +
      '<div style="font-size: var(--pac-font-lg); font-weight: 700; color: var(--pac-accent);">' + value + '</div>' +
      '<div style="font-size: var(--pac-font-2xs); color: var(--pac-text-muted);">' + label + '</div></div>';
  }

  // Export tracking function for external use
  PAC.UI.Panels.Analytics = {
    trackShopRoll: _trackShopRoll
  };

  if (PAC.DEBUG_MODE) console.log('PAC Panels: Analytics loaded');
})();
