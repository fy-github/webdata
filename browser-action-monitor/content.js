(() => {
const CONTENT_RUNTIME_KEY = "__browserActionMonitorContentRuntime";

const previousRuntime = globalThis[CONTENT_RUNTIME_KEY];
if (previousRuntime?.dispose) {
  previousRuntime.dispose();
}

const DEFAULT_SETTINGS = {
  captureClicks: true,
  captureInput: true,
  captureChange: true,
  captureSubmit: true,
  captureNavigation: true,
  captureScroll: true,
  captureKeydown: true,
  captureMousemove: false,
  scrollThrottleMs: 200,
  mousemoveThrottleMs: 800
};

const SETTINGS_KEY = "monitorSettings";

let settings = { ...DEFAULT_SETTINGS };
let scrollTimer = null;
let mousemoveTimer = null;
let disposed = false;
const cleanupFns = [];

function registerCleanup(callback) {
  cleanupFns.push(callback);
}

function disposeRuntime() {
  if (disposed) {
    return;
  }

  disposed = true;
  clearTimeout(scrollTimer);
  clearTimeout(mousemoveTimer);
  scrollTimer = null;
  mousemoveTimer = null;

  while (cleanupFns.length > 0) {
    const cleanup = cleanupFns.pop();
    cleanup();
  }
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

async function loadSettings() {
  const storedSettings = await storageGet(SETTINGS_KEY);
  settings = {
    ...DEFAULT_SETTINGS,
    ...(storedSettings || {})
  };
}

function getSelector(element) {
  if (!element || !element.tagName) {
    return "";
  }

  let current = element;
  const parts = [];

  while (current && current.tagName) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part += `#${current.id}`;
      parts.unshift(part);
      break;
    }

    const classNames = typeof current.className === "string"
      ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
      : [];
    if (classNames.length > 0) {
      part += `.${classNames.join(".")}`;
    }

    if (current.parentElement) {
      const sameTagSiblings = Array.from(current.parentElement.children)
        .filter((sibling) => sibling.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function getTargetSnapshot(target) {
  if (!target || !(target instanceof Element)) {
    return {
      tagName: "",
      id: "",
      className: "",
      name: "",
      type: "",
      text: "",
      selector: "",
      placeholder: "",
      ariaLabel: "",
      bounds: null
    };
  }

  const rect = typeof target.getBoundingClientRect === "function"
    ? target.getBoundingClientRect()
    : null;

  return {
    tagName: target.tagName,
    id: target.id || "",
    className: typeof target.className === "string" ? target.className : "",
    name: target.getAttribute("name") || "",
    type: target.getAttribute("type") || "",
    text: target.innerText || target.textContent || "",
    selector: getSelector(target),
    placeholder: target.getAttribute("placeholder") || "",
    ariaLabel: target.getAttribute("aria-label") || "",
    bounds: rect
      ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
      : null
  };
}

function sendAction(eventType, payload = {}, target = null) {
  if (disposed || !chrome?.runtime?.id) {
    return;
  }

  const safeSendMessage = globalThis.BrowserActionMonitorRuntime?.safeSendMessage;
  const message = {
    action: "recordAction",
    data: {
      eventType,
      timestamp: Date.now(),
      page: {
        url: window.location.href,
        title: document.title
      },
      target: getTargetSnapshot(target),
      payload
    }
  };

  if (typeof safeSendMessage === "function") {
    safeSendMessage(chrome.runtime.sendMessage.bind(chrome.runtime), message);
    return;
  }

  chrome.runtime.sendMessage(message);
}

function emitNavigation(trigger) {
  if (!settings.captureNavigation) {
    return;
  }

  sendAction("navigation", {
    trigger,
    url: window.location.href
  });
}

function addDomListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  registerCleanup(() => {
    target.removeEventListener(type, handler, options);
  });
}

function setupListeners() {
  const handleClick = (event) => {
    if (settings.captureClicks) {
      sendAction("click", {
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button
      }, event.target);
    }
  };

  const handleInput = (event) => {
    if (settings.captureInput) {
      sendAction("input", { value: event.target?.value || "" }, event.target);
    }
  };

  const handleChange = (event) => {
    if (settings.captureChange) {
      sendAction("change", { value: event.target?.value || "" }, event.target);
    }
  };

  const handleSubmit = (event) => {
    if (settings.captureSubmit) {
      sendAction("submit", {}, event.target);
    }
  };

  const handleKeydown = (event) => {
    if (settings.captureKeydown) {
      sendAction("keydown", { key: event.key }, event.target);
    }
  };

  const handleScroll = () => {
    if (!settings.captureScroll) {
      return;
    }

    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      sendAction("scroll", {
        scrollX: window.scrollX,
        scrollY: window.scrollY
      });
    }, settings.scrollThrottleMs);
  };

  const handleMousemove = (event) => {
    if (!settings.captureMousemove) {
      return;
    }

    clearTimeout(mousemoveTimer);
    mousemoveTimer = setTimeout(() => {
      sendAction("mousemove", {
        clientX: event.clientX,
        clientY: event.clientY
      }, event.target);
    }, settings.mousemoveThrottleMs);
  };

  const handleHashChange = () => emitNavigation("hashchange");
  const handlePopState = () => emitNavigation("popstate");
  const handleStorageChange = (changes, areaName) => {
    if (areaName === "local" && changes[SETTINGS_KEY]?.newValue) {
      settings = {
        ...DEFAULT_SETTINGS,
        ...changes[SETTINGS_KEY].newValue
      };
    }
  };

  addDomListener(document, "click", handleClick, true);
  addDomListener(document, "input", handleInput, true);
  addDomListener(document, "change", handleChange, true);
  addDomListener(document, "submit", handleSubmit, true);
  addDomListener(document, "keydown", handleKeydown, true);
  addDomListener(document, "scroll", handleScroll, true);
  addDomListener(document, "mousemove", handleMousemove, true);
  addDomListener(window, "hashchange", handleHashChange);
  addDomListener(window, "popstate", handlePopState);

  chrome.storage.onChanged.addListener(handleStorageChange);
  registerCleanup(() => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushStateWrapper(...args) {
    const result = originalPushState.apply(this, args);
    emitNavigation("pushState");
    return result;
  };

  history.replaceState = function replaceStateWrapper(...args) {
    const result = originalReplaceState.apply(this, args);
    emitNavigation("replaceState");
    return result;
  };

  registerCleanup(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  emitNavigation("load");
}

loadSettings().then(() => {
  if (!disposed) {
    setupListeners();
  }
});

globalThis[CONTENT_RUNTIME_KEY] = {
  dispose: disposeRuntime
};
})();
