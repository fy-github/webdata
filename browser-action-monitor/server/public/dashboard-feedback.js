export function updateFeedbackBar(feedbackBar, message, tone = "busy") {
  if (!feedbackBar) {
    return false;
  }

  feedbackBar.textContent = message;
  feedbackBar.className = `feedback is-${tone}`;
  return true;
}

export function clearFeedbackBar(feedbackBar) {
  if (!feedbackBar) {
    return false;
  }

  feedbackBar.textContent = "";
  feedbackBar.className = "feedback hidden";
  return true;
}
