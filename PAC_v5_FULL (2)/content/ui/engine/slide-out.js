/**
 * PAC v5 — Detail Panel (Slide-Out)
 * Same-size glass card BEHIND the phone (z:0).
 * Translates 101% left or right based on overlay position.
 * "‹ Back" to close.
 */
(function() {
  'use strict';

  var Events = PAC.UI.Events;
  var PhoneHub = null;

  var els = {};
  var currentSection = null;
  var renderedSections = {};
  var isOpen = false;

  PAC.UI.Engine.SlideOut = {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function() { return isOpen; },
    getCurrentSection: function() { return currentSection; }
  };

  function init() {
    PhoneHub = PAC.UI.Engine.PhoneHub;
    _createDOM();
    _wireEvents();
  }

  function _createDOM() {
    var root = PhoneHub.getRootEl();

    // Detail container (same size as root, behind phone)
    els.detail = document.createElement('div');
    els.detail.className = 'pac-detail';

    // Glass card inside
    els.card = document.createElement('div');
    els.card.className = 'pac-detail-card';

    // Header
    els.header = document.createElement('div');
    els.header.className = 'pac-detail-header';
    els.header.setAttribute('data-no-drag', 'true');

    // Back button
    var back = document.createElement('button');
    back.className = 'pac-detail-back';
    back.innerHTML = '<span class="pac-detail-back-arrow">‹</span> Back';
    back.addEventListener('click', function() { close(); });
    els.header.appendChild(back);

    // Title area
    els.titleArea = document.createElement('div');
    els.titleArea.className = 'pac-detail-title-area';
    els.titleArea.innerHTML =
      '<span class="pac-detail-emoji" id="pac-detail-emoji"></span>' +
      '<span class="pac-detail-name" id="pac-detail-name">Section</span>';
    els.header.appendChild(els.titleArea);

    // Spacer
    var spacer = document.createElement('div');
    spacer.className = 'pac-detail-spacer';
    els.header.appendChild(spacer);

    els.card.appendChild(els.header);

    // Body
    els.body = document.createElement('div');
    els.body.className = 'pac-detail-body';
    els.body.setAttribute('data-no-drag', 'true');
    els.card.appendChild(els.body);

    els.detail.appendChild(els.card);

    // Insert BEFORE phone card so it's behind (z:0)
    root.insertBefore(els.detail, root.firstChild);

    // Cache refs
    els.emoji = document.getElementById('pac-detail-emoji');
    els.name = document.getElementById('pac-detail-name');
  }

  function _wireEvents() {
    Events.on('phone:appTapped', function(data) { toggle(data.id); });
    Events.on('phone:minimized', function() { close(); });
    Events.on('phone:hidden', function() { close(); });
    Events.on('phone:escPressed', function() {
      if (isOpen) close();
    });
  }

  // ── Direction Detection ───────────────────────────────────────────────────
  function _detectDirection() {
    var root = PhoneHub.getRootEl();
    if (!root) return 'right';
    var rect = root.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    return centerX > window.innerWidth / 2 ? 'left' : 'right';
  }

  // ── Open / Close / Toggle ─────────────────────────────────────────────────
  function toggle(sectionId) {
    if (isOpen && currentSection === sectionId) {
      close();
    } else {
      open(sectionId);
    }
  }

  function open(sectionId) {
    var apps = PhoneHub.getApps();
    var app = null;
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].id === sectionId) { app = apps[i]; break; }
    }
    if (!app) return;

    // Check section renderer
    if (!PAC.UI.Sections[sectionId]) {
      if (PAC.DEBUG_MODE) console.warn('PAC Detail: No section for', sectionId);
      return;
    }

    // Lazy render
    if (!renderedSections[sectionId]) {
      var container = document.createElement('div');
      container.className = 'pac-section-content';
      container.id = 'pac-section-' + sectionId;
      els.body.appendChild(container);
      PAC.UI.Sections[sectionId].render(container);
      renderedSections[sectionId] = container;
    }

    // Show target section, hide others
    Object.keys(renderedSections).forEach(function(id) {
      renderedSections[id].classList.toggle('pac-active', id === sectionId);
    });

    // Update header
    els.emoji.textContent = app.emoji;
    els.name.textContent = app.name;

    // Direction
    var dir = _detectDirection();
    els.detail.className = 'pac-detail pac-detail--open-' + dir;

    isOpen = true;
    currentSection = sectionId;

    // Scroll to top
    els.body.scrollTop = 0;

    Events.emit('slideout:opened', { id: sectionId });
  }

  function close() {
    els.detail.className = 'pac-detail';
    isOpen = false;
    currentSection = null;
    Events.emit('slideout:closed');
  }

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Detail Panel loaded');
})();
