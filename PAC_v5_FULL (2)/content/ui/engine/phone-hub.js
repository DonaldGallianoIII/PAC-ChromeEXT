/**
 * PAC v5 — Phone Hub
 * Creates the phone glass card with app icon grid.
 *
 * 3 core apps always visible: Setup, Search, CMD
 * Optional apps toggled via CMD: Team, Intel, Analytics, Fishing, Settings
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var CMD_STORAGE_KEY = 'pac_cmd_state';

  var CORE_APPS = [
    { id: 'setup',  emoji: '⚡', name: 'Setup',   gradient: 'linear-gradient(135deg, #f39c12, #e67e22)' },
    { id: 'search', emoji: '🎯', name: 'Search',  gradient: 'linear-gradient(135deg, #1abc9c, #16a085)' },
    { id: 'cmd',    emoji: '>_', name: 'CMD',     gradient: 'linear-gradient(135deg, #2c3e50, #1a252f)', isText: true },
    { id: 'guide',  emoji: '📖', name: 'Guide',   gradient: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }
  ];

  var OPTIONAL_APPS = [
    { id: 'team',      emoji: '🎮', name: 'Modes',     gradient: 'linear-gradient(135deg, #2ecc71, #27ae60)' },
    { id: 'intel',     emoji: '🔍', name: 'Intel',     gradient: 'linear-gradient(135deg, #9b59b6, #8e44ad)' },
    { id: 'analytics', emoji: '📈', name: 'Analytics', gradient: 'linear-gradient(135deg, #e67e22, #d35400)' },
    { id: 'chat',      emoji: '💬', name: 'Chat',      gradient: 'linear-gradient(135deg, #e056a0, #c0392b)' },
    { id: 'fishing',   emoji: '🐟', name: 'Fishing',   gradient: 'linear-gradient(135deg, #3498db, #2980b9)' },
    { id: 'keybinds',  emoji: '⌨️', name: 'Keybinds',  gradient: 'linear-gradient(135deg, #fdcb6e, #f39c12)' },
    { id: 'gamepad',   emoji: '🕹️', name: 'Gamepad',   gradient: 'linear-gradient(135deg, #30d5c8, #20a39e)' },
    { id: 'settings',  emoji: '⚙️', name: 'Settings',  gradient: 'linear-gradient(135deg, #7f8c8d, #636e72)' }
  ];

  var ALL_APPS = CORE_APPS.concat(OPTIONAL_APPS);

  var els = {};
  var isExpanded = true;
  var isVisible = true;

  PAC.UI.Engine.PhoneHub = {
    init: init,
    getRootEl: function() { return els.root; },
    getPhoneEl: function() { return els.phone; },
    getApps: function() { return ALL_APPS; },
    updateFooter: updateFooter,
    setLiveDot: setLiveDot,
    isVisible: function() { return isVisible; },
    rebuildGrid: rebuildGrid,
    toggle: _toggleExpand
  };

  function init() {
    _injectStyles();
    _createDOM();
    _wireEvents();
  }

  function _injectStyles() {
    var css = [
      PAC.UI.Styles.Variables,
      PAC.UI.Styles.Base,
      PAC.UI.Styles.Phone,
      PAC.UI.Styles.Slideout,
      PAC.UI.Styles.Sections,
      PAC.UI.Styles.Animations
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'pac-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function _createDOM() {
    // Root container
    els.root = document.createElement('div');
    els.root.id = 'pac-root';

    // Phone card
    els.phone = document.createElement('div');
    els.phone.className = 'pac-phone';

    // ── Header ────────────────────────────────
    var header = document.createElement('div');
    header.className = 'pac-phone-header';

    var headerLeft = document.createElement('div');
    headerLeft.className = 'pac-phone-header-left';

    // 6-dot grip
    var grip = document.createElement('div');
    grip.className = 'pac-grip';
    for (var r = 0; r < 3; r++) {
      var row = document.createElement('div');
      row.className = 'pac-grip-row';
      row.innerHTML = '<div class="pac-grip-dot"></div><div class="pac-grip-dot"></div>';
      grip.appendChild(row);
    }
    headerLeft.appendChild(grip);

    // Live dot
    els.liveDot = document.createElement('div');
    els.liveDot.className = 'pac-live-dot';
    headerLeft.appendChild(els.liveDot);

    // Title
    var titleWrap = document.createElement('div');
    titleWrap.innerHTML = '<div class="pac-phone-title">PAC Live Data</div>' +
                          '<div class="pac-phone-version">v' + PAC.VERSION + '</div>';
    headerLeft.appendChild(titleWrap);

    header.appendChild(headerLeft);

    // Buttons
    var btns = document.createElement('div');
    btns.className = 'pac-phone-btns';
    btns.innerHTML =
      '<button class="pac-phone-btn" id="pac-btn-expand" title="Minimize">−</button>' +
      '<button class="pac-phone-btn" id="pac-btn-close" title="Hide">×</button>';
    header.appendChild(btns);

    els.phone.appendChild(header);
    els.header = header;

    // ── Body (icon grid) ──────────────────────
    var body = document.createElement('div');
    body.className = 'pac-phone-body';

    var inner = document.createElement('div');
    inner.className = 'pac-phone-body-inner';
    inner.setAttribute('data-no-drag', 'true');

    var appsLabel = document.createElement('div');
    appsLabel.className = 'pac-apps-label';
    appsLabel.textContent = 'Your Apps';
    inner.appendChild(appsLabel);

    var grid = document.createElement('div');
    grid.className = 'pac-phone-grid';
    inner.appendChild(grid);

    body.appendChild(inner);
    els.phone.appendChild(body);
    els.body = body;
    els.grid = grid;

    // Build initial grid
    rebuildGrid();

    // ── Footer ────────────────────────────────
    var footer = document.createElement('div');
    footer.className = 'pac-phone-footer';
    footer.setAttribute('data-no-drag', 'true');
    footer.innerHTML =
      '<span>Pool: <span id="pac-footer-pool">—</span></span>' +
      '<span>Rate: <span id="pac-footer-rate">—</span></span>';
    els.phone.appendChild(footer);
    els.footerPool = footer.querySelector('#pac-footer-pool');
    els.footerRate = footer.querySelector('#pac-footer-rate');

    // Add phone to root
    els.root.appendChild(els.phone);
    document.body.appendChild(els.root);

    // Reopen pill
    els.reopen = document.createElement('div');
    els.reopen.id = 'pac-reopen';
    els.reopen.innerHTML = '<span class="pac-reticle">◉</span> PAC';
    document.body.appendChild(els.reopen);

    // Cache buttons
    els.btnExpand = document.getElementById('pac-btn-expand');
    els.btnClose = document.getElementById('pac-btn-close');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC GRID
  // ═══════════════════════════════════════════════════════════════════════════

  function rebuildGrid() {
    var grid = els.grid;
    grid.innerHTML = '';

    // Always show core apps
    CORE_APPS.forEach(function(app) { _addIcon(grid, app); });

    // Show enabled optional apps from CMD state
    var cmdState = _loadCmdState();
    OPTIONAL_APPS.forEach(function(app) {
      if (cmdState && cmdState.apps && cmdState.apps[app.id]) {
        _addIcon(grid, app);
      }
    });
  }

  function _addIcon(grid, app) {
    var icon = document.createElement('div');
    icon.className = 'pac-app-icon';
    icon.dataset.appId = app.id;

    var tile = document.createElement('div');
    tile.className = 'pac-app-icon-tile';
    tile.style.background = app.gradient;

    // CMD gets text instead of emoji
    if (app.isText) {
      tile.style.fontFamily = "'Courier New', monospace";
      tile.style.fontSize = '16px';
      tile.style.fontWeight = '700';
      tile.style.color = 'var(--pac-accent, #30D5C8)';
    }
    tile.textContent = app.emoji;

    var label = document.createElement('div');
    label.className = 'pac-app-icon-label';
    label.textContent = app.name;

    icon.appendChild(tile);
    icon.appendChild(label);
    grid.appendChild(icon);
  }

  function _loadCmdState() {
    try {
      var raw = localStorage.getItem(CMD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function _wireEvents() {
    // Icon clicks
    els.grid.addEventListener('click', function(e) {
      var icon = e.target.closest('.pac-app-icon');
      if (!icon) return;
      Events.emit('phone:appTapped', { id: icon.dataset.appId });
    });

    // Expand / collapse
    els.btnExpand.addEventListener('click', function(e) {
      e.stopPropagation();
      _toggleExpand();
    });

    // Hide
    els.btnClose.addEventListener('click', function(e) {
      e.stopPropagation();
      _hide();
    });

    // Reopen — draggable + click to reopen
    (function() {
      var pill = els.reopen;
      var dragged = false;
      var startX, startY, origLeft, origTop;
      var PILL_KEY = 'pac_reopenPos';

      // Load saved position
      function _loadPillPos() {
        try {
          var raw = localStorage.getItem(PILL_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
      }

      function _savePillPos(left, top) {
        try { localStorage.setItem(PILL_KEY, JSON.stringify({ l: left, t: top })); } catch(e) {}
      }

      // Apply saved position when pill becomes visible
      var observer = new MutationObserver(function() {
        if (pill.classList.contains('pac-visible')) {
          var saved = _loadPillPos();
          if (saved) {
            pill.style.right = 'auto';
            pill.style.left = saved.l + 'px';
            pill.style.top = saved.t + 'px';
          }
        }
      });
      observer.observe(pill, { attributes: true, attributeFilter: ['class'] });

      pill.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        dragged = false;
        startX = e.clientX;
        startY = e.clientY;

        var rect = pill.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;

        // Switch from right-anchored to left-anchored for drag
        pill.style.right = 'auto';
        pill.style.left = origLeft + 'px';
        pill.style.top = origTop + 'px';

        function onMove(ev) {
          var dx = ev.clientX - startX;
          var dy = ev.clientY - startY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
          pill.style.left = (origLeft + dx) + 'px';
          pill.style.top = (origTop + dy) + 'px';
        }
        function onUp(ev) {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (dragged) {
            // Save final position
            var rect = pill.getBoundingClientRect();
            _savePillPos(rect.left, rect.top);
          } else {
            _show();
          }
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    })();

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        Events.emit('phone:escPressed');
      }
    });

    // Keybind event listener (routed from keybind engine)
    Events.on('keybind:togglePhone', function() {
      _toggleExpand();
    });

    // Drag
    PAC.UI.Engine.Drag.attach(els.root, els.header);

    // Update footer from extraction
    Events.on('extraction:updated', function(data) {
      if (data && data.totalUnits !== undefined) {
        els.footerPool.textContent = data.totalUnits || 0;
      }
    });
    Events.on('state:resultsCalculated', function(data) {
      if (data && data.rate !== undefined) {
        els.footerRate.textContent = data.rate + '%';
      }
    });

    // CMD app toggles → rebuild grid
    Events.on('cmd:appToggled', function(data) {
      rebuildGrid();

      // If the toggled-off app is currently open in slide-out, close it
      if (!data.enabled) {
        var slideOut = PAC.UI.Engine.SlideOut;
        if (slideOut && slideOut.getCurrentSection() === data.app) {
          slideOut.close();
        }
      }
    });
  }

  function _toggleExpand() {
    isExpanded = !isExpanded;
    els.body.classList.toggle('pac-phone-body--collapsed', !isExpanded);
    els.btnExpand.textContent = isExpanded ? '−' : '＋';

    // Tell drag engine about minimize state
    PAC.UI.Engine.Drag.setMinimized(!isExpanded);

    if (!isExpanded) {
      els.root.style.height = 'auto';
      Events.emit('phone:minimized');
    } else {
      var size = PAC.UI.Engine.Drag.getSize();
      els.root.style.height = size.h + 'px';
    }
  }

  function _hide() {
    isVisible = false;
    els.root.style.opacity = '0';
    els.root.style.transform = 'translateY(-3.2vmin) scale(0.95)';
    els.root.style.pointerEvents = 'none';
    els.reopen.classList.add('pac-visible');
    Events.emit('phone:hidden');
  }

  function _show() {
    isVisible = true;
    els.root.style.opacity = '1';
    els.root.style.transform = 'translateY(0) scale(1)';
    els.root.style.pointerEvents = 'auto';
    els.reopen.classList.remove('pac-visible');
  }

  function updateFooter(pool, rate) {
    if (pool !== undefined) els.footerPool.textContent = pool;
    if (rate !== undefined) els.footerRate.textContent = rate + '%';
  }

  function setLiveDot(isLive) {
    els.liveDot.classList.toggle('pac-live-dot--on', isLive);
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Phone Hub loaded');
})();
