/**
 * PAC v4 — Animations
 */
(function() {
  'use strict';

  PAC.UI.Styles.Animations = `
    @keyframes pac-appear {
      from { opacity: 0; transform: translateY(-3.2vmin) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes pac-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .pac-live-dot--on { animation: pac-pulse 2s ease-in-out infinite; }

    @keyframes pac-flash-blink {
      0%, 100% { box-shadow: var(--pac-shadow); }
      50% { box-shadow: var(--pac-shadow), 0 0 4.8vmin var(--pac-flash-color, rgba(43,255,0,0.5)); }
    }
    .pac-flashing .pac-phone {
      animation: pac-flash-blink 0.5s ease-in-out 6;
    }
  `;
})();
