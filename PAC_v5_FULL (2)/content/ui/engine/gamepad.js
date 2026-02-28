/**
 * PAC Gamepad Engine — Content Script Bridge + Settings Panel
 *
 * Runs in ISOLATED world (content script context).
 * Injects gamepad-core.js into PAGE context (MAIN world).
 * Manages cursor overlay, button prompt HUD, blocked notifications,
 * and the gamepad settings panel as PAC.UI.Sections.gamepad.
 *
 * @author Donald Galliano III × Cassy
 * @version 1.5 — Phase 1-5 + Phase 6 (Polish)
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;

  var CONFIG_KEY = 'pac_gamepad_config';
  var _coreInjected = false;
  var _coreReady = false;
  var _connected = false;
  var _connectedId = null;
  var _currentContext = 'shop';
  var _panelContainer = null;
  var _lastSlotCount = 0;
  var _lastCursorIndex = 0;
  var _lastPickIndex = 0;
  var _lastBoardX = 0;
  var _lastBoardY = 0;
  var _boardGrabbed = false;
  var _boardLayout = null;       // Cached pixel layout, invalidated on resize
  var _analogMode = false;       // Whether analog cursor is active (visual state)

  // ── Hunt Browser State ──
  var _huntOpen = false;
  var _huntScreen = 'mode';        // 'mode' | 'pokemon' | 'config'
  var _huntMode = 'single';        // 'single' | 'team'
  var _huntModeIndex = 0;          // 0=Single, 1=Team, 2=Abort (if active)
  var _huntModeCount = 2;          // 2 or 3 depending on hunt active
  var _huntRarityIndex = 0;
  var _huntListIndex = 0;
  var _huntFilteredList = [];
  var _huntRarities = ['common', 'uncommon', 'rare', 'epic', 'ultra', 'unique', 'legendary', 'special', 'hatch'];
  var _huntTarget = '';
  var _huntQty = 3;
  var _huntBudget = 20;
  var _huntConfigField = 0;        // 0=qty, 1=budget
  var _huntOverlayEl = null;
  var HUNT_LIST_VISIBLE = 8;

  // ── Tooltip ──
  var _tooltipEl = null;

  // ── Cursor animations ──
  var _styleInjected = false;
  var _breatheTimer = null;


  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIG PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function _loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : { enabled: true };
    } catch (e) {
      return { enabled: true };
    }
  }

  function _saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CORE INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectCore() {
    if (_coreInjected) return;
    try {
      var scriptUrl = chrome.runtime.getURL('content/gamepad-core.js');
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.onload = function() {
        _coreInjected = true;
        if (PAC.DEBUG_MODE) console.log('PAC Gamepad: Core injected');
      };
      script.onerror = function() {
        console.error('PAC Gamepad: Failed to inject gamepad-core.js');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('PAC Gamepad: Injection error', e);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CURSOR ANIMATION STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function _injectCursorStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '@keyframes pac-cursor-breathe {' +
        '0%,100% { box-shadow: 0 0 12px rgba(48,213,200,0.4), inset 0 0 8px rgba(48,213,200,0.1); }' +
        '50% { box-shadow: 0 0 18px rgba(48,213,200,0.6), inset 0 0 12px rgba(48,213,200,0.2); }' +
      '}';
    document.documentElement.appendChild(style);
  }

  function _pauseBreathing() {
    _cursorEl.style.animation = 'none';
    if (_breatheTimer) clearTimeout(_breatheTimer);
    _breatheTimer = setTimeout(function() {
      if (_cursorEl.style.display !== 'none') {
        _cursorEl.style.animation = 'pac-cursor-breathe 2s ease-in-out infinite';
      }
    }, 500);
  }

  function _pulseContext() {
    _cursorEl.style.transform = 'scale(1.3)';
    _cursorEl.style.transition = 'transform 0.15s ease-out';
    setTimeout(function() {
      _cursorEl.style.transform = 'scale(1)';
      setTimeout(function() {
        _cursorEl.style.transition = '';
      }, 150);
    }, 150);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CURSOR OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  var _cursorEl = document.createElement('div');
  _cursorEl.id = 'pac-gamepad-cursor';
  _cursorEl.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483644;' +
    'border:2px solid rgba(48,213,200,0.8);border-radius:6px;' +
    'box-shadow:0 0 12px rgba(48,213,200,0.4),inset 0 0 8px rgba(48,213,200,0.1);' +
    'transition:left 0.08s ease-out,top 0.08s ease-out,width 0.08s ease-out,height 0.08s ease-out;' +
    'display:none;';
  document.documentElement.appendChild(_cursorEl);


  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTON PROMPT HUD
  // ═══════════════════════════════════════════════════════════════════════════

  var _hudEl = document.createElement('div');
  _hudEl.id = 'pac-gamepad-hud';
  _hudEl.style.cssText =
    'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);' +
    'z-index:2147483644;pointer-events:none;' +
    'background:rgba(10,12,18,0.96);border:1px solid rgba(48,213,200,0.2);' +
    'border-radius:8px;padding:6px 14px;' +
    'font-family:\'Courier New\',monospace;font-size:10px;' +
    'color:rgba(255,255,255,0.6);white-space:nowrap;display:none;';
  document.documentElement.appendChild(_hudEl);

  /**
   * Update HUD text and visibility based on context.
   */
  function _updateHUD(context) {
    if (context === 'shop') {
      _hudEl.textContent = 'A Buy  \u00B7  Y Remove  \u00B7  LT Reroll  \u00B7  RT Level  \u00B7  X Lock  \u00B7  Menu End  \u00B7  LB Board';
      _hudEl.style.display = 'block';
    } else if (context === 'pick') {
      _hudEl.textContent = '\u25C4\u25BA Choose  \u00B7  A Pick';
      _hudEl.style.display = 'block';
    } else if (context === 'board') {
      _hudEl.textContent = '\u25C4\u25B2\u25BC\u25BA Move  \u00B7  A Grab/Drop  \u00B7  Y Sell  \u00B7  B Back  \u00B7  LB Shop';
      _hudEl.style.display = 'block';
    } else if (context === 'analog') {
      _hudEl.textContent = 'A Click/Drag  \u00B7  B Cancel  \u00B7  D-pad Grid Mode';
      _hudEl.style.display = 'block';
    } else {
      _hudEl.style.display = 'none';
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CURSOR POSITIONING
  // ═══════════════════════════════════════════════════════════════════════════

  function _positionShopCursor(index) {
    _lastCursorIndex = index;

    var shopContainer = document.querySelector('ul.game-pokemons-store');
    if (!shopContainer) {
      _cursorEl.style.display = 'none';
      return;
    }

    var slots = shopContainer.querySelectorAll('div.my-box.clickable.game-pokemon-portrait');

    // Report actual slot count back to core for cursor wrapping
    if (slots.length !== _lastSlotCount) {
      _lastSlotCount = slots.length;
      window.postMessage({ type: 'PAC_GAMEPAD_SLOT_COUNT', count: slots.length }, '*');
    }

    if (slots.length === 0 || index >= slots.length) {
      _cursorEl.style.display = 'none';
      return;
    }

    var rect = slots[index].getBoundingClientRect();
    _cursorEl.style.display = 'block';
    _cursorEl.style.left = rect.left + 'px';
    _cursorEl.style.top = rect.top + 'px';
    _cursorEl.style.width = rect.width + 'px';
    _cursorEl.style.height = rect.height + 'px';
    _pauseBreathing();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VISIBILITY CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a DOM element is actually visible on screen.
   * Matches the authoritative isVisible() in api-core.js.
   */
  function _isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PICK CURSOR POSITIONING
  // ═══════════════════════════════════════════════════════════════════════════

  function _positionPickCursor(index) {
    _lastPickIndex = index;

    // Try pokemon proposition first, then item proposition
    var container = document.querySelector('.game-pokemons-proposition');
    if (!container || !_isVisible(container)) {
      container = document.querySelector('.game-items-proposition');
    }
    if (!container || !_isVisible(container)) {
      _cursorEl.style.display = 'none';
      return;
    }

    // Child selector: .game-pokemon-portrait with fallback to direct children
    var choices = container.querySelectorAll('.game-pokemon-portrait');
    if (choices.length === 0) {
      choices = container.children;
    }

    if (choices.length === 0 || index >= choices.length) {
      _cursorEl.style.display = 'none';
      return;
    }

    var rect = choices[index].getBoundingClientRect();
    _cursorEl.style.display = 'block';
    _cursorEl.style.left = rect.left + 'px';
    _cursorEl.style.top = rect.top + 'px';
    _cursorEl.style.width = rect.width + 'px';
    _cursorEl.style.height = rect.height + 'px';
    _pauseBreathing();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BOARD CURSOR POSITIONING
  // ═══════════════════════════════════════════════════════════════════════════

  // From Phaser source (game res: 1950×1000, cell: 96×96).
  // Coordinates are top-left corner of each cell, not center.
  // Y-axis is INVERTED: positionY=0 is the bottom board row (highest pixel Y),
  // positionY=3 is the top board row (lowest pixel Y).
  var BOARD_LEFT_RATIO   = 0.32;      // (672 - 48) / 1950 — left edge of col 0
  var BOARD_TOP_RATIO    = 0.616;     // (664 - 48) / 1000 — top edge of row 0 (bottom row)
  var CELL_WIDTH_RATIO   = 0.04923;   // 96 / 1950
  var CELL_HEIGHT_RATIO  = 0.096;     // 96 / 1000

  function _calculateBoardLayout() {
    var canvas = document.querySelector('canvas');
    if (!canvas) return null;

    var rect = canvas.getBoundingClientRect();
    _boardLayout = {
      canvasRect: rect,
      originX: rect.left + rect.width * BOARD_LEFT_RATIO,
      originY: rect.top + rect.height * BOARD_TOP_RATIO,
      cellW: rect.width * CELL_WIDTH_RATIO,
      cellH: rect.height * CELL_HEIGHT_RATIO
    };
    return _boardLayout;
  }

  function _positionBoardCursor(x, y, grabbed) {
    _lastBoardX = x;
    _lastBoardY = y;
    _boardGrabbed = !!grabbed;

    if (!_boardLayout) _calculateBoardLayout();
    if (!_boardLayout) {
      _cursorEl.style.display = 'none';
      return;
    }

    _cursorEl.style.display = 'block';
    _cursorEl.style.left = (_boardLayout.originX + x * _boardLayout.cellW) + 'px';
    _cursorEl.style.top = (_boardLayout.originY - y * _boardLayout.cellH) + 'px';
    _cursorEl.style.width = _boardLayout.cellW + 'px';
    _cursorEl.style.height = _boardLayout.cellH + 'px';

    // Visual state: grabbed = bright green, normal = teal
    if (grabbed) {
      _cursorEl.style.borderColor = 'rgba(72,255,128,0.9)';
      _cursorEl.style.boxShadow = '0 0 16px rgba(72,255,128,0.5),inset 0 0 8px rgba(72,255,128,0.15)';
    } else {
      _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
      _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4),inset 0 0 8px rgba(48,213,200,0.1)';
    }
    _pauseBreathing();
  }


  /**
   * Position analog cursor at exact pixel coordinates.
   * Small circle, teal idle, orange dragging. Transition disabled for 60fps updates.
   */
  function _positionAnalogCursor(x, y, dragging) {
    _cursorEl.style.display = 'block';
    _cursorEl.style.transition = 'none';
    _cursorEl.style.width = '24px';
    _cursorEl.style.height = '24px';
    _cursorEl.style.left = (x - 12) + 'px';
    _cursorEl.style.top = (y - 12) + 'px';
    _cursorEl.style.borderRadius = '50%';

    if (dragging) {
      _cursorEl.style.borderColor = 'rgba(255,180,48,0.9)';
      _cursorEl.style.boxShadow = '0 0 12px rgba(255,180,48,0.5)';
    } else {
      _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
      _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4)';
    }
    _pauseBreathing();
  }

  /**
   * Restore cursor to grid mode styling (rectangle with transitions).
   */
  function _resetCursorToGrid() {
    _cursorEl.style.borderRadius = '6px';
    _cursorEl.style.transition =
      'left 0.08s ease-out,top 0.08s ease-out,width 0.08s ease-out,height 0.08s ease-out';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // HUNT BROWSER OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  function _createHuntOverlay() {
    if (_huntOverlayEl) return;
    _huntOverlayEl = document.createElement('div');
    _huntOverlayEl.id = 'pac-hunt-browser';
    _huntOverlayEl.style.cssText =
      'position:fixed;z-index:2147483645;' +
      'left:50%;top:50%;transform:translate(-50%,-50%);' +
      'background:rgba(10,12,18,0.96);' +
      'border:1px solid rgba(48,213,200,0.3);border-radius:12px;padding:16px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 16px rgba(48,213,200,0.15);' +
      'backdrop-filter:blur(12px);' +
      'min-width:340px;max-width:480px;' +
      'font-family:monospace;color:#fff;pointer-events:none;';
    document.body.appendChild(_huntOverlayEl);
  }

  function _destroyHuntOverlay() {
    if (_huntOverlayEl) { _huntOverlayEl.remove(); _huntOverlayEl = null; }
  }


  // ── Screen Renderers ──

  function _renderModeScreen() {
    if (!_huntOverlayEl) return;

    _huntModeCount = PAC.UI.Engine.Hunt.isActive() ? 3 : 2;
    if (_huntModeIndex >= _huntModeCount) _huntModeIndex = 0;

    var options = ['Single Target', 'Team Hunt'];
    if (_huntModeCount === 3) options.push('Abort Hunt');

    var html =
      '<div style="font-size:13px;color:rgba(48,213,200,0.9);margin-bottom:12px;text-align:center;">HUNT BROWSER</div>';

    for (var i = 0; i < options.length; i++) {
      var selected = (i === _huntModeIndex);
      var color = (i === 2) ? 'rgba(255,100,100,0.9)' : (selected ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)');
      var bg = selected ? 'rgba(48,213,200,0.1)' : 'transparent';
      var border = selected ? '1px solid rgba(48,213,200,0.3)' : '1px solid transparent';
      html += '<div style="padding:8px 12px;margin:4px 0;border-radius:6px;' +
        'background:' + bg + ';border:' + border + ';color:' + color + ';font-size:12px;">' +
        (selected ? '\u25B6 ' : '  ') + options[i] + '</div>';
    }

    html += '<div style="margin-top:12px;font-size:9px;color:rgba(255,255,255,0.25);text-align:center;">' +
      '\u25B2\u25BC Select  \u00B7  A Confirm  \u00B7  B/RB Close</div>';

    _huntOverlayEl.innerHTML = html;
  }

  function _renderPokemonScreen() {
    if (!_huntOverlayEl) return;

    var html =
      '<div style="font-size:13px;color:rgba(48,213,200,0.9);margin-bottom:8px;text-align:center;">SELECT POKEMON</div>';

    // Rarity tabs
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">';
    for (var r = 0; r < _huntRarities.length; r++) {
      var sel = (r === _huntRarityIndex);
      var tabColor = sel ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.3)';
      var tabBg = sel ? 'rgba(48,213,200,0.12)' : 'transparent';
      html += '<span style="font-size:9px;padding:2px 6px;border-radius:3px;' +
        'color:' + tabColor + ';background:' + tabBg + ';' +
        'border:1px solid ' + (sel ? 'rgba(48,213,200,0.3)' : 'transparent') + ';">' +
        _huntRarities[r].toUpperCase() + '</span>';
    }
    html += '</div>';

    // Pokemon list (scrolling window)
    if (_huntFilteredList.length === 0) {
      html += '<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.3);font-size:11px;">No pokemon in this rarity</div>';
    } else {
      var start = Math.max(0, _huntListIndex - Math.floor(HUNT_LIST_VISIBLE / 2));
      if (start + HUNT_LIST_VISIBLE > _huntFilteredList.length) {
        start = Math.max(0, _huntFilteredList.length - HUNT_LIST_VISIBLE);
      }
      var end = Math.min(start + HUNT_LIST_VISIBLE, _huntFilteredList.length);

      for (var p = start; p < end; p++) {
        var pSel = (p === _huntListIndex);
        var pColor = pSel ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.5)';
        var pBg = pSel ? 'rgba(48,213,200,0.08)' : 'transparent';
        html += '<div style="padding:4px 8px;font-size:11px;color:' + pColor +
          ';background:' + pBg + ';border-radius:3px;">' +
          (pSel ? '\u25B6 ' : '  ') + _huntFilteredList[p] + '</div>';
      }

      html += '<div style="text-align:right;font-size:9px;color:rgba(255,255,255,0.25);margin-top:4px;">' +
        (_huntListIndex + 1) + ' / ' + _huntFilteredList.length + '</div>';
    }

    html += '<div style="margin-top:8px;font-size:9px;color:rgba(255,255,255,0.25);text-align:center;">' +
      '\u25C4\u25BA Rarity  \u00B7  \u25B2\u25BC Scroll  \u00B7  A Select  \u00B7  B Back</div>';

    _huntOverlayEl.innerHTML = html;
  }

  function _renderConfigScreen() {
    if (!_huntOverlayEl) return;

    var html =
      '<div style="font-size:13px;color:rgba(48,213,200,0.9);margin-bottom:12px;text-align:center;">CONFIGURE HUNT</div>';

    if (_huntMode === 'single') {
      // Show target name + rarity
      var targetData = PAC.Data.POKEMON_DATA[_huntTarget];
      var rarity = targetData ? targetData.rarity : '?';
      html += '<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:12px;text-align:center;">' +
        _huntTarget + ' <span style="color:rgba(48,213,200,0.6);">(' + rarity + ')</span></div>';

      // Qty field
      var qtySelected = (_huntConfigField === 0);
      html += '<div style="display:flex;justify-content:space-between;align-items:center;' +
        'padding:8px 12px;margin:4px 0;border-radius:6px;' +
        'background:' + (qtySelected ? 'rgba(48,213,200,0.08)' : 'transparent') + ';' +
        'border:1px solid ' + (qtySelected ? 'rgba(48,213,200,0.3)' : 'transparent') + ';">' +
        '<span style="font-size:11px;color:' + (qtySelected ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)') + ';">Quantity</span>' +
        '<span style="font-size:13px;color:' + (qtySelected ? '#fff' : 'rgba(255,255,255,0.5)') + ';">\u25C4 ' + _huntQty + ' \u25BA</span></div>';

      // Budget field
      var budSelected = (_huntConfigField === 1);
      html += '<div style="display:flex;justify-content:space-between;align-items:center;' +
        'padding:8px 12px;margin:4px 0;border-radius:6px;' +
        'background:' + (budSelected ? 'rgba(48,213,200,0.08)' : 'transparent') + ';' +
        'border:1px solid ' + (budSelected ? 'rgba(48,213,200,0.3)' : 'transparent') + ';">' +
        '<span style="font-size:11px;color:' + (budSelected ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)') + ';">Budget</span>' +
        '<span style="font-size:13px;color:' + (budSelected ? '#fff' : 'rgba(255,255,255,0.5)') + ';">\u25C4 ' + _huntBudget + 'g \u25BA</span></div>';
    } else {
      // Team hunt config — show targets + budget
      var targets = PAC.State.state.teamTargets || [];
      var enabled = targets.filter(function(t) { return t.enabled; });
      html += '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px;">' +
        'Team targets: ' + enabled.length + '</div>';

      for (var i = 0; i < enabled.length && i < 6; i++) {
        html += '<div style="font-size:10px;color:rgba(48,213,200,0.7);padding:2px 0;">' +
          '\u2022 ' + (enabled[i].displayName || enabled[i].pokemon) + '</div>';
      }
      if (enabled.length > 6) {
        html += '<div style="font-size:9px;color:rgba(255,255,255,0.3);">+' + (enabled.length - 6) + ' more</div>';
      }

      // Budget field (always selected in team mode)
      html += '<div style="display:flex;justify-content:space-between;align-items:center;' +
        'padding:8px 12px;margin:8px 0 4px;border-radius:6px;' +
        'background:rgba(48,213,200,0.08);border:1px solid rgba(48,213,200,0.3);">' +
        '<span style="font-size:11px;color:rgba(48,213,200,0.9);">Budget</span>' +
        '<span style="font-size:13px;color:#fff;">\u25C4 ' + _huntBudget + 'g \u25BA</span></div>';
    }

    html += '<div style="margin-top:12px;font-size:9px;color:rgba(255,255,255,0.25);text-align:center;">';
    if (_huntMode === 'single') {
      html += '\u25B2\u25BC Field  \u00B7  \u25C4\u25BA \u00B11  \u00B7  LB -5  \u00B7  RB +5  \u00B7  A Launch  \u00B7  B Back';
    } else {
      html += '\u25C4\u25BA \u00B11  \u00B7  LB -5  \u00B7  RB +5  \u00B7  A Launch  \u00B7  B Back';
    }
    html += '</div>';

    _huntOverlayEl.innerHTML = html;
  }


  // ── Hunt Helpers ──

  function _filterPokemonByRarity(rarity) {
    var names = Object.keys(PAC.Data.POKEMON_DATA);
    _huntFilteredList = names.filter(function(name) {
      return PAC.Data.POKEMON_DATA[name].rarity === rarity;
    }).sort();
    _huntListIndex = 0;
  }

  function _initBudgetDefault() {
    var el = document.querySelector('.toast-player-income span');
    if (el) {
      var gold = parseInt(el.textContent, 10);
      if (!isNaN(gold) && gold > 0) { _huntBudget = gold; return; }
    }
    _huntBudget = 20;
  }

  function _adjustConfigField(delta) {
    if (_huntMode === 'team' || _huntConfigField === 1) {
      _huntBudget = Math.max(1, _huntBudget + delta);
    } else {
      _huntQty = Math.max(1, Math.min(9, _huntQty + delta));
    }
  }


  // ── Hunt Navigation Handlers ──

  function _handleHuntButton(button) {
    if (_huntScreen === 'mode') _handleModeNav(button);
    else if (_huntScreen === 'pokemon') _handlePokemonNav(button);
    else if (_huntScreen === 'config') _handleConfigNav(button);
  }

  function _handleModeNav(button) {
    switch (button) {
      case 12: // Up
        _huntModeIndex = (_huntModeIndex - 1 + _huntModeCount) % _huntModeCount;
        _renderModeScreen();
        break;
      case 13: // Down
        _huntModeIndex = (_huntModeIndex + 1) % _huntModeCount;
        _renderModeScreen();
        break;
      case 0: // A = confirm
        if (_huntModeIndex === 0) {
          // Single target → pokemon select
          _huntMode = 'single';
          _huntScreen = 'pokemon';
          _huntRarityIndex = 0;
          _filterPokemonByRarity(_huntRarities[0]);
          _renderPokemonScreen();
        } else if (_huntModeIndex === 1) {
          // Team hunt → config
          _huntMode = 'team';
          _huntScreen = 'config';
          _initBudgetDefault();
          _renderConfigScreen();
        } else if (_huntModeIndex === 2) {
          // Abort active hunt
          PAC.UI.Engine.Hunt.abort();
          _closeHuntBrowser();
        }
        break;
      case 1: // B = close
      case 5: // RB = close (from mode screen)
        _closeHuntBrowser();
        break;
    }
  }

  function _handlePokemonNav(button) {
    switch (button) {
      case 14: // Left — prev rarity tab
        _huntRarityIndex = (_huntRarityIndex - 1 + _huntRarities.length) % _huntRarities.length;
        _filterPokemonByRarity(_huntRarities[_huntRarityIndex]);
        _renderPokemonScreen();
        break;
      case 15: // Right — next rarity tab
        _huntRarityIndex = (_huntRarityIndex + 1) % _huntRarities.length;
        _filterPokemonByRarity(_huntRarities[_huntRarityIndex]);
        _renderPokemonScreen();
        break;
      case 12: // Up — scroll list up
        if (_huntFilteredList.length > 0) {
          _huntListIndex = (_huntListIndex - 1 + _huntFilteredList.length) % _huntFilteredList.length;
          _renderPokemonScreen();
        }
        break;
      case 13: // Down — scroll list down
        if (_huntFilteredList.length > 0) {
          _huntListIndex = (_huntListIndex + 1) % _huntFilteredList.length;
          _renderPokemonScreen();
        }
        break;
      case 0: // A = select pokemon
        if (_huntFilteredList.length > 0) {
          _huntTarget = _huntFilteredList[_huntListIndex];
          _huntScreen = 'config';
          _huntConfigField = 0;
          _huntQty = 3;
          _initBudgetDefault();
          _renderConfigScreen();
        }
        break;
      case 1: // B = back to mode
        _huntScreen = 'mode';
        _renderModeScreen();
        break;
    }
  }

  function _handleConfigNav(button) {
    switch (button) {
      case 12: // Up — prev field (single only)
        if (_huntMode === 'single') {
          _huntConfigField = (_huntConfigField === 0) ? 1 : 0;
          _renderConfigScreen();
        }
        break;
      case 13: // Down — next field (single only)
        if (_huntMode === 'single') {
          _huntConfigField = (_huntConfigField === 0) ? 1 : 0;
          _renderConfigScreen();
        }
        break;
      case 14: // Left — decrease by 1
        _adjustConfigField(-1);
        _renderConfigScreen();
        break;
      case 15: // Right — increase by 1
        _adjustConfigField(1);
        _renderConfigScreen();
        break;
      case 4: // LB — decrease by 5
        _adjustConfigField(-5);
        _renderConfigScreen();
        break;
      case 5: // RB — increase by 5
        _adjustConfigField(5);
        _renderConfigScreen();
        break;
      case 0: // A = launch
        _launchHunt();
        break;
      case 1: // B = back
        if (_huntMode === 'single') {
          _huntScreen = 'pokemon';
          _renderPokemonScreen();
        } else {
          _huntScreen = 'mode';
          _renderModeScreen();
        }
        break;
    }
  }


  // ── Hunt Launch + Open/Close ──

  function _launchHunt() {
    if (!PAC.UI.CMD || !PAC.UI.CMD.isHuntEnabled()) {
      PAC.UI.Components.Notification.show('Hunt Mode disabled \u2014 enable in CMD', 'warning', 2000);
      _closeHuntBrowser();
      return;
    }
    window.postMessage({ type: 'PAC_GAMEPAD_VIBRATE', profile: 'hunt' }, '*');
    if (_huntMode === 'single') {
      PAC.UI.Engine.Hunt.start({
        target: _huntTarget, qty: _huntQty, budget: _huntBudget, isTeamHunt: false
      });
    } else {
      PAC.UI.Engine.Hunt.start({ budget: _huntBudget, isTeamHunt: true });
    }
    _closeHuntBrowser();
  }

  function _openHuntBrowser() {
    if (_huntOpen) return true;
    if (!PAC.UI.CMD || !PAC.UI.CMD.isHuntEnabled()) {
      PAC.UI.Components.Notification.show('Hunt Mode disabled \u2014 enable in CMD', 'warning', 2000);
      return false;
    }
    _huntOpen = true;
    _huntScreen = 'mode';
    _huntModeIndex = 0;
    _createHuntOverlay();
    _renderModeScreen();
    return true;
  }

  function _closeHuntBrowser() {
    _huntOpen = false;
    _destroyHuntOverlay();
    window.postMessage({ type: 'PAC_GAMEPAD_HUNT_CLOSE' }, '*');
  }


  // Reposition cursor on window resize
  window.addEventListener('resize', function() {
    _boardLayout = null;   // Force recalculation
    if (!_connected) return;
    if (_currentContext === 'shop') {
      _positionShopCursor(_lastCursorIndex);
    } else if (_currentContext === 'pick') {
      _positionPickCursor(_lastPickIndex);
    } else if (_currentContext === 'board') {
      _positionBoardCursor(_lastBoardX, _lastBoardY, _boardGrabbed);
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK REASON MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  function _blockMessage(reason) {
    if (reason === 'wrong_phase') return 'Not available in this phase';
    if (reason === 'cant_afford') return 'Not enough gold';
    if (reason === 'no_room') return 'Not in a game';
    if (reason === 'empty_cell') return 'No unit here';
    return 'Action blocked';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTED FEEDBACK — brief green flash on cursor
  // ═══════════════════════════════════════════════════════════════════════════

  var _flashTimer = null;

  function _flashCursor() {
    _cursorEl.style.borderColor = 'rgba(46,204,113,0.9)';
    _cursorEl.style.boxShadow = '0 0 16px rgba(46,204,113,0.5),inset 0 0 8px rgba(46,204,113,0.15)';

    if (_flashTimer) clearTimeout(_flashTimer);
    _flashTimer = setTimeout(function() {
      if (_analogMode) {
        // Reset to analog teal circle
        _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
        _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4)';
      } else if (_boardGrabbed) {
        // Reset to grabbed state (bright green)
        _cursorEl.style.borderColor = 'rgba(72,255,128,0.9)';
        _cursorEl.style.boxShadow = '0 0 16px rgba(72,255,128,0.5),inset 0 0 8px rgba(72,255,128,0.15)';
      } else {
        // Reset to default teal
        _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
        _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4),inset 0 0 8px rgba(48,213,200,0.1)';
      }
      _flashTimer = null;
    }, 150);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // BOARD UNIT TOOLTIP
  // ═══════════════════════════════════════════════════════════════════════════

  function _createTooltip() {
    if (_tooltipEl) return;
    _tooltipEl = document.createElement('div');
    _tooltipEl.id = 'pac-gamepad-tooltip';
    _tooltipEl.style.cssText =
      'position:fixed;z-index:2147483643;pointer-events:none;' +
      'background:rgba(10,12,18,0.96);' +
      'border:1px solid rgba(48,213,200,0.3);border-radius:8px;padding:8px 10px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.5),0 0 8px rgba(48,213,200,0.1);' +
      'backdrop-filter:blur(8px);' +
      'font-family:monospace;font-size:10px;color:rgba(255,255,255,0.8);' +
      'white-space:nowrap;display:none;';
    document.documentElement.appendChild(_tooltipEl);
  }

  function _positionTooltip() {
    if (!_tooltipEl || _tooltipEl.style.display === 'none') return;
    if (!_boardLayout) return;

    var cx = _boardLayout.originX + _lastBoardX * _boardLayout.cellW;
    var cy = _boardLayout.originY - _lastBoardY * _boardLayout.cellH;
    var tw = _tooltipEl.offsetWidth;
    var th = _tooltipEl.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Default: right + above cursor
    var tx = cx + _boardLayout.cellW + 8;
    var ty = cy - th - 4;

    // Flip left if overflows right
    if (tx + tw > vw - 8) {
      tx = cx - tw - 8;
    }
    // Flip below if overflows top
    if (ty < 8) {
      ty = cy + _boardLayout.cellH + 4;
    }
    // Final clamp
    tx = Math.max(8, Math.min(vw - tw - 8, tx));
    ty = Math.max(8, Math.min(vh - th - 8, ty));

    _tooltipEl.style.left = tx + 'px';
    _tooltipEl.style.top = ty + 'px';
  }

  function _showTooltip(data) {
    _createTooltip();

    var name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
    var stars = '';
    for (var s = 0; s < (data.stars || 1); s++) stars += '\u2605';

    var html =
      '<div style="color:rgba(48,213,200,0.9);font-size:11px;margin-bottom:4px;">' +
        name + ' <span style="color:rgba(255,215,0,0.8);">' + stars + '</span>' +
        (data.shiny ? ' <span style="color:rgba(255,180,48,0.9);">\u2726</span>' : '') +
      '</div>';

    if (data.types && data.types.length) {
      html += '<div style="color:rgba(255,255,255,0.4);font-size:9px;margin-bottom:3px;">' +
        data.types.join(' / ') + '</div>';
    }

    html += '<div style="display:flex;gap:8px;color:rgba(255,255,255,0.6);font-size:9px;">' +
      '<span>HP ' + (data.hp || 0) + '/' + (data.maxHP || 0) + '</span>' +
      '<span>ATK ' + (data.atk || 0) + '</span>' +
      '<span>DEF ' + (data.def || 0) + '</span>' +
      '<span>RNG ' + (data.range || 0) + '</span>' +
    '</div>';

    if (data.items && data.items.length) {
      html += '<div style="color:rgba(255,180,48,0.7);font-size:9px;margin-top:3px;">' +
        data.items.join(', ') + '</div>';
    }

    _tooltipEl.innerHTML = html;
    _tooltipEl.style.display = 'block';
    _positionTooltip();
  }

  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE BRIDGE (page context → content script)
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: Register BEFORE _injectCore() so PAC_GAMEPAD_CORE_READY is not lost.

  window.addEventListener('message', function(e) {
    if (e.source !== window || !e.data) return;

    switch (e.data.type) {

      case 'PAC_GAMEPAD_CORE_READY':
        _coreReady = true;
        // Bridge initial config from localStorage to core
        var config = _loadConfig();
        window.postMessage({ type: 'PAC_GAMEPAD_ENABLE', active: config.enabled !== false }, '*');
        if (config.analogSpeed) {
          window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_SPEED', speed: config.analogSpeed }, '*');
        }
        if (config.deadzone) {
          window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_DEADZONE', deadzone: config.deadzone }, '*');
        }
        if (config.haptics !== undefined) {
          window.postMessage({ type: 'PAC_GAMEPAD_HAPTICS', enabled: config.haptics }, '*');
        }
        if (config.stickCurve) {
          window.postMessage({ type: 'PAC_GAMEPAD_STICK_CURVE', curve: config.stickCurve }, '*');
        }
        if (PAC.DEBUG_MODE) console.log('PAC Gamepad: Core ready');
        break;

      case 'PAC_GAMEPAD_CONNECTED':
        _connected = true;
        _connectedId = e.data.gamepadId;
        if (_currentContext !== 'disabled') {
          _cursorEl.style.display = 'block';
        }
        _updateHUD(_currentContext !== 'disabled' ? _currentContext : 'disabled');
        if (_panelContainer) _renderPanel(_panelContainer);
        break;

      case 'PAC_GAMEPAD_DISCONNECTED':
        _connected = false;
        _connectedId = null;
        _cursorEl.style.display = 'none';
        _updateHUD('disabled');
        if (_panelContainer) _renderPanel(_panelContainer);
        break;

      case 'PAC_GAMEPAD_CURSOR':
        if (e.data.context === 'shop') {
          _positionShopCursor(e.data.index);
        } else if (e.data.context === 'pick') {
          _positionPickCursor(e.data.index);
        } else if (e.data.context === 'board') {
          _positionBoardCursor(e.data.x, e.data.y, e.data.grabbed);
        }
        break;

      case 'PAC_GAMEPAD_EXECUTED':
        _flashCursor();
        break;

      case 'PAC_GAMEPAD_BLOCKED':
        PAC.UI.Components.Notification.show(_blockMessage(e.data.reason), 'warning', 1200);
        break;

      case 'PAC_GAMEPAD_GRABBED':
        _boardGrabbed = true;
        _positionBoardCursor(e.data.x, e.data.y, true);
        break;

      case 'PAC_GAMEPAD_DROPPED':
        _boardGrabbed = false;
        _flashCursor();
        break;

      case 'PAC_GAMEPAD_GRAB_CANCELLED':
        _boardGrabbed = false;
        break;

      case 'PAC_GAMEPAD_MODE':
        if (e.data.mode === 'analog') {
          _analogMode = true;
          _updateHUD('analog');
          _hideTooltip();
        } else if (e.data.mode === 'grid') {
          _analogMode = false;
          _resetCursorToGrid();
          _updateHUD(_currentContext);
        }
        break;

      case 'PAC_GAMEPAD_ANALOG_CURSOR':
        _positionAnalogCursor(e.data.x, e.data.y, e.data.dragging);
        break;

      case 'PAC_GAMEPAD_CONTEXT':
        _currentContext = e.data.context;
        _boardLayout = null;
        _boardGrabbed = false;
        _analogMode = false;
        _hideTooltip();
        if (e.data.context === 'hunt') {
          _cursorEl.style.display = 'none';
          _hudEl.style.display = 'none';
          if (!_openHuntBrowser()) {
            window.postMessage({ type: 'PAC_GAMEPAD_HUNT_CLOSE' }, '*');
          }
          break;
        }
        if (e.data.context === 'disabled') {
          _cursorEl.style.display = 'none';
          _updateHUD('disabled');
        } else if (_connected) {
          _cursorEl.style.display = 'block';
          _resetCursorToGrid();
          _updateHUD(e.data.context);
          // Reset cursor to default teal on context switch
          _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
          _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4),inset 0 0 8px rgba(48,213,200,0.1)';
          _pulseContext();
        }
        break;

      case 'PAC_GAMEPAD_HUNT_BUTTON':
        if (_huntOpen) _handleHuntButton(e.data.button);
        break;

      case 'PAC_GAMEPAD_HUNT_FORCE_CLOSE':
        if (_huntOpen) {
          _huntOpen = false;
          _destroyHuntOverlay();
          // Don't send HUNT_CLOSE — core already changed context
        }
        break;

      case 'PAC_GAMEPAD_UNIT_INFO':
        if (e.data.name) {
          _showTooltip(e.data);
        } else {
          _hideTooltip();
        }
        break;
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS PANEL (PAC.UI.Sections.gamepad)
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderPanel(container) {
    _panelContainer = container;
    container.innerHTML = '';

    var config = _loadConfig();

    // ── Connected Status ──
    var statusGroup = document.createElement('div');
    statusGroup.className = 'pac-group';
    statusGroup.appendChild(_buildGroupHeader('CONNECTION'));

    var statusRow = document.createElement('div');
    statusRow.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:8px;' +
      'background:rgba(255,255,255,0.02);border-radius:4px;margin-bottom:8px;';

    var dot = document.createElement('span');
    dot.style.cssText =
      'width:8px;height:8px;border-radius:50%;flex-shrink:0;' +
      'background:' + (_connected ? '#2ecc71' : 'rgba(255,255,255,0.15)') + ';' +
      'box-shadow:' + (_connected ? '0 0 6px rgba(46,204,113,0.4)' : 'none') + ';';

    var statusText = document.createElement('span');
    statusText.style.cssText =
      'font-size:11px;font-family:monospace;color:' +
      (_connected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)') + ';';
    statusText.textContent = _connected
      ? _connectedId || 'Gamepad connected'
      : 'No gamepad detected';

    statusRow.appendChild(dot);
    statusRow.appendChild(statusText);
    statusGroup.appendChild(statusRow);
    container.appendChild(statusGroup);

    // ── Enable/Disable Toggle ──
    var toggleGroup = document.createElement('div');
    toggleGroup.className = 'pac-group';
    toggleGroup.appendChild(_buildGroupHeader('SETTINGS'));

    var toggleRow = document.createElement('div');
    toggleRow.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;' +
      'padding:6px 0;font-family:\'Courier New\',monospace;';

    var toggleLabel = document.createElement('span');
    toggleLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);';
    toggleLabel.textContent = 'Enable Gamepad';

    var toggleWrap = document.createElement('label');
    toggleWrap.className = 'pac-toggle';
    toggleWrap.style.cssText = 'flex-shrink:0;';

    var toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = config.enabled !== false;
    toggleInput.className = 'pac-cmd-toggle';

    var toggleTrack = document.createElement('div');
    toggleTrack.className = 'pac-toggle-track';
    var toggleKnob = document.createElement('div');
    toggleKnob.className = 'pac-toggle-knob';
    toggleTrack.appendChild(toggleKnob);

    toggleWrap.appendChild(toggleInput);
    toggleWrap.appendChild(toggleTrack);

    toggleInput.addEventListener('change', function() {
      config.enabled = toggleInput.checked;
      _saveConfig(config);
      window.postMessage({ type: 'PAC_GAMEPAD_ENABLE', active: config.enabled }, '*');
    });

    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleWrap);
    toggleGroup.appendChild(toggleRow);

    // Haptics toggle
    var hapRow = document.createElement('div');
    hapRow.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;' +
      'padding:6px 0;font-family:\'Courier New\',monospace;';

    var hapLabel = document.createElement('span');
    hapLabel.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);';
    hapLabel.textContent = 'Haptic Feedback';

    var hapWrap = document.createElement('label');
    hapWrap.className = 'pac-toggle';
    hapWrap.style.cssText = 'flex-shrink:0;';

    var hapInput = document.createElement('input');
    hapInput.type = 'checkbox';
    hapInput.checked = config.haptics !== false;
    hapInput.className = 'pac-cmd-toggle';

    var hapTrack = document.createElement('div');
    hapTrack.className = 'pac-toggle-track';
    var hapKnob = document.createElement('div');
    hapKnob.className = 'pac-toggle-knob';
    hapTrack.appendChild(hapKnob);

    hapWrap.appendChild(hapInput);
    hapWrap.appendChild(hapTrack);

    hapInput.addEventListener('change', function() {
      config.haptics = hapInput.checked;
      _saveConfig(config);
      window.postMessage({ type: 'PAC_GAMEPAD_HAPTICS', enabled: config.haptics }, '*');
    });

    hapRow.appendChild(hapLabel);
    hapRow.appendChild(hapWrap);
    toggleGroup.appendChild(hapRow);
    container.appendChild(toggleGroup);

    // ── Button Reference ──
    var refGroup = document.createElement('div');
    refGroup.className = 'pac-group';
    refGroup.appendChild(_buildGroupHeader('SHOP CONTROLS', 'rgba(255,255,255,0.3)'));

    var refHTML =
      '<div style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4);line-height:1.8;padding:4px 0;">' +
        '<div><span style="color:rgba(48,213,200,0.7);">D-pad L/R</span> Navigate shop slots</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">A</span> Buy at cursor</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">Y</span> Remove at cursor</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">LT</span> Reroll shop</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">RT</span> Level up</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">X</span> Lock/unlock shop</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">Menu</span> End turn</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">LB</span> Switch to board</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">RB</span> Open Hunt Browser</div>' +
      '</div>';

    var refContent = document.createElement('div');
    refContent.innerHTML = refHTML;
    refGroup.appendChild(refContent);
    container.appendChild(refGroup);

    // ── Pick Controls ──
    var pickGroup = document.createElement('div');
    pickGroup.className = 'pac-group';
    pickGroup.appendChild(_buildGroupHeader('PICK CONTROLS', 'rgba(255,255,255,0.3)'));

    var pickHTML =
      '<div style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4);line-height:1.8;padding:4px 0;">' +
        '<div><span style="color:rgba(48,213,200,0.7);">D-pad L/R</span> Cycle choices</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">A</span> Pick selection</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">RB</span> Open Hunt Browser</div>' +
        '<div style="color:rgba(255,255,255,0.25);font-size:9px;margin-top:4px;">Auto-activates during proposition screens</div>' +
      '</div>';

    var pickContent = document.createElement('div');
    pickContent.innerHTML = pickHTML;
    pickGroup.appendChild(pickContent);
    container.appendChild(pickGroup);

    // ── Board Controls ──
    var boardGroup = document.createElement('div');
    boardGroup.className = 'pac-group';
    boardGroup.appendChild(_buildGroupHeader('BOARD CONTROLS', 'rgba(255,255,255,0.3)'));

    var boardHTML =
      '<div style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4);line-height:1.8;padding:4px 0;">' +
        '<div><span style="color:rgba(48,213,200,0.7);">LB</span> Toggle to board (from shop)</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">D-pad</span> Move cursor on 8\u00D74 grid</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">A</span> Grab unit / Drop unit</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">Y</span> Sell unit at cursor (or grabbed)</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">B</span> Cancel grab / Back to shop</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">LB</span> Return to shop</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">RB</span> Open Hunt Browser</div>' +
        '<div style="color:rgba(255,255,255,0.25);font-size:9px;margin-top:4px;">Cursor turns green when holding a unit</div>' +
      '</div>';

    var boardContent = document.createElement('div');
    boardContent.innerHTML = boardHTML;
    boardGroup.appendChild(boardContent);
    container.appendChild(boardGroup);

    // ── Analog Stick Settings ──
    var analogGroup = document.createElement('div');
    analogGroup.className = 'pac-group';
    analogGroup.appendChild(_buildGroupHeader('ANALOG STICK', 'rgba(255,255,255,0.3)'));

    // Speed selector row
    var speedRow = document.createElement('div');
    speedRow.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:6px 0;';

    var speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'font-family:monospace;font-size:11px;color:rgba(255,255,255,0.6);';
    speedLabel.textContent = 'Cursor Speed';
    speedRow.appendChild(speedLabel);

    var speedBtns = document.createElement('div');
    speedBtns.style.cssText = 'display:flex;gap:4px;';

    var speedOptions = [
      { label: 'Slow', value: 6 },
      { label: 'Med', value: 12 },
      { label: 'Fast', value: 20 }
    ];
    var currentSpeed = config.analogSpeed || 12;

    speedOptions.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.textContent = opt.label;
      var isActive = (currentSpeed === opt.value);
      btn.style.cssText =
        'font-family:monospace;font-size:10px;padding:2px 8px;border-radius:3px;cursor:pointer;' +
        'border:1px solid ' + (isActive ? 'rgba(48,213,200,0.6)' : 'rgba(255,255,255,0.15)') + ';' +
        'background:' + (isActive ? 'rgba(48,213,200,0.15)' : 'transparent') + ';' +
        'color:' + (isActive ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)') + ';';
      btn.addEventListener('click', function() {
        config.analogSpeed = opt.value;
        _saveConfig(config);
        window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_SPEED', speed: opt.value }, '*');
        _renderPanel(container);
      });
      speedBtns.appendChild(btn);
    });

    speedRow.appendChild(speedBtns);
    analogGroup.appendChild(speedRow);

    // Deadzone selector row
    var dzRow = document.createElement('div');
    dzRow.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:6px 0;';

    var dzLabel = document.createElement('span');
    dzLabel.style.cssText = 'font-family:monospace;font-size:11px;color:rgba(255,255,255,0.6);';
    dzLabel.textContent = 'Deadzone';
    dzRow.appendChild(dzLabel);

    var dzBtns = document.createElement('div');
    dzBtns.style.cssText = 'display:flex;gap:4px;';

    var dzOptions = [
      { label: 'Low', value: 0.08 },
      { label: 'Med', value: 0.15 },
      { label: 'High', value: 0.25 }
    ];
    var currentDz = config.deadzone || 0.15;

    dzOptions.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.textContent = opt.label;
      var isActive = (currentDz === opt.value);
      btn.style.cssText =
        'font-family:monospace;font-size:10px;padding:2px 8px;border-radius:3px;cursor:pointer;' +
        'border:1px solid ' + (isActive ? 'rgba(48,213,200,0.6)' : 'rgba(255,255,255,0.15)') + ';' +
        'background:' + (isActive ? 'rgba(48,213,200,0.15)' : 'transparent') + ';' +
        'color:' + (isActive ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)') + ';';
      btn.addEventListener('click', function() {
        config.deadzone = opt.value;
        _saveConfig(config);
        window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_DEADZONE', deadzone: opt.value }, '*');
        _renderPanel(container);
      });
      dzBtns.appendChild(btn);
    });

    dzRow.appendChild(dzBtns);
    analogGroup.appendChild(dzRow);

    // Stick curve selector row
    var curveRow = document.createElement('div');
    curveRow.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:6px 0;';

    var curveLabel = document.createElement('span');
    curveLabel.style.cssText = 'font-family:monospace;font-size:11px;color:rgba(255,255,255,0.6);';
    curveLabel.textContent = 'Sensitivity';
    curveRow.appendChild(curveLabel);

    var curveBtns = document.createElement('div');
    curveBtns.style.cssText = 'display:flex;gap:4px;';

    var curveOptions = [
      { label: 'Linear', value: 'linear' },
      { label: 'Smooth', value: 'smooth' },
      { label: 'Precise', value: 'precise' }
    ];
    var currentCurve = config.stickCurve || 'smooth';

    curveOptions.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.textContent = opt.label;
      var isActive = (currentCurve === opt.value);
      btn.style.cssText =
        'font-family:monospace;font-size:10px;padding:2px 8px;border-radius:3px;cursor:pointer;' +
        'border:1px solid ' + (isActive ? 'rgba(48,213,200,0.6)' : 'rgba(255,255,255,0.15)') + ';' +
        'background:' + (isActive ? 'rgba(48,213,200,0.15)' : 'transparent') + ';' +
        'color:' + (isActive ? 'rgba(48,213,200,0.9)' : 'rgba(255,255,255,0.4)') + ';';
      btn.addEventListener('click', function() {
        config.stickCurve = opt.value;
        _saveConfig(config);
        window.postMessage({ type: 'PAC_GAMEPAD_STICK_CURVE', curve: opt.value }, '*');
        _renderPanel(container);
      });
      curveBtns.appendChild(btn);
    });

    curveRow.appendChild(curveBtns);
    analogGroup.appendChild(curveRow);

    // Analog controls reference
    var analogRefHTML =
      '<div style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.4);line-height:1.8;padding:4px 0;">' +
        '<div><span style="color:rgba(48,213,200,0.7);">Left Stick</span> Move cursor freely</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">A</span> Click / Hold to drag</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">B</span> Cancel drag / Back to grid</div>' +
        '<div><span style="color:rgba(48,213,200,0.7);">D-pad</span> Return to grid mode</div>' +
        '<div style="color:rgba(255,255,255,0.25);font-size:9px;margin-top:4px;">Other buttons pass through to grid context</div>' +
      '</div>';

    var analogRefContent = document.createElement('div');
    analogRefContent.innerHTML = analogRefHTML;
    analogGroup.appendChild(analogRefContent);
    container.appendChild(analogGroup);
  }

  /**
   * Build a group header element.
   */
  function _buildGroupHeader(text, color) {
    var header = document.createElement('div');
    header.style.cssText =
      'font-family:monospace;font-size:10px;text-transform:uppercase;' +
      'letter-spacing:0.1em;color:' + (color || 'var(--pac-accent)') + ';' +
      'margin-bottom:6px;padding-bottom:4px;' +
      'border-bottom:1px solid ' + (color || 'rgba(48,213,200,0.2)') + ';';
    header.textContent = '> ' + text;
    return header;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Sections.gamepad = {
    render: function(container) {
      _renderPanel(container);
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════════════════════════

  _injectCore();
  _injectCursorStyles();

  if (PAC.DEBUG_MODE) {
    console.log('PAC Engine: Gamepad loaded');
  }

})();
