/**
 * PAC v5 — WebSocket Interceptor
 * 
 * Injected into PAGE CONTEXT (like extractor.js) via web_accessible_resources.
 * Monkey-patches WebSocket to capture the game's sessionId from WS connections.
 * Posts it back to content script via window.postMessage.
 *
 * WHY: Chrome extensions can't read WebSocket URLs from content scripts.
 * The game connects via wss://...?sessionId=XXX&reconnectionToken=YYY
 * We intercept that URL, extract sessionId, and relay it.
 */
(function() {
  'use strict';

  var OriginalWebSocket = window.WebSocket;
  var capturedSessionId = null;

  window.WebSocket = function(url, protocols) {
    // Check if this WS connection has a sessionId (game match connection)
    if (url && typeof url === 'string' && url.indexOf('sessionId=') !== -1) {
      try {
        var urlObj = new URL(url);
        var sessionId = urlObj.searchParams.get('sessionId');

        if (sessionId && sessionId !== capturedSessionId) {
          capturedSessionId = sessionId;
          // console.log('[PAC WS Interceptor] Match sessionId captured:', sessionId);

          // Relay to content script
          window.postMessage({
            type: 'PAC_SESSION_DETECTED',
            sessionId: sessionId
          }, '*');
        }
      } catch(e) {
        console.warn('[PAC WS Interceptor] URL parse error:', e);
      }
    }

    // Call original constructor normally
    if (protocols !== undefined) {
      return new OriginalWebSocket(url, protocols);
    }
    return new OriginalWebSocket(url);
  };

  // Copy over static properties and prototype
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  // console.log('[PAC WS Interceptor] WebSocket patched, listening for sessionId');
})();
