import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clearFeedbackBar, updateFeedbackBar } from "../../server/public/dashboard-feedback.js";

test("dashboard shell includes a live feedback region for button operations", async () => {
  const html = await readFile(new URL("../../server/views/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /id="feedbackBar"/);
  assert.match(html, /aria-live="polite"/);
});

test("dashboard shell reserves structure for a scrollable table and sticky detail drawer", async () => {
  const html = await readFile(new URL("../../server/views/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /class="table-scroll"/);
  assert.match(html, /class="sessions-table"/);
  assert.match(html, /<colgroup>/);
  assert.match(html, /class="drawer-scroll"/);
});

test("dashboard shell exposes agent export controls for single and bulk workflows", async () => {
  const html = await readFile(new URL("../../server/views/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /id="exportFormatSelect"/);
  assert.match(html, /Agent JSON/);
  assert.match(html, /Agent ZIP/);
  assert.match(html, /id="batchExportFormatSelect"/);
});

test("dashboard styles include pressed and pending button feedback", async () => {
  const css = await readFile(new URL("../../server/public/dashboard.css", import.meta.url), "utf8");

  assert.match(css, /button:active/);
  assert.match(css, /\.is-busy/);
  assert.match(css, /\.feedback/);
});

test("dashboard styles keep the two-column layout stable under long session content", async () => {
  const css = await readFile(new URL("../../server/public/dashboard.css", import.meta.url), "utf8");

  assert.match(css, /\.layout[\s\S]*align-items:\s*start/);
  assert.match(css, /\.table-scroll[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.sessions-table[\s\S]*table-layout:\s*fixed/);
  assert.match(css, /\.drawer[\s\S]*position:\s*sticky/);
  assert.match(css, /\.drawer-scroll[\s\S]*overflow:\s*auto/);
  assert.match(css, /\.session-url[\s\S]*text-overflow:\s*ellipsis/);
});

test("dashboard feedback helpers tolerate a missing feedback region", () => {
  assert.doesNotThrow(() => updateFeedbackBar(null, "正在刷新", "busy"));
  assert.doesNotThrow(() => clearFeedbackBar(null));

  const feedbackBar = {
    textContent: "",
    className: "feedback hidden"
  };

  updateFeedbackBar(feedbackBar, "刷新成功", "success");
  assert.equal(feedbackBar.textContent, "刷新成功");
  assert.equal(feedbackBar.className, "feedback is-success");

  clearFeedbackBar(feedbackBar);
  assert.equal(feedbackBar.textContent, "");
  assert.equal(feedbackBar.className, "feedback hidden");
});

test("dashboard session renderer includes dense cell wrappers for long values", async () => {
  const script = await readFile(new URL("../../server/public/dashboard.js", import.meta.url), "utf8");

  assert.match(script, /session-id-text/);
  assert.match(script, /session-url/);
  assert.match(script, /session-time/);
  assert.match(script, /session-count/);
});

test("dashboard client includes agent export request paths", async () => {
  const script = await readFile(new URL("../../server/public/dashboard.js", import.meta.url), "utf8");

  assert.match(script, /buildSessionExportUrl/);
  assert.match(script, /"agent"/);
  assert.match(script, /\/api\/sessions\/bulk\/export-agent/);
});

test("dashboard shell exposes auth config for protected api mode", async () => {
  const html = await readFile(new URL("../../server/views/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /authMode:/);
  assert.match(html, /apiKey:/);
});

test("dashboard client can attach api key headers to protected requests", async () => {
  const script = await readFile(new URL("../../server/public/dashboard.js", import.meta.url), "utf8");

  assert.match(script, /X-API-Key/);
  assert.match(script, /Authorization/);
  assert.match(script, /window\.DASHBOARD_CONFIG/);
});

test("dashboard shell exposes attachment summary and preview regions", async () => {
  const html = await readFile(new URL("../../server/views/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /id="attachmentSummary"/);
  assert.match(html, /id="attachmentPreview"/);
  assert.match(html, /id="attachmentPreviewEmpty"/);
});

test("dashboard client renders attachment indicators and preview requests", async () => {
  const script = await readFile(new URL("../../server/public/dashboard.js", import.meta.url), "utf8");

  assert.match(script, /attachmentSummary/);
  assert.match(script, /attachmentPreview/);
  assert.match(script, /remoteStatus|failed_privacy_guard|attachment/);
});
