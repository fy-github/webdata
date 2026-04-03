export const CONTENT_SCRIPT_FILES = [
  "src/extension/content/runtime-messaging.js",
  "content.js"
];

export function isInjectableTabUrl(url = "") {
  return /^(https?:|file:)/i.test(String(url || ""));
}

export function getInjectableTabs(tabs = []) {
  return tabs.filter((tab) => Number.isInteger(tab?.id) && isInjectableTabUrl(tab?.url));
}

export async function bootstrapExistingTabs({
  tabsApi,
  scriptingApi,
  files = CONTENT_SCRIPT_FILES,
  onError = () => {}
}) {
  const tabs = await tabsApi.query({});
  const injectedTabIds = [];

  for (const tab of getInjectableTabs(tabs)) {
    try {
      await scriptingApi.executeScript({
        target: {
          tabId: tab.id
        },
        files
      });
      injectedTabIds.push(tab.id);
    } catch (error) {
      onError(error, tab);
    }
  }

  return {
    scannedCount: tabs.length,
    injectedTabIds
  };
}
