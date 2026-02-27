/**
 * PAC v4 — Detail Panel Styles
 * Same size as phone, positioned behind it (z:0), translates out.
 */
(function() {
  'use strict';

  PAC.UI.Styles.Slideout = `
    /* ── Detail Panel (behind phone) ─────────── */
    .pac-detail {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 0;
      transform: translateX(0%);
      opacity: 0;
      pointer-events: none;
      transition: transform var(--pac-transition), opacity 480ms var(--pac-ease);
    }

    .pac-detail--open-right {
      transform: translateX(101%);
      opacity: 1;
      pointer-events: auto;
    }
    .pac-detail--open-left {
      transform: translateX(-101%);
      opacity: 1;
      pointer-events: auto;
    }

    .pac-detail-card {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--pac-bg-glass);
      backdrop-filter: var(--pac-blur);
      -webkit-backdrop-filter: var(--pac-blur);
      border-radius: var(--pac-radius);
      border: var(--pac-border);
      box-shadow: var(--pac-shadow);
      overflow: hidden;
    }

    /* ── Detail Header ───────────────────────── */
    .pac-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }

    .pac-detail-back {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      font-size: 14px;
      color: var(--pac-accent);
      font-weight: 600;
      background: none;
      border: none;
      font-family: var(--pac-font);
      padding: 0;
    }
    .pac-detail-back:hover { opacity: 0.8; }
    .pac-detail-back-arrow { font-size: 18px; }

    .pac-detail-title-area {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pac-detail-emoji { font-size: 16px; }
    .pac-detail-name {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }
    .pac-detail-spacer { width: 50px; }

    /* ── Detail Body ─────────────────────────── */
    .pac-detail-body {
      padding: 12px 16px;
      overflow-y: auto;
      overflow-x: hidden;
      cursor: default;
      flex: 1;
      min-height: 0;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    /* Section containers */
    .pac-section-content { display: none; }
    .pac-section-content.pac-active { display: block; }
  `;
})();
