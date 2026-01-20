import { onDocumentWritten } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

function normalizeEventKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function ensureNormalizedField(event, eventId) {
  const doc = event.data?.after;
  if (!doc || !doc.exists) {
    return;
  }

  const data = doc.data() || {};
  const baseName =
    data.event_info?.name ||
    data.name ||
    data.eventName ||
    eventId ||
    "";
  const normalized = normalizeEventKey(baseName);

  const updates = {};
  if (data.eventNameNormalized !== normalized) {
    updates.eventNameNormalized = normalized;
  }

  if (Object.keys(updates).length > 0) {
    await doc.ref.update(updates);
  }

  const path = doc.ref.path;
  const raceMatch = path.match(/races\/([^/]+)/);
  if (!raceMatch) {
    return;
  }
  const raceId = raceMatch[1];
  const appMatch = path.match(/apps\/([^/]+)/);
  const appId = appMatch ? appMatch[1] : null;

  const indexRef = admin.firestore()
    .collection('races')
    .doc(raceId)
    .collection('eventIndex')
    .doc(normalized);

  await indexRef.set({
    raceId,
    appId,
    eventId,
    eventNameNormalized: normalized,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

export const onEventWritten = onDocumentWritten(
  "races/{raceId}/apps/{appId}/events/{eventId}",
  async (event) => {
    await ensureNormalizedField(event, event.params.eventId);
  }
);

export const onLegacyEventWritten = onDocumentWritten(
  "races/{raceId}/events/{eventId}",
  async (event) => {
    await ensureNormalizedField(event, event.params.eventId);
  }
);
