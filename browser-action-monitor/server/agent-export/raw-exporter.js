function mapRawType(actionType) {
  const mapping = {
    navigation: "navigate",
    click: "click",
    input: "input",
    change: "change",
    submit: "submit",
    keydown: "keydown",
    scroll: "scroll",
    mousemove: "mousemove"
  };

  return mapping[actionType] || actionType || "unknown";
}

function buildReplayHint(action) {
  if (action.type === "mousemove") {
    return {
      suitable: false,
      reason: "low_value_motion"
    };
  }

  if ((action.type === "click" || action.type === "input" || action.type === "change") && !action.target?.selector) {
    return {
      suitable: false,
      reason: "missing_selector"
    };
  }

  return {
    suitable: true,
    reason: ""
  };
}

export function buildRawSteps(actions = []) {
  return actions.map((action, index) => ({
    id: `raw_${index + 1}`,
    sourceActionId: action.id,
    type: mapRawType(action.type),
    timestamp: action.timestamp,
    page: {
      url: action.page?.url || "",
      title: action.page?.title || ""
    },
    target: {
      selector: action.target?.selector || "",
      tagName: action.target?.tagName || "",
      name: action.target?.name || "",
      type: action.target?.type || "",
      text: action.target?.text || ""
    },
    payload: { ...(action.payload || {}) },
    privacy: { ...(action.privacy || {}) },
    attachment: action.attachment
      ? {
        domSnapshot: action.attachment.domSnapshot
          ? {
            status: action.attachment.domSnapshot.status || "",
            preview: action.attachment.domSnapshot.preview || "",
            privacyMode: action.attachment.domSnapshot.privacyMode || "",
            root: action.attachment.domSnapshot.root || null
          }
          : null,
        screenshot: action.attachment.screenshot
          ? {
            status: action.attachment.screenshot.status || "",
            remoteStatus: action.attachment.screenshot.remoteStatus || "",
            remoteUrl: action.attachment.screenshot.remoteUrl || "",
            mimeType: action.attachment.screenshot.mimeType || ""
          }
          : null
      }
      : null,
    replay: buildReplayHint(action)
  }));
}
