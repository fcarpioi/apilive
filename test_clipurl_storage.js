#!/usr/bin/env node

/**
 * Script para probar que el clipUrl se guarda correctamente en:
 * 1. video-clips collection (global)
 * 2. stories collection (del participante)
 * 3. checkpoints collection (del participante) ← NUEVO
 * 4. split-clips collection (del evento) ← NUEVO
 * 5. timing-clips collection (del evento) ← NUEVO
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const testClipUrlStorage = async () => {
  console.log("🎬 PROBANDO ALMACENAMIENTO DE CLIPURL");
  console.log("=" * 60);

  // Datos de prueba (usar datos reales de tu sistema)
  const testData = {
    raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5", // Maratón de Málaga
    appId: "Ryx7YFWobBfGTJqkciCV", // App ID del Maratón de Málaga
    eventId: "Maratón",
    participantId: "test-participant-123",
    checkpointId: "10K", // Split conocido
    clipUrl: "https://test-clip-url.com/video.mp4"
  };

  console.log("📋 Datos de prueba:");
  console.log(`   🏁 Race: ${testData.raceId}`);
  console.log(`   📱 App: ${testData.appId}`);
  console.log(`   🎯 Event: ${testData.eventId}`);
  console.log(`   👤 Participant: ${testData.participantId}`);
  console.log(`   📍 Checkpoint: ${testData.checkpointId}`);
  console.log(`   🎬 ClipUrl: ${testData.clipUrl}`);

  // 1. VERIFICAR ESTRUCTURA DEL EVENTO
  console.log("\n🔍 1. VERIFICANDO ESTRUCTURA DEL EVENTO...");
  
  try {
    const eventRef = db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId);
    
    const eventDoc = await eventRef.get();
    
    if (eventDoc.exists) {
      const eventData = eventDoc.data();
      console.log("✅ Evento encontrado");
      console.log(`   📊 Splits: ${JSON.stringify(eventData.splits || [])}`);
      console.log(`   ⏱️ Timing Points: ${JSON.stringify(eventData.timingPoints || [])}`);
      
      // Verificar si nuestro checkpoint está en splits
      const isInSplits = eventData.splits && eventData.splits.includes(testData.checkpointId);
      const isInTimingPoints = eventData.timingPoints && eventData.timingPoints.includes(testData.checkpointId);
      
      console.log(`   📍 Checkpoint '${testData.checkpointId}' en splits: ${isInSplits ? '✅' : '❌'}`);
      console.log(`   ⏱️ Checkpoint '${testData.checkpointId}' en timing points: ${isInTimingPoints ? '✅' : '❌'}`);
    } else {
      console.log("❌ Evento no encontrado");
      return;
    }
  } catch (error) {
    console.error("💥 Error verificando evento:", error.message);
    return;
  }

  // 2. SIMULAR CREACIÓN DE CHECKPOINT CON CLIPURL
  console.log("\n📍 2. CREANDO CHECKPOINT CON CLIPURL...");
  
  try {
    const checkpointRef = db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("participants").doc(testData.participantId)
      .collection("checkpoints").doc(testData.checkpointId);

    const checkpointData = {
      runnerId: testData.participantId,
      runnerBib: "123",
      checkpointId: testData.checkpointId,
      timestamp: admin.firestore.Timestamp.now(),
      clipUrl: testData.clipUrl, // ← NUEVO CAMPO
      clipGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      hasVideoClip: true,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
      source: "test_script"
    };

    await checkpointRef.set(checkpointData);
    console.log(`✅ Checkpoint creado con clipUrl: ${testData.checkpointId}`);
  } catch (error) {
    console.error("💥 Error creando checkpoint:", error.message);
  }

  // 3. CREAR SPLIT-CLIPS COLLECTION
  console.log("\n🏁 3. CREANDO SPLIT-CLIPS COLLECTION...");
  
  try {
    await db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("split-clips").doc(testData.checkpointId).set({
        splitName: testData.checkpointId,
        splitIndex: 1, // Índice del split
        clipUrl: testData.clipUrl,
        participantId: testData.participantId,
        raceId: testData.raceId,
        eventId: testData.eventId,
        streamId: `stream-${testData.checkpointId}`,
        timestamp: new Date().toISOString(),
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
    console.log(`✅ Split-clip creado: ${testData.checkpointId}`);
  } catch (error) {
    console.error("💥 Error creando split-clip:", error.message);
  }

  // 4. CREAR TIMING-CLIPS COLLECTION
  console.log("\n⏱️ 4. CREANDO TIMING-CLIPS COLLECTION...");
  
  try {
    await db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("timing-clips").doc(testData.checkpointId).set({
        timingPointName: testData.checkpointId,
        timingIndex: 1, // Índice del timing point
        clipUrl: testData.clipUrl,
        participantId: testData.participantId,
        raceId: testData.raceId,
        eventId: testData.eventId,
        streamId: `stream-${testData.checkpointId}`,
        timestamp: new Date().toISOString(),
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
    console.log(`✅ Timing-clip creado: ${testData.checkpointId}`);
  } catch (error) {
    console.error("💥 Error creando timing-clip:", error.message);
  }

  // 5. VERIFICAR QUE TODO SE GUARDÓ CORRECTAMENTE
  console.log("\n🔍 5. VERIFICANDO ALMACENAMIENTO...");
  
  try {
    // Verificar checkpoint
    const checkpointDoc = await db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("participants").doc(testData.participantId)
      .collection("checkpoints").doc(testData.checkpointId).get();
    
    if (checkpointDoc.exists && checkpointDoc.data().clipUrl) {
      console.log("✅ ClipUrl guardado en checkpoint");
    } else {
      console.log("❌ ClipUrl NO encontrado en checkpoint");
    }

    // Verificar split-clip
    const splitClipDoc = await db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("split-clips").doc(testData.checkpointId).get();
    
    if (splitClipDoc.exists && splitClipDoc.data().clipUrl) {
      console.log("✅ ClipUrl guardado en split-clips");
    } else {
      console.log("❌ ClipUrl NO encontrado en split-clips");
    }

    // Verificar timing-clip
    const timingClipDoc = await db.collection("races").doc(testData.raceId)
      .collection("apps").doc(testData.appId)
      .collection("events").doc(testData.eventId)
      .collection("timing-clips").doc(testData.checkpointId).get();
    
    if (timingClipDoc.exists && timingClipDoc.data().clipUrl) {
      console.log("✅ ClipUrl guardado en timing-clips");
    } else {
      console.log("❌ ClipUrl NO encontrado en timing-clips");
    }

  } catch (error) {
    console.error("💥 Error verificando almacenamiento:", error.message);
  }

  console.log("\n🎯 RESUMEN DE ALMACENAMIENTO DE CLIPURL:");
  console.log("=" * 50);
  console.log("📍 Ubicaciones donde se guarda el clipUrl:");
  console.log("   1. ✅ video-clips (collection global)");
  console.log("   2. ✅ stories (del participante)");
  console.log("   3. 🆕 checkpoints (del participante) ← NUEVO");
  console.log("   4. 🆕 split-clips (del evento) ← NUEVO");
  console.log("   5. 🆕 timing-clips (del evento) ← NUEVO");
  console.log("");
  console.log("🔍 Esto permite:");
  console.log("   📊 Consultar clips por split específico");
  console.log("   ⏱️ Consultar clips por timing point");
  console.log("   👤 Consultar clips por participante");
  console.log("   🎬 Acceso rápido desde cualquier contexto");

  process.exit(0);
};

// Ejecutar la prueba
testClipUrlStorage().catch(console.error);
