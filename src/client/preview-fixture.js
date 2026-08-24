var __DshDragFilePreviewFixture = (() => {
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

  // src/client/preview.ts
  var preview_exports = {};
  __export(preview_exports, {
    activateAttachment: () => activateAttachment,
    closeActivePreview: () => closeActivePreview,
    notifyUser: () => notifyUser,
    openInSystem: () => openInSystem
  });

  // src/protocol.ts
  var FILE_DROP_ROUTE = "/file-drop";
  var RESOLVE_ROUTE = `${FILE_DROP_ROUTE}/resolve`;
  var COPY_ROUTE = `${FILE_DROP_ROUTE}/copy`;
  var CONFIG_ROUTE = `${FILE_DROP_ROUTE}/config`;
  var SETTINGS_ROUTE = `${FILE_DROP_ROUTE}/settings`;
  var PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/preview`;
  var TEXT_PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/text-preview`;
  var OPEN_ROUTE = `${FILE_DROP_ROUTE}/open`;
  var REVOKE_ROUTE = `${FILE_DROP_ROUTE}/revoke`;
  var SAMPLE_BYTES = 64 * 1024;
  var SMALL_FILE_BYTES = 8 * 1024 * 1024;
  var TEXT_READ_BYTES = 1024 * 1024;
  var MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

  // src/client/preview.ts
  var activeClose;
  function closeActivePreview() {
    activeClose?.();
  }
  async function jsonOrError(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }
  function notifyUser(message) {
    document.querySelector("[data-drag-file-notice]")?.remove();
    const notice = document.createElement("div");
    notice.setAttribute("data-drag-file-notice", "1");
    notice.setAttribute("role", "alert");
    notice.textContent = message;
    document.body.append(notice);
    window.setTimeout(() => notice.remove(), 5e3);
  }
  async function openInSystem(item) {
    const response = await fetch(OPEN_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, sessionId: item.sessionId })
    });
    const result = await jsonOrError(response);
    if (!response.ok || !result.ok) throw new Error(result.error?.message || "\u65E0\u6CD5\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u6587\u4EF6");
  }
  function actionButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    return button;
  }
  function activateAttachment(item, trigger) {
    if (item.previewKind === "system") {
      void openInSystem(item).catch((error) => notifyUser(error instanceof Error ? error.message : "\u65E0\u6CD5\u6253\u5F00\u6587\u4EF6"));
      return;
    }
    closeActivePreview();
    const controller = new AbortController();
    const backdrop = document.createElement("div");
    backdrop.setAttribute("data-drag-file-preview", "1");
    backdrop.className = "dsh-drag-file-preview-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", `\u9884\u89C8 ${item.name}`);
    const panel = document.createElement("section");
    panel.className = "dsh-drag-file-preview-panel";
    const header = document.createElement("header");
    header.className = "dsh-drag-file-preview-header";
    const heading = document.createElement("div");
    heading.className = "dsh-drag-file-preview-heading";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("span");
    meta.textContent = `${item.typeLabel} \xB7 ${item.formattedSize}`;
    heading.append(title, meta);
    const close = actionButton("\xD7", "dsh-drag-file-preview-close");
    close.setAttribute("aria-label", "\u5173\u95ED\u9884\u89C8");
    header.append(heading, close);
    const content = document.createElement("div");
    content.className = "dsh-drag-file-preview-content";
    content.setAttribute("aria-live", "polite");
    content.textContent = "\u6B63\u5728\u52A0\u8F7D\u9884\u89C8\u2026";
    const footer = document.createElement("footer");
    footer.className = "dsh-drag-file-preview-footer";
    const open = actionButton("\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00", "dsh-drag-file-preview-open");
    footer.append(open);
    panel.append(header, content, footer);
    backdrop.append(panel);
    let previewTimer;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
    };
    const finish = () => {
      controller.abort();
      if (previewTimer !== void 0) window.clearTimeout(previewTimer);
      backdrop.querySelector("iframe")?.removeAttribute("src");
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (activeClose === finish) activeClose = void 0;
      if (trigger.isConnected) trigger.focus();
    };
    const fail = (message) => {
      if (previewTimer !== void 0) window.clearTimeout(previewTimer);
      content.replaceChildren();
      const error = document.createElement("div");
      error.className = "dsh-drag-file-preview-error";
      error.textContent = message;
      content.append(error);
    };
    close.addEventListener("click", finish);
    const preventBackdropFocus = (event) => {
      if (event.target === backdrop) event.preventDefault();
    };
    backdrop.addEventListener("pointerdown", preventBackdropFocus);
    backdrop.addEventListener("mousedown", preventBackdropFocus);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) finish();
    });
    open.addEventListener("click", () => {
      void openInSystem(item).catch((error) => fail(error instanceof Error ? error.message : "\u65E0\u6CD5\u6253\u5F00\u6587\u4EF6"));
    });
    document.addEventListener("keydown", onKey);
    activeClose = finish;
    document.body.append(backdrop);
    close.focus();
    void (async () => {
      try {
        if (item.previewKind === "text") {
          const response = await fetch(`${TEXT_PREVIEW_ROUTE}?id=${encodeURIComponent(item.id)}&sessionId=${encodeURIComponent(item.sessionId)}`, { signal: controller.signal });
          const text = await response.text();
          if (!response.ok) {
            let message = "\u6587\u672C\u9884\u89C8\u52A0\u8F7D\u5931\u8D25";
            try {
              message = JSON.parse(text).error?.message || message;
            } catch {
            }
            throw new Error(message);
          }
          const pre = document.createElement("pre");
          pre.className = "dsh-drag-file-preview-text";
          pre.textContent = text;
          content.replaceChildren(pre);
          if (response.headers.get("x-dsh-drag-file-truncated") === "1") {
            const warning = document.createElement("div");
            warning.className = "dsh-drag-file-preview-truncated";
            warning.textContent = "\u6587\u4EF6\u8F83\u957F\uFF0C\u4EC5\u663E\u793A\u524D 1 MB \u5185\u5BB9\u3002";
            content.append(warning);
          }
          return;
        }
        const src = `${PREVIEW_ROUTE}?id=${encodeURIComponent(item.id)}&sessionId=${encodeURIComponent(item.sessionId)}`;
        const probe = await fetch(src, { method: "HEAD", signal: controller.signal });
        if (!probe.ok) {
          const result = await jsonOrError(probe);
          throw new Error(result.error?.message || "\u9884\u89C8\u52A0\u8F7D\u5931\u8D25");
        }
        if (item.previewKind === "pdf") {
          const iframe = document.createElement("iframe");
          iframe.className = "dsh-drag-file-preview-pdf";
          iframe.title = item.name;
          iframe.addEventListener("load", () => {
            if (previewTimer !== void 0) window.clearTimeout(previewTimer);
            previewTimer = void 0;
          }, { once: true });
          iframe.addEventListener("error", () => fail("PDF \u9884\u89C8\u5931\u8D25\u3002\u4F60\u4ECD\u53EF\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u3002"), { once: true });
          previewTimer = window.setTimeout(() => fail("PDF \u9884\u89C8\u52A0\u8F7D\u8D85\u65F6\u3002\u4F60\u4ECD\u53EF\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u3002"), 12e3);
          iframe.src = src;
          content.replaceChildren(iframe);
        } else if (item.previewKind === "video") {
          const video = document.createElement("video");
          video.className = "dsh-drag-file-preview-video";
          video.controls = true;
          video.preload = "metadata";
          video.src = src;
          video.addEventListener("error", () => fail("\u89C6\u9891\u9884\u89C8\u5931\u8D25\u3002\u4F60\u4ECD\u53EF\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u3002"), { once: true });
          content.replaceChildren(video);
        } else {
          const audio = document.createElement("audio");
          audio.className = "dsh-drag-file-preview-audio";
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = src;
          audio.addEventListener("error", () => fail("\u97F3\u9891\u9884\u89C8\u5931\u8D25\u3002\u4F60\u4ECD\u53EF\u4F7F\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u5E94\u7528\u6253\u5F00\u3002"), { once: true });
          content.replaceChildren(audio);
        }
      } catch (error) {
        if (!controller.signal.aborted) fail(error instanceof Error ? error.message : "\u9884\u89C8\u52A0\u8F7D\u5931\u8D25");
      }
    })();
  }
  return __toCommonJS(preview_exports);
})();
