import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("records page exposes attachment column and preview regions", async () => {
  const html = await readFile(new URL("../../records.html", import.meta.url), "utf8");

  assert.match(html, /附件/);
  assert.match(html, /id="attachmentSummary"/);
  assert.match(html, /id="attachmentPreview"/);
});

test("records client renders attachment badges and loads attachment previews", async () => {
  const script = await readFile(new URL("../../src/ui/records.js", import.meta.url), "utf8");

  assert.match(script, /attachmentSummary/);
  assert.match(script, /attachmentPreview/);
  assert.match(script, /getActionAttachmentPreview/);
});
