/**
 * PAC Gamepad Core — Page Context Polling + Action Execution
 *
 * Runs in PAGE CONTEXT (MAIN world). Injected by content/ui/engine/gamepad.js.
 *
 * Single rAF polling loop reads gamepad state every frame. D-pad navigates a
 * shop cursor; face buttons and triggers execute game commands via __AgentIO.
 * Context auto-detects from __AgentIO.phase() — Phase 1 supports shop only.
 *
 * Button presses fire on transition (pressed: false → true) to prevent 60fps
 * repeat-fire. D-pad supports hold-to-repeat (300ms delay, 80ms repeat).
 *
 * @author Donald Galliano III × Cassy
 * @version 1.1 — Phase 1 (Shop) + Phase 2 (Pick)
 */
(function() {
  'use strict';

  if (window.__PACGamepadCore) return;
  window.__PACGamepadCore = true;


  // ════════════════════════════════════════
  // STATE VARIABLES
  // ════════════════════════════════════════

  var _enabled = true;        // Toggled by content script via PAC_GAMEPAD_ENABLE
  var _context = 'shop';      // 'shop' | 'pick' | 'disabled'
  var _shopCursor = 0;        // Current shop slot (0-based)
  var _maxShopSlots = 6;      // Updated by content script via PAC_GAMEPAD_SLOT_COUNT
  var _prevButtons = [];      // Previous frame button states (16 booleans)
  var _pollRAF = null;        // rAF handle for polling loop
  var _holdTimers = {};       // D-pad hold-to-repeat timer IDs (keyed by button index)
  var _frameCount = 0;        // Frame counter for throttled phase checks
  var _polling = false;       // Whether polling loop is active
  var _pickCursor = 0;        // Current pick choice (0-based)
  var _pickCount = 0;         // Available choices (derived from mask)


  // ════════════════════════════════════════
  // HOLD-TO-REPEAT TIMERS
  // ════════════════════════════════════════

  /**
   * Cancel ALL hold-to-repeat timers.
   * Called on context change, disable, and disconnect.
   */
  function _cancelAllHoldTimers() {
    var keys = Object.keys(_holdTimers);
    for (var i = 0; i < keys.length; i++) {
      clearTimeout(_holdTimers[keys[i]]);
      clearInterval(_holdTimers[keys[i]]);
    }
    _holdTimers = {};
  }

  /**
   * Start hold-to-repeat for a D-pad button.
   * 300ms initial delay, then 80ms repeat.
   */
  function _startHoldRepeat(button) {
    // Cancel any existing timer for this button
    if (_holdTimers[button]) {
      clearTimeout(_holdTimers[button]);
      clearInterval(_holdTimers[button]);
    }

    var delta = (button === 14) ? -1 : 1; // Left = -1, Right = +1
    var startContext = _context; // Capture context at repeat start

    // Initial delay
    _holdTimers[button] = setTimeout(function() {
      // Repeat interval
      _holdTimers[button] = setInterval(function() {
        if (_context !== startContext) {
          clearInterval(_holdTimers[button]);
          delete _holdTimers[button];
          return;
        }
        if (startContext === 'shop') _moveCursor(delta);
        else if (startContext === 'pick') _movePickCursor(delta);
      }, 80);
    }, 300);
  }

  /**
   * Cancel hold timer for a specific button.
   */
  function _cancelHoldTimer(button) {
    if (_holdTimers[button]) {
      clearTimeout(_holdTimers[button]);
      clearInterval(_holdTimers[button]);
      delete _holdTimers[button];
    }
  }


  // ════════════════════════════════════════
  // CURSOR MOVEMENT
  // ════════════════════════════════════════

  /**
   * Move shop cursor by delta with wrapping.
   */
  function _moveCursor(delta) {
    _shopCursor += delta;
    if (_shopCursor < 0) _shopCursor = _maxShopSlots - 1;
    if (_shopCursor >= _maxShopSlots) _shopCursor = 0;

    window.postMessage({
      type: 'PAC_GAMEPAD_CURSOR',
      context: _context,
      index: _shopCursor
    }, '*');
  }


  // ════════════════════════════════════════
  // PICK CURSOR
  // ════════════════════════════════════════

  /**
   * Count available pick slots from the action mask.
   * Picks are contiguous at indices 80-85.
   */
  function _countPickSlots() {
    if (!window.__AgentIO) return 0;
    var mask = window.__AgentIO.mask();
    if (!mask) return 0;
    var count = 0;
    for (var i = 80; i <= 85; i++) {
      if (mask[i] === 1) count++;
      else break;
    }
    return count;
  }

  /**
   * Move pick cursor by delta with wrapping.
   */
  function _movePickCursor(delta) {
    if (_pickCount === 0) return;
    _pickCursor += delta;
    if (_pickCursor < 0) _pickCursor = _pickCount - 1;
    if (_pickCursor >= _pickCount) _pickCursor = 0;

    window.postMessage({
      type: 'PAC_GAMEPAD_CURSOR',
      context: 'pick',
      index: _pickCursor
    }, '*');
  }


  // ════════════════════════════════════════
  // GUARDED EXECUTION
  // ════════════════════════════════════════

  /**
   * Get human-readable block reason for an action index.
   */
  function _getBlockReason(index) {
    if (!window.__AgentIO) return 'no_room';

    var phase = window.__AgentIO.phase();
    if (phase === 'combat' || phase === 'game_over' ||
        phase === 'carousel' || phase === 'portal_select') {
      return 'wrong_phase';
    }
    if (index >= 0 && index <= 5) {
      return 'cant_afford';
    }
    return 'invalid';
  }

  /**
   * Check mask then execute a game action.
   */
  function _guardedExec(actionIndex) {
    if (!window.__AgentIO) {
      window.postMessage({
        type: 'PAC_GAMEPAD_BLOCKED',
        index: actionIndex,
        reason: 'no_room'
      }, '*');
      return;
    }

    var mask = window.__AgentIO.mask();
    if (!mask) {
      window.postMessage({
        type: 'PAC_GAMEPAD_BLOCKED',
        index: actionIndex,
        reason: 'no_room'
      }, '*');
      return;
    }

    if (mask[actionIndex] !== 1) {
      window.postMessage({
        type: 'PAC_GAMEPAD_BLOCKED',
        index: actionIndex,
        reason: _getBlockReason(actionIndex)
      }, '*');
      return;
    }

    window.__AgentIO.exec(actionIndex);
    window.postMessage({
      type: 'PAC_GAMEPAD_EXECUTED',
      index: actionIndex
    }, '*');
  }


  // ════════════════════════════════════════
  // CONTEXT AUTO-DETECTION
  // ════════════════════════════════════════

  /**
   * Detect game context from __AgentIO.phase().
   * Maps game phases to gamepad contexts.
   */
  function _detectContext() {
    if (!window.__AgentIO) return;

    var phase = window.__AgentIO.phase();
    var newContext;

    if (phase === 'shop') {
      newContext = 'shop';
    } else if (phase === 'pick_pokemon' || phase === 'pick_item') {
      newContext = 'pick';
    } else {
      newContext = 'disabled';
    }

    if (newContext !== _context) {
      _cancelAllHoldTimers(); // CRITICAL: kill timers on context change
      _context = newContext;

      // Reset pick cursor when entering pick context
      if (newContext === 'pick') {
        _pickCursor = 0;
        _pickCount = _countPickSlots();
      }

      window.postMessage({
        type: 'PAC_GAMEPAD_CONTEXT',
        context: _context
      }, '*');

      // Send initial cursor position for the new context
      if (newContext === 'pick') {
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: 'pick',
          index: _pickCursor
        }, '*');
      } else if (newContext === 'shop') {
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: 'shop',
          index: _shopCursor
        }, '*');
      }
    }
  }


  // ════════════════════════════════════════
  // BUTTON ROUTING
  // ════════════════════════════════════════

  /**
   * Handle a button press event (transition from unpressed to pressed).
   */
  function _onPress(button) {
    if (_context === 'disabled') return;
    if (_context === 'shop') _shopPress(button);
    if (_context === 'pick') _pickPress(button);
  }

  /**
   * Handle a button release event.
   */
  function _onRelease(button) {
    // Cancel hold-to-repeat for D-pad buttons
    if (button === 12 || button === 13 || button === 14 || button === 15) {
      _cancelHoldTimer(button);
    }
  }

  /**
   * Shop context button mapping.
   */
  function _shopPress(button) {
    switch (button) {
      case 14: _moveCursor(-1); break;               // D-pad Left
      case 15: _moveCursor(1); break;                 // D-pad Right
      case 0:  _guardedExec(_shopCursor); break;      // A = buy at cursor
      case 3:  _guardedExec(74 + _shopCursor); break; // Y = remove at cursor
      case 2:  _guardedExec(8); break;                 // X = lock shop
      case 6:  _guardedExec(6); break;                 // LT = reroll
      case 7:  _guardedExec(7); break;                 // RT = level up
      case 9:  _guardedExec(9); break;                 // Menu = end turn
    }

    // Hold-to-repeat for D-pad only
    if (button === 14 || button === 15) {
      _startHoldRepeat(button);
    }
  }


  /**
   * Pick context button mapping.
   * Only D-pad L/R and A — all other buttons ignored during picks.
   */
  function _pickPress(button) {
    switch (button) {
      case 14: _movePickCursor(-1); break;               // D-pad Left
      case 15: _movePickCursor(1); break;                 // D-pad Right
      case 0:  _guardedExec(80 + _pickCursor); break;     // A = pick choice
    }

    // Hold-to-repeat for D-pad only
    if (button === 14 || button === 15) {
      _startHoldRepeat(button);
    }
  }


  // ════════════════════════════════════════
  // POLLING LOOP
  // ════════════════════════════════════════

  /**
   * Main rAF polling loop. Reads gamepad state every frame.
   */
  function _poll() {
    _pollRAF = requestAnimationFrame(_poll);

    if (!_enabled) return;

    var gamepads = navigator.getGamepads();
    var gp = null;
    for (var i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) { gp = gamepads[i]; break; }
    }
    if (!gp) return;

    // Phase auto-detection every ~10 frames
    _frameCount++;
    if (_frameCount % 10 === 0) {
      _detectContext();
    }

    // Button processing — compare to previous frame
    var buttons = gp.buttons;
    for (var b = 0; b < buttons.length && b < 16; b++) {
      var curr = buttons[b].pressed;
      var prev = _prevButtons[b] || false;

      if (curr && !prev) _onPress(b);    // PRESS event
      if (!curr && prev) _onRelease(b);  // RELEASE event

      _prevButtons[b] = curr;
    }
  }

  /**
   * Start polling loop (idempotent).
   */
  function _startPolling() {
    if (_polling) return;
    _polling = true;
    _prevButtons = [];
    _pollRAF = requestAnimationFrame(_poll);
  }

  /**
   * Stop polling loop (idempotent).
   */
  function _stopPolling() {
    if (!_polling) return;
    _polling = false;
    if (_pollRAF) {
      cancelAnimationFrame(_pollRAF);
      _pollRAF = null;
    }
    _cancelAllHoldTimers();
    _prevButtons = [];
  }


  // ════════════════════════════════════════
  // PRE-CONNECTED GAMEPAD CHECK
  // ════════════════════════════════════════

  /**
   * Scan for already-connected gamepads at boot.
   * Handles the case where controller was active before page load.
   */
  function _checkPreConnected() {
    var gamepads = navigator.getGamepads();
    for (var i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        window.postMessage({
          type: 'PAC_GAMEPAD_CONNECTED',
          gamepadId: gamepads[i].id
        }, '*');
        // Send initial cursor position so cursor appears at slot 0
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: _context,
          index: _shopCursor
        }, '*');
        _startPolling();
        return;
      }
    }
  }


  // ════════════════════════════════════════
  // MESSAGE LISTENER (content script → core)
  // ════════════════════════════════════════

  window.addEventListener('message', function(e) {
    if (e.source !== window || !e.data) return;

    if (e.data.type === 'PAC_GAMEPAD_ENABLE') {
      _enabled = !!e.data.active;
      if (!_enabled) {
        _cancelAllHoldTimers();
      }
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_SLOT_COUNT') {
      _maxShopSlots = e.data.count || 6;
      if (_shopCursor >= _maxShopSlots) {
        _shopCursor = _maxShopSlots - 1;
      }
      return;
    }
  });


  // ════════════════════════════════════════
  // CONNECT / DISCONNECT EVENTS
  // ════════════════════════════════════════

  window.addEventListener('gamepadconnected', function(e) {
    window.postMessage({
      type: 'PAC_GAMEPAD_CONNECTED',
      gamepadId: e.gamepad.id
    }, '*');
    // Send initial cursor position so cursor appears at slot 0, not viewport origin
    window.postMessage({
      type: 'PAC_GAMEPAD_CURSOR',
      context: _context,
      index: _shopCursor
    }, '*');
    _startPolling();
  });

  window.addEventListener('gamepaddisconnected', function(e) {
    _cancelAllHoldTimers();
    window.postMessage({ type: 'PAC_GAMEPAD_DISCONNECTED' }, '*');
    _stopPolling();
  });


  // ════════════════════════════════════════
  // BOOT
  // ════════════════════════════════════════

  window.postMessage({ type: 'PAC_GAMEPAD_CORE_READY' }, '*');
  _checkPreConnected();

})();
