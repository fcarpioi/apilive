#!/usr/bin/env node

/**
 * Backfill de stories a la nueva colección por evento:
 * races/{raceId}/apps/{appId}/events/{eventId}/stories/{storyId}
 *
 * Uso:
 *   node backfill_event_stories.mjs
 *
 * Opcional (filtrar alcance):
 *   RACE_ID=... APP_ID=... EVENT_ID=... PARTICIPANT_ID=... node backfill_event_stories.mjs
 *
 * Flags:
 *   DRY_RUN=1            -> no escribe, solo simula
 *   BATCH_SIZE=400       -> tamaño de batch (máx 500)
 *   SLEEP_MS=100         -> pausa entre batches
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";

const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = Math.min(parseInt(process.env.BATCH_SIZE || "400", 10), 500);
const SLEEP_MS = parseInt(process.env.SLEEP_MS || "100", 10);

const FILTERS = {
  raceId: process.env.RACE_ID || null,
  appId: process.env.APP_ID || null,
  eventId: process.env.EVENT_ID || null,
  participantId: process.env.PARTICIPANT_ID || null
};

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(readFileSync("./functions/serviceAccountKey.json", "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin inicializado con serviceAccountKey.json");
  } catch (error) {
    admin.initializeApp();
    console.log("✅ Firebase Admin inicializado con credenciales por defecto");
  }
}

const db = admin.firestore();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getDocs = async (ref, name) => {
  const snap = await ref.get();
  console.log(`📥 ${name}: ${snap.size}`);
  return snap.docs;
};

const buildTargetRef = ({ raceId, appId, eventId, storyId }) =>
  db.collection("races").doc(raceId)
    .collection("apps").doc(appId)
    .collection("events").doc(eventId)
    .collection("stories").doc(storyId);

const buildSourceStoriesRef = ({ raceId, appId, eventId, participantId }) =>
  db.collection("races").doc(raceId)
    .collection("apps").doc(appId)
    .collection("events").doc(eventId)
    .collection("participants").doc(participantId)
    .collection("stories");

const main = async () => {
  console.log("🚀 Iniciando backfill de stories por evento");
  console.log(`Dry run: ${DRY_RUN ? "SI" : "NO"}`);
  console.log(`Batch size: ${BATCH_SIZE}  Sleep: ${SLEEP_MS}ms`);
  console.log("Filtros:", FILTERS);

  let totalStories = 0;
  let totalWritten = 0;
  let totalErrors = 0;

  try {
    const raceDocs = FILTERS.raceId
      ? [await db.collection("races").doc(FILTERS.raceId).get()].filter((d) => d.exists)
      : await getDocs(db.collection("races"), "Carreras");

    for (const raceDoc of raceDocs) {
      const raceId = raceDoc.id;
      console.log(`\n🏁 Carrera: ${raceId}`);

      const appsRef = db.collection("races").doc(raceId).collection("apps");
      const appDocs = FILTERS.appId
        ? [await appsRef.doc(FILTERS.appId).get()].filter((d) => d.exists)
        : await getDocs(appsRef, "Apps");

      for (const appDoc of appDocs) {
        const appId = appDoc.id;
        console.log(`  📱 App: ${appId}`);

        const eventsRef = appsRef.doc(appId).collection("events");
        const eventDocs = FILTERS.eventId
          ? [await eventsRef.doc(FILTERS.eventId).get()].filter((d) => d.exists)
          : await getDocs(eventsRef, "Eventos");

        for (const eventDoc of eventDocs) {
          const eventId = eventDoc.id;
          console.log(`    🎯 Evento: ${eventId}`);

          const participantsRef = eventsRef.doc(eventId).collection("participants");
          const participantDocs = FILTERS.participantId
            ? [await participantsRef.doc(FILTERS.participantId).get()].filter((d) => d.exists)
            : await getDocs(participantsRef, "Participantes");

          for (const participantDoc of participantDocs) {
            const participantId = participantDoc.id;
            const participantData = participantDoc.data() || {};

            try {
              const storiesRef = buildSourceStoriesRef({
                raceId,
                appId,
                eventId,
                participantId
              });
              const storiesSnap = await storiesRef.get();
              if (storiesSnap.empty) {
                continue;
              }

              const storyDocs = storiesSnap.docs;
              for (let i = 0; i < storyDocs.length; i += BATCH_SIZE) {
                const batch = db.batch();
                const batchDocs = storyDocs.slice(i, i + BATCH_SIZE);
                let batchWrites = 0;

                for (const storyDoc of batchDocs) {
                  const storyData = storyDoc.data() || {};
                  const storyType = storyData.type || storyData.checkpointInfo?.type || null;

                  const payload = {
                    ...storyData,
                    storyId: storyDoc.id,
                    raceId,
                    appId,
                    eventId,
                    participantId,
                    type: storyType,
                    participant: {
                      id: participantId,
                      externalId: participantData.externalId || null,
                      ...participantData
                    },
                    backfilledAt: admin.firestore.FieldValue.serverTimestamp()
                  };

                  const targetRef = buildTargetRef({
                    raceId,
                    appId,
                    eventId,
                    storyId: storyDoc.id
                  });

                  totalStories += 1;
                  if (!DRY_RUN) {
                    batch.set(targetRef, payload, { merge: true });
                    batchWrites += 1;
                  }
                }

                if (!DRY_RUN && batchWrites > 0) {
                  await batch.commit();
                  totalWritten += batchWrites;
                }

                if (SLEEP_MS > 0) {
                  await sleep(SLEEP_MS);
                }
              }
            } catch (error) {
              totalErrors += 1;
              console.error(`      ❌ Error en participante ${participantId}:`, error.message);
            }
          }
        }
      }
    }
  } catch (error) {
    totalErrors += 1;
    console.error("💥 Error general en backfill:", error);
  }

  console.log("\n📊 REPORTE FINAL");
  console.log("=".repeat(50));
  console.log(`📚 Stories procesadas: ${totalStories}`);
  console.log(`✅ Stories escritas: ${totalWritten}`);
  console.log(`❌ Errores: ${totalErrors}`);
  console.log(`🧪 Dry run: ${DRY_RUN ? "SI" : "NO"}`);
};

main().catch((error) => {
  console.error("❌ Error ejecutando backfill:", error);
  process.exit(1);
});
