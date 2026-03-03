/**
 * Google Drive operations — list CSVs, read content, move to Processed.
 *
 * Uses service account credentials directly (no impersonation).
 * The watch folder must be shared with the service account email:
 *   ar-review@packouts-assistant-1800.iam.gserviceaccount.com
 */

import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

function buildAuth(saKey) {
  return new google.auth.JWT({
    email: saKey.client_email,
    key: saKey.private_key,
    scopes: SCOPES,
  });
}

/**
 * List CSV files in the watch folder (not in subfolders).
 * Returns oldest first so we process in order.
 */
export async function listCsvFiles(saKey, folderId) {
  const drive = google.drive({ version: "v3", auth: buildAuth(saKey) });

  const res = await drive.files.list({
    q: [
      `'${folderId}' in parents`,
      `trashed = false`,
      `(mimeType = 'text/csv' or mimeType = 'application/vnd.ms-excel' or mimeType = 'application/octet-stream')`,
    ].join(" and "),
    fields: "files(id, name, createdTime, mimeType)",
    orderBy: "createdTime",
    spaces: "drive",
  });

  // Extra safety: only .csv files (some Drive uploads get generic MIME types)
  return (res.data.files || []).filter((f) =>
    f.name.toLowerCase().endsWith(".csv")
  );
}

/**
 * Download CSV file content as a UTF-8 string.
 */
export async function readCsvContent(saKey, fileId) {
  const drive = google.drive({ version: "v3", auth: buildAuth(saKey) });

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );

  return res.data;
}

/**
 * Find or create the "Processed" subfolder inside the watch folder.
 */
export async function getOrCreateProcessedFolder(saKey, parentId) {
  const drive = google.drive({ version: "v3", auth: buildAuth(saKey) });

  const res = await drive.files.list({
    q: `name = 'Processed' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    spaces: "drive",
  });

  if (res.data.files?.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name: "Processed",
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });

  return folder.data.id;
}

/**
 * Move a file from the watch folder to the Processed subfolder.
 */
export async function moveToProcessed(saKey, fileId, watchFolderId, processedFolderId) {
  const drive = google.drive({ version: "v3", auth: buildAuth(saKey) });

  await drive.files.update({
    fileId,
    addParents: processedFolderId,
    removeParents: watchFolderId,
  });
}
