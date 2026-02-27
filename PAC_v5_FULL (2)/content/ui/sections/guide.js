/**
 * PAC — Guide & Reference
 *
 * Comprehensive documentation of all CLI commands, customizable features,
 * workspace mode, and an interactive hotkey checker.
 * Renders as a phone hub section (slide-out or floating panel).
 *
 * @author Donald Galliano III × Cassy
 * @version 1.0
 */
(function() {
  'use strict';

  var _containerEl = null;
  var _activeTab = 'quick';

  // Action labels for hotkey display (mirrors keybinds.js ACTIONS)
  var ACTION_LABELS = {};
  // Shop
  ACTION_LABELS['exec:0']  = 'Buy Slot 1';
  ACTION_LABELS['exec:1']  = 'Buy Slot 2';
  ACTION_LABELS['exec:2']  = 'Buy Slot 3';
  ACTION_LABELS['exec:3']  = 'Buy Slot 4';
  ACTION_LABELS['exec:4']  = 'Buy Slot 5';
  ACTION_LABELS['exec:5']  = 'Buy Slot 6';
  ACTION_LABELS['exec:6']  = 'Reroll';
  ACTION_LABELS['exec:7']  = 'Level Up';
  ACTION_LABELS['exec:8']  = 'Lock Shop';
  ACTION_LABELS['exec:9']  = 'End Turn';
  // Pick
  ACTION_LABELS['exec:80'] = 'Pick Choice 1';
  ACTION_LABELS['exec:81'] = 'Pick Choice 2';
  ACTION_LABELS['exec:82'] = 'Pick Choice 3';
  ACTION_LABELS['exec:83'] = 'Pick Choice 4';
  ACTION_LABELS['exec:84'] = 'Pick Choice 5';
  ACTION_LABELS['exec:85'] = 'Pick Choice 6';
  // Remove
  ACTION_LABELS['exec:74'] = 'Remove Slot 1';
  ACTION_LABELS['exec:75'] = 'Remove Slot 2';
  ACTION_LABELS['exec:76'] = 'Remove Slot 3';
  ACTION_LABELS['exec:77'] = 'Remove Slot 4';
  ACTION_LABELS['exec:78'] = 'Remove Slot 5';
  ACTION_LABELS['exec:79'] = 'Remove Slot 6';
  // PAC UI
  ACTION_LABELS['ui:keybind:toggleHunt']    = 'Toggle Hunt';
  ACTION_LABELS['ui:keybind:toggleTurbo']   = 'Toggle Turbo';
  ACTION_LABELS['ui:keybind:togglePhone']   = 'Toggle Phone';
  ACTION_LABELS['ui:keybind:openCLI']       = 'Open CLI';
  ACTION_LABELS['ui:keybind:clearTracker']  = 'Clear Tracker';
  // Move (10-41)
  (function() {
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 8; x++) {
        ACTION_LABELS['exec:' + (10 + y * 8 + x)] = 'Move \u2192 (' + x + ',' + y + ')';
      }
    }
    for (var y2 = 0; y2 < 4; y2++) {
      for (var x2 = 0; x2 < 8; x2++) {
        ACTION_LABELS['exec:' + (42 + y2 * 8 + x2)] = 'Sell @ (' + x2 + ',' + y2 + ')';
      }
    }
    for (var c = 0; c < 6; c++) {
      ACTION_LABELS['exec:' + (86 + c)] = 'Combine Items ' + (c + 1);
    }
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // TAB CONTENT BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _buildQuickStart() {
    return '' +
      _heading('Welcome to PAC') +
      _p('PAC is a Chrome extension for Pokemon Auto Chess with a probability tracker, counter-intelligence, auto-play hunt engine, and a full CLI for power users.') +
      _heading('Getting Started') +
      _step('1', 'Setup', 'Open the <b>Setup</b> app to connect PAC to your game. Green badge = connected.') +
      _step('2', 'Search', 'Add pokemon targets in <b>Search</b>. PAC calculates real-time roll probabilities.') +
      _step('3', 'CMD', 'Enable extra apps (Intel, Chat, Modes, etc.) in the <b>CMD</b> app launcher.') +
      _step('4', 'CLI', 'Bind a key to <b>Open CLI</b> in the Keybinds app for quick typed commands.') +
      _heading('Key Concepts') +
      _li('<b>Hunt Mode</b> — Auto-buy/reroll engine. Toggle via keybind or CLI.') +
      _li('<b>Turbo Mode</b> — Faster hunt tick speed for aggressive rolling.') +
      _li('<b>Workspace Mode</b> — Detach any app into a floating panel. See the Workspace tab.') +
      _li('<b>CLI</b> — Text command overlay. Type commands instead of clicking. See the Commands tab.');
  }

  function _buildCommands() {
    return '' +
      _heading('CLI Commands') +
      _p('Open CLI via keybind (default: unbound — set in Keybinds app). Tab to autocomplete, Enter to execute, Esc to close.') +

      _subheading('Game Actions') +
      _cmd('buy <1-6>', 'Buy a shop slot. Alias: <kbd>b</kbd>') +
      _cmd('reroll', 'Reroll the shop. Aliases: <kbd>r</kbd>, <kbd>d</kbd>, <kbd>refresh</kbd>') +
      _cmd('level', 'Buy XP. Aliases: <kbd>l</kbd>, <kbd>f</kbd>, <kbd>levelup</kbd>') +
      _cmd('lock', 'Toggle shop lock.') +
      _cmd('pass', 'End turn / skip. Aliases: <kbd>end</kbd>, <kbd>wait</kbd>') +
      _cmd('pick <1-6>', 'Pick a proposition/carousel item. Alias: <kbd>p</kbd>') +
      _cmd('remove <1-6>', 'Remove a shop slot. Alias: <kbd>rm</kbd>') +

      _subheading('Unit & Item Management') +
      _cmd('sell <name> [x,y]', 'Sell a board unit by name. Fuzzy matched. Add coordinates to disambiguate duplicates: <kbd>sell pikachu 3,1</kbd>') +
      _cmd('move <name> <x,y>', 'Reposition a board unit: <kbd>move pikachu 4,2</kbd>') +
      _cmd('equip <item> <x,y>', 'Equip a held item to a board position: <kbd>equip mystic_water 2,2</kbd>') +
      _cmd('combine <a> <b>', 'Combine two held items: <kbd>combine leftovers shell_bell</kbd>') +
      _cmd('clear', 'Clear all tracker targets. Aliases: <kbd>ca</kbd>, <kbd>clearall</kbd>') +

      _subheading('Info') +
      _cmd('gold', 'Show current gold + interest.') +
      _cmd('board', 'List all board units with stars, positions, and items.') +
      _cmd('shop', 'List shop contents with costs. Shows lock status.') +
      _cmd('items', 'List held items.') +
      _cmd('team', 'Show active synergies.') +
      _cmd('phase', 'Show current game phase, stage, and alive count.') +

      _subheading('Customization') +
      _cmd('speed [preset|ms]', 'Set animation speed. Presets: <kbd>off</kbd> (0ms), <kbd>fast</kbd> (150ms), <kbd>normal</kbd> (300ms), <kbd>slow</kbd> (600ms). Or any number 0-5000. Persists across reload.') +

      _subheading('Workspace') +
      _cmd('panel <id>', 'Open a section as a floating panel. IDs: search, team, intel, analytics, chat, fishing, settings, keybinds, guide') +
      _cmd('panel <id> <x,y>', 'Open at a specific position: <kbd>panel intel 200,100</kbd>') +
      _cmd('panel <id> <x,y> <WxH>', 'Open with size: <kbd>panel analytics 500,80 400x600</kbd>') +
      _cmd('panel close <id>', 'Close a floating panel.') +
      _cmd('panel closeall', 'Close all floating panels.') +
      _cmd('panel list', 'Show open panels or available IDs.') +
      _cmd('panel reset', 'Close everything, restore phone hub.') +
      _cmd('ui on|off|toggle', 'Show/hide the phone hub.') +
      _cmd('workspace save <n>', 'Save current layout as a named preset.') +
      _cmd('workspace load <n>', 'Restore a saved preset.') +
      _cmd('workspace list', 'Show all saved preset names.') +
      _cmd('workspace delete <n>', 'Delete a saved preset.') +
      _cmd('workspace export', 'Copy layout JSON to clipboard for sharing.') +
      _cmd('workspace import <json>', 'Apply a shared layout from JSON.') +
      _cmd('help', 'Show all commands. Aliases: <kbd>?</kbd>, <kbd>h</kbd>');
  }

  function _buildWorkspace() {
    return '' +
      _heading('Workspace Mode') +
      _p('Workspace mode lets you pop any PAC app out of the phone into its own floating window. Drag, resize, minimize, and arrange however you want. Your layout saves automatically and restores on page reload.') +
      _heading('How To Use') +
      _step('1', 'Open CLI', 'Press your Open CLI keybind.') +
      _step('2', 'Create Panel', 'Type <kbd>panel intel</kbd> to open Intel as a floating panel.') +
      _step('3', 'Arrange', 'Drag panels by their header. Resize from any edge or corner.') +
      _step('4', 'Hide Phone', 'Type <kbd>ui off</kbd> to hide the phone hub for a clean workspace.') +
      _step('5', 'Save', 'Type <kbd>ws save tryhard</kbd> to save your layout as a preset.') +
      _heading('Panel Controls') +
      _li('<b>Drag</b> — Click and drag the header bar.') +
      _li('<b>Resize</b> — Drag any edge or corner.') +
      _li('<b>Minimize</b> — Click <kbd>\u2500</kbd> button or double-click header. Collapses to title bar.') +
      _li('<b>Close</b> — Click <kbd>\u2715</kbd> button or use <kbd>panel close id</kbd>.') +
      _li('<b>Focus</b> — Click any panel to bring it to front.') +
      _heading('Presets') +
      _p('Save different arrangements for different situations:') +
      _li('<kbd>ws save econ</kbd> — Save your economy-focused layout') +
      _li('<kbd>ws save tryhard</kbd> — Save your competitive layout') +
      _li('<kbd>ws load tryhard</kbd> — Switch to it instantly') +
      _li('<kbd>ws export</kbd> — Share your layout JSON on Discord') +
      _heading('Available Panels') +
      _li('<b>search</b> — Target tracker with probabilities') +
      _li('<b>team</b> — Challenge modes (Mono-Type, Draft, etc.)') +
      _li('<b>intel</b> — Counter-intelligence (opponents\' boards)') +
      _li('<b>analytics</b> — Roll history and stats') +
      _li('<b>chat</b> — Global and match chat') +
      _li('<b>fishing</b> — Fishing minigame') +
      _li('<b>settings</b> — PAC settings') +
      _li('<b>keybinds</b> — Hotkey configuration') +
      _li('<b>guide</b> — This guide');
  }

  function _buildHotkeys() {
    var binds = {};
    try {
      var raw = localStorage.getItem('pac_keybinds');
      if (raw) binds = JSON.parse(raw);
    } catch (e) {}

    var html = '' +
      _heading('Hotkey Checker') +
      _p('Your currently bound hotkeys. Edit these in the <b>Keybinds</b> app.') +
      '<div id="pac-guide-hk-filter" style="margin-bottom:10px;">' +
        '<input type="text" placeholder="Search hotkeys..." style="' +
          'width:100%;box-sizing:border-box;padding:6px 10px;' +
          'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);' +
          'border-radius:6px;color:#fff;font-size:12px;outline:none;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        '">' +
      '</div>';

    // Reverse map: build action_key → key_string
    var boundKeys = {};
    var keyStrings = Object.keys(binds);
    for (var i = 0; i < keyStrings.length; i++) {
      var k = keyStrings[i];
      var b = binds[k];
      var actionKey = '';
      if (b.type === 'exec') actionKey = 'exec:' + b.index;
      else if (b.type === 'ui_action') actionKey = 'ui:' + b.event;
      boundKeys[actionKey] = k;
    }

    // Group and render
    html += _hotkeyGroup('PAC Controls', [
      'ui:keybind:toggleHunt',
      'ui:keybind:toggleTurbo',
      'ui:keybind:togglePhone',
      'ui:keybind:openCLI',
      'ui:keybind:clearTracker'
    ], boundKeys);

    html += _hotkeyGroup('Shop', [
      'exec:0', 'exec:1', 'exec:2', 'exec:3', 'exec:4', 'exec:5',
      'exec:6', 'exec:7', 'exec:8', 'exec:9'
    ], boundKeys);

    html += _hotkeyGroup('Pick', [
      'exec:80', 'exec:81', 'exec:82', 'exec:83', 'exec:84', 'exec:85'
    ], boundKeys);

    html += _hotkeyGroup('Remove', [
      'exec:74', 'exec:75', 'exec:76', 'exec:77', 'exec:78', 'exec:79'
    ], boundKeys);

    // Show bound move/sell/combine only if any are bound
    var advancedBound = [];
    for (var idx = 10; idx <= 91; idx++) {
      var aKey = 'exec:' + idx;
      if (boundKeys[aKey]) advancedBound.push(aKey);
    }
    if (advancedBound.length > 0) {
      html += _hotkeyGroup('Advanced (Move/Sell/Combine)', advancedBound, boundKeys);
    }

    // Summary
    var totalBound = keyStrings.length;
    html += '<div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.3);">' +
      totalBound + ' hotkey' + (totalBound !== 1 ? 's' : '') + ' bound total' +
    '</div>';

    return html;
  }

  function _hotkeyGroup(title, actionKeys, boundKeys) {
    var rows = '';
    for (var i = 0; i < actionKeys.length; i++) {
      var aKey = actionKeys[i];
      var label = ACTION_LABELS[aKey] || aKey;
      var key = boundKeys[aKey] || null;
      var keyDisplay = key ? _formatKey(key) : '<span style="color:rgba(255,255,255,0.2);">not bound</span>';
      rows += '<div class="pac-guide-hk-row" data-label="' + label.toLowerCase() + '" data-key="' + (key || '').toLowerCase() + '" style="' +
        'display:flex;justify-content:space-between;align-items:center;' +
        'padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);' +
      '">' +
        '<span style="font-size:11px;color:rgba(255,255,255,0.7);">' + label + '</span>' +
        '<span>' + keyDisplay + '</span>' +
      '</div>';
    }
    return '<div class="pac-guide-hk-group" style="margin-bottom:12px;">' +
      '<div style="font-size:10px;font-weight:600;color:rgba(48,213,200,0.7);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">' + title + '</div>' +
      rows +
    '</div>';
  }

  function _formatKey(keyStr) {
    // Format "ctrl+shift+a" → nice kbd display
    var parts = keyStr.split('+');
    return parts.map(function(p) {
      var display = p.charAt(0).toUpperCase() + p.slice(1);
      display = display.replace('arrowup', '\u2191').replace('arrowdown', '\u2193').replace('arrowleft', '\u2190').replace('arrowright', '\u2192');
      display = display.replace('Arrowup', '\u2191').replace('Arrowdown', '\u2193').replace('Arrowleft', '\u2190').replace('Arrowright', '\u2192');
      display = display.replace(' ', 'Space');
      return '<kbd style="' +
        'background:rgba(48,213,200,0.12);border:1px solid rgba(48,213,200,0.25);' +
        'border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace;' +
        'color:#30D5C8;' +
      '">' + display + '</kbd>';
    }).join(' + ');
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // HTML HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function _heading(text) {
    return '<div style="font-size:13px;font-weight:700;color:#fff;margin:14px 0 6px 0;padding-bottom:4px;border-bottom:1px solid rgba(48,213,200,0.15);">' + text + '</div>';
  }

  function _subheading(text) {
    return '<div style="font-size:11px;font-weight:600;color:rgba(48,213,200,0.7);text-transform:uppercase;letter-spacing:0.05em;margin:12px 0 4px 0;">' + text + '</div>';
  }

  function _p(text) {
    return '<div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.5;margin-bottom:8px;">' + text + '</div>';
  }

  function _li(text) {
    return '<div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.5;padding:2px 0 2px 12px;border-left:2px solid rgba(48,213,200,0.15);">' + text + '</div>';
  }

  function _step(num, title, text) {
    return '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">' +
      '<div style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:rgba(48,213,200,0.15);color:#30D5C8;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">' + num + '</div>' +
      '<div style="flex:1;">' +
        '<div style="font-size:11px;font-weight:600;color:#fff;">' + title + '</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.5);line-height:1.4;">' + text + '</div>' +
      '</div>' +
    '</div>';
  }

  function _cmd(syntax, desc) {
    return '<div style="margin-bottom:6px;">' +
      '<code style="font-size:11px;font-family:monospace;color:#30D5C8;background:rgba(48,213,200,0.08);padding:1px 5px;border-radius:3px;">' + syntax + '</code>' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:1px;padding-left:2px;">' + desc + '</div>' +
    '</div>';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  PAC.UI.Sections.guide = {
    render: function(body) {
      _containerEl = body;

      body.innerHTML =
        '<div style="margin-bottom:8px;">' +
          _tabBar() +
        '</div>' +
        '<div id="pac-guide-content"></div>';

      _renderTab(_activeTab);
      _wireTabEvents(body);
    }
  };

  function _tabBar() {
    var tabs = [
      { id: 'quick',     label: 'Quick Start' },
      { id: 'commands',  label: 'Commands' },
      { id: 'workspace', label: 'Workspace' },
      { id: 'hotkeys',   label: 'Hotkeys' }
    ];
    return '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
      tabs.map(function(t) {
        var active = t.id === _activeTab;
        return '<button class="pac-guide-tab" data-tab="' + t.id + '" style="' +
          'padding:4px 10px;border-radius:6px;border:1px solid ' +
          (active ? 'rgba(48,213,200,0.3)' : 'rgba(255,255,255,0.08)') + ';' +
          'background:' + (active ? 'rgba(48,213,200,0.12)' : 'rgba(255,255,255,0.03)') + ';' +
          'color:' + (active ? '#30D5C8' : 'rgba(255,255,255,0.5)') + ';' +
          'font-size:11px;cursor:pointer;font-family:inherit;' +
          'transition:all 150ms;' +
        '">' + t.label + '</button>';
      }).join('') +
    '</div>';
  }

  function _renderTab(tabId) {
    _activeTab = tabId;
    var content = _containerEl.querySelector('#pac-guide-content');
    if (!content) return;

    switch (tabId) {
      case 'quick':     content.innerHTML = _buildQuickStart(); break;
      case 'commands':  content.innerHTML = _buildCommands(); break;
      case 'workspace': content.innerHTML = _buildWorkspace(); break;
      case 'hotkeys':
        content.innerHTML = _buildHotkeys();
        _wireHotkeyFilter(content);
        break;
      default:          content.innerHTML = _buildQuickStart();
    }
  }

  function _wireTabEvents(body) {
    body.addEventListener('click', function(e) {
      var tab = e.target.closest('.pac-guide-tab');
      if (!tab) return;
      var tabId = tab.dataset.tab;
      if (!tabId) return;

      // Update active styles
      body.querySelectorAll('.pac-guide-tab').forEach(function(t) {
        var isActive = t.dataset.tab === tabId;
        t.style.borderColor = isActive ? 'rgba(48,213,200,0.3)' : 'rgba(255,255,255,0.08)';
        t.style.background = isActive ? 'rgba(48,213,200,0.12)' : 'rgba(255,255,255,0.03)';
        t.style.color = isActive ? '#30D5C8' : 'rgba(255,255,255,0.5)';
      });

      _renderTab(tabId);
    });
  }

  function _wireHotkeyFilter(container) {
    var input = container.querySelector('#pac-guide-hk-filter input');
    if (!input) return;
    input.addEventListener('input', function() {
      var q = input.value.toLowerCase().trim();
      var rows = container.querySelectorAll('.pac-guide-hk-row');
      rows.forEach(function(row) {
        var label = row.dataset.label || '';
        var key = row.dataset.key || '';
        var match = !q || label.indexOf(q) !== -1 || key.indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
      });
      // Show/hide group headers if all rows hidden
      var groups = container.querySelectorAll('.pac-guide-hk-group');
      groups.forEach(function(group) {
        var visibleRows = group.querySelectorAll('.pac-guide-hk-row:not([style*="display: none"])');
        // Also check for display:none without space
        var allRows = group.querySelectorAll('.pac-guide-hk-row');
        var anyVisible = false;
        allRows.forEach(function(r) {
          if (r.style.display !== 'none') anyVisible = true;
        });
        group.style.display = anyVisible ? '' : 'none';
      });
    });
  }

  if (PAC.DEBUG_MODE) console.log('PAC Sections: Guide loaded');
})();
