/**
 * PAC Gamepad Engine — Content Script Bridge + Settings Panel
 *
 * Runs in ISOLATED world (content script context).
 * Injects gamepad-core.js into PAGE context (MAIN world).
 * Manages cursor overlay, button prompt HUD, blocked notifications,
 * and the gamepad settings panel as PAC.UI.Sections.gamepad.
 *
 * @author Donald Galliano III × Cassy
 * @version 1.1 — Phase 1 (Shop) + Phase 2 (Pick)
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
      _hudEl.textContent = 'A Buy  \u00B7  Y Remove  \u00B7  LT Reroll  \u00B7  RT Level  \u00B7  X Lock  \u00B7  Menu End';
      _hudEl.style.display = 'block';
    } else if (context === 'pick') {
      _hudEl.textContent = '\u25C4\u25BA Choose  \u00B7  A Pick';
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
  }


  // Reposition cursor on window resize
  window.addEventListener('resize', function() {
    if (!_connected) return;
    if (_currentContext === 'shop') {
      _positionShopCursor(_lastCursorIndex);
    } else if (_currentContext === 'pick') {
      _positionPickCursor(_lastPickIndex);
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK REASON MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  function _blockMessage(reason) {
    if (reason === 'wrong_phase') return 'Not available in this phase';
    if (reason === 'cant_afford') return 'Not enough gold';
    if (reason === 'no_room') return 'Not in a game';
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
      _cursorEl.style.borderColor = 'rgba(48,213,200,0.8)';
      _cursorEl.style.boxShadow = '0 0 12px rgba(48,213,200,0.4),inset 0 0 8px rgba(48,213,200,0.1)';
      _flashTimer = null;
    }, 150);
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
        // Bridge initial enabled state from localStorage to core
        var config = _loadConfig();
        window.postMessage({ type: 'PAC_GAMEPAD_ENABLE', active: config.enabled !== false }, '*');
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
        }
        break;

      case 'PAC_GAMEPAD_EXECUTED':
        _flashCursor();
        break;

      case 'PAC_GAMEPAD_BLOCKED':
        PAC.UI.Components.Notification.show(_blockMessage(e.data.reason), 'warning', 1200);
        break;

      case 'PAC_GAMEPAD_CONTEXT':
        _currentContext = e.data.context;
        if (e.data.context === 'disabled') {
          _cursorEl.style.display = 'none';
          _updateHUD('disabled');
        } else if (_connected) {
          _cursorEl.style.display = 'block';
          _updateHUD(e.data.context);
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
        '<div style="color:rgba(255,255,255,0.25);font-size:9px;margin-top:4px;">Auto-activates during proposition screens</div>' +
      '</div>';

    var pickContent = document.createElement('div');
    pickContent.innerHTML = pickHTML;
    pickGroup.appendChild(pickContent);
    container.appendChild(pickGroup);
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

  if (PAC.DEBUG_MODE) {
    console.log('PAC Engine: Gamepad loaded');
  }

})();
