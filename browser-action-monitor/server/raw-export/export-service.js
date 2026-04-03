import { createZip } from "../agent-export/archive.js";

function getAttachmentExtension(mimeType = "image/jpeg") {
  return mimeType.includes("png") ? "png" : "jpg";
}

function buildExportActions(record, attachmentPathByActionId = new Map()) {
  return (record.actions || []).map((action) => {
    const attachmentPath = attachmentPathByActionId.get(action.id);
    if (!attachmentPath) {
      return action;
    }

    return {
      ...action,
      attachment: {
        ...(action.attachment || {}),
        screenshot: {
          ...(action.attachment?.screenshot || {}),
          exportPath: attachmentPath
        }
      }
    };
  });
}

export function buildRawExportBundle(record, attachmentPathByActionId = new Map()) {
  return {
    ...record.session,
    actions: buildExportActions(record, attachmentPathByActionId)
  };
}

export async function buildRawExportArchive(repository, record) {
  const attachmentEntries = [];
  const attachmentPathByActionId = new Map();

  for (const action of record.actions || []) {
    const screenshot = action.attachment?.screenshot;
    if (!screenshot?.remoteUrl) {
      continue;
    }

    const attachment = await repository.getScreenshotAttachment(record.session.sessionId, action.id);
    if (!attachment?.content) {
      continue;
    }

    const attachmentPath = `attachments/${action.id}.${getAttachmentExtension(attachment.mimeType)}`;
    attachmentPathByActionId.set(action.id, attachmentPath);
    attachmentEntries.push({
      name: attachmentPath,
      content: attachment.content
    });
  }

  return createZip([
    {
      name: "session.json",
      content: JSON.stringify(buildRawExportBundle(record, attachmentPathByActionId), null, 2)
    },
    ...attachmentEntries
  ]);
}
