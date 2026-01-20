#!/usr/bin/env node

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

function normalizeEventKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getNormalizedFromEvent(eventData, eventId) {
  const baseName =
    eventData?.event_info?.name ||
    eventData?.name ||
    eventData?.eventName ||
    eventId ||
    '';
  return normalizeEventKey(baseName);
}

function parseArgs() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args.set(key, value ?? true);
  }
  return {
    raceId: args.get('raceId') || null,
    appId: args.get('appId') || null,
    includeLegacy: args.get('legacy') !== 'false'
  };
}

async function commitBatch(batch, pending) {
  if (!pending.length) return;
  await batch.commit();
  pending.length = 0;
}

async function backfillEventsInApp(raceId, appId) {
  const eventsSnapshot = await db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('events').get();

  let updated = 0;
  let scanned = 0;
  let batch = db.batch();
  const pending = [];

  for (const eventDoc of eventsSnapshot.docs) {
    scanned += 1;
    const eventData = eventDoc.data() || {};
    const normalized = getNormalizedFromEvent(eventData, eventDoc.id);
    if (eventData.eventNameNormalized === normalized) {
      continue;
    }
    batch.update(eventDoc.ref, { eventNameNormalized: normalized });
    const indexRef = db.collection('races').doc(raceId)
      .collection('eventIndex').doc(normalized);
    batch.set(indexRef, {
      raceId,
      appId,
      eventId: eventDoc.id,
      eventNameNormalized: normalized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    pending.push(eventDoc.id);
    updated += 1;

    if (pending.length >= 450) {
      await commitBatch(batch, pending);
      batch = db.batch();
    }
  }

  await commitBatch(batch, pending);
  return { scanned, updated };
}

async function backfillLegacyEvents(raceId) {
  const eventsSnapshot = await db.collection('races').doc(raceId)
    .collection('events').get();

  let updated = 0;
  let scanned = 0;
  let batch = db.batch();
  const pending = [];

  for (const eventDoc of eventsSnapshot.docs) {
    scanned += 1;
    const eventData = eventDoc.data() || {};
    const normalized = getNormalizedFromEvent(eventData, eventDoc.id);
    if (eventData.eventNameNormalized === normalized) {
      continue;
    }
    batch.update(eventDoc.ref, { eventNameNormalized: normalized });
    const indexRef = db.collection('races').doc(raceId)
      .collection('eventIndex').doc(normalized);
    batch.set(indexRef, {
      raceId,
      appId: null,
      eventId: eventDoc.id,
      eventNameNormalized: normalized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    pending.push(eventDoc.id);
    updated += 1;

    if (pending.length >= 450) {
      await commitBatch(batch, pending);
      batch = db.batch();
    }
  }

  await commitBatch(batch, pending);
  return { scanned, updated };
}

async function main() {
  const { raceId, appId, includeLegacy } = parseArgs();
  console.log('🚀 Backfill eventNameNormalized');
  console.log(`- raceId: ${raceId || 'ALL'}`);
  console.log(`- appId: ${appId || 'ALL'}`);
  console.log(`- includeLegacy: ${includeLegacy}`);

  let totalScanned = 0;
  let totalUpdated = 0;

  const racesSnapshot = raceId
    ? await db.collection('races').doc(raceId).get().then(doc => (doc.exists ? [doc] : []))
    : await db.collection('races').get().then(s => s.docs);

  for (const raceDoc of racesSnapshot) {
    const currentRaceId = raceDoc.id;
    console.log(`\n🏁 Race: ${currentRaceId}`);

    if (appId) {
      const { scanned, updated } = await backfillEventsInApp(currentRaceId, appId);
      totalScanned += scanned;
      totalUpdated += updated;
      console.log(`  📦 App ${appId} events scanned: ${scanned}, updated: ${updated}`);
    } else {
      const appsSnapshot = await db.collection('races').doc(currentRaceId)
        .collection('apps').get();

      for (const appDoc of appsSnapshot.docs) {
        const { scanned, updated } = await backfillEventsInApp(currentRaceId, appDoc.id);
        totalScanned += scanned;
        totalUpdated += updated;
        console.log(`  📦 App ${appDoc.id} events scanned: ${scanned}, updated: ${updated}`);
      }
    }

    if (includeLegacy) {
      const { scanned, updated } = await backfillLegacyEvents(currentRaceId);
      totalScanned += scanned;
      totalUpdated += updated;
      if (scanned > 0) {
        console.log(`  🧭 Legacy events scanned: ${scanned}, updated: ${updated}`);
      }
    }
  }

  console.log('\n✅ Backfill completado');
  console.log(`- Total events scanned: ${totalScanned}`);
  console.log(`- Total events updated: ${totalUpdated}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('💥 Error:', err);
    process.exit(1);
  });
}
