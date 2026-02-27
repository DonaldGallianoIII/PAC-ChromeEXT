/**
 * PAC v4 — Pool State Section
 * Owned/Scouted counts, target search, Ditto, Auto-Scout.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.pool = {
    render: function(container) {
      container.innerHTML =
        '<div class="pac-group">' +
          '<div class="pac-row">' +
            '<div class="pac-pill">' +
              '<div class="pac-pill-label">Owned</div>' +
              '<div class="pac-pill-value" id="pac-pool-owned">0</div>' +
            '</div>' +
            '<div class="pac-pill">' +
              '<div class="pac-pill-label">Scouted</div>' +
              '<div class="pac-pill-value" id="pac-pool-scouted">0</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pac-group" style="position:relative">' +
          '<span class="pac-label">Target Pokémon (Auto-Scout)</span>' +
          '<input type="text" id="pac-pool-search" placeholder="Type to search...">' +
          '<div id="pac-pool-autocomplete"></div>' +
        '</div>' +

        '<div class="pac-group">' +
          '<div class="pac-row pac-row--center" style="gap:24px">' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
              '<div class="pac-checkbox" id="pac-pool-ditto">✓</div>' +
              '<span style="font-size:12px;color:rgba(255,255,255,0.6)">Ditto (Stage 6+)</span>' +
            '</label>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<label class="pac-toggle">' +
                '<input type="checkbox" id="pac-pool-autoscout">' +
                '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
              '</label>' +
              '<span style="font-size:12px;color:rgba(255,255,255,0.6)">Auto-Scout</span>' +
            '</div>' +
          '</div>' +
        '</div>';

      els.owned = container.querySelector('#pac-pool-owned');
      els.scouted = container.querySelector('#pac-pool-scouted');
      els.search = container.querySelector('#pac-pool-search');
      els.autocomplete = container.querySelector('#pac-pool-autocomplete');
      els.ditto = container.querySelector('#pac-pool-ditto');
      els.autoscout = container.querySelector('#pac-pool-autoscout');

      // Ditto checkbox toggle
      var dittoOn = false;
      els.ditto.addEventListener('click', function() {
        dittoOn = !dittoOn;
        els.ditto.className = dittoOn ? 'pac-checkbox pac-checkbox--on' : 'pac-checkbox';
        els.ditto.textContent = dittoOn ? '✓' : '';
        PAC.UI.Events.emit('pool:dittoChanged', { ditto: dittoOn });
      });
      els.ditto.className = 'pac-checkbox';
      els.ditto.textContent = '';

      // Autocomplete
      if (PAC.UI.Components && PAC.UI.Components.Autocomplete) {
        PAC.UI.Components.Autocomplete.attach(els.search, els.autocomplete, function(pokemon) {
          PAC.UI.Events.emit('pool:targetSelected', { name: pokemon.name });
        });
      }

      // Auto-scout toggle
      els.autoscout.addEventListener('change', function() {
        PAC.UI.Events.emit('pool:autoScoutChanged', { enabled: els.autoscout.checked });
      });

      // Listen for updates
      PAC.UI.Events.on('extraction:updated', function(data) {
        if (data) {
          if (data.ownedCount !== undefined) els.owned.textContent = data.ownedCount;
          if (data.scoutedCount !== undefined) els.scouted.textContent = data.scoutedCount;
        }
      });
    }
  };
})();
