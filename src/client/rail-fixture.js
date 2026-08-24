var __DshDragFileRailFixture = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client/rail.ts
  var rail_exports = {};
  __export(rail_exports, {
    NATIVE_INNER_ATTR: () => NATIVE_INNER_ATTR,
    NATIVE_WRAPPER_ATTR: () => NATIVE_WRAPPER_ATTR,
    PILLS_ATTR: () => PILLS_ATTR,
    findNativeAttachmentRail: () => findNativeAttachmentRail,
    placePillBar: () => placePillBar,
    startAttachmentRailObserver: () => startAttachmentRailObserver,
    wireAttachmentCardActions: () => wireAttachmentCardActions
  });
  var PILLS_ATTR = "data-drag-file-pills";
  var NATIVE_WRAPPER_ATTR = "data-drag-file-native-wrapper";
  var NATIVE_INNER_ATTR = "data-drag-file-native-inner";
  var coordinatedRails = /* @__PURE__ */ new WeakMap();
  function pluginOwned(element) {
    return element.hasAttribute(PILLS_ATTR) || element.classList.contains("dsh-side-chat-parent-annotation-rail");
  }
  function findNativeAttachmentRail(slot) {
    for (const child of slot.children) {
      if (pluginOwned(child) || !(child instanceof HTMLElement)) continue;
      const direct = Array.from(child.children).find((item) => item.getAttribute("role") === "group");
      const inner = direct instanceof HTMLElement ? direct : child.querySelector('[role="group"]');
      if (inner !== null) return { wrapper: child, inner };
    }
    return void 0;
  }
  function placePillBar(slot, bar) {
    const previous = coordinatedRails.get(slot);
    previous?.wrapper.removeAttribute(NATIVE_WRAPPER_ATTR);
    previous?.inner.removeAttribute(NATIVE_INNER_ATTR);
    slot.querySelectorAll(`[${NATIVE_WRAPPER_ATTR}], [${NATIVE_INNER_ATTR}]`).forEach((element) => {
      element.removeAttribute(NATIVE_WRAPPER_ATTR);
      element.removeAttribute(NATIVE_INNER_ATTR);
    });
    const native = findNativeAttachmentRail(slot);
    if (native !== void 0) {
      native.wrapper.setAttribute(NATIVE_WRAPPER_ATTR, "1");
      native.inner.setAttribute(NATIVE_INNER_ATTR, "1");
      coordinatedRails.set(slot, native);
      if (bar !== void 0 && bar.parentElement !== native.inner) native.inner.appendChild(bar);
      return native;
    }
    coordinatedRails.delete(slot);
    if (bar === void 0) return void 0;
    const reference = Array.from(slot.children).find((child) => child.classList.contains("dsh-side-chat-parent-annotation-rail")) ?? null;
    if (bar.parentElement !== slot || bar.nextElementSibling !== reference) slot.insertBefore(bar, reference);
    return void 0;
  }
  function startAttachmentRailObserver(target, reconcile, delayMs = 60) {
    let timer;
    const observer = new MutationObserver(() => {
      if (timer !== void 0) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        reconcile();
      }, delayMs);
    });
    observer.observe(target, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timer !== void 0) clearTimeout(timer);
    };
  }
  function wireAttachmentCardActions(main, remove, onActivate, onRemove) {
    main.addEventListener("click", onActivate);
    const stopPropagation = (event) => {
      event.stopPropagation();
    };
    for (const type of ["pointerdown", "mousedown", "keydown"]) remove.addEventListener(type, stopPropagation);
    remove.addEventListener("click", (event) => {
      stopPropagation(event);
      onRemove();
    });
  }
  return __toCommonJS(rail_exports);
})();
