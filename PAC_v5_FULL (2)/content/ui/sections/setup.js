/**
 * PAC v5 — Setup Section
 * Player name, live tracking, connection status, poll speed, reinject.
 * This is the "launch pad" — set it once at game start, glance at status.
 */
(function() {
  'use strict';

  var els = {};

  PAC.UI.Sections.setup = {
    render: function(container) {
      container.innerHTML =
        /* ── Connection Status (big, obvious) ──────── */
        '<div class="pac-group" style="text-align:center">' +
          '<div id="pac-setup-status-badge" style="' +
            'display:inline-flex;align-items:center;gap:8px;' +
            'padding:8px 16px;border-radius:20px;font-size:13px;font-weight:700;' +
            'background:rgba(255,71,87,0.15);border:1px solid rgba(255,71,87,0.3);color:#ff4757;">' +
            '<span id="pac-setup-dot" style="width:8px;height:8px;border-radius:50%;background:#ff4757;"></span>' +
            '<span id="pac-setup-status-text">DISCONNECTED</span>' +
          '</div>' +
        '</div>' +

        /* ── Player Name ───────────────────────────── */
        '<div class="pac-group">' +
          '<span class="pac-label">Player Name</span>' +
          '<input type="text" id="pac-setup-name" value="Deuce222X" placeholder="Your in-game name...">' +
        '</div>' +

        /* ── Live Tracking Toggle ──────────────────── */
        '<div class="pac-group">' +
          '<div class="pac-row pac-row--spread" style="align-items:center">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:600;color:var(--pac-text-primary)">Live Tracking</div>' +
              '<div style="font-size:11px;color:var(--pac-text-muted)">Auto-read game state</div>' +
            '</div>' +
            '<label class="pac-toggle">' +
              '<input type="checkbox" id="pac-setup-live">' +
              '<div class="pac-toggle-track"><div class="pac-toggle-knob"></div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +

        /* ── Poll Speed ────────────────────────────── */
        '<div class="pac-group">' +
          '<span class="pac-label">Poll Speed</span>' +
          '<select id="pac-setup-speed">' +
            '<option value="11" selected>Turbo (11ms)</option>' +
            '<option value="50">Fast (50ms)</option>' +
            '<option value="100">Normal (100ms)</option>' +
          '</select>' +
        '</div>' +

        /* ── Reinject ──────────────────────────────── */
        '<div class="pac-group">' +
          '<button class="pac-btn pac-btn--primary pac-btn--block" id="pac-setup-reinject">' +
            '🔄 New Game — Reinject Extractor' +
          '</button>' +
        '</div>';

      // Cache refs
      els.statusBadge = container.querySelector('#pac-setup-status-badge');
      els.dot = container.querySelector('#pac-setup-dot');
      els.statusText = container.querySelector('#pac-setup-status-text');
      els.name = container.querySelector('#pac-setup-name');
      els.live = container.querySelector('#pac-setup-live');
      els.speed = container.querySelector('#pac-setup-speed');
      els.reinject = container.querySelector('#pac-setup-reinject');

      // ── Wire Events ───────────────────────────────

      // Player name
      els.name.addEventListener('change', function() {
        PAC.State.state.playerName = els.name.value;
        PAC.State.savePlayerName();
        PAC.UI.Events.emit('scout:nameChanged', { name: els.name.value });
      });

      // Live tracking toggle
      els.live.addEventListener('change', function() {
        var isOn = els.live.checked;
        PAC.State.liveTrackingActive = isOn;

        if (isOn) {
          _setStatus('connecting', 'CONNECTING...');
        } else {
          _setStatus('off', 'DISCONNECTED');
        }

        PAC.UI.Events.emit('scout:liveChanged', { enabled: isOn });

        // Update phone hub live dot
        if (PAC.UI.Engine.PhoneHub) {
          PAC.UI.Engine.PhoneHub.setLiveDot(isOn);
        }
      });

      // Poll speed
      els.speed.addEventListener('change', function() {
        PAC.State.currentPollSpeed = parseInt(els.speed.value, 10);
        PAC.UI.Events.emit('scout:speedChanged', { speed: PAC.State.currentPollSpeed });
      });

      // Reinject
      els.reinject.addEventListener('click', function() {
        PAC.UI.Events.emit('scout:reinject');
        _setStatus('off', 'REINJECTING...');
      });

      // Listen for extraction updates → show connected status
      PAC.UI.Events.on('extraction:updated', function(data) {
        if (!data) return;
        var parts = [];
        if (data.stage !== undefined) parts.push('Stage ' + data.stage);
        if (data.unitCount !== undefined) parts.push(data.unitCount + ' units');
        _setStatus('on', parts.length > 0 ? parts.join(' · ') : 'CONNECTED');

        // Sync toggle state
        if (!els.live.checked) {
          els.live.checked = true;
        }
      });

      // No game room found (in lobby, not in a match)
      PAC.UI.Events.on('extraction:noGame', function() {
        _setStatus('connecting', 'SCANNING · No game found');
      });

      // Bridge auto-starts polling — sync UI
      PAC.UI.Events.on('bridge:autoStarted', function() {
        els.live.checked = true;
        _setStatus('connecting', 'CONNECTING...');
      });

      // Load saved state
      var state = PAC.State.state;
      if (state.playerName) els.name.value = state.playerName;
      if (PAC.State.currentPollSpeed) els.speed.value = PAC.State.currentPollSpeed;

      // If bridge already started before this panel rendered
      if (PAC.State.liveTrackingActive) {
        els.live.checked = true;
        _setStatus(PAC.State.isConnected ? 'on' : 'connecting',
                   PAC.State.isConnected ? 'CONNECTED' : 'CONNECTING...');
      }
    }
  };

  function _setStatus(mode, text) {
    if (!els.statusBadge) return;

    els.statusText.textContent = text;

    if (mode === 'on') {
      els.statusBadge.style.background = 'rgba(48,213,200,0.15)';
      els.statusBadge.style.borderColor = 'rgba(48,213,200,0.3)';
      els.statusBadge.style.color = '#30D5C8';
      els.dot.style.background = '#30D5C8';
    } else if (mode === 'connecting') {
      els.statusBadge.style.background = 'rgba(243,156,18,0.15)';
      els.statusBadge.style.borderColor = 'rgba(243,156,18,0.3)';
      els.statusBadge.style.color = '#f39c12';
      els.dot.style.background = '#f39c12';
    } else {
      els.statusBadge.style.background = 'rgba(255,71,87,0.15)';
      els.statusBadge.style.borderColor = 'rgba(255,71,87,0.3)';
      els.statusBadge.style.color = '#ff4757';
      els.dot.style.background = '#ff4757';
    }
  }

  if (PAC.DEBUG_MODE) console.log('PAC Sections: Setup loaded');
})();
