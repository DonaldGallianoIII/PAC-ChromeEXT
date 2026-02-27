/**
 * PAC Live Data Calculator - Namespace v5.0
 *
 * MUST be loaded first. Establishes shared namespace for all modules.
 * v5: Added UI sub-namespaces for modular panel system.
 */
(function() {
  'use strict';

  window.PAC = window.PAC || {};

  PAC.VERSION = '5.0.0';
  PAC.DEBUG_MODE = false;

  // Core namespaces (unchanged from v3)
  PAC.Data = {};
  PAC.Utils = {};
  PAC.State = {};
  PAC.Calc = {};

  // UI namespace (rebuilt for v4 — phone + slide-out)
  PAC.UI = {};
  PAC.UI.Engine = {};       // Phone hub, slide-out, drag, events
  PAC.UI.Sections = {};     // Section content renderers (target, pool, etc.)
  PAC.UI.Components = {};   // Shared components (autocomplete, notification)
  PAC.UI.Styles = {};       // Style injection modules
  PAC.UI.Panels = {};       // Legacy compat (detection, etc.)

  // Features namespace
  PAC.Features = {};

  if (PAC.DEBUG_MODE) console.log('PAC Namespace initialized v' + PAC.VERSION);
})();
