/**
 * PAC v5 — Event Bus
 *
 * Simple pub/sub system for inter-panel communication.
 * Panels never reference each other directly — only through events.
 *
 * Event naming convention:
 *   state:targetChanged    — app state mutations
 *   panel:opened           — panel lifecycle
 *   theme:changed          — theme updates
 *   layout:reset           — layout changes
 *   extraction:data        — game data from extractor
 *
 * Usage:
 *   PAC.UI.Events.on('state:targetChanged', function(data) { ... });
 *   PAC.UI.Events.emit('state:targetChanged', { level: 7 });
 *   PAC.UI.Events.off('state:targetChanged', handler);
 */
(function() {
  'use strict';

  var listeners = {};

  PAC.UI.Events = {
    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {function} handler - Callback
     * @returns {function} handler (for later removal)
     */
    on: function(event, handler) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
      return handler;
    },

    /**
     * Unsubscribe from an event.
     * @param {string} event - Event name
     * @param {function} handler - The same function reference passed to on()
     */
    off: function(event, handler) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(function(h) {
        return h !== handler;
      });
    },

    /**
     * Emit an event to all subscribers.
     * @param {string} event - Event name
     * @param {*} data - Payload (any type)
     */
    emit: function(event, data) {
      if (PAC.DEBUG_MODE && event !== 'extraction:updated') {
        if (PAC.DEBUG_MODE) console.log('PAC Event:', event, data);
      }
      var handlers = listeners[event];
      if (!handlers) return;

      // Hot path: iterate directly without copying.
      // CONTRACT: No handler may call Events.on() or Events.off() during emission.
      // No handler may emit events whose handlers mutate this event's listeners.
      // Listener registration must happen at initialization time only.
      // Do NOT add Events.once() without restoring the defensive .slice() copy.
      // If a handler throws: log + continue in production, re-throw in debug.
      for (var i = 0; i < handlers.length; i++) {
        try {
          handlers[i](data);
        } catch (err) {
          console.error('PAC Event handler error [' + event + ']:', err);
          if (PAC.DEBUG_MODE) throw err;
        }
      }
    },

    /**
     * Remove all listeners for an event, or all events.
     * @param {string} [event] - Optional event name. Omit to clear everything.
     */
    clear: function(event) {
      if (event) {
        delete listeners[event];
      } else {
        listeners = {};
      }
    },

    /** Debug: list all registered events and handler counts */
    debug: function() {
      var summary = {};
      for (var event in listeners) {
        summary[event] = listeners[event].length;
      }
      return summary;
    }
  };

  if (PAC.DEBUG_MODE) console.log('PAC Engine: Event bus loaded');
})();
