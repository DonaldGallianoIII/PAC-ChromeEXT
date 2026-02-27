/**
 * PAC v4 — Phone Frame Styles
 * Matched to prototype: glass card fills container, icon grid, footer.
 */
(function() {
  'use strict';

  PAC.UI.Styles.Phone = `
    /* ── Glass Card ──────────────────────────── */
    .pac-phone {
      position: relative;
      z-index: 2;
      height: 100%;
      background: var(--pac-bg-glass);
      backdrop-filter: var(--pac-blur);
      -webkit-backdrop-filter: var(--pac-blur);
      border-radius: var(--pac-radius);
      border: var(--pac-border);
      box-shadow: var(--pac-shadow);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ──────────────────────────────── */
    .pac-phone-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      cursor: grab;
      flex-shrink: 0;
    }
    .pac-phone-header:active { cursor: grabbing; }

    .pac-phone-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* 6-dot grip */
    .pac-grip {
      display: flex;
      flex-direction: column;
      gap: 3px;
      opacity: 0.3;
      margin-right: 3px;
    }
    .pac-grip-row {
      display: flex;
      gap: 3px;
    }
    .pac-grip-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #fff;
    }

    /* Live dot */
    .pac-live-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--pac-text-20);
      transition: all var(--pac-transition);
    }
    .pac-live-dot--on {
      background: var(--pac-accent);
      box-shadow: var(--pac-accent-glow);
    }

    .pac-phone-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .pac-phone-version {
      font-size: 11px;
      color: var(--pac-text-35);
      font-weight: 500;
    }

    .pac-phone-btns {
      display: flex;
      gap: 6px;
    }
    .pac-phone-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.5);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      font-family: var(--pac-font);
      padding: 0;
    }
    .pac-phone-btn:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.18);
      color: #fff;
    }

    /* ── Body (collapsible) ──────────────────── */
    .pac-phone-body {
      overflow: hidden;
      flex: 1;
      min-height: 0;
      transition: max-height var(--pac-transition), opacity 600ms var(--pac-ease);
    }
    .pac-phone-body--collapsed {
      max-height: 0 !important;
      opacity: 0;
    }

    .pac-phone-body-inner {
      padding: 16px 20px;
      overflow-y: auto;
      height: 100%;
      cursor: default;
    }

    /* "Your Apps" label */
    .pac-apps-label {
      text-align: center;
      font-size: 13px;
      color: var(--pac-text-30);
      margin-bottom: 20px;
      font-weight: 500;
      letter-spacing: 0.05em;
    }

    /* ── Icon Grid ───────────────────────────── */
    .pac-phone-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 20px;
      justify-items: center;
    }

    .pac-app-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: transform 200ms ease, opacity 200ms ease;
    }
    .pac-app-icon:hover { transform: scale(1.08); }
    .pac-app-icon:active { transform: scale(0.95); }

    .pac-app-icon-tile {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
    }

    .pac-app-icon-label {
      font-size: 11px;
      color: var(--pac-text-50);
      font-weight: 500;
      text-align: center;
      line-height: 1.2;
    }

    /* ── Footer ──────────────────────────────── */
    .pac-phone-footer {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      background: var(--pac-footer-bg);
      cursor: default;
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--pac-text-40);
      overflow: hidden;
      white-space: nowrap;
      min-width: 0;
    }
    .pac-phone-footer span {
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
  `;
})();
