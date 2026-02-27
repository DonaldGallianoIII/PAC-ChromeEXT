/**
 * PAC v5 — Section Content Styles
 * Ported from v3's battle-tested px-based design system.
 * Colors adapted to v4 teal/glass theme.
 */
(function() {
  'use strict';

  PAC.UI.Styles.Sections = `

    /* ══════════════════════════════════════════
       SECTION CONTENT — v3 design system (px)
       ══════════════════════════════════════════ */

    /* ── Core Layout ─────────────────────────── */
    .pac-section {
      margin-bottom: 16px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .pac-section:last-child { margin-bottom: 0; }

    .pac-section-title {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    .pac-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pac-row:last-child { margin-bottom: 0; }

    .pac-field {
      flex: 1;
    }
    .pac-field label {
      display: block;
      font-size: 11px;
      margin-bottom: 4px;
      color: #aaa;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ── Form Elements (inside detail body) ── */
    .pac-detail-body input,
    .pac-detail-body select {
      width: 100%;
      padding: 8px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-family: var(--pac-font);
      transition: all 0.2s;
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
      outline: none;
      max-width: 100%;
      box-sizing: border-box;
    }
    .pac-detail-body button {
      font-family: var(--pac-font);
      border: none;
      cursor: pointer;
      outline: none;
      box-sizing: border-box;
    }
    .pac-detail-body input:focus,
    .pac-detail-body select:focus {
      border-color: var(--pac-accent);
      box-shadow: 0 0 8px rgba(48,213,200,0.3);
    }
    .pac-detail-body select {
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 10px;
      padding-right: 28px;
    }
    .pac-detail-body select option {
      background: #1a1a2e;
      color: #fff;
    }
    .pac-detail-body input::placeholder {
      color: rgba(255,255,255,0.3);
    }
    .pac-detail-body input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 24px;
      padding: 0;
      background: rgba(0,0,0,0.4);
      border: none;
      border-radius: 12px;
      cursor: pointer;
      outline: none;
      transition: height 0.15s ease, border-radius 0.15s ease, box-shadow 0.15s ease;
    }
    .pac-detail-body input[type="range"]:active,
    .pac-detail-body input[type="range"].pac-slider--active {
      height: 30px;
      border-radius: 15px;
      box-shadow: 0 0 16px rgba(48,213,200,0.25);
    }
    .pac-detail-body input[type="range"]::-webkit-slider-runnable-track {
      height: inherit;
      background: transparent;
      border-radius: inherit;
    }
    .pac-detail-body input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 0;
      height: 0;
      background: transparent;
      border: none;
      cursor: grab;
    }
    .pac-detail-body input[type="range"]:active::-webkit-slider-thumb {
      cursor: grabbing;
    }
    .pac-detail-body input[type="range"]::-moz-range-track {
      height: inherit;
      background: transparent;
      border-radius: inherit;
      border: none;
    }
    .pac-detail-body input[type="range"]::-moz-range-thumb {
      width: 0;
      height: 0;
      background: transparent;
      border: none;
      cursor: grab;
    }
    .pac-detail-body input[type="range"]::-moz-range-progress {
      background: transparent;
      border: none;
    }

    @keyframes pac-healthbar-swirl {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }

    /* ── Toggle Row ──────────────────────────── */
    .pac-toggle-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }

    /* v3 compat: .pac-toggle span inside toggle rows */
    .pac-toggle-row .pac-toggle span {
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Live Controls ───────────────────────── */
    .pac-live-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: stretch;
    }
    .pac-live-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--pac-font);
      white-space: nowrap;
    }
    .pac-live-toggle:hover { border-color: var(--pac-accent); }
    .pac-live-toggle.active {
      background: rgba(48,213,200,0.15);
      border-color: var(--pac-accent);
    }
    .pac-live-status {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      background: rgba(255,255,255,0.1);
      color: #888;
    }
    .pac-live-status.on {
      background: rgba(48,213,200,0.2);
      color: var(--pac-accent);
    }
    .pac-speed-select {
      flex: 1;
      padding: 8px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--pac-font);
      -webkit-appearance: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 10px;
      padding-right: 28px;
      outline: none;
    }
    .pac-speed-select:hover,
    .pac-speed-select:focus { border-color: var(--pac-accent); }
    .pac-speed-select option { background: #1a1a2e; color: #fff; }

    /* ── New Game Button ─────────────────────── */
    .pac-new-game-btn {
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, var(--pac-accent), #26b0a5);
      border: none;
      border-radius: 6px;
      color: #000;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--pac-font);
    }
    .pac-new-game-btn:hover { filter: brightness(1.1); }

    /* ── Results ─────────────────────────────── */
    .pac-results {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 8px;
    }
    .pac-result-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 13px;
    }
    .pac-result-row + .pac-result-row {
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .pac-result-label { color: rgba(255,255,255,0.6); }
    .pac-result-value { font-weight: 700; color: #fff; }

    /* ── Confidence Slider ───────────────────── */
    .pac-confidence-control {
      padding: 8px 0;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .pac-confidence-control label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 6px;
    }
    .pac-confidence-control input[type="range"] {
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      outline: none;
      border: none;
      padding: 0;
    }
    .pac-confidence-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: var(--pac-accent);
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 0 6px rgba(48,213,200,0.4);
    }

    /* ── Collapsible ─────────────────────────── */
    .pac-collapsible { margin-bottom: 8px; }
    .pac-collapse-btn {
      width: 100%;
      padding: 8px 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s;
      font-family: var(--pac-font);
    }
    .pac-collapse-btn:hover { background: rgba(255,255,255,0.08); }
    .pac-collapse-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .pac-collapsible.expanded .pac-collapse-content { max-height: 500px; }

    /* ── Mono-Type Grid ──────────────────────── */
    .pac-mono-panel { margin-bottom: 12px; }
    .pac-mono-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .pac-mono-header:hover { background: rgba(255,255,255,0.08); }
    .pac-mono-header-title {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.8);
    }
    .pac-mono-arrow {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      transition: transform 0.2s;
    }
    .pac-mono-panel.expanded .pac-mono-arrow { transform: rotate(90deg); }
    .pac-mono-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .pac-mono-panel.expanded .pac-mono-content {
      max-height: 600px;
      padding-top: 8px;
    }
    .pac-mono-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 3px;
    }
    .pac-mono-btn {
      padding: 6px 2px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      transition: all 0.15s;
      opacity: 0.7;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      font-family: var(--pac-font);
    }
    .pac-mono-btn:hover { opacity: 1; transform: scale(1.05); }
    .pac-mono-btn.selected {
      opacity: 1;
      box-shadow: 0 0 0 2px #fff, 0 0 8px rgba(255,255,255,0.5);
    }
    .pac-mono-status {
      text-align: center;
      font-size: 11px;
      color: #888;
      padding: 6px 0;
      margin-top: 4px;
    }
    .pac-mono-status.active { color: var(--pac-accent); font-weight: 600; }
    .pac-mono-clear {
      width: 100%;
      margin-top: 8px;
      padding: 6px;
      background: rgba(239,68,68,0.2);
      border: 1px solid rgba(239,68,68,0.4);
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      cursor: pointer;
      font-family: var(--pac-font);
    }
    .pac-mono-clear:hover { background: rgba(239,68,68,0.4); }

    /* ── Spin Wheel ──────────────────────────── */
    .pac-mono-wheel-section {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .pac-mono-spin-btn {
      padding: 8px 16px;
      background: linear-gradient(135deg, var(--pac-accent), #26b0a5);
      border: none;
      border-radius: 6px;
      color: #000;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--pac-font);
    }
    .pac-mono-spin-btn:hover { transform: scale(1.05); filter: brightness(1.1); }
    .pac-mono-wheel-display { flex: 1; text-align: center; }
    .pac-mono-wheel-type {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .pac-mono-wheel-label {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      text-align: center;
      margin-top: 4px;
    }

    /* ── Random Draft / Copycat / MLG ────────── */
    .pac-draft-panel, .pac-copycat-panel, .pac-mlg-panel {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .pac-draft-header, .pac-copycat-header, .pac-mlg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .pac-draft-header-title, .pac-copycat-header-title, .pac-mlg-header-title {
      font-size: 12px;
      font-weight: 700;
      color: rgba(255,255,255,0.8);
    }
    .pac-draft-toggle, .pac-copycat-toggle, .pac-mlg-toggle {
      padding: 4px 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--pac-font);
    }
    .pac-draft-toggle:hover, .pac-copycat-toggle:hover, .pac-mlg-toggle:hover {
      background: rgba(255,255,255,0.15);
    }
    .pac-draft-status, .pac-copycat-status, .pac-mlg-status {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      padding: 4px 0;
    }

    /* ── Team Tracker ────────────────────────── */
    .pac-team-add-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .pac-team-add-row input { flex: 1; }
    .pac-team-add-btn {
      padding: 8px 16px;
      background: linear-gradient(135deg, var(--pac-accent), #26b0a5);
      border: none;
      border-radius: 6px;
      color: #000;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      font-family: var(--pac-font);
    }
    .pac-team-add-btn:hover { filter: brightness(1.1); }
    .pac-team-list { margin-bottom: 12px; }
    .pac-team-empty {
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      padding: 20px 0;
    }
    .pac-team-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .pac-team-item-name { font-weight: 600; color: #fff; }
    .pac-team-item-info { color: rgba(255,255,255,0.5); font-size: 11px; }
    .pac-team-remove {
      width: 20px; height: 20px;
      border-radius: 50%;
      border: none;
      background: rgba(239,68,68,0.15);
      color: rgba(239,68,68,0.7);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-family: var(--pac-font);
    }
    .pac-team-remove:hover { background: rgba(239,68,68,0.3); color: #ef4444; }

    /* ── Team Combined Probability ────────────── */
    .pac-team-combined {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 12px;
    }
    .pac-team-combined-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--pac-accent);
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .pac-team-combined-stats { display: flex; gap: 16px; }
    .pac-team-stat { display: flex; flex-direction: column; }
    .pac-team-stat-label { font-size: 10px; color: rgba(255,255,255,0.5); }
    .pac-team-stat-value { font-size: 16px; font-weight: 700; color: #fff; }

    /* ── Synergy Bar ─────────────────────────── */
    .pac-synergy-bar {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .pac-synergy-btn {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      border: none;
      cursor: default;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
      font-family: var(--pac-font);
    }

    /* ── Intel Cards ─────────────────────────── */
    .pac-intel-empty {
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      padding: 20px 0;
    }
    .pac-intel-player {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 8px;
      overflow: hidden;
    }
    .pac-intel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .pac-intel-header:hover { background: rgba(255,255,255,0.03); }
    .pac-intel-name { font-weight: 600; font-size: 13px; color: #fff; }
    .pac-intel-name.is-you { color: var(--pac-accent); }
    .pac-intel-elo { font-size: 11px; color: rgba(255,255,255,0.5); }
    .pac-intel-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .pac-intel-player.expanded .pac-intel-body {
      max-height: 500px;
      padding: 0 12px 12px;
    }
    .pac-intel-pokemon-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .pac-intel-pokemon {
      padding: 3px 8px;
      background: rgba(255,255,255,0.05);
      border-radius: 4px;
      font-size: 10px;
      color: rgba(255,255,255,0.7);
    }
    .pac-intel-pokemon.contested {
      border: 1px solid rgba(239,68,68,0.4);
      color: #ef4444;
    }

    /* ── Analytics Tabs ──────────────────────── */
    .pac-analytics-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }
    .pac-analytics-tab {
      flex: 1;
      padding: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: rgba(255,255,255,0.5);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      font-family: var(--pac-font);
    }
    .pac-analytics-tab:hover { background: rgba(255,255,255,0.08); }
    .pac-analytics-tab.active {
      background: rgba(48,213,200,0.15);
      border-color: var(--pac-accent);
      color: var(--pac-accent);
    }
    .pac-analytics-content { display: none; }
    .pac-analytics-content.active { display: block; }
    .pac-analytics-section {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 8px;
    }
    .pac-analytics-title {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
      margin-bottom: 8px;
    }
    .pac-analytics-disclaimer, .pac-history-disclaimer, .pac-fishing-disclaimer {
      font-size: 10px;
      color: rgba(255,152,0,0.8);
      background: rgba(255,152,0,0.1);
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .pac-history-empty {
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
      padding: 16px 0;
    }

    /* ── Luck Gauge ──────────────────────────── */
    .pac-luck-gauge { display: flex; align-items: center; gap: 12px; }
    .pac-luck-score { font-size: 24px; font-weight: 700; min-width: 50px; text-align: center; }
    .pac-luck-score.lucky { color: #4caf50; }
    .pac-luck-score.unlucky { color: #ef4444; }
    .pac-luck-score.neutral { color: #888; }
    .pac-luck-gauge-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      position: relative;
    }
    .pac-luck-gauge-marker {
      position: absolute;
      top: -4px;
      width: 14px; height: 14px;
      background: var(--pac-accent);
      border-radius: 50%;
      transform: translateX(-50%);
    }
    .pac-luck-gauge-labels {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      margin-top: 4px;
    }

    /* ── Chart Bars ──────────────────────────── */
    .pac-chart-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 11px;
    }
    .pac-chart-row-label { width: 70px; color: rgba(255,255,255,0.6); flex-shrink: 0; text-align: right; }
    .pac-chart-horizontal {
      flex: 1; height: 14px;
      background: rgba(255,255,255,0.05);
      border-radius: 3px;
      overflow: hidden;
    }
    .pac-chart-bar-h { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
    .pac-chart-bar-value { font-size: 10px; color: rgba(255,255,255,0.5); min-width: 35px; }

    /* ── Fishing ─────────────────────────────── */
    .pac-fishing-section { margin-bottom: 12px; }
    .pac-fishing-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
    .pac-fishing-rod-select { display: flex; gap: 4px; margin-bottom: 6px; }
    .pac-rod-btn {
      flex: 1;
      padding: 6px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: rgba(255,255,255,0.6);
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      font-family: var(--pac-font);
    }
    .pac-rod-btn:hover { background: rgba(255,255,255,0.08); }
    .pac-rod-btn.active,
    .pac-rod-btn--active {
      background: rgba(48,213,200,0.15);
      border-color: var(--pac-accent);
      color: var(--pac-accent);
    }
    .pac-fishing-rod-info { display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: rgba(255,255,255,0.3); }
    .pac-fishing-no-rod { text-align: center; color: rgba(255,255,255,0.3); font-size: 12px; padding: 12px 0; }
    .pac-fishing-checkbox {
      display: flex; align-items: center; gap: 6px; font-size: 11px;
      color: rgba(255,255,255,0.6); cursor: pointer; margin-bottom: 8px;
    }
    .pac-fishing-checkbox input {
      width: 14px !important; height: 14px;
      accent-color: var(--pac-accent);
      -webkit-appearance: auto; appearance: auto;
      padding: 0 !important; background: transparent !important; border: none !important;
    }

    /* ── Settings ────────────────────────────── */
    .pac-settings-section {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 10px;
    }
    .pac-settings-section-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
    .pac-settings-row {
      display: flex; align-items: center; justify-content: space-between; padding: 6px 0;
    }
    .pac-settings-row + .pac-settings-row { border-top: 1px solid rgba(255,255,255,0.05); }
    .pac-settings-label { font-size: 12px; color: rgba(255,255,255,0.6); }
    .pac-settings-value { font-size: 12px; color: rgba(255,255,255,0.4); min-width: 30px; text-align: right; }
    .pac-settings-slider-row { display: flex; align-items: center; gap: 8px; width: 100%; }
    .pac-settings-slider { flex: 1; }
    .pac-settings-btn {
      width: 100%; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: var(--pac-font); margin-top: 8px;
    }
    .pac-settings-btn.reset {
      background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #ef4444;
    }
    .pac-settings-btn.reset:hover { background: rgba(239,68,68,0.25); }
    .pac-settings-btn.primary {
      background: linear-gradient(135deg, var(--pac-accent), #26b0a5); border: none; color: #000;
    }
    .pac-settings-preview { background: rgba(0,0,0,0.3); border-radius: 6px; padding: 12px; }
    .pac-settings-preview-text { font-size: 13px; color: #fff; margin-bottom: 8px; }
    .pac-settings-preview-flashes { display: flex; gap: 8px; }
    .pac-settings-flash-preview { padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .pac-settings-flash-preview.target { background: rgba(48,213,200,0.2); color: var(--pac-accent); }
    .pac-settings-flash-preview.team { background: rgba(255,152,0,0.2); color: #ff9800; }

    /* ── Autocomplete ────────────────────────── */
    .pac-pokemon-selector { position: relative; }
    .pac-autocomplete-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: rgba(20,20,40,0.98);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      margin-top: 2px;
    }
    .pac-autocomplete-item {
      display: flex; justify-content: space-between; padding: 6px 10px;
      cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.8);
    }
    .pac-autocomplete-item:hover { background: rgba(48,213,200,0.15); }
    .pac-autocomplete-rarity { font-size: 10px; color: rgba(255,255,255,0.4); }

    /* ── Evolution Family ────────────────────── */
    .pac-evolution-family {
      margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px;
    }
    .pac-family-title { font-weight: 600; color: rgba(255,255,255,0.6); margin-bottom: 4px; }
    .pac-family-total {
      margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1);
      font-weight: 600; color: rgba(255,255,255,0.7);
    }

    /* ── Live Indicator ──────────────────────── */
    .pac-live-indicator {
      display: flex; align-items: center; gap: 6px; padding: 6px 10px;
      background: rgba(48,213,200,0.1); border-radius: 6px; font-size: 11px;
      color: rgba(255,255,255,0.6); margin-top: 8px;
    }
    .pac-stage-display { font-weight: 600; color: var(--pac-accent); }
    .pac-live-divider { color: rgba(255,255,255,0.2); }

    /* ── Status / Portal / Detection ─────────── */
    .pac-status-msg { font-size: 11px; color: rgba(255,255,255,0.5); padding: 4px 0; }
    .pac-portal-warning {
      color: #ff9800; font-size: 11px; margin-top: 4px; padding: 4px 8px;
      background: rgba(255,152,0,0.15); border-radius: 4px;
    }
    .pac-detection-panel { margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; }

    /* ── EULA ────────────────────────────────── */
    .pac-eula-text { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.6; margin-bottom: 12px; }
    .pac-eula-check-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 12px; cursor: pointer;
    }
    .pac-eula-check-row input {
      width: 16px !important; height: 16px; accent-color: var(--pac-accent);
      -webkit-appearance: auto; appearance: auto; padding: 0 !important;
      background: transparent !important; border: none !important;
    }

    /* ── Section visibility ──────────────────── */
    .pac-section-content { display: none; }
    .pac-section-content.pac-active { display: block; }

    /* ── Hidden utility ──────────────────────── */
    .hidden { display: none !important; }

    /* ══════════════════════════════════════════
       V4 RENDERER CLASSES
       Classes actually used by section renderers
       ══════════════════════════════════════════ */

    /* ── Button System ───────────────────────── */
    .pac-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--pac-font);
      border: 1px solid transparent;
      color: #fff;
      white-space: nowrap;
    }
    .pac-btn--primary {
      background: linear-gradient(135deg, var(--pac-accent), #26b0a5);
      color: #000;
      border: none;
    }
    .pac-btn--primary:hover { filter: brightness(1.1); }
    .pac-btn--ghost {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.7);
    }
    .pac-btn--ghost:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.18);
      color: #fff;
    }
    .pac-btn--danger {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444;
    }
    .pac-btn--danger:hover { background: rgba(239,68,68,0.25); }
    .pac-btn--block { width: 100%; }
    .pac-btn--flex { flex: 1; }

    /* ── Tabs (v4 names) ─────────────────────── */
    .pac-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }
    .pac-tabs__btn {
      flex: 1;
      padding: 8px 6px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: rgba(255,255,255,0.5);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      font-family: var(--pac-font);
      transition: all 0.2s;
    }
    .pac-tabs__btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
    .pac-tabs__btn--active {
      background: rgba(48,213,200,0.15);
      border-color: var(--pac-accent);
      color: var(--pac-accent);
    }
    .pac-tab-content { display: none; }
    .pac-tab-content--active { display: block; }

    /* ── Group (v4 name for section) ─────────── */
    .pac-group {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 12px;
    }
    .pac-group:last-child { margin-bottom: 0; }
    .pac-group-title {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.45);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    /* ── Row variants ────────────────────────── */
    .pac-row--spread {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pac-row--center {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    /* ── Label ────────────────────────────────── */
    .pac-label {
      font-size: 11px;
      color: #aaa;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ── Toggle (track/knob style) ───────────── */
    .pac-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
      flex: 0 0 auto;
      padding: 0;
      background: none;
      border-radius: 0;
      min-width: 0;
    }
    .pac-toggle input[type="checkbox"] {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
      pointer-events: none;
    }
    .pac-toggle-track {
      width: 36px;
      min-width: 36px;
      max-width: 36px;
      height: 20px;
      border-radius: 10px;
      background: rgba(255,255,255,0.12);
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .pac-toggle-track.active,
    .pac-toggle input:checked + .pac-toggle-track {
      background: rgba(48,213,200,0.4);
    }
    .pac-toggle-knob {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .pac-toggle-track.active .pac-toggle-knob,
    .pac-toggle input:checked + .pac-toggle-track .pac-toggle-knob {
      transform: translateX(16px);
    }

    /* ── Pill (result display) ───────────────── */
    .pac-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 6px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .pac-pill--accent {
      border-color: rgba(48,213,200,0.2);
      background: rgba(48,213,200,0.05);
    }
    .pac-pill-label {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
    }
    .pac-pill-value {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
    }

    /* ── Stat (results section) ──────────────── */
    .pac-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .pac-stat + .pac-stat {
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .pac-stat-label {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
    }
    .pac-stat-value {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
    }
    .pac-stat-value--accent {
      color: var(--pac-accent);
    }

    /* ── Result row (team section) ────────────── */
    .pac-result {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 12px;
    }
    .pac-result__label { color: rgba(255,255,255,0.5); }
    .pac-result__value { font-weight: 700; color: #fff; }

    /* ── Badge ────────────────────────────────── */
    .pac-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .pac-badge--common { background: rgba(158,158,158,0.2); color: #9e9e9e; }
    .pac-badge--uncommon { background: rgba(76,175,80,0.2); color: #4caf50; }
    .pac-badge--rare { background: rgba(33,150,243,0.2); color: #2196f3; }
    .pac-badge--epic { background: rgba(156,39,176,0.2); color: #9c27b0; }
    .pac-badge--ultra { background: rgba(255,152,0,0.2); color: #ff9800; }
    .pac-badge--off { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
    .pac-badge-label { font-size: 10px; color: rgba(255,255,255,0.5); margin-right: 4px; }

    /* ── Hint ─────────────────────────────────── */
    .pac-hint {
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      font-style: italic;
      padding: 4px 0;
    }

    /* ── Divider ──────────────────────────────── */
    .pac-divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 10px 0;
    }

    /* ── Checkbox ─────────────────────────────── */
    .pac-checkbox {
      width: 14px;
      height: 14px;
      accent-color: var(--pac-accent);
      cursor: pointer;
      flex-shrink: 0;
    }

    /* ── Collapsible (v4 names) ──────────────── */
    .pac-collapsible__trigger {
      width: 100%;
      padding: 10px 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--pac-font);
      transition: all 0.2s;
    }
    .pac-collapsible__trigger:hover {
      background: rgba(255,255,255,0.08);
    }
    .pac-collapsible__arrow {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      transition: transform 0.2s;
    }
    .pac-collapsible--open .pac-collapsible__arrow {
      transform: rotate(90deg);
    }
    .pac-collapsible__body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .pac-collapsible--open .pac-collapsible__body {
      max-height: 2000px;
    }

    /* ── Intel trigger ───────────────────────── */
    .pac-intel-trigger {
      margin-bottom: 8px;
    }

    /* ── Team items ──────────────────────────── */
    .pac-team-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 4px;
    }
    .pac-team-name {
      font-weight: 600;
      color: #fff;
      font-size: 12px;
      flex: 1;
    }
    .pac-team-wild {
      font-size: 10px;
      color: rgba(76,175,80,0.8);
      margin-left: 4px;
    }
    .pac-team-remove {
      width: 22px; height: 22px;
      border-radius: 50%;
      border: none;
      background: rgba(239,68,68,0.12);
      color: rgba(239,68,68,0.6);
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin-left: 8px;
      font-family: var(--pac-font);
      transition: all 0.2s;
    }
    .pac-team-remove:hover {
      background: rgba(239,68,68,0.25);
      color: #ef4444;
    }

    /* ── Team Enable ─────────────────────────── */
    .pac-team-enable {
      text-align: center;
      padding: 20px;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
    }

    /* ── Theme Pills ─────────────────────────── */
    .pac-theme-pill {
      padding: 6px 14px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      color: rgba(255,255,255,0.5);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--pac-font);
      transition: all 0.2s;
    }
    .pac-theme-pill:hover { background: rgba(255,255,255,0.08); }
    .pac-theme-pill--active {
      background: rgba(48,213,200,0.15);
      border-color: var(--pac-accent);
      color: var(--pac-accent);
    }

    /* ── EULA Check ──────────────────────────── */
    .pac-eula-check {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 12px;
      cursor: pointer;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      line-height: 1.5;
    }
  `;
})();
