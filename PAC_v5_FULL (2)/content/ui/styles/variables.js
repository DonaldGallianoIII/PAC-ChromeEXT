/**
 * PAC v4 — CSS Variables (vmin-scaled, matched to prototype)
 */
(function() {
  'use strict';

  var _animSpeed = '300';
  try {
    var saved = localStorage.getItem('pac_animSpeed');
    if (saved && !isNaN(parseInt(saved))) _animSpeed = saved;
  } catch(e) {}

  PAC.UI.Styles.Variables = `
    #pac-root, #pac-root * {
      box-sizing: border-box;
    }

    #pac-root {
      /* ── Glass ─────────────────────────────── */
      --pac-bg-glass: rgba(20, 20, 32, 0.9);
      --pac-blur: blur(16px) saturate(180%);
      --pac-border: 1px solid rgba(255, 255, 255, 0.14);
      --pac-shadow: 0 30px 72px rgba(0,0,0,0.5), 0 6px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
      --pac-divider: 1px solid rgba(255,255,255,0.06);
      --pac-radius: 16px;

      /* ── Colors ────────────────────────────── */
      --pac-accent: #30D5C8;
      --pac-accent-20: rgba(48, 213, 200, 0.125);
      --pac-accent-40: rgba(48, 213, 200, 0.25);
      --pac-accent-glow: 0 0 10px rgba(48, 213, 200, 0.375);
      --pac-danger: #FF4757;
      --pac-success: #2ED573;
      --pac-warning: #FFA502;
      --pac-green: #2ED573;
      --pac-red: #FF4757;
      --pac-yellow: #FFA502;

      /* ── Surfaces ──────────────────────────── */
      --pac-surface: rgba(255, 255, 255, 0.1);
      --pac-surface-border: 1px solid rgba(255, 255, 255, 0.1);
      --pac-surface-hover: rgba(255, 255, 255, 0.15);
      --pac-footer-bg: rgba(0, 0, 0, 0.2);
      --pac-bg-primary: rgba(20, 20, 32, 0.95);
      --pac-bg-tertiary: rgba(255, 255, 255, 0.03);

      /* ── Text ──────────────────────────────── */
      --pac-text: #ffffff;
      --pac-text-primary: #ffffff;
      --pac-text-secondary: rgba(255, 255, 255, 0.6);
      --pac-text-muted: rgba(255, 255, 255, 0.4);
      --pac-text-60: rgba(255, 255, 255, 0.6);
      --pac-text-50: rgba(255, 255, 255, 0.5);
      --pac-text-45: rgba(255, 255, 255, 0.45);
      --pac-text-40: rgba(255, 255, 255, 0.4);
      --pac-text-35: rgba(255, 255, 255, 0.35);
      --pac-text-30: rgba(255, 255, 255, 0.3);
      --pac-text-25: rgba(255, 255, 255, 0.25);
      --pac-text-20: rgba(255, 255, 255, 0.2);

      /* ── Typography ────────────────────────── */
      --pac-font: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
      --pac-font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
      --pac-font-2xs: 9px;
      --pac-font-xs: 11px;
      --pac-font-sm: 12px;
      --pac-font-md: 13px;
      --pac-font-lg: 15px;
      --pac-font-xl: 18px;

      /* ── Spacing ────────────────────────────── */
      --pac-sp-2xs: 3px;
      --pac-sp-xs: 6px;
      --pac-sp-sm: 8px;
      --pac-sp-md: 12px;
      --pac-sp-lg: 16px;
      --pac-sp-xl: 24px;

      /* ── Border Radius ─────────────────────── */
      --pac-radius-sm: 4px;
      --pac-radius-md: 8px;
      --pac-radius-xl: 16px;

      /* ── Borders ────────────────────────────── */
      --pac-border-primary: rgba(255, 255, 255, 0.06);
      --pac-border-accent: rgba(48, 213, 200, 0.3);

      /* ── Shadows ────────────────────────────── */
      --pac-shadow-lg: 0 12px 40px rgba(0,0,0,0.5);

      /* ── Rarity Colors ─────────────────────── */
      --pac-rarity-common: #9e9e9e;
      --pac-rarity-uncommon: #4caf50;
      --pac-rarity-rare: #2196f3;
      --pac-rarity-epic: #9c27b0;
      --pac-rarity-ultra: #ff9800;

      /* ── Timing ────────────────────────────── */
      --pac-ease: ease-out;
      --pac-dur: ${_animSpeed}ms;
      --pac-dur-fast: 200ms;
      --pac-dur-mid: 300ms;
      --pac-transition: ${_animSpeed}ms ease-out;
    }
  `;
})();
