/**
 * PAC v5 — Notification Component
 *
 * Toast-style notifications that auto-dismiss.
 */
(function() {
  'use strict';

  var activeToast = null;
  var dismissTimer = null;

  PAC.UI.Components.Notification = {
    /**
     * Show a toast notification.
     * @param {string} message — Text to display
     * @param {string} [type='info'] — 'info', 'success', 'warning', 'error'
     * @param {number} [duration=3000] — ms before auto-dismiss
     */
    show: function(message, type, duration) {
      type = type || 'info';
      duration = duration || 3000;

      // Remove existing toast
      this.dismiss();

      var root = document.getElementById('pac-root');
      if (!root) return;

      var toast = document.createElement('div');
      toast.className = 'pac-toast';
      if (type !== 'info') {
        toast.classList.add('pac-toast--' + type);
      }
      toast.textContent = message;
      root.appendChild(toast);
      activeToast = toast;

      // Auto-dismiss
      dismissTimer = setTimeout(function() {
        PAC.UI.Components.Notification.dismiss();
      }, duration);
    },

    /** Dismiss the current toast */
    dismiss: function() {
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      if (activeToast && activeToast.parentNode) {
        activeToast.parentNode.removeChild(activeToast);
      }
      activeToast = null;
    }
  };

  if (PAC.DEBUG_MODE) console.log('PAC Components: Notification loaded');
})();
