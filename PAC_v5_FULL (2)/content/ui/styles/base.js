/**
 * PAC v4 — Base Styles
 */
(function() {
  'use strict';

  PAC.UI.Styles.Base = `
    /* Kill ALL scrollbars */
    #pac-root *::-webkit-scrollbar { display: none !important; }
    #pac-root * { -ms-overflow-style: none !important; scrollbar-width: none !important; }

    #pac-root {
      position: fixed;
      z-index: 99999;
      font-family: var(--pac-font);
      color: var(--pac-text);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      user-select: none;
      cursor: grab;
      overflow: visible;
    }
    #pac-root:active { cursor: grabbing; }

    #pac-root .pac-hidden { display: none !important; }

    /* ── Global Checkbox Accent ──────────────── */
    #pac-root input[type="checkbox"],
    [id^="pac-"] input[type="checkbox"] {
      accent-color: #2ecc71;
      color-scheme: dark;
    }

    /* ── Toast Notifications ────────────────── */
    .pac-toast {
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      background: rgba(30,30,50,0.95);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      animation: pac-toast-in 200ms ease-out;
    }
    .pac-toast--success { border-color: rgba(46,213,115,0.4); color: #2ED573; }
    .pac-toast--warning { border-color: rgba(255,165,2,0.4); color: #FFA502; }
    .pac-toast--error { border-color: rgba(255,71,87,0.4); color: #FF4757; }
    @keyframes pac-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(8px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* ── Resolver Popup ────────────────────── */
    .pac-resolver {
      position: fixed;
      top: 8px;
      right: 8px;
      z-index: 100001;
      background: rgba(15,15,35,0.97);
      border: 2px solid rgba(0,255,204,0.35);
      border-radius: 12px;
      padding: 14px 18px;
      min-width: 280px;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 20px rgba(0,255,204,0.1);
      font-family: var(--pac-font);
      color: #fff;
      animation: pac-resolver-in 250ms ease-out;
    }
    @keyframes pac-resolver-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .pac-resolver-title {
      font-size: 13px;
      font-weight: 700;
      color: #00ffcc;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pac-resolver-slot {
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .pac-resolver-slot:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .pac-resolver-label {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 6px;
    }
    .pac-resolver-rarity {
      font-weight: 700;
      text-transform: capitalize;
    }
    .pac-resolver-btns {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pac-resolver-btn {
      padding: 6px 14px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--pac-font);
      cursor: pointer;
      transition: all 120ms ease;
    }
    .pac-resolver-btn:hover {
      background: rgba(0,255,204,0.15);
      border-color: rgba(0,255,204,0.4);
      color: #00ffcc;
    }
    }

    /* Selection */
    #pac-root ::selection {
      background: var(--pac-accent-20);
      color: var(--pac-text);
    }

    /* ── Resize handles ──────────────────────── */
    .pac-resize {
      position: absolute;
      z-index: 10;
    }
    .pac-resize--n  { top: -0.8vmin; left: 10%; right: 10%; height: 1.6vmin; cursor: ns-resize; }
    .pac-resize--s  { bottom: -0.8vmin; left: 10%; right: 10%; height: 1.6vmin; cursor: ns-resize; }
    .pac-resize--e  { right: -0.8vmin; top: 10%; bottom: 10%; width: 1.6vmin; cursor: ew-resize; }
    .pac-resize--w  { left: -0.8vmin; top: 10%; bottom: 10%; width: 1.6vmin; cursor: ew-resize; }
    .pac-resize--ne { top: -1.12vmin; right: -1.12vmin; width: 2.88vmin; height: 2.88vmin; cursor: nesw-resize; }
    .pac-resize--nw { top: -1.12vmin; left: -1.12vmin; width: 2.88vmin; height: 2.88vmin; cursor: nwse-resize; }
    .pac-resize--se { bottom: -1.12vmin; right: -1.12vmin; width: 2.88vmin; height: 2.88vmin; cursor: nwse-resize; }
    .pac-resize--sw { bottom: -1.12vmin; left: -1.12vmin; width: 2.88vmin; height: 2.88vmin; cursor: nesw-resize; }

    /* ── Reopen pill ─────────────────────────── */
    @keyframes pac-reticle-pulse {
      0%, 100% { opacity: 0.5; text-shadow: 0 0 4px transparent; }
      50% { opacity: 1; text-shadow: 0 0 8px rgba(48, 213, 200, 0.6); }
    }

    #pac-reopen {
      position: fixed;
      z-index: 99998;
      top: 4.8vmin;
      right: 4.8vmin;
      background: rgba(20, 20, 32, 0.9);
      backdrop-filter: blur(1.28vmin);
      -webkit-backdrop-filter: blur(1.28vmin);
      border-radius: 10px;
      border: 1px solid rgba(48, 213, 200, 0.2);
      padding: 10px 18px;
      font-family: var(--pac-font);
      font-size: 18px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      cursor: grab;
      opacity: 0;
      transform: scale(0.8);
      pointer-events: none;
      transition: opacity 0.3s, transform 0.3s;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #pac-reopen:active { cursor: grabbing; }
    #pac-reopen .pac-reticle {
      color: #30D5C8;
      font-size: 20px;
      animation: pac-reticle-pulse 2s ease-in-out infinite;
    }
    #pac-reopen:hover {
      border-color: rgba(48, 213, 200, 0.4);
      color: rgba(255, 255, 255, 0.7);
    }
    #pac-reopen.pac-visible {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }
  `;
})();
