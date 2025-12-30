#!/usr/bin/env node

/**
 * 🏁 EJEMPLOS DE CONSULTAS DE CLIPS POR SPLITS
 * 
 * Este script muestra diferentes formas de consultar clips organizados por splits
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Datos de ejemplo (ajusta según tu carrera)
const RACE_ID = "69200553-464c-4bfd-9b35-4ca6ac1f17f5"; // Maratón de Málaga
const APP_ID = "Ryx7YFWobBfGTJqkciCV"; // App ID del Maratón de Málaga
const EVENT_ID = "Maratón";

/**
 * 🎯 1. CONSULTAR CLIPS DE UN SPLIT ESPECÍFICO
 */
async function getClipsBySplit(raceId, eventId, splitName, appId = null) {
  console.log(`🏁 Consultando clips del split: ${splitName}`);
  
  try {
    let splitClipsRef;
    
    if (appId) {
      // Estructura nueva: /races/{raceId}/apps/{appId}/events/{eventId}/split-clips
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      // Estructura antigua: /races/{raceId}/events/{eventId}/split-clips
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    const snapshot = await splitClipsRef
      .where("splitName", "==", splitName)
      .orderBy("generatedAt", "desc")
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips para el split: ${splitName}`);
      return [];
    }
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        splitName: data.splitName,
        splitIndex: data.splitIndex,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    console.log(`✅ Encontrados ${clips.length} clips para el split: ${splitName}`);
    return clips;
    
  } catch (error) {
    console.error(`💥 Error consultando clips del split ${splitName}:`, error.message);
    return [];
  }
}

/**
 * 🎯 2. CONSULTAR TODOS LOS SPLITS CON CLIPS
 */
async function getAllSplitsWithClips(raceId, eventId, appId = null) {
  console.log(`📊 Consultando todos los splits con clips...`);
  
  try {
    let splitClipsRef;
    
    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    const snapshot = await splitClipsRef
      .orderBy("splitIndex", "asc")
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips en ningún split`);
      return {};
    }
    
    const splitGroups = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      
      if (!splitGroups[splitName]) {
        splitGroups[splitName] = {
          splitName: splitName,
          splitIndex: data.splitIndex,
          clips: []
        };
      }
      
      splitGroups[splitName].clips.push({
        id: doc.id,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    console.log(`✅ Encontrados clips en ${Object.keys(splitGroups).length} splits diferentes`);
    return splitGroups;
    
  } catch (error) {
    console.error(`💥 Error consultando splits con clips:`, error.message);
    return {};
  }
}

/**
 * 🎯 3. CONSULTAR CLIPS DE UN PARTICIPANTE EN TODOS LOS SPLITS
 */
async function getParticipantClipsInAllSplits(raceId, eventId, participantId, appId = null) {
  console.log(`👤 Consultando clips del participante ${participantId} en todos los splits...`);
  
  try {
    let splitClipsRef;
    
    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .orderBy("splitIndex", "asc")
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips para el participante: ${participantId}`);
      return [];
    }
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        splitName: data.splitName,
        splitIndex: data.splitIndex,
        clipUrl: data.clipUrl,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    console.log(`✅ Encontrados ${clips.length} clips del participante en diferentes splits`);
    return clips;
    
  } catch (error) {
    console.error(`💥 Error consultando clips del participante:`, error.message);
    return [];
  }
}

/**
 * 🎯 4. CONSULTAR CLIPS POR RANGO DE SPLITS
 */
async function getClipsByIndexRange(raceId, eventId, startIndex, endIndex, appId = null) {
  console.log(`📍 Consultando clips entre splits ${startIndex} y ${endIndex}...`);
  
  try {
    let splitClipsRef;
    
    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    const snapshot = await splitClipsRef
      .where("splitIndex", ">=", startIndex)
      .where("splitIndex", "<=", endIndex)
      .orderBy("splitIndex", "asc")
      .orderBy("generatedAt", "desc")
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips en el rango de splits ${startIndex}-${endIndex}`);
      return [];
    }
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        splitName: data.splitName,
        splitIndex: data.splitIndex,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    console.log(`✅ Encontrados ${clips.length} clips en el rango de splits`);
    return clips;
    
  } catch (error) {
    console.error(`💥 Error consultando clips por rango:`, error.message);
    return [];
  }
}

/**
 * 🎯 5. CONSULTAR SPLITS QUE TIENEN CLIPS DE UN PARTICIPANTE ESPECÍFICO
 */
