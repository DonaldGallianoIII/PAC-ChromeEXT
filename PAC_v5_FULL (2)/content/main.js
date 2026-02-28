/**
 * PAC v5 — Main Entry Point
 *
 * Boot sequence:
 * 1. Verify modules
 * 2. Load saved state
 * 3. Initialize Phone Hub (creates DOM, injects styles)
 * 4. Initialize Slide-Out
 * 5. EULA check
 * 6. Expose debug interface
 */
(function() {
  'use strict';

  var hasStarted = false;

  // Verify core modules
  if (!window.PAC || !PAC.Data || !PAC.Utils || !PAC.State || !PAC.Calc || !PAC.UI) {
    console.error('PAC v5: Missing core modules');
    return;
  }

  if (!PAC.UI.Engine.PhoneHub || !PAC.UI.Engine.SlideOut || !PAC.UI.Engine.Drag) {
    console.error('PAC v5: Missing UI engine modules');
    return;
  }

  async function start() {
    if (hasStarted) return;
    hasStarted = true;

    if (PAC.DEBUG_MODE) console.log('🚀 PAC v5 starting...');

    // Load saved state
    PAC.State.loadPlayerName();
    PAC.State.loadTeamTargets();
    PAC.State.loadRollHistory();

    // Initialize phone hub (creates #pac-root, injects all styles)
    PAC.UI.Engine.PhoneHub.init();

    // Initialize slide-out system
    PAC.UI.Engine.SlideOut.init();

    // Initialize chat engine (Supabase + WS interceptor)
    if (PAC.UI.Engine.Chat) {
      PAC.UI.Engine.Chat.init();
    }

    // Initialize feedback engine (separate Supabase instance)
    if (PAC.UI.Engine.Feedback) {
      PAC.UI.Engine.Feedback.init();
    }

    // EULA check (needs #pac-root to exist)
    var eulaAccepted = localStorage.getItem('pac_eulaAccepted');
    if (!eulaAccepted && PAC.UI.Panels.EULA) {
      await PAC.UI.Panels.EULA.showIfNeeded();
      if (PAC.DEBUG_MODE) console.log('📜 EULA accepted');
    }

    if (PAC.DEBUG_MODE) console.log('✅ PAC v5 initialized');
    if (PAC.DEBUG_MODE) console.log('📱 Sections available:', Object.keys(PAC.UI.Sections));
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    setTimeout(start, 500);
  }

  // Debug interface
  window.__PACCalc = {
    version: PAC.VERSION,
    isConnected: function() { return PAC.State.isConnected; },
    getState: function() { return PAC.State.state; },
    getPoolData: function() { return PAC.State.lastPoolData; },
    getPokemonData: function() { return PAC.Data.POKEMON_DATA; },
    sections: function() { return Object.keys(PAC.UI.Sections); },
    openSection: function(id) { PAC.UI.Engine.SlideOut.open(id); },
    closeSection: function() { PAC.UI.Engine.SlideOut.close(); },
    events: function() { return PAC.UI.Events.debug(); },
    resetEULA: function() {
      localStorage.removeItem('pac_eulaAccepted');
      console.log('PAC: EULA reset. Refresh to see it again.');
    }
  };

  if (PAC.DEBUG_MODE) console.log('PAC Main: Entry point loaded v' + PAC.VERSION);
})();
