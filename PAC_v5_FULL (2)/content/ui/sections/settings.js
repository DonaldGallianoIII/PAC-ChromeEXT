/**
 * PAC v4 — Settings Section
 * Flash alerts, export/import, reset.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.settings = {
    render: function(container) {
      container.innerHTML =
        /* Flash Alerts */
        '<div class="pac-group">' +
          '<div class="pac-row pac-row--spread">' +
            '<span style="font-size:12px;color:rgba(255,255,255,0.6)">Flash Alerts</span>' +
            '<label class="pac-toggle">' +
              '<input type="checkbox" id="pac-set-flash" checked>' +
              '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +

        /* Epilepsy safe mode */
        '<div class="pac-group">' +
          '<div class="pac-row pac-row--spread">' +
            '<span style="font-size:12px;color:rgba(255,255,255,0.6)">Disable Flash (Epilepsy)</span>' +
            '<label class="pac-toggle">' +
              '<input type="checkbox" id="pac-set-epilepsy">' +
              '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="pac-divider"></div>' +

        /* Export / Import */
        '<div class="pac-group">' +
          '<span class="pac-label">Export / Import</span>' +
          '<div class="pac-row" style="gap:8px">' +
            '<button class="pac-btn pac-btn--ghost pac-btn--flex" id="pac-set-export">Export Config</button>' +
            '<button class="pac-btn pac-btn--ghost pac-btn--flex" id="pac-set-import">Import Config</button>' +
          '</div>' +
        '</div>' +

        '<div class="pac-divider"></div>' +

        /* Reset */
        '<div class="pac-group">' +
          '<button class="pac-btn pac-btn--ghost pac-btn--block" id="pac-set-reset" ' +
            'style="color:rgba(255,71,87,0.7);border-color:rgba(255,71,87,0.2)">' +
            '⚠ Reset All Settings' +
          '</button>' +
        '</div>';

      els.flash = container.querySelector('#pac-set-flash');
      els.epilepsy = container.querySelector('#pac-set-epilepsy');
      els.exportBtn = container.querySelector('#pac-set-export');
      els.importBtn = container.querySelector('#pac-set-import');
      els.resetBtn = container.querySelector('#pac-set-reset');

      // Flash alerts
      els.flash.addEventListener('change', function() {
        PAC.UI.Events.emit('settings:flashChanged', { enabled: els.flash.checked });
      });

      // Epilepsy
      els.epilepsy.addEventListener('change', function() {
        PAC.UI.Events.emit('settings:epilepsyChanged', { enabled: els.epilepsy.checked });
      });

      // Export
      els.exportBtn.addEventListener('click', function() {
        var state = PAC.State.state;
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'pac_config.json';
        a.click();
        URL.revokeObjectURL(url);
      });

      // Import
      els.importBtn.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(ev) {
            try {
              var state = JSON.parse(ev.target.result);
              Object.assign(PAC.State.state, state);
              PAC.UI.Events.emit('settings:imported');
            } catch (err) {
              console.error('PAC: Invalid config file', err);
            }
          };
          reader.readAsText(file);
        });
        input.click();
      });

      // Reset
      els.resetBtn.addEventListener('click', function() {
        if (confirm('Reset all PAC settings? This cannot be undone.')) {
          localStorage.removeItem('pac_state');
          localStorage.removeItem('pac_overlay');
          PAC.UI.Events.emit('settings:reset');
          location.reload();
        }
      });

      // Load saved state
      var state = PAC.State.state;
      if (state.settings) {
        if (state.settings.flash === false) els.flash.checked = false;
        if (state.settings.epilepsy) els.epilepsy.checked = true;
      }
    }
  };
})();
