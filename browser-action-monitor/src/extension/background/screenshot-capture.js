import { resolveScreenshotStorageProfile } from "./screenshot-policy.js";

function estimateBytes(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function defaultCanvasFactory(width, height) {
  if (typeof OffscreenCanvas !== "function") {
    throw new Error("offscreen_canvas_unavailable");
  }

  return new OffscreenCanvas(width, height);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export async function normalizeCapturedScreenshot({
  dataUrl,
  mimeType = "image/jpeg",
  quality = 0.72,
  maxWidth = 1600,
  fetchImpl = globalThis.fetch,
  createImageBitmapImpl = globalThis.createImageBitmap,
  createCanvasImpl = defaultCanvasFactory,
  blobToDataUrlImpl = blobToDataUrl
}) {
  const fallback = {
    dataUrl,
    mimeType,
    width: 0,
    height: 0,
    sizeBytes: estimateBytes(dataUrl)
  };

  if (
    typeof fetchImpl !== "function"
    || typeof createImageBitmapImpl !== "function"
    || typeof createCanvasImpl !== "function"
    || typeof blobToDataUrlImpl !== "function"
  ) {
    return fallback;
  }

  try {
    const response = await fetchImpl(dataUrl);
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmapImpl(sourceBlob);
    const width = Number(bitmap.width) || 0;
    const height = Number(bitmap.height) || 0;
    const scale = maxWidth > 0 && width > maxWidth ? maxWidth / width : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = createCanvasImpl(targetWidth, targetHeight);
    const context = canvas.getContext("2d");

    if (!context?.drawImage || typeof canvas.convertToBlob !== "function") {
      bitmap.close?.();
      return {
        ...fallback,
        width,
        height
      };
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const outputBlob = await canvas.convertToBlob({
      type: mimeType,
      quality
    });
    const normalizedDataUrl = await blobToDataUrlImpl(outputBlob);

    bitmap.close?.();

    return {
      dataUrl: normalizedDataUrl,
      mimeType: outputBlob.type || mimeType,
      width: targetWidth,
      height: targetHeight,
      sizeBytes: estimateBytes(normalizedDataUrl)
    };
  } catch {
    return fallback;
  }
}

export async function captureScreenshotForProfile({
  windowId,
  settings = {},
  captureVisibleTabImpl,
  normalizeImageImpl = normalizeCapturedScreenshot
}) {
  if (typeof captureVisibleTabImpl !== "function") {
    throw new Error("missing_capture_visible_tab_impl");
  }

  const profile = resolveScreenshotStorageProfile(settings);
  const dataUrl = await captureVisibleTabImpl(windowId, {
    format: "jpeg",
    quality: Math.round(profile.jpegQuality * 100)
  });

  return normalizeImageImpl({
    dataUrl,
    mimeType: "image/jpeg",
    quality: profile.jpegQuality,
    maxWidth: profile.maxWidth
  });
}
