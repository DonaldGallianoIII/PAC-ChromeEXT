/**
 * PAC Gamepad Core — Page Context Polling + Action Execution
 *
 * Runs in PAGE CONTEXT (MAIN world). Injected by content/ui/engine/gamepad.js.
 *
 * Single rAF polling loop reads gamepad state every frame. D-pad navigates a
 * shop cursor, pick cursor, or 2D board grid; face buttons and triggers execute
 * game commands via __AgentIO. Board context supports grab/drop/sell via DRAG_DROP
 * and SELL_POKEMON messages sent directly through __AgentIO.send().
 *
 * Button presses fire on transition (pressed: false → true) to prevent 60fps
 * repeat-fire. D-pad supports hold-to-repeat (300ms delay, 80ms repeat).
 *
 * @author Donald Galliano III × Cassy
 * @version 1.2 — Phase 1 (Shop) + Phase 2 (Pick) + Phase 3 (Board)
 */
(function() {
  'use strict';

  if (window.__PACGamepadCore) return;
  window.__PACGamepadCore = true;


  // ════════════════════════════════════════
  // STATE VARIABLES
  // ════════════════════════════════════════

  var _enabled = true;        // Toggled by content script via PAC_GAMEPAD_ENABLE
  var _context = 'shop';      // 'shop' | 'pick' | 'board' | 'disabled'
  var _shopCursor = 0;        // Current shop slot (0-based)
  var _maxShopSlots = 6;      // Updated by content script via PAC_GAMEPAD_SLOT_COUNT
  var _prevButtons = [];      // Previous frame button states (16 booleans)
  var _pollRAF = null;        // rAF handle for polling loop
  var _holdTimers = {};       // D-pad hold-to-repeat timer IDs (keyed by button index)
  var _frameCount = 0;        // Frame counter for throttled phase checks
  var _polling = false;       // Whether polling loop is active
  var _pickCursor = 0;        // Current pick choice (0-based)
  var _pickCount = 0;         // Available choices (derived from mask)
  var _boardCursorX = 0;      // Board cursor X (0-7)
  var _boardCursorY = 0;      // Board cursor Y (0-3)
  var _grabbedUnitId = null;  // Currently grabbed unit ID (null = not grabbing)
  var _grabbedFromX = -1;     // Where we grabbed from
  var _grabbedFromY = -1;


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
        if (startContext === 'shop') {
          _moveCursor((button === 14) ? -1 : 1);
        } else if (startContext === 'pick') {
          _movePickCursor((button === 14) ? -1 : 1);
        } else if (startContext === 'board') {
          var dx = 0, dy = 0;
          if (button === 14) dx = -1;
          else if (button === 15) dx = 1;
          else if (button === 12) dy = -1;
          else if (button === 13) dy = 1;
          _moveBoardCursor(dx, dy);
        }
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
  // BOARD CURSOR + GRAB/DROP
  // ════════════════════════════════════════

  /**
   * Find unit at grid position from board array.
   */
  function _getUnitAt(board, x, y) {
    for (var i = 0; i < board.length; i++) {
      if (board[i].positionX === x && board[i].positionY === y) {
        return board[i];
      }
    }
    return null;
  }

  /**
   * Move board cursor by dx/dy with wrapping on 8×4 grid.
   */
  function _moveBoardCursor(dx, dy) {
    _boardCursorX += dx;
    _boardCursorY += dy;
    if (_boardCursorX < 0) _boardCursorX = 7;
    if (_boardCursorX > 7) _boardCursorX = 0;
    if (_boardCursorY < 0) _boardCursorY = 3;
    if (_boardCursorY > 3) _boardCursorY = 0;

    window.postMessage({
      type: 'PAC_GAMEPAD_CURSOR',
      context: 'board',
      index: _boardCursorY * 8 + _boardCursorX,
      x: _boardCursorX,
      y: _boardCursorY,
      grabbed: !!_grabbedUnitId
    }, '*');
  }

  /**
   * Clear grab state and notify content script.
   */
  function _clearGrab() {
    _grabbedUnitId = null;
    _grabbedFromX = -1;
    _grabbedFromY = -1;
    window.postMessage({
      type: 'PAC_GAMEPAD_CURSOR',
      context: 'board',
      index: _boardCursorY * 8 + _boardCursorX,
      x: _boardCursorX,
      y: _boardCursorY,
      grabbed: false
    }, '*');
  }

  /**
   * A button in board context — grab or drop unit.
   */
  function _boardAction() {
    if (!window.__AgentIO) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      return;
    }

    var obs = window.__AgentIO.obs();
    if (!obs || !obs.self || !obs.self.board) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      return;
    }

    var board = obs.self.board;

    if (!_grabbedUnitId) {
      // NOT GRABBED — try to grab unit at cursor
      var unit = _getUnitAt(board, _boardCursorX, _boardCursorY);
      if (!unit) {
        window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'empty_cell' }, '*');
        return;
      }
      _grabbedUnitId = unit.id;
      _grabbedFromX = _boardCursorX;
      _grabbedFromY = _boardCursorY;
      window.postMessage({
        type: 'PAC_GAMEPAD_GRABBED',
        unitId: unit.id,
        unitName: unit.name,
        x: _boardCursorX,
        y: _boardCursorY
      }, '*');
      return;
    }

    // GRABBED — drop/swap or cancel
    if (_boardCursorX === _grabbedFromX && _boardCursorY === _grabbedFromY) {
      // Dropped on same cell = cancel grab
      _clearGrab();
      window.postMessage({ type: 'PAC_GAMEPAD_GRAB_CANCELLED' }, '*');
      return;
    }

    // Drop on any cell (empty = move, occupied = swap — server handles both)
    window.__AgentIO.send('DRAG_DROP', {
      x: _boardCursorX,
      y: _boardCursorY,
      id: _grabbedUnitId
    });
    window.postMessage({
      type: 'PAC_GAMEPAD_DROPPED',
      unitId: _grabbedUnitId,
      fromX: _grabbedFromX,
      fromY: _grabbedFromY,
      toX: _boardCursorX,
      toY: _boardCursorY
    }, '*');
    _clearGrab();
  }

  /**
   * Y button in board context — sell unit.
   */
  function _boardSell() {
    if (!window.__AgentIO) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      return;
    }

    if (_grabbedUnitId) {
      // Sell the grabbed unit
      window.__AgentIO.send('SELL_POKEMON', _grabbedUnitId);
      window.postMessage({
        type: 'PAC_GAMEPAD_EXECUTED',
        index: -1,
        action: 'sell',
        unitId: _grabbedUnitId
      }, '*');
      _clearGrab();
      return;
    }

    // Sell unit at cursor
    var obs = window.__AgentIO.obs();
    if (!obs || !obs.self || !obs.self.board) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      return;
    }
    var unit = _getUnitAt(obs.self.board, _boardCursorX, _boardCursorY);
    if (!unit) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'empty_cell' }, '*');
      return;
    }
    window.__AgentIO.send('SELL_POKEMON', unit.id);
    window.postMessage({
      type: 'PAC_GAMEPAD_EXECUTED',
      index: -1,
      action: 'sell',
      unitId: unit.id,
      unitName: unit.name
    }, '*');
  }

  /**
   * B button in board context — cancel grab or return to shop.
   */
  function _boardCancel() {
    if (_grabbedUnitId) {
      _clearGrab();
      window.postMessage({ type: 'PAC_GAMEPAD_GRAB_CANCELLED' }, '*');
    } else {
      _cancelAllHoldTimers();
      _context = 'shop';
      window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: 'shop' }, '*');
      window.postMessage({
        type: 'PAC_GAMEPAD_CURSOR',
        context: 'shop',
        index: _shopCursor
      }, '*');
    }
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
      // Don't force shop if user manually toggled to board
      newContext = (_context === 'board') ? 'board' : 'shop';
    } else if (phase === 'pick_pokemon' || phase === 'pick_item') {
      newContext = 'pick';
    } else {
      newContext = 'disabled';
    }

    if (newContext !== _context) {
      _cancelAllHoldTimers(); // CRITICAL: kill timers on context change
      if (_grabbedUnitId) _clearGrab(); // Clear grab on any context change
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
      } else if (newContext === 'board') {
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: 'board',
          index: _boardCursorY * 8 + _boardCursorX,
          x: _boardCursorX,
          y: _boardCursorY,
          grabbed: false
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
    else if (_context === 'pick') _pickPress(button);
    else if (_context === 'board') _boardPress(button);
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
      case 4:                                           // LB = switch to board
        _cancelAllHoldTimers();
        _context = 'board';
        window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: 'board' }, '*');
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: 'board',
          index: _boardCursorY * 8 + _boardCursorX,
          x: _boardCursorX,
          y: _boardCursorY,
          grabbed: false
        }, '*');
        break;
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


  /**
   * Board context button mapping.
   * D-pad navigates 8×4 grid, A grabs/drops, Y sells, B cancels/back, LB→shop.
   */
  function _boardPress(button) {
    switch (button) {
      case 12: _moveBoardCursor(0, -1); break;   // D-pad Up
      case 13: _moveBoardCursor(0, 1); break;    // D-pad Down
      case 14: _moveBoardCursor(-1, 0); break;   // D-pad Left
      case 15: _moveBoardCursor(1, 0); break;    // D-pad Right
      case 0:  _boardAction(); break;             // A = grab/drop
      case 3:  _boardSell(); break;               // Y = sell
      case 1:  _boardCancel(); break;             // B = cancel/back
      case 4:                                     // LB = return to shop
        _clearGrab();
        _cancelAllHoldTimers();
        _context = 'shop';
        window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: 'shop' }, '*');
        window.postMessage({
          type: 'PAC_GAMEPAD_CURSOR',
          context: 'shop',
          index: _shopCursor
        }, '*');
        break;
    }

    // Hold-to-repeat for all 4 D-pad directions in board
    if (button >= 12 && button <= 15) {
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
