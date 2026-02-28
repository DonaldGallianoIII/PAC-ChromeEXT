/**
 * PAC Gamepad Core — Page Context Polling + Action Execution
 *
 * Runs in PAGE CONTEXT (MAIN world). Injected by content/ui/engine/gamepad.js.
 *
 * Single rAF polling loop reads gamepad state every frame. D-pad navigates
 * pick cursor and 2D board grid; analog stick handles shop buy/sell via direct
 * click. Face buttons and triggers execute game commands via __AgentIO.
 * Board context supports grab/drop/sell via DRAG_DROP and SELL_POKEMON.
 *
 * Left stick drives analog mouse emulation — moves a cursor in pixel space and
 * synthesizes pointer/mouse events for click and drag on any element.
 *
 * RB opens the hunt browser overlay (new 'hunt' context). In hunt context, all
 * button presses are forwarded to the content script via PAC_GAMEPAD_HUNT_BUTTON.
 *
 * Button presses fire on transition (pressed: false → true) to prevent 60fps
 * repeat-fire. D-pad supports hold-to-repeat (300ms delay, 80ms repeat).
 *
 * @author Donald Galliano III × Cassy
 * @version 1.5 — Phase 1-5 + Phase 6 (Polish)
 */
(function() {
  'use strict';

  if (window.__PACGamepadCore) return;
  window.__PACGamepadCore = true;


  // ════════════════════════════════════════
  // STATE VARIABLES
  // ════════════════════════════════════════

  var _enabled = true;        // Toggled by content script via PAC_GAMEPAD_ENABLE
  var _context = 'shop';      // 'shop' | 'pick' | 'board' | 'hunt' | 'target' | 'disabled'
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

  // ── Analog mode (stick mouse emulation) ──
  var _analogActive = false;      // true when stick is driving cursor
  var _analogX = 0;               // Cursor X position (screen pixels)
  var _analogY = 0;               // Cursor Y position (screen pixels)
  var _analogDragging = false;    // true while A is held in analog mode
  var _analogDragStartX = 0;      // Mouse-down position for click detection
  var _analogDragStartY = 0;
  var _analogSpeed = 12;          // Pixels per frame at full deflection
  var _deadzone = 0.15;           // Stick deadzone threshold

  // ── Hunt browser ──
  var _preHuntContext = 'shop';   // Context to restore when hunt closes

  // ── Target browser ──
  var _preTargetContext = 'shop'; // Context to restore when target browser closes

  // ── Direct DOM cursor (bypasses postMessage latency) ──
  var _cursorDOM = null;

  // ── Haptic feedback ──
  var _hapticsEnabled = true;
  var HAPTICS = {
    click:   { duration: 40,  weak: 0.2, strong: 0.0 },
    cursor:  { duration: 20,  weak: 0.1, strong: 0.0 },
    grab:    { duration: 60,  weak: 0.4, strong: 0.1 },
    drop:    { duration: 80,  weak: 0.3, strong: 0.2 },
    sell:    { duration: 100, weak: 0.5, strong: 0.2 },
    blocked: { duration: 50,  weak: 0.0, strong: 0.3 },
    error:   { duration: 150, weak: 0.0, strong: 0.5 },
    context: { duration: 70,  weak: 0.15, strong: 0.1 },
    hunt:    { duration: 120, weak: 0.6, strong: 0.3 }
  };

  // ── Stick sensitivity curve (power exponent: 1.0=linear, 2.0=precise, 0.5=responsive) ──
  var _stickExponent = 1.0;


  // ════════════════════════════════════════
  // BUTTON BINDINGS (rebindable)
  // ════════════════════════════════════════

  var DEFAULT_BINDS = {
    reroll:        6,    // LT
    levelUp:       7,    // RT
    lockShop:      2,    // X
    huntBrowser:   5,    // RB
    targetBrowser: 4     // LB
  };

  var _binds = {};          // action → button index
  var _reverseBinds = {};   // button index → action
  var _captureMode = false; // true when UI is capturing a button press for binding

  function _rebuildReverse() {
    _reverseBinds = {};
    var keys = Object.keys(_binds);
    for (var i = 0; i < keys.length; i++) {
      var btn = _binds[keys[i]];
      if (btn !== null && btn !== undefined) {
        _reverseBinds[btn] = keys[i];
      }
    }
  }

  function _initBinds() {
    var keys = Object.keys(DEFAULT_BINDS);
    for (var i = 0; i < keys.length; i++) {
      _binds[keys[i]] = DEFAULT_BINDS[keys[i]];
    }
    _rebuildReverse();
  }

  function _applyBinds(incoming) {
    var keys = Object.keys(DEFAULT_BINDS);
    for (var i = 0; i < keys.length; i++) {
      var action = keys[i];
      _binds[action] = (incoming && incoming[action] !== undefined && incoming[action] !== null)
        ? incoming[action]
        : DEFAULT_BINDS[action];
    }
    _rebuildReverse();
  }

  _initBinds();


  // ════════════════════════════════════════
  // HAPTIC FEEDBACK
  // ════════════════════════════════════════

  /**
   * Fire a haptic pulse on the connected gamepad's vibration actuator.
   * Silently fails if haptics are disabled or hardware doesn't support it.
   */
  function _vibrate(profile) {
    if (!_hapticsEnabled) return;
    try {
      var gamepads = navigator.getGamepads();
      var gp = null;
      for (var i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) { gp = gamepads[i]; break; }
      }
      if (gp && gp.vibrationActuator) {
        gp.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: profile.duration,
          weakMagnitude: profile.weak,
          strongMagnitude: profile.strong
        });
      }
    } catch (e) { /* silently fail — controller may not support vibration */ }
  }


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
        if (startContext === 'hunt') {
          window.postMessage({ type: 'PAC_GAMEPAD_HUNT_BUTTON', button: button }, '*');
        } else if (startContext === 'target') {
          window.postMessage({ type: 'PAC_GAMEPAD_TARGET_BUTTON', button: button }, '*');
        }
      }, 60);
    }, 200);
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
    _vibrate(HAPTICS.cursor);
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
    _vibrate(HAPTICS.cursor);
    _sendTooltipForCurrentCell();
  }

  /**
   * Check unit presence at current board cursor and send tooltip data.
   * Uses mask[42 + cellIndex] as a cheap presence check before calling obs().
   */
  function _sendTooltipForCurrentCell() {
    var tipMask = window.__AgentIO ? window.__AgentIO.mask() : null;
    var tipCell = _boardCursorY * 8 + _boardCursorX;
    if (tipMask && tipMask[42 + tipCell] === 1) {
      var tipObs = window.__AgentIO.obs();
      var tipUnit = tipObs && tipObs.self ?
        _getUnitAt(tipObs.self.board, _boardCursorX, _boardCursorY) : null;
      if (tipUnit) {
        window.postMessage({
          type: 'PAC_GAMEPAD_UNIT_INFO',
          name: tipUnit.name, stars: tipUnit.stars, types: tipUnit.types,
          items: tipUnit.items, hp: tipUnit.hp, maxHP: tipUnit.maxHP,
          atk: tipUnit.atk, def: tipUnit.def, range: tipUnit.range,
          rarity: tipUnit.rarity || '', shiny: tipUnit.shiny
        }, '*');
      } else {
        window.postMessage({ type: 'PAC_GAMEPAD_UNIT_INFO', name: null }, '*');
      }
    } else {
      window.postMessage({ type: 'PAC_GAMEPAD_UNIT_INFO', name: null }, '*');
    }
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
      _vibrate(HAPTICS.blocked);
      return;
    }

    var obs = window.__AgentIO.obs();
    if (!obs || !obs.self || !obs.self.board) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      _vibrate(HAPTICS.blocked);
      return;
    }

    var board = obs.self.board;

    if (!_grabbedUnitId) {
      // NOT GRABBED — try to grab unit at cursor
      var unit = _getUnitAt(board, _boardCursorX, _boardCursorY);
      if (!unit) {
        window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'empty_cell' }, '*');
        _vibrate(HAPTICS.blocked);
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
      _vibrate(HAPTICS.grab);
      return;
    }

    // GRABBED — drop/swap or cancel
    if (_boardCursorX === _grabbedFromX && _boardCursorY === _grabbedFromY) {
      // Dropped on same cell = cancel grab
      _clearGrab();
      window.postMessage({ type: 'PAC_GAMEPAD_GRAB_CANCELLED' }, '*');
      _vibrate(HAPTICS.drop);
      _sendTooltipForCurrentCell();
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
    _vibrate(HAPTICS.drop);
    _clearGrab();
    _sendTooltipForCurrentCell();
  }

  /**
   * Y button in board context — sell unit.
   */
  function _boardSell() {
    if (!window.__AgentIO) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      _vibrate(HAPTICS.blocked);
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
      _vibrate(HAPTICS.sell);
      _clearGrab();
      _sendTooltipForCurrentCell();
      return;
    }

    // Sell unit at cursor
    var obs = window.__AgentIO.obs();
    if (!obs || !obs.self || !obs.self.board) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'no_room' }, '*');
      _vibrate(HAPTICS.blocked);
      return;
    }
    var unit = _getUnitAt(obs.self.board, _boardCursorX, _boardCursorY);
    if (!unit) {
      window.postMessage({ type: 'PAC_GAMEPAD_BLOCKED', reason: 'empty_cell' }, '*');
      _vibrate(HAPTICS.blocked);
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
    _vibrate(HAPTICS.sell);
    _sendTooltipForCurrentCell();
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
    }
  }


  // ════════════════════════════════════════
  // GUARDED EXECUTION
  // ════════════════════════════════════════

  /**
   * Execute a game action. Fire-and-forget — server validates legality.
   */
  function _guardedExec(actionIndex) {
    if (!window.__AgentIO) {
      _vibrate(HAPTICS.blocked);
      return;
    }
    // Fire immediately — server validates legality. No client-side mask
    // check so rapid presses aren't blocked by stale mask data.
    window.__AgentIO.exec(actionIndex);
    window.postMessage({
      type: 'PAC_GAMEPAD_EXECUTED',
      index: actionIndex
    }, '*');
    _vibrate(HAPTICS.click);
  }


  // ════════════════════════════════════════
  // CONTEXT HELPERS
  // ════════════════════════════════════════

  /**
   * Send cursor position message for the current context.
   * Extracted as helper so _detectContext and HUNT_CLOSE handler can share it.
   */
  function _sendCursorForContext() {
    if (_context === 'pick') {
      window.postMessage({
        type: 'PAC_GAMEPAD_CURSOR', context: 'pick', index: _pickCursor
      }, '*');
    } else if (_context === 'board') {
      window.postMessage({
        type: 'PAC_GAMEPAD_CURSOR', context: 'board',
        index: _boardCursorY * 8 + _boardCursorX,
        x: _boardCursorX, y: _boardCursorY, grabbed: !!_grabbedUnitId
      }, '*');
    }
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

    // Always 'shop' — the shop is visible in every phase (picks, carousel, portal).
    // Preserve hunt/target if an overlay is open.
    newContext = (_context === 'hunt' || _context === 'target') ? _context : 'shop';

    if (newContext !== _context) {
      _cancelAllHoldTimers(); // CRITICAL: kill timers on context change

      // Force-close overlays if leaving their context
      if (_context === 'hunt' && newContext !== 'hunt') {
        window.postMessage({ type: 'PAC_GAMEPAD_HUNT_FORCE_CLOSE' }, '*');
      }
      if (_context === 'target' && newContext !== 'target') {
        window.postMessage({ type: 'PAC_GAMEPAD_TARGET_FORCE_CLOSE' }, '*');
      }

      if (_grabbedUnitId) _clearGrab(); // Clear grab on any context change
      if (_analogActive) {
        if (_analogDragging) {
          _dispatchMouse('mouseup', _analogX, _analogY);
          _analogDragging = false;
        }
        _analogActive = false;
        window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'grid' }, '*');
      }
      _context = newContext;
      if (newContext !== 'disabled') _vibrate(HAPTICS.context);

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
      _sendCursorForContext();
    }
  }


  // ════════════════════════════════════════
  // ANALOG MOUSE EMULATION
  // ════════════════════════════════════════

  /**
   * Dispatch synthetic pointer + mouse events at the given screen coordinates.
   * Targets whichever element is at (x, y) via elementFromPoint.
   */
  function _dispatchMouse(eventType, x, y) {
    var target = document.elementFromPoint(x, y);
    if (!target) target = document.body;

    // For clicks on non-canvas elements (PAC UI, website buttons), use native
    // .click() which produces isTrusted:true events — ensures content-script
    // event listeners respond. Canvas needs synthetic events with coordinates.
    if (eventType === 'click') {
      if (target.tagName !== 'CANVAS' && target.click) {
        target.click();
      } else {
        target.dispatchEvent(new MouseEvent('click', {
          clientX: x, clientY: y, screenX: x, screenY: y,
          bubbles: true, cancelable: true, view: window, button: 0, buttons: 0
        }));
      }
      return;
    }

    var eventInit = {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: (eventType === 'mouseup') ? 0 : 1
    };

    // Dispatch both pointer and mouse events for maximum compatibility.
    // Phaser 3 listens for pointer events; DOM elements listen for mouse events.
    target.dispatchEvent(new PointerEvent(
      eventType.replace('mouse', 'pointer'), eventInit
    ));
    target.dispatchEvent(new MouseEvent(eventType, eventInit));
  }

  /**
   * Handle A press in analog mode — start drag / click.
   */
  function _analogDown() {
    _analogDragging = true;
    _analogDragStartX = _analogX;
    _analogDragStartY = _analogY;
    _dispatchMouse('mousedown', _analogX, _analogY);
    // Notify content script of drag state change (infrequent)
    window.postMessage({
      type: 'PAC_GAMEPAD_ANALOG_DRAG', dragging: true
    }, '*');
  }


  // ════════════════════════════════════════
  // BUTTON ROUTING
  // ════════════════════════════════════════

  /**
   * Handle a button press event (transition from unpressed to pressed).
   */
  function _onPress(button) {
    // ── Capture mode: intercept for binding UI, don't execute ──
    if (_captureMode) {
      window.postMessage({ type: 'PAC_GAMEPAD_BIND_CAPTURED', button: button }, '*');
      return;
    }

    // Analog mode A/B — works in ALL contexts (enables lobby/menu navigation)
    if (button === 0 && _analogActive) {
      _analogDown();
      return;
    }
    if (button === 1 && _analogActive) {
      if (_analogDragging) {
        _dispatchMouse('mouseup', _analogX, _analogY);
        _analogDragging = false;
        window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_DRAG', dragging: false }, '*');
      } else {
        _analogActive = false;
        window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'grid' }, '*');
      }
      return;
    }
    // Y button in analog mode → sell bench/board units OR remove from shop
    if (button === 3 && _analogActive) {
      var yEl = document.elementFromPoint(_analogX, _analogY);
      // Shop slots are React DOM — synthetic keyboard events don't reach them.
      // Detect shop slot and use __AgentIO directly.
      var shopContainer = document.querySelector('ul.game-pokemons-store');
      if (yEl && shopContainer && shopContainer.contains(yEl)) {
        // Use children (all slots including empties) so indices stay stable after removals
        var allSlots = shopContainer.children;
        for (var si = 0; si < allSlots.length; si++) {
          if (allSlots[si].contains(yEl) || allSlots[si] === yEl) {
            _guardedExec(74 + si);
            break;
          }
        }
      } else {
        // Bench/board units — Phaser listens on window for keyboard events
        var eOpts = { key: 'e', code: 'KeyE', keyCode: 69, which: 69,
                      bubbles: true, cancelable: true, view: window };
        window.dispatchEvent(new KeyboardEvent('keydown', eOpts));
        window.dispatchEvent(new KeyboardEvent('keyup', eOpts));
      }
      _vibrate(HAPTICS.sell);
      return;
    }

    // D-pad press → exit analog mode, return to grid
    if (button >= 12 && button <= 15) {
      if (_analogActive) {
        if (_analogDragging) {
          _dispatchMouse('mouseup', _analogX, _analogY);
          _analogDragging = false;
        }
        _analogActive = false;
        window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'grid' }, '*');
      }
    }

    // Hunt browser — rebindable (works from any non-hunt, non-target context)
    if (_reverseBinds[button] === 'huntBrowser'
        && _context !== 'hunt' && _context !== 'target') {
      if (_analogActive) {
        if (_analogDragging) {
          _dispatchMouse('mouseup', _analogX, _analogY);
          _analogDragging = false;
        }
        _analogActive = false;
        window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'grid' }, '*');
      }
      _preHuntContext = _context;
      _context = 'hunt';
      _cancelAllHoldTimers();
      if (_grabbedUnitId) _clearGrab();
      window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: 'hunt' }, '*');
      _vibrate(HAPTICS.context);
      return;
    }

    // Target browser — rebindable (works from any non-hunt, non-target context)
    if (_reverseBinds[button] === 'targetBrowser'
        && _context !== 'target' && _context !== 'hunt') {
      if (_analogActive) {
        if (_analogDragging) {
          _dispatchMouse('mouseup', _analogX, _analogY);
          _analogDragging = false;
        }
        _analogActive = false;
        window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'grid' }, '*');
      }
      _preTargetContext = _context;
      _context = 'target';
      _cancelAllHoldTimers();
      if (_grabbedUnitId) _clearGrab();
      window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: 'target' }, '*');
      _vibrate(HAPTICS.context);
      return;
    }

    // Grid mode routing (pick/board use analog stick only)
    if (_context === 'shop') _shopPress(button);
    else if (_context === 'hunt') {
      window.postMessage({ type: 'PAC_GAMEPAD_HUNT_BUTTON', button: button }, '*');
      if (button >= 12 && button <= 15) {
        _vibrate(HAPTICS.cursor);
        _startHoldRepeat(button);
      } else if (button === 0) {
        _vibrate(HAPTICS.click);
      }
      return;
    }
    else if (_context === 'target') {
      window.postMessage({ type: 'PAC_GAMEPAD_TARGET_BUTTON', button: button }, '*');
      if (button >= 12 && button <= 15) {
        _vibrate(HAPTICS.cursor);
        _startHoldRepeat(button);
      } else if (button === 0) {
        _vibrate(HAPTICS.click);
      }
      return;
    }
  }

  /**
   * Handle a button release event.
   */
  function _onRelease(button) {
    // Cancel hold-to-repeat for any button (safe — no-op if no timer exists)
    _cancelHoldTimer(button);

    // A release in analog mode → mouseup + click at current position
    if (button === 0 && _analogActive && _analogDragging) {
      _dispatchMouse('mouseup', _analogX, _analogY);
      _dispatchMouse('click', _analogX, _analogY);
      _analogDragging = false;
      window.postMessage({ type: 'PAC_GAMEPAD_ANALOG_DRAG', dragging: false }, '*');
    }
  }

  /**
   * Shop context button mapping.
   */
  function _shopPress(button) {
    var action = _reverseBinds[button];
    if (!action) return;

    if (action === 'lockShop') _guardedExec(8);
    else if (action === 'reroll') _guardedExec(6);
    else if (action === 'levelUp') _guardedExec(7);
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

    // ── Stick input (analog mode — works in ALL contexts, including lobby) ──
    if (gp.axes && gp.axes.length >= 2) {
      var stickX = gp.axes[0];
      var stickY = gp.axes[1];
      var magnitude = Math.sqrt(stickX * stickX + stickY * stickY);

      if (magnitude > _deadzone) {
        // Enter analog mode on stick input
        if (!_analogActive) {
          _analogActive = true;
          // Initialize cursor at center of viewport if first use
          if (_analogX === 0 && _analogY === 0) {
            _analogX = window.innerWidth / 2;
            _analogY = window.innerHeight / 2;
          }
          window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'analog' }, '*');
        }

        // Scale movement by deflection with sensitivity curve
        var normX = stickX / magnitude;
        var normY = stickY / magnitude;
        var clamped = Math.min(magnitude, 1.0); // Prevent diagonal speed boost
        var raw = (clamped - _deadzone) / (1 - _deadzone);
        var curved = Math.pow(raw, _stickExponent);
        var speed = _analogSpeed * curved;

        _analogX += normX * speed;
        _analogY += normY * speed;

        // Clamp to viewport
        _analogX = Math.max(0, Math.min(window.innerWidth - 1, _analogX));
        _analogY = Math.max(0, Math.min(window.innerHeight - 1, _analogY));

        // Move cursor directly via DOM (zero latency — no postMessage async delay)
        if (!_cursorDOM) _cursorDOM = document.getElementById('pac-gamepad-cursor');
        if (_cursorDOM) {
          _cursorDOM.style.left = (_analogX - 14) + 'px';
          _cursorDOM.style.top = (_analogY - 14) + 'px';
        }

        // Dispatch mousemove: every frame while dragging,
        // every 3rd frame otherwise (for hover states without 60fps spam)
        if (_analogDragging || _frameCount % 3 === 0) {
          _dispatchMouse('mousemove', _analogX, _analogY);
        }
      }
    }

    // ── Right stick: scroll PAC menus (every 10th frame ≈ 6/sec) ──
    if (_frameCount % 10 === 0 && gp.axes && gp.axes.length >= 4) {
      var rStickY = gp.axes[3];
      if (Math.abs(rStickY) > _deadzone) {
        window.postMessage({ type: 'PAC_GAMEPAD_SCROLL', delta: rStickY * 80 }, '*');
      }
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

    if (e.data.type === 'PAC_GAMEPAD_ANALOG_SPEED') {
      _analogSpeed = e.data.speed || 12;
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_ANALOG_DEADZONE') {
      _deadzone = e.data.deadzone || 0.15;
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_HUNT_CLOSE') {
      if (_context === 'hunt') {
        _context = _preHuntContext;
        // Re-enable analog mode for shop context
        if (_context === 'shop' && !_analogActive) {
          _analogActive = true;
          window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'analog' }, '*');
        }
        window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: _context }, '*');
        _sendCursorForContext();
      }
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_TARGET_CLOSE') {
      if (_context === 'target') {
        _context = _preTargetContext;
        // Re-enable analog mode for shop context
        if (_context === 'shop' && !_analogActive) {
          _analogActive = true;
          window.postMessage({ type: 'PAC_GAMEPAD_MODE', mode: 'analog' }, '*');
        }
        window.postMessage({ type: 'PAC_GAMEPAD_CONTEXT', context: _context }, '*');
        _sendCursorForContext();
      }
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_VIBRATE') {
      var profile = HAPTICS[e.data.profile];
      if (profile) _vibrate(profile);
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_HAPTICS') {
      _hapticsEnabled = !!e.data.enabled;
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_STICK_CURVE') {
      var val = parseFloat(e.data.curve);
      _stickExponent = (val > 0 && val <= 5) ? val : 1.0;
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_BIND_CAPTURE_MODE') {
      _captureMode = !!e.data.active;
      return;
    }

    if (e.data.type === 'PAC_GAMEPAD_BIND_UPDATE') {
      _applyBinds(e.data.binds);
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
