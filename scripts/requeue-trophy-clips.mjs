/**
 * Requeue clip generation jobs for trophy stories that failed or are missing a clip.
 *
 * Usage:
 *   node scripts/requeue-trophy-clips.mjs <raceId> [--dry-run]
 *
 * --dry-run  Lists what would be enqueued without writing anything.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const raceId = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!raceId) {
  console.error("Usage: node scripts/requeue-trophy-clips.mjs <raceId> [--dry-run]");
  process.exit(1);
}

initializeApp({ projectId: "live-copernico" });
const db = getFirestore();

function checkpointRawTimeFromStartTime(startTime) {
  // buildClipRequest uses: startTime = checkpointMs - 20000
  if (!startTime) return null;
  const parsed = Date.parse(startTime);
  return Number.isNaN(parsed) ? null : parsed + 20_000;
}

async function getExistingActiveJob(storyRefPath) {
  const snap = await db.collection("clip_generation_jobs")
    .where("storyRefPath", "==", storyRefPath)
    .where("status", "in", ["queued", "processing"])
    .limit(1)
    .get();
  return !snap.empty;
}

async function run() {
  console.log(`\nRace: ${raceId}${dryRun ? "  [DRY RUN]" : ""}\n`);

  const storiesRef = db.collection("races").doc(raceId).collection("stories");
  let query = storiesRef.where("originType", "==", "automatic_trophy").orderBy("__name__");

  let total = 0, skippedNoStream = 0, skippedHasClip = 0, skippedActiveJob = 0, enqueued = 0;
  let lastDoc = null;
  const PAGE = 100;

  while (true) {
    const snap = await (lastDoc ? query.startAfter(lastDoc).limit(PAGE) : query.limit(PAGE)).get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1];
    total += snap.docs.length;

    for (const doc of snap.docs) {
      const data = doc.data();
      const storyId = doc.id;
      const { appId, eventId, participantId } = data;

      // Already has a working clip
      if (data.clipUrl || data.generationInfo?.status === "completed") {
        skippedHasClip++;
        continue;
      }

      const reqPayload = data.generationInfo?.requestPayload || {};
      const streamId = reqPayload.streamId || null;

      if (!streamId) {
        skippedNoStream++;
        console.log(`  SKIP (no streamId)  ${storyId}`);
        continue;
      }

      const checkpointRawTime = checkpointRawTimeFromStartTime(reqPayload.startTime);
      if (!checkpointRawTime) {
        skippedNoStream++;
        console.log(`  SKIP (no startTime) ${storyId}`);
        continue;
      }

      const storyRefPath = `races/${raceId}/stories/${storyId}`;
      const eventStoryRefPath = `races/${raceId}/apps/${appId}/events/${eventId}/stories/${storyId}`;

      const hasActiveJob = await getExistingActiveJob(storyRefPath);
      if (hasActiveJob) {
        skippedActiveJob++;
        console.log(`  SKIP (job active)   ${storyId}`);
        continue;
      }

      const splitName = data.splitName || data.extraData?.point || "Meta";
      const location = data.extraData?.location || splitName;

      console.log(`  ENQUEUE  ${storyId}  stream=${streamId}  rawTime=${checkpointRawTime}`);

      if (!dryRun) {
        await db.collection("clip_generation_jobs").add({
          raceId,
          appId,
          eventId,
          participantId,
          storyId,
          storyRefPath,
          eventStoryRefPath,
          streamId,
          checkpointRawTime,
          checkpointId: splitName,
          extraData: { point: splitName, location },
          participantData: data.participant || {},
          status: "queued",
          source: "requeue_trophy_clips_script",
          createdAt: FieldValue.serverTimestamp()
        });
      }

      enqueued++;
    }

    if (snap.docs.length < PAGE) break;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total trophy stories scanned : ${total}`);
  console.log(`Already have clip            : ${skippedHasClip}`);
  console.log(`No streamId (can't generate) : ${skippedNoStream}`);
  console.log(`Active job already queued    : ${skippedActiveJob}`);
  console.log(`${dryRun ? "Would enqueue" : "Enqueued"}               : ${enqueued}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
