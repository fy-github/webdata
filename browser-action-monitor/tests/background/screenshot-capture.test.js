import test from "node:test";
import assert from "node:assert/strict";

import {
  captureScreenshotForProfile,
  normalizeCapturedScreenshot
} from "../../src/extension/background/screenshot-capture.js";

test("captureScreenshotForProfile maps the light profile to the expected capture settings", async () => {
  const captureCalls = [];
  const normalizeCalls = [];

  const result = await captureScreenshotForProfile({
    windowId: 7,
    settings: {
      screenshotStorageProfile: "light"
    },
    captureVisibleTabImpl: async (windowId, options) => {
      captureCalls.push({ windowId, options });
      return "data:image/jpeg;base64,raw-light";
    },
    normalizeImageImpl: async (payload) => {
      normalizeCalls.push(payload);
      return {
        dataUrl: "data:image/jpeg;base64,normalized-light",
        mimeType: "image/jpeg",
        width: 1024,
        height: 640,
        sizeBytes: 128
      };
    }
  });

  assert.deepEqual(captureCalls, [
    {
      windowId: 7,
      options: {
        format: "jpeg",
        quality: 55
      }
    }
  ]);
  assert.equal(normalizeCalls[0].maxWidth, 1280);
  assert.equal(normalizeCalls[0].quality, 0.55);
  assert.equal(result.width, 1024);
  assert.equal(result.sizeBytes, 128);
});

test("normalizeCapturedScreenshot rescales oversized captures and reports final dimensions", async () => {
  const drawCalls = [];
  let convertOptions = null;

  const result = await normalizeCapturedScreenshot({
    dataUrl: "data:image/jpeg;base64,raw-forensics",
    mimeType: "image/jpeg",
    quality: 0.86,
    maxWidth: 1920,
    fetchImpl: async () => ({
      blob: async () => ({
        type: "image/jpeg",
        async arrayBuffer() {
          return new Uint8Array([1, 2, 3]).buffer;
        }
      })
    }),
    createImageBitmapImpl: async () => ({
      width: 2400,
      height: 1200,
      close() {}
    }),
    createCanvasImpl: (width, height) => ({
      width,
      height,
      getContext() {
        return {
          drawImage(...args) {
            drawCalls.push(args);
          }
        };
      },
      async convertToBlob(options) {
        convertOptions = options;
        return {
          type: options.type,
          async arrayBuffer() {
            return new Uint8Array([4, 5, 6, 7]).buffer;
          }
        };
      }
    }),
    blobToDataUrlImpl: async () => "data:image/jpeg;base64,resized-forensics"
  });

  assert.equal(drawCalls.length, 1);
  assert.deepEqual(drawCalls[0].slice(1), [0, 0, 1920, 960]);
  assert.deepEqual(convertOptions, {
    type: "image/jpeg",
    quality: 0.86
  });
  assert.equal(result.width, 1920);
  assert.equal(result.height, 960);
  assert.equal(result.dataUrl, "data:image/jpeg;base64,resized-forensics");
  assert.equal(result.sizeBytes > 0, true);
});
