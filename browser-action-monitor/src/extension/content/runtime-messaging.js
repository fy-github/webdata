(function initRuntimeMessaging(globalScope) {
  function getErrorMessage(error) {
    if (!error) {
      return "";
    }

    return String(error.message || error);
  }

  function isIgnorableRuntimeError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("extension context invalidated") || message.includes("context invalidated");
  }

  function safeSendMessage(sendMessageImpl, message) {
    try {
      sendMessageImpl(message, function handleResponse() {
        const runtimeError = globalScope.chrome?.runtime?.lastError;
        if (runtimeError && !isIgnorableRuntimeError(runtimeError)) {
          console.warn("Browser Action Monitor message error:", getErrorMessage(runtimeError));
        }
      });
      return true;
    } catch (error) {
      if (!isIgnorableRuntimeError(error)) {
        console.warn("Browser Action Monitor message failed:", getErrorMessage(error));
      }
      return false;
    }
  }

  globalScope.BrowserActionMonitorRuntime = {
    getErrorMessage,
    isIgnorableRuntimeError,
    safeSendMessage
  };
})(globalThis);
