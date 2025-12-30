#!/usr/bin/env node

/**
 * 🎯 CONSULTAR SPLITS QUE TIENEN CLIPS DE UN PARTICIPANTE ESPECÍFICO
 * 
 * Este script muestra cómo obtener todos los splits donde un participante tiene clips
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * 🎯 FUNCIÓN PRINCIPAL: Obtener splits con clips de un participante
 */
async function getSplitsWithClipsForParticipant(raceId, eventId, participantId, appId = null) {
  console.log(`🎯 Consultando splits con clips del participante: ${participantId}`);
  console.log(`📍 Race: ${raceId}`);
  console.log(`🎯 Event: ${eventId}`);
  if (appId) console.log(`📱 App: ${appId}`);
  
  try {
    // Construir referencia según estructura
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
    
    // Consultar clips del participante
    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .orderBy("splitIndex", "asc")
      .get();
    
    if (snapshot.empty) {
      console.log(`❌ No se encontraron clips para el participante: ${participantId}`);
      return {
        participantId: participantId,
        totalSplits: 0,
        totalClips: 0,
        splits: []
      };
    }
    
    // Procesar resultados y agrupar por split
    const splitsMap = new Map();
    let totalClips = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      totalClips++;
      
      if (!splitsMap.has(splitName)) {
        splitsMap.set(splitName, {
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
        // Agregar clip adicional al split existente
        const existingSplit = splitsMap.get(splitName);
        existingSplit.clipCount++;
        existingSplit.clips.push({
          id: doc.id,
          clipUrl: data.clipUrl,
          timestamp: data.timestamp,
          generatedAt: data.generatedAt?.toDate()
        });
      }
    });
    
    // Convertir a array y ordenar por índice de split
    const splits = Array.from(splitsMap.values())
      .sort((a, b) => a.splitIndex - b.splitIndex);
    
    const result = {
      participantId: participantId,
      totalSplits: splits.length,
      totalClips: totalClips,
      splits: splits
    };
    
    // Mostrar resultados
    console.log(`\n✅ RESULTADOS:`);
    console.log(`   👤 Participante: ${participantId}`);
    console.log(`   🏁 Total splits con clips: ${result.totalSplits}`);
    console.log(`   🎬 Total clips: ${result.totalClips}`);
    console.log(`\n📍 SPLITS CON CLIPS:`);
    
    splits.forEach(split => {
      console.log(`   🏁 ${split.splitName} (índice ${split.splitIndex}): ${split.clipCount} clip(s)`);
      split.clips.forEach((clip, index) => {
        console.log(`      ${index + 1}. 🎬 ${clip.clipUrl}`);
        console.log(`         ⏰ ${clip.timestamp}`);
        console.log(`         📅 Generado: ${clip.generatedAt}`);
      });
    });
    
    return result;
    
  } catch (error) {
    console.error(`💥 Error consultando splits del participante:`, error.message);
    return {
      participantId: participantId,
      totalSplits: 0,
      totalClips: 0,
      splits: [],
      error: error.message
    };
  }
}

/**
 * 🎯 VERSIÓN SIMPLIFICADA: Solo nombres de splits
 */
async function getSplitNamesForParticipant(raceId, eventId, participantId, appId = null) {
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
    
    const splitNames = new Set();
    snapshot.forEach(doc => {
      splitNames.add(doc.data().splitName);
    });
    
    return Array.from(splitNames).sort();
    
  } catch (error) {
    console.error(`💥 Error obteniendo nombres de splits:`, error.message);
    return [];
  }
}

/**
 * 🎯 EJEMPLO DE USO
 */
async function runExample() {
  console.log("🎯 CONSULTAR SPLITS CON CLIPS DE UN PARTICIPANTE");
  console.log("=" * 60);
  
  // Datos de ejemplo (ajusta según tu sistema)
  const RACE_ID = "69200553-464c-4bfd-9b35-4ca6ac1f17f5"; // Maratón de Málaga
  const APP_ID = "Ryx7YFWobBfGTJqkciCV"; // App ID del Maratón de Málaga
  const EVENT_ID = "Maratón";
  const PARTICIPANT_ID = "test-participant-123"; // Cambia por un participante real
  
  // Consulta completa
  const result = await getSplitsWithClipsForParticipant(RACE_ID, EVENT_ID, PARTICIPANT_ID, APP_ID);
  
  // Consulta simplificada
  console.log(`\n📋 VERSIÓN SIMPLIFICADA:`);
  const splitNames = await getSplitNamesForParticipant(RACE_ID, EVENT_ID, PARTICIPANT_ID, APP_ID);
  console.log(`   📍 Splits con clips: [${splitNames.join(', ')}]`);
  
  // Ejemplo de respuesta JSON para API
  console.log(`\n📄 RESPUESTA JSON PARA API:`);
  console.log(JSON.stringify({
    success: true,
    participantId: PARTICIPANT_ID,
    splitsWithClips: splitNames,
    totalSplits: result.totalSplits,
    totalClips: result.totalClips,
    detailedSplits: result.splits
  }, null, 2));
  
  process.exit(0);
}

// Ejecutar ejemplo
runExample().catch(console.error);
