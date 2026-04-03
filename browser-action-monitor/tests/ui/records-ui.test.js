import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("records workbench shell exposes richer filter controls", async () => {
  const html = await readFile(new URL("../../records.html", import.meta.url), "utf8");

  assert.match(html, /id="sessionFilter"/);
  assert.match(html, /id="typeFilter"/);
  assert.match(html, /id="syncStatusFilter"/);
  assert.match(html, /id="dateFromFilter"/);
  assert.match(html, /id="dateToFilter"/);
  assert.match(html, /id="keywordFilter"/);
  assert.match(html, /id="refreshBtn"/);
  assert.match(html, /id="resetBtn"/);
});

test("records workbench shell includes summary and split workbench structure", async () => {
  const html = await readFile(new URL("../../records.html", import.meta.url), "utf8");

  assert.match(html, /id="summaryBar"/);
  assert.match(html, /id="summaryTotal"/);
  assert.match(html, /id="recordsBody"/);
  assert.match(html, /id="recordDetail"/);
  assert.match(html, /class="layout"/);
});

test("records workbench styles allow filter controls to shrink without overlapping", async () => {
  const html = await readFile(new URL("../../records.html", import.meta.url), "utf8");

  assert.match(html, /\.filters\s*>\s*\*\s*\{[\s\S]*min-width:\s*0/);
  assert.match(html, /\.filters label\s*\{[\s\S]*min-width:\s*0/);
  assert.match(html, /\.filters[\s\S]*select[\s\S]*width:\s*100%/);
  assert.match(html, /\.filters[\s\S]*select[\s\S]*min-width:\s*0/);
});

test("records client includes reset and keyword debounce hooks", async () => {
  const script = await readFile(new URL("../../src/ui/records.js", import.meta.url), "utf8");

  assert.match(script, /syncStatusFilter/);
  assert.match(script, /keywordFilter/);
  assert.match(script, /resetBtn/);
  assert.match(script, /summaryBar|summaryTotal/);
  assert.match(script, /setTimeout/);
  assert.match(script, /clearTimeout/);
});
