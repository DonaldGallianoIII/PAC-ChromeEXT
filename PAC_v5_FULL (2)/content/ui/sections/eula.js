/**
 * PAC v4 — EULA & User Guide
 *
 * Two-panel modal:
 *   Left  — Legal agreement, privacy, disclaimers, checkboxes
 *   Right — Interactive feature guide (every section documented)
 *
 * First-run: full modal (both panels). Must accept to proceed.
 * CMD callable: opens guide-only panel anytime via PAC.UI.Panels.EULA.showGuide()
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED STYLE CONSTANTS (hardcoded — these render outside #pac-root)
  // ═══════════════════════════════════════════════════════════════════════════

  var S = {
    bg:          'rgba(15,15,26,0.98)',
    bgCard:      'rgba(255,255,255,0.04)',
    border:      'rgba(48,213,200,0.25)',
    borderSub:   'rgba(255,255,255,0.08)',
    accent:      '#30D5C8',
    accentDim:   'rgba(48,213,200,0.15)',
    green:       '#2ED573',
    yellow:      '#FFA502',
    red:         '#FF4757',
    gold:        '#fbbf24',
    text:        '#fff',
    textSec:     'rgba(255,255,255,0.6)',
    textMuted:   'rgba(255,255,255,0.35)',
    font:        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    mono:        '"Courier New",monospace',
    radius:      '10px',
    radiusSm:    '6px'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Panels.EULA = {
    /**
     * Show full EULA (agreement + guide) if not yet accepted.
     * @returns {Promise} Resolves when accepted (or already accepted).
     */
    showIfNeeded: function() {
      return new Promise(function(resolve) {
        if (localStorage.getItem('pac_eulaAccepted') === 'true') {
          resolve();
          return;
        }
        _showFull(resolve);
      });
    },

    /**
     * Open the feature guide only (no legal, no checkboxes).
     * Callable from CMD at any time.
     */
    showGuide: function() {
      _showGuideOnly();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE GUIDE DATA
  // ═══════════════════════════════════════════════════════════════════════════

  var FEATURES = [
    {
      icon: '⚡', name: 'Setup', color: '#f39c12',
      desc: 'Set your in-game name so PAC can identify your board and bench. This is how the tool knows which Pokemon are yours vs. opponents\'.',
      tips: ['Enter your exact in-game username', 'Live mode auto-detects when a match starts']
    },
    {
      icon: '🎯', name: 'Search', color: S.accent,
      desc: 'The core probability calculator. Type any Pokemon name to see your exact odds of finding it in the shop based on your level, the current pool, and how many copies remain.',
      tips: ['Results update live as the match progresses', 'Shows probability per roll AND per shop slot', 'Confidence slider adjusts how many rolls to simulate']
    },
    {
      icon: '⚡', name: 'Quick Search', color: '#e056a0',
      desc: 'Alt + Right-Click anywhere on the game board to instantly open a search popup at your cursor. Type a Pokemon name, hit Enter, and get odds without ever opening the PAC panel. This is the fastest way to check probabilities mid-round.',
      tips: ['Alt + Right-Click on any empty area of the game', 'Type a name to add to tracker, or "remove name" to untrack', 'Press Escape or click away to dismiss', 'Your primary tool — faster than opening PAC every time']
    },
    {
      icon: '🎮', name: 'Modes (Team)', color: '#2ecc71',
      desc: 'Build and track your team composition. Add Pokemon to your tracker to monitor multiple targets at once. Supports standard, random draft, and other game modes.',
      tips: ['Click + on search results to add to tracker', 'Lock targets to prevent accidental removal', 'Wild checkbox factors wild encounters into calculations']
    },
    {
      icon: '🔍', name: 'Intel', color: '#9b59b6',
      desc: 'Opponent intelligence panel. See what other players are collecting to predict pool contention and plan around the competition.',
      tips: ['Updates automatically from game state', 'Use this to avoid contested Pokemon']
    },
    {
      icon: '📈', name: 'Analytics', color: '#e67e22',
      desc: 'Match statistics and performance data. Track your economy, level progression, and rolling efficiency across the current game.',
      tips: ['Gold tracking shows spending patterns', 'Helps identify when to level vs. roll']
    },
    {
      icon: '💬', name: 'Chat', color: '#e056a0',
      desc: 'In-game chat overlay integrated directly into the PAC interface. Communicate with other players without losing focus on your board.',
      tips: ['Messages appear inline in the PAC panel', 'Toggle on/off in CMD']
    },
    {
      icon: '🐟', name: 'Fishing', color: '#3498db',
      desc: 'Fishing minigame calculator. Computes expected catches, rod efficiency, and optimal fishing strategy based on your current rod and bait.',
      tips: ['Factors in rod type and level', 'Shows expected value per fish']
    },
    {
      icon: '⚙️', name: 'Settings', color: '#7f8c8d',
      desc: 'Configure PAC behavior. Toggle flash alerts, epilepsy-safe mode, and other display preferences.',
      tips: ['Flash alerts pulse the border when key events occur', 'Epilepsy mode disables all animations']
    },
    {
      icon: '>_', name: 'CMD', color: S.accent, isMono: true,
      desc: 'Command center and power user dashboard. Toggle optional apps on/off, access the math proof viewer, and manage embedded game interaction features.',
      tips: ['Math Proof shows the exact formula behind any search result', 'Embedded section contains Hunt Mode and Shop Hotkeys', 'User Guide is accessible here anytime']
    }
  ];

  var EMBEDDED_FEATURES = [
    {
      icon: '🎯', name: 'Hunt Mode', color: S.gold,
      desc: 'Assisted shop rolling. When activated, PAC will automatically refresh the shop and purchase target Pokemon for you using browser-native DOM clicks.',
      tips: ['Enable in CMD → Embedded section', 'Requires separate disclaimer acceptance', 'Alt+X opens the hunt input', 'Set targets, quantity, and gold budget', 'Human-paced (1.2s intervals) by default'],
      warn: 'Game interaction feature — uses isTrusted DOM clicks. Not affiliated with game developers. May be removed at any time.'
    },
    {
      icon: '⌨️', name: 'Shop Hotkeys', color: S.gold,
      desc: 'Press 1-6 on your keyboard (top row or numpad) to instantly buy the corresponding shop slot. One keypress = one purchase.',
      tips: ['Enable in CMD → Embedded section', 'Works with both number row and numpad', 'Automatically disabled when typing in PAC inputs', 'Pure accessibility feature — 1:1 keypress to click mapping'],
      warn: 'Game interaction feature — uses isTrusted DOM clicks.'
    }
  ];

  var HOTKEYS = [
    { keys: 'Alt + Right Click', action: 'Quick search — search any Pokemon directly from the game board' },
    { keys: 'Alt + X', action: 'Open Hunt Mode input / abort active hunt' },
    { keys: '1-6', action: 'Buy shop slot (when Shop Hotkeys enabled)' },
    { keys: 'Escape', action: 'Close hunt input / abort hunt / close overlays' },
    { keys: 'Alt + Shift + ]', action: '???' }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL MODAL (first-run — agreement + guide)
  // ═══════════════════════════════════════════════════════════════════════════

  function _showFull(onAccept) {
    var overlay = _createOverlay('pac-eula-overlay');

    var isNarrow = window.innerWidth < 768;

    var modal = document.createElement('div');
    modal.style.cssText =
      'background:' + S.bg + ';border:1px solid ' + S.border + ';' +
      'border-radius:' + S.radius + ';max-width:960px;width:94vw;' +
      'max-height:90vh;display:flex;overflow:hidden;' +
      (isNarrow ? 'flex-direction:column;' : '') +
      'box-shadow:0 30px 72px rgba(0,0,0,0.6),0 8px 24px rgba(0,0,0,0.3);' +
      'font-family:' + S.font + ';color:' + S.text + ';';

    // ── Left Panel: Legal ──────────────────────────────────────
    var left = document.createElement('div');
    left.style.cssText = isNarrow
      ? 'padding:20px;overflow-y:auto;display:flex;flex-direction:column;' +
        'max-height:90vh;'
      : 'flex:0 0 380px;padding:24px;overflow-y:auto;' +
        'border-right:1px solid ' + S.borderSub + ';' +
        'display:flex;flex-direction:column;';

    left.innerHTML =
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:20px;font-weight:700;">🎮 PAC</div>' +
        '<div style="font-size:10px;color:' + S.textMuted + ';margin-top:4px;">Pokemon Auto Chess Live Data Calculator</div>' +
        '<div style="font-size:10px;color:' + S.accent + ';margin-top:2px;">v' + (PAC.VERSION || '4.0') + ' by @Deuce222X</div>' +
      '</div>' +

      _legalSection('🔒 Privacy', [
        'Zero data collection. Zero tracking. Zero transmission.',
        'All data stays on YOUR device — local storage only.',
        'No analytics, telemetry, or third-party services.'
      ]) +

      _legalSection('📊 Core Functionality', [
        'Reads public game state (Pokemon pool counts visible to all players).',
        'Calculates probability of finding specific Pokemon.',
        'Tracks your board/bench when you provide your in-game name.',
        'Saves preferences locally in your browser.'
      ]) +

      _legalSection('🔧 Optional Features', [
        'Some features interact with the game page via standard browser click events.',
        'These are <strong>off by default</strong> and gated behind separate opt-in toggles.',
        'All interaction uses the browser\'s native <code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-size:10px;">.click()</code> method — no game modification, packet forging, or memory manipulation.'
      ], S.gold) +

      _legalSection('⚖️ Disclaimer', [
        'Independent tool — not affiliated with Pokemon Auto Chess developers.',
        'Use at your own discretion. Features may change or be removed.',
        'Bug reports & contact: <strong>@Deuce222X</strong> in the official Discord.'
      ], S.yellow) +

      '<div style="margin-top:auto;padding-top:16px;">' +
        _checkbox('eula-1', 'I understand how this tool works and what data it accesses') +
        _checkbox('eula-2', 'I understand no personal data is collected or transmitted') +
        _checkbox('eula-3', 'I agree to use this tool responsibly and at my own discretion') +

        '<button id="pac-eula-accept" disabled style="' +
          'margin-top:12px;padding:10px;font-size:13px;width:100%;' +
          'background:' + S.accentDim + ';border:1px solid ' + S.border + ';' +
          'border-radius:' + S.radiusSm + ';color:' + S.accent + ';' +
          'font-weight:700;cursor:pointer;opacity:0.4;transition:opacity 0.2s;">' +
          'I Agree — Start Using PAC' +
        '</button>' +
      '</div>';

    // ── Right Panel: Feature Guide ─────────────────────────────
    if (isNarrow) {
      // Narrow: insert collapsible guide section into the left (only) panel, before checkboxes
      var guideToggle =
        '<div id="pac-eula-guide-toggle" style="margin:8px 0;padding:8px;' +
          'background:rgba(48,213,200,0.06);border:1px solid rgba(48,213,200,0.15);' +
          'border-radius:' + S.radiusSm + ';cursor:pointer;text-align:center;' +
          'font-size:11px;color:' + S.accent + ';font-weight:600;">' +
          '📖 View Feature Guide ▾' +
        '</div>' +
        '<div id="pac-eula-guide-content" style="display:none;padding:8px 0;">' +
          _buildGuideHTML() +
        '</div>';

      // Insert before the checkbox div (margin-top:auto)
      left.innerHTML = left.innerHTML.replace(
        '<div style="margin-top:auto;padding-top:16px;">',
        guideToggle + '<div style="margin-top:auto;padding-top:16px;">'
      );

      modal.appendChild(left);
    } else {
      // Wide: side-by-side panels
      var right = document.createElement('div');
      right.style.cssText =
        'flex:1;padding:24px;overflow-y:auto;min-width:0;';

      right.innerHTML =
        '<div style="font-size:14px;font-weight:700;margin-bottom:4px;">📖 Feature Guide</div>' +
        '<div style="font-size:10px;color:' + S.textMuted + ';margin-bottom:16px;">' +
          'Everything PAC can do — accessible anytime via CMD' +
        '</div>' +
        _buildGuideHTML();

      modal.appendChild(left);
      modal.appendChild(right);
    }
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ── Wire guide toggle (narrow mode) ──────────────────────
    if (isNarrow) {
      var guideBtn = overlay.querySelector('#pac-eula-guide-toggle');
      var guideContent = overlay.querySelector('#pac-eula-guide-content');
      if (guideBtn && guideContent) {
        guideBtn.addEventListener('click', function() {
          var isOpen = guideContent.style.display !== 'none';
          guideContent.style.display = isOpen ? 'none' : 'block';
          guideBtn.innerHTML = isOpen ? '📖 View Feature Guide ▾' : '📖 Hide Feature Guide ▴';
        });
      }
    }

    // ── Wire checkboxes ────────────────────────────────────────
    var checks = overlay.querySelectorAll('.pac-eula-check');
    var acceptBtn = overlay.querySelector('#pac-eula-accept');

    checks.forEach(function(cb) {
      cb.addEventListener('change', function() {
        var allChecked = Array.from(checks).every(function(c) { return c.checked; });
        acceptBtn.disabled = !allChecked;
        acceptBtn.style.opacity = allChecked ? '1' : '0.4';
      });
    });

    acceptBtn.addEventListener('click', function() {
      if (acceptBtn.disabled) return;
      localStorage.setItem('pac_eulaAccepted', 'true');
      overlay.remove();
      onAccept();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDE-ONLY MODAL (callable from CMD anytime)
  // ═══════════════════════════════════════════════════════════════════════════

  function _showGuideOnly() {
    // Toggle — remove if already open
    var existing = document.getElementById('pac-guide-overlay');
    if (existing) { existing.remove(); return; }

    var overlay = _createOverlay('pac-guide-overlay');

    var modal = document.createElement('div');
    var guideNarrow = window.innerWidth < 768;
    modal.style.cssText =
      'background:' + S.bg + ';border:1px solid ' + S.border + ';' +
      'border-radius:' + S.radius + ';max-width:620px;width:' + (guideNarrow ? '96vw' : '92vw') + ';' +
      'max-height:' + (guideNarrow ? '92vh' : '85vh') + ';overflow-y:auto;' +
      'padding:' + (guideNarrow ? '16px' : '24px') + ';' +
      'box-shadow:0 30px 72px rgba(0,0,0,0.6),0 8px 24px rgba(0,0,0,0.3);' +
      'font-family:' + S.font + ';color:' + S.text + ';';

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:700;">📖 PAC Feature Guide</div>' +
          '<div style="font-size:10px;color:' + S.textMuted + ';">v' + (PAC.VERSION || '4.0') + ' by @Deuce222X</div>' +
        '</div>' +
        '<button id="pac-guide-close" style="' +
          'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);' +
          'border-radius:6px;color:' + S.textSec + ';cursor:pointer;' +
          'padding:4px 10px;font-size:11px;font-family:' + S.mono + ';">' +
          'ESC' +
        '</button>' +
      '</div>' +
      _buildGuideHTML();

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    var closeBtn = modal.querySelector('#pac-guide-close');
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    var escHandler = function(e) {
      if (e.key === 'Escape' && document.getElementById('pac-guide-overlay')) {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDE CONTENT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildGuideHTML() {
    var html = '';

    // ── Core & Optional Apps ──────────────────────────
    html += '<div style="font-family:' + S.mono + ';font-size:10px;text-transform:uppercase;' +
      'letter-spacing:0.1em;color:' + S.accent + ';margin-bottom:8px;">APPS</div>';

    FEATURES.forEach(function(f) {
      html += _featureCard(f);
    });

    // ── Embedded Features ─────────────────────────────
    html += '<div style="font-family:' + S.mono + ';font-size:10px;text-transform:uppercase;' +
      'letter-spacing:0.1em;color:' + S.gold + ';margin:16px 0 8px;padding-top:12px;' +
      'border-top:1px solid ' + S.borderSub + ';">EMBEDDED (game interaction)</div>';

    EMBEDDED_FEATURES.forEach(function(f) {
      html += _featureCard(f);
    });

    // ── Hotkey Reference ──────────────────────────────
    html += '<div style="font-family:' + S.mono + ';font-size:10px;text-transform:uppercase;' +
      'letter-spacing:0.1em;color:' + S.textSec + ';margin:16px 0 8px;padding-top:12px;' +
      'border-top:1px solid ' + S.borderSub + ';">HOTKEYS</div>';

    html += '<div style="background:' + S.bgCard + ';border-radius:' + S.radiusSm + ';padding:10px;' +
      'display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center;">';

    HOTKEYS.forEach(function(h) {
      html += '<div style="font-family:' + S.mono + ';font-size:11px;color:' + S.accent + ';' +
        'background:rgba(48,213,200,0.08);padding:2px 6px;border-radius:3px;white-space:nowrap;">' +
        h.keys + '</div>';
      html += '<div style="font-size:11px;color:' + S.textSec + ';">' + h.action + '</div>';
    });

    html += '</div>';

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HTML BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _createOverlay(id) {
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:rgba(0,0,0,0.85);z-index:99999999;display:flex;' +
      'align-items:center;justify-content:center;pointer-events:auto;';
    return overlay;
  }

  function _featureCard(f) {
    var iconStyle = f.isMono
      ? 'font-family:' + S.mono + ';font-size:10px;font-weight:700;'
      : 'font-size:14px;';

    var html = '<div style="background:' + S.bgCard + ';border-radius:' + S.radiusSm + ';' +
      'padding:10px;margin-bottom:6px;border-left:3px solid ' + (f.color || S.borderSub) + ';">';

    // Header
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
      '<span style="' + iconStyle + '">' + f.icon + '</span>' +
      '<span style="font-size:13px;font-weight:600;">' + f.name + '</span>' +
    '</div>';

    // Description
    html += '<div style="font-size:11px;color:' + S.textSec + ';line-height:1.5;margin-bottom:6px;">' + f.desc + '</div>';

    // Tips
    if (f.tips && f.tips.length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
      f.tips.forEach(function(tip) {
        html += '<span style="font-size:9px;color:' + S.textMuted + ';background:rgba(255,255,255,0.04);' +
          'padding:2px 6px;border-radius:3px;line-height:1.4;">💡 ' + tip + '</span>';
      });
      html += '</div>';
    }

    // Warning (for embedded features)
    if (f.warn) {
      html += '<div style="font-size:9px;color:' + S.yellow + ';margin-top:6px;padding:4px 6px;' +
        'background:rgba(255,165,2,0.06);border-radius:3px;line-height:1.4;">⚠️ ' + f.warn + '</div>';
    }

    html += '</div>';
    return html;
  }

  function _legalSection(title, bullets, accentColor) {
    var borderColor = accentColor || S.borderSub;
    var html = '<div style="margin-bottom:10px;padding:10px;background:' + S.bgCard + ';' +
      'border-left:3px solid ' + borderColor + ';border-radius:' + S.radiusSm + ';">' +
      '<div style="font-weight:600;font-size:12px;margin-bottom:6px;">' + title + '</div>';

    bullets.forEach(function(b) {
      html += '<div style="font-size:11px;color:' + S.textSec + ';line-height:1.5;padding:1px 0;">' +
        '<span style="color:' + S.textMuted + ';margin-right:4px;">›</span> ' + b + '</div>';
    });

    html += '</div>';
    return html;
  }

  function _checkbox(id, label) {
    return '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:3px 0;">' +
      '<input type="checkbox" class="pac-eula-check" id="pac-' + id + '" style="' +
        'width:15px;height:15px;min-width:15px;margin-top:1px;cursor:pointer;' +
        'accent-color:#2ecc71;color-scheme:dark;">' +
      '<span style="font-size:11px;color:rgba(255,255,255,0.7);line-height:1.4;">' + label + '</span></label>';
  }

  if (PAC.DEBUG_MODE) console.log('PAC Panels: EULA & Guide loaded');
})();
