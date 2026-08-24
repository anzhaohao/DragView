// src/client/export-bridge.ts
var DRAG_FILE_BRIDGE_VERSION = 2;
function acknowledgeRegisteredExport(event, sessionId, add) {
  const detail = event.detail;
  if (!event.cancelable || !detail || sessionId === void 0 || detail.sessionId !== sessionId || typeof detail.id !== "string" || typeof detail.ref !== "string" || typeof detail.name !== "string" || detail.mediaType !== "text/markdown") return false;
  add(detail);
  event.preventDefault();
  return event.defaultPrevented;
}
export {
  DRAG_FILE_BRIDGE_VERSION,
  acknowledgeRegisteredExport
};
