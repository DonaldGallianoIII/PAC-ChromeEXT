/**
 * PAC v4 — Target Section
 * Level, Rarity, Evolution selectors + Wild Mechanics toggles.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.target = {
    render: function(container) {
      container.innerHTML =
        '<div class="pac-group">' +
          '<div class="pac-row">' +
            '<div class="pac-field">' +
              '<span class="pac-label">Level</span>' +
              '<select id="pac-tgt-level">' +
                [1,2,3,4,5,6,7,8,9].map(function(l) {
                  return '<option value="' + l + '"' + (l === 7 ? ' selected' : '') + '>Lv ' + l + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div class="pac-field">' +
              '<span class="pac-label">Rarity</span>' +
              '<select id="pac-tgt-rarity">' +
                '<option value="common">Common</option>' +
                '<option value="uncommon">Uncommon</option>' +
                '<option value="rare" selected>Rare</option>' +
                '<option value="epic">Epic</option>' +
                '<option value="ultra">Ultra</option>' +
              '</select>' +
            '</div>' +
            '<div class="pac-field">' +
              '<span class="pac-label">Evo</span>' +
              '<select id="pac-tgt-evo">' +
                '<option value="twoStar">2★</option>' +
                '<option value="threeStar" selected>3★</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pac-divider"></div>' +

        '<div class="pac-group">' +
          '<div class="pac-group-title">🌿 Wild Mechanics</div>' +

          '<div class="pac-row pac-row--spread" style="margin-bottom:12px">' +
            '<span style="font-size:12px;color:rgba(255,255,255,0.6)">Target is Wild</span>' +
            '<label class="pac-toggle">' +
              '<input type="checkbox" id="pac-tgt-wild">' +
              '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
            '</label>' +
          '</div>' +

          '<div class="pac-row pac-row--spread" style="margin-bottom:12px">' +
            '<span style="font-size:12px;color:rgba(255,255,255,0.6)">PvE Round</span>' +
            '<label class="pac-toggle">' +
              '<input type="checkbox" id="pac-tgt-pve">' +
              '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
            '</label>' +
          '</div>' +

          '<div class="pac-row">' +
            '<div class="pac-field">' +
              '<span class="pac-label">Wild Owned</span>' +
              '<input type="number" id="pac-tgt-wildOwned" value="0" min="0">' +
            '</div>' +
            '<div class="pac-field">' +
              '<span class="pac-label">Scouted</span>' +
              '<input type="number" id="pac-tgt-wildScouted" value="0" min="0">' +
            '</div>' +
          '</div>' +
        '</div>';

      els.level = container.querySelector('#pac-tgt-level');
      els.rarity = container.querySelector('#pac-tgt-rarity');
      els.evo = container.querySelector('#pac-tgt-evo');
      els.wild = container.querySelector('#pac-tgt-wild');
      els.pve = container.querySelector('#pac-tgt-pve');
      els.wildOwned = container.querySelector('#pac-tgt-wildOwned');
      els.wildScouted = container.querySelector('#pac-tgt-wildScouted');

      els.level.addEventListener('change', _emitTarget);
      els.rarity.addEventListener('change', _emitTarget);
      els.evo.addEventListener('change', _emitTarget);
      els.wild.addEventListener('change', _emitTarget);
      els.pve.addEventListener('change', _emitTarget);
      els.wildOwned.addEventListener('input', _emitTarget);
      els.wildScouted.addEventListener('input', _emitTarget);

      var state = PAC.State.state;
      if (state.target) {
        if (state.target.level) els.level.value = state.target.level;
        if (state.target.rarity) els.rarity.value = state.target.rarity;
        if (state.target.evo) els.evo.value = state.target.evo;
        els.wild.checked = !!state.target.isWild;
        els.pve.checked = !!state.target.isPvE;
        if (state.target.wildOwned) els.wildOwned.value = state.target.wildOwned;
        if (state.target.wildScouted) els.wildScouted.value = state.target.wildScouted;
      }
      _emitTarget();
    }
  };

  function _emitTarget() {
    PAC.UI.Events.emit('target:changed', {
      level: parseInt(els.level.value, 10),
      rarity: els.rarity.value,
      evo: els.evo.value,
      isWild: els.wild.checked,
      isPvE: els.pve.checked,
      wildOwned: parseInt(els.wildOwned.value, 10) || 0,
      wildScouted: parseInt(els.wildScouted.value, 10) || 0
    });
  }
})();
