/**
 * PAC v5 — Flash Alert Handler
 *
 * Listens for extraction:updated events and checks if
 * the player's shop contains their target or team targets.
 * Applies flash CSS classes + emits alert events.
 */
(function() {
  'use strict';

  var Utils = PAC.Utils;
  var state = PAC.State.state;
  var Events = PAC.UI.Events;

  // Track current flash state to avoid redundant DOM thrashing
  var _isTargetFlashing = false;
  var _isTeamFlashing = false;

  Events.on('extraction:updated', _checkShopAlerts);

  function _checkShopAlerts(data) {
    if (!data) return;
    var lastPoolData = PAC.State.lastPoolData;
    if (!lastPoolData) return;

    var playerShop = (lastPoolData.playerShops && state.playerName)
      ? lastPoolData.playerShops[state.playerName]
      : null;

    var root = document.getElementById('pac-root');
    if (!root) return;

    // ── Main target flash ────────────────────────────────────────
    var targetInShop = false;
    var foundPokemon = null;

    if (playerShop && playerShop.length > 0 && state.targetPokemon) {
      // Ditto check
      var dittoInShop = playerShop.indexOf('DITTO') !== -1;

      // Evolution family check
      var family = state.evolutionFamily;
      if (!family || family.length === 0) {
        var baseForm = Utils.getBaseForm(state.targetPokemon);
        family = Utils.getEvolutionFamily(baseForm);
      }

      if (family && family.length > 0) {
        for (var i = 0; i < family.length; i++) {
          if (playerShop.indexOf(family[i]) !== -1) {
            foundPokemon = family[i];
            targetInShop = true;
            break;
          }
        }
      }

      // Ditto as wildcard
      if (dittoInShop && !targetInShop && state.dittoEnabled) {
        foundPokemon = 'DITTO';
        targetInShop = true;
      }
    }

    if (targetInShop !== _isTargetFlashing) {
      _isTargetFlashing = targetInShop;
      root.classList.toggle('pac-target-in-shop', targetInShop);

      if (targetInShop && !state.customSettings.disableFlash) {
        _flashPanel('target', state.customSettings.targetFlashColor || '#2bff00');
        Events.emit('alert:targetFound', { pokemon: foundPokemon });
        PAC.UI.Components.Notification.show('🎯 ' + foundPokemon + ' in your shop!', 'success', 4000);
      }
    }

    // ── Team target flash ────────────────────────────────────────
    var teamTargetInShop = false;
    var foundTeamPokemon = null;

    if (playerShop && playerShop.length > 0 && state.teamTargets && state.teamTargets.length > 0) {
      var dittoInShop2 = playerShop.indexOf('DITTO') !== -1;

      for (var j = 0; j < state.teamTargets.length; j++) {
        var target = state.teamTargets[j];
        if (!target.enabled) continue;

        var tBase = Utils.getBaseForm(target.pokemon);
        var tFamily = Utils.getEvolutionFamily(tBase);
        for (var k = 0; k < tFamily.length; k++) {
          if (playerShop.indexOf(tFamily[k]) !== -1) {
            foundTeamPokemon = tFamily[k];
            teamTargetInShop = true;
            break;
          }
        }
        if (teamTargetInShop) break;
      }

      if (dittoInShop2 && !teamTargetInShop && state.dittoEnabled) {
        foundTeamPokemon = 'DITTO';
        teamTargetInShop = true;
      }
    }

    if (teamTargetInShop !== _isTeamFlashing) {
      _isTeamFlashing = teamTargetInShop;
      root.classList.toggle('pac-team-in-shop', teamTargetInShop);

      if (teamTargetInShop && !state.customSettings.disableFlash) {
        _flashPanel('team', state.customSettings.teamFlashColor || '#0033ff');
        Events.emit('alert:teamFound', { pokemon: foundTeamPokemon });
      }
    }
  }

  /**
   * Apply a flash animation to a panel.
   * Uses CSS animation class that auto-removes after completing.
   */
  function _flashPanel(panelId, color) {
    var root = document.getElementById('pac-root');
    if (!root) return;

    var speed = state.customSettings.flashSpeed || 250;
    var panel = root.querySelector('[data-panel-id="' + panelId + '"]');

    // Also flash the root border as a catch-all
    root.style.setProperty('--pac-flash-color', color);
    root.classList.add('pac-flashing');

    if (panel) {
      panel.style.setProperty('--pac-flash-color', color);
      panel.classList.add('pac-flashing');
    }

    setTimeout(function() {
      root.classList.remove('pac-flashing');
      if (panel) panel.classList.remove('pac-flashing');
    }, speed * 6); // 6 blinks
  }

  // Reset on new game
  Events.on('extraction:newGame', function() {
    _isTargetFlashing = false;
    _isTeamFlashing = false;
    var root = document.getElementById('pac-root');
    if (root) {
      root.classList.remove('pac-target-in-shop', 'pac-team-in-shop', 'pac-flashing');
    }
  });

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Flash alerts loaded');
})();