async function getSplitsWithClipsForParticipant(raceId, eventId, participantId, appId = null) {
  console.log(`🎯 Consultando splits con clips del participante: ${participantId}`);

  try {
    let splitClipsRef;

    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }

    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .orderBy("splitIndex", "asc")
      .get();

    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips para el participante: ${participantId}`);
      return [];
    }

    const splitsWithClips = [];
    const uniqueSplits = new Map(); // Para evitar duplicados

    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;

      if (!uniqueSplits.has(splitName)) {
        uniqueSplits.set(splitName, {
          splitName: splitName,
          splitIndex: data.splitIndex,
          clipCount: 1,
          clips: [{
            id: doc.id,
            clipUrl: data.clipUrl,
            timestamp: data.timestamp,
            generatedAt: data.generatedAt?.toDate()
          }]
        });
      } else {
        // Si ya existe el split, agregar el clip adicional
        const existingSplit = uniqueSplits.get(splitName);
        existingSplit.clipCount++;
        existingSplit.clips.push({
          id: doc.id,
          clipUrl: data.clipUrl,
          timestamp: data.timestamp,
          generatedAt: data.generatedAt?.toDate()
        });
      }
    });

    // Convertir Map a Array y ordenar por splitIndex
    splitsWithClips.push(...Array.from(uniqueSplits.values()));
    splitsWithClips.sort((a, b) => a.splitIndex - b.splitIndex);

    console.log(`✅ Participante ${participantId} tiene clips en ${splitsWithClips.length} splits diferentes:`);
    splitsWithClips.forEach(split => {
      console.log(`   🏁 ${split.splitName} (índice ${split.splitIndex}): ${split.clipCount} clip(s)`);
    });

    return splitsWithClips;

  } catch (error) {
    console.error(`💥 Error consultando splits del participante:`, error.message);
    return [];
  }
}

/**
 * 🎯 6. VERSIÓN SIMPLIFICADA - SOLO NOMBRES DE SPLITS
 */
async function getSplitNamesWithClipsForParticipant(raceId, eventId, participantId, appId = null) {
  console.log(`📋 Obteniendo lista simple de splits con clips para: ${participantId}`);

  try {
    let splitClipsRef;

    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }

    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .get();

    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips para el participante: ${participantId}`);
      return [];
    }

    const splitNames = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      splitNames.add(data.splitName);
    });

    const splitList = Array.from(splitNames).sort();
    console.log(`✅ Splits con clips: [${splitList.join(', ')}]`);

    return splitList;

  } catch (error) {
    console.error(`💥 Error obteniendo splits:`, error.message);
    return [];
  }
}

/**
 * 🎯 FUNCIÓN PRINCIPAL - EJECUTAR EJEMPLOS
 */
async function runExamples() {
  console.log("🏁 EJEMPLOS DE CONSULTAS DE CLIPS POR SPLITS");
  console.log("=" * 60);
  
  // Ejemplo 1: Clips de un split específico
  console.log("\n📍 1. CLIPS DEL SPLIT '10K':");
  const clips10K = await getClipsBySplit(RACE_ID, EVENT_ID, "10K", APP_ID);
  clips10K.forEach(clip => {
    console.log(`   🎬 ${clip.participantId}: ${clip.clipUrl}`);
  });
  
  // Ejemplo 2: Todos los splits con clips
  console.log("\n📊 2. TODOS LOS SPLITS CON CLIPS:");
  const allSplits = await getAllSplitsWithClips(RACE_ID, EVENT_ID, APP_ID);
  Object.values(allSplits).forEach(split => {
    console.log(`   🏁 ${split.splitName} (índice ${split.splitIndex}): ${split.clips.length} clips`);
  });
  
  // Ejemplo 3: Clips de un participante en todos los splits
  console.log("\n👤 3. CLIPS DE UN PARTICIPANTE EN TODOS LOS SPLITS:");
  const participantClips = await getParticipantClipsInAllSplits(RACE_ID, EVENT_ID, "test-participant-123", APP_ID);
  participantClips.forEach(clip => {
    console.log(`   📍 ${clip.splitName}: ${clip.clipUrl}`);
  });
  
  // Ejemplo 4: Clips por rango de splits
  console.log("\n📍 4. CLIPS EN SPLITS 0-2:");
  const rangeClips = await getClipsByIndexRange(RACE_ID, EVENT_ID, 0, 2, APP_ID);
  rangeClips.forEach(clip => {
    console.log(`   🎬 Split ${clip.splitIndex} (${clip.splitName}): ${clip.participantId}`);
  });

  // Ejemplo 5: Splits con clips de un participante específico
  console.log("\n🎯 5. SPLITS CON CLIPS DEL PARTICIPANTE 'test-participant-123':");
  const participantSplits = await getSplitsWithClipsForParticipant(RACE_ID, EVENT_ID, "test-participant-123", APP_ID);
  participantSplits.forEach(split => {
    console.log(`   🏁 ${split.splitName} (índice ${split.splitIndex}): ${split.clipCount} clip(s)`);
    split.clips.forEach(clip => {
      console.log(`      🎬 ${clip.clipUrl}`);
    });
  });

  // Ejemplo 6: Lista simple de splits con clips
  console.log("\n📋 6. LISTA SIMPLE DE SPLITS CON CLIPS:");
  const splitNames = await getSplitNamesWithClipsForParticipant(RACE_ID, EVENT_ID, "test-participant-123", APP_ID);
  console.log(`   📍 Splits: [${splitNames.join(', ')}]`);

  console.log("\n✅ EJEMPLOS COMPLETADOS");
  process.exit(0);
}

// Ejecutar ejemplos
runExamples().catch(console.error);
