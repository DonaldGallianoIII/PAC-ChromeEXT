/**
 * PAC v4 — Scout Section
 * Player name, live tracking, poll speed, extractor injection.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.scout = {
    render: function(container) {
      container.innerHTML =
        '<div class="pac-group">' +
          '<span class="pac-label">Your In-Game Name</span>' +
          '<input type="text" id="pac-scout-name" value="Deuce222X" placeholder="Player name...">' +
        '</div>' +

        '<div class="pac-group">' +
          '<div class="pac-row pac-row--center" style="gap:16px">' +
            /* Live tracking badge */
            '<div class="pac-badge pac-badge--off" id="pac-scout-badge">' +
              '<label class="pac-toggle">' +
                '<input type="checkbox" id="pac-scout-live">' +
                '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
              '</label>' +
              '<span class="pac-badge-label">Live Tracking</span>' +
            '</div>' +
          '</div>' +
          '<div id="pac-scout-status" style="font-size:12px;font-weight:700;color:#fff;margin-top:8px">OFF</div>' +
        '</div>' +

        '<div class="pac-group">' +
          '<span class="pac-label">Poll Speed</span>' +
          '<select id="pac-scout-speed">' +
            '<option value="11" selected>Turbo (11ms)</option>' +
            '<option value="50">Fast (50ms)</option>' +
            '<option value="100">Normal (100ms)</option>' +
          '</select>' +
        '</div>' +

        '<div class="pac-group">' +
          '<button class="pac-btn pac-btn--primary" id="pac-scout-reinject">' +
            '🔄 New Game — Reinject Extractor' +
          '</button>' +
        '</div>';

      els.name = container.querySelector('#pac-scout-name');
      els.live = container.querySelector('#pac-scout-live');
      els.badge = container.querySelector('#pac-scout-badge');
      els.status = container.querySelector('#pac-scout-status');
      els.speed = container.querySelector('#pac-scout-speed');
      els.reinject = container.querySelector('#pac-scout-reinject');

      // Player name
      els.name.addEventListener('change', function() {
        PAC.UI.Events.emit('scout:nameChanged', { name: els.name.value });
      });

      // Live tracking toggle
      els.live.addEventListener('change', function() {
        var isOn = els.live.checked;
        els.badge.className = 'pac-badge ' + (isOn ? 'pac-badge--on' : 'pac-badge--off');
        els.status.textContent = isOn ? 'LIVE' : 'OFF';
        els.status.style.color = isOn ? '#30D5C8' : '#fff';
        PAC.UI.Events.emit('scout:liveChanged', { enabled: isOn });

        // Update phone hub live dot
        if (PAC.UI.Engine.PhoneHub) {
          PAC.UI.Engine.PhoneHub.setLiveDot(isOn);
        }
      });

      // Poll speed
      els.speed.addEventListener('change', function() {
        PAC.UI.Events.emit('scout:speedChanged', { speed: parseInt(els.speed.value, 10) });
      });

      // Reinject
      els.reinject.addEventListener('click', function() {
        PAC.UI.Events.emit('scout:reinject');
      });

      // Listen for extraction events
      PAC.UI.Events.on('extraction:updated', function(data) {
        if (data && data.stage !== undefined) {
          els.status.textContent = 'Stage ' + data.stage;
          if (data.unitCount !== undefined) {
            els.status.textContent += ' · ' + data.unitCount + ' units';
          }
          els.status.style.color = '#30D5C8';
        }
      });

      // Load saved state
      var state = PAC.State.state;
      if (state.playerName) els.name.value = state.playerName;
      if (state.pollSpeed) els.speed.value = state.pollSpeed;
    }
  };
})();
