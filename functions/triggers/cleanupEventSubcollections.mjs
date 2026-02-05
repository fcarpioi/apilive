import { onSchedule } from "firebase-functions/v2/scheduler";
import { firestore } from "../config/firebaseConfig.mjs";

const RACE_ID = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
const APP_ID = "Ryx7YFWobBfGTJqkciCV";
const EVENT_IDS = ["Maratón", "Medio Maratón"];
const CLEANUP_ENABLED = process.env.CLEANUP_EVENT_COPERNICO === "true";
const CONFIG_DOC_PATH = { collection: "config", doc: "cleanup" };

async function cleanupEventSubcollections(eventId) {
  const eventRef = firestore
    .collection("races").doc(RACE_ID)
    .collection("apps").doc(APP_ID)
    .collection("events").doc(eventId);

  const storiesRef = eventRef.collection("stories");
  const participantsRef = eventRef.collection("participants");

  await firestore.recursiveDelete(storiesRef);
  await firestore.recursiveDelete(participantsRef);
}

export const cleanupEventSubcollectionsDaily = onSchedule(
  { schedule: "0 6 * * *", timeZone: "Europe/Madrid" },
  async () => {
    let enabled = CLEANUP_ENABLED;
    let eventIds = EVENT_IDS;

    try {
      const configSnap = await firestore
        .collection(CONFIG_DOC_PATH.collection)
        .doc(CONFIG_DOC_PATH.doc)
        .get();
      if (configSnap.exists) {
        const configData = configSnap.data() || {};
        if (typeof configData.enabled === "boolean") {
          enabled = configData.enabled;
        }
        if (Array.isArray(configData.eventIds) && configData.eventIds.length > 0) {
          eventIds = configData.eventIds;
        }
      }
    } catch (configError) {
      console.error("⚠️ Error leyendo config/cleanup:", configError.message);
    }

    if (!enabled) {
      console.log("🧹 Limpieza diaria desactivada por config/cleanup.");
      return;
    }
    console.log("🧹 Limpieza diaria activada: eliminando stories y participants.");
    for (const eventId of eventIds) {
      await cleanupEventSubcollections(eventId);
      console.log(`✅ Limpieza completada para evento: ${eventId}`);
    }
  }
);
