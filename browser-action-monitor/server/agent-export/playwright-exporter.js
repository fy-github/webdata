function quote(value) {
  return JSON.stringify(String(value ?? ""));
}

function isMeaningfulKey(action) {
  const key = action.payload?.key;
  return ["Enter", "Tab", "Escape"].includes(key);
}

function createStep(command, properties) {
  return {
    command,
    confidence: "high",
    ...properties
  };
}

function toRawLikeStep(action) {
  if (action.type === "navigation" && action.page?.url) {
    return createStep("goto", {
      sourceActionIds: [action.id],
      url: action.page.url
    });
  }

  if (action.type === "click" && action.target?.selector) {
    return createStep("click", {
      sourceActionIds: [action.id],
      selector: action.target.selector
    });
  }

  if ((action.type === "input" || action.type === "change") && action.target?.selector) {
    return createStep("fill", {
      sourceActionIds: [action.id],
      selector: action.target.selector,
      value: action.payload?.value ?? ""
    });
  }

  if (action.type === "keydown" && isMeaningfulKey(action)) {
    return createStep("press", {
      sourceActionIds: [action.id],
      key: action.payload.key
    });
  }

  return null;
}

function mergeExecutableSteps(steps) {
  const merged = [];

  for (const step of steps) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.command === "fill" &&
      step.command === "fill" &&
      previous.selector === step.selector &&
      previous.value === step.value
    ) {
      previous.sourceActionIds.push(...step.sourceActionIds);
      previous.confidence = "high";
      continue;
    }

    merged.push({
      ...step,
      sourceActionIds: [...step.sourceActionIds]
    });
  }

  return merged;
}

function toScriptLine(step) {
  if (step.command === "goto") {
    return `await page.goto(${quote(step.url)});`;
  }

  if (step.command === "click") {
    return `await page.locator(${quote(step.selector)}).click();`;
  }

  if (step.command === "fill") {
    return `await page.locator(${quote(step.selector)}).fill(${quote(step.value)});`;
  }

  if (step.command === "press") {
    return `await page.keyboard.press(${quote(step.key)});`;
  }

  return `// Unsupported step: ${step.command}`;
}

export function buildPlaywrightBundle(actions = []) {
  const rawLikeSteps = actions
    .map((action) => toRawLikeStep(action))
    .filter(Boolean);
  const executableSteps = mergeExecutableSteps(rawLikeSteps);
  const script = [
    "import { test } from '@playwright/test';",
    "",
    "test('replay exported session', async ({ page }) => {",
    ...executableSteps.map((step) => `  ${toScriptLine(step)}`),
    "});"
  ].join("\n");

  return {
    rawLikeSteps,
    executableSteps,
    script
  };
}
