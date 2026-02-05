#!/usr/bin/env node

/**
 * Script para corregir los splits del evento Generali Maratón Málaga
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const raceData = {
  raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  appId: "Ryx7YFWobBfGTJqkciCV",
  eventId: "Maratón",
  // SPLITS CORRECTOS que especificaste
  correctSplits: ["10K", "15K", "Media", "25K", "35K", "Meta"],
  // TIMING POINTS CORRECTOS que especificaste  
  correctTimingPoints: ["Salida", "10K", "15K", "Media", "25K", "35K", "Spotter", "Meta"]
};

async function fixSplitsAndTimingPoints() {
  console.log("🔧 CORRIGIENDO SPLITS Y TIMING POINTS");
  console.log("=" * 50);
  
  try {
    // 1. Obtener el evento actual
    console.log(`📋 Obteniendo evento actual: ${raceData.eventId}`);
    
    const eventRef = db.collection('races').doc(raceData.raceId)
      .collection('apps').doc(raceData.appId)
      .collection('events').doc(raceData.eventId);
    
    const eventDoc = await eventRef.get();
    
    if (!eventDoc.exists) {
      throw new Error("Evento no encontrado");
    }
    
    const currentEventData = eventDoc.data();
    console.log("✅ Evento encontrado");
    console.log(`   Splits actuales: ${JSON.stringify(currentEventData.splits)}`);
    console.log(`   Timing Points actuales: ${JSON.stringify(currentEventData.timingPoints)}`);
    
    // 2. Actualizar con los splits y timing points correctos
    console.log("\n🔄 Actualizando con datos correctos...");
    console.log(`   Nuevos splits: ${JSON.stringify(raceData.correctSplits)}`);
    console.log(`   Nuevos timing points: ${JSON.stringify(raceData.correctTimingPoints)}`);
    
    const updateData = {
      splits: raceData.correctSplits,
      timingPoints: raceData.correctTimingPoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await eventRef.update(updateData);
    console.log("✅ Evento actualizado exitosamente");
    
    // 3. También actualizar la carrera principal
    console.log("\n🔄 Actualizando carrera principal...");
    
    const raceRef = db.collection('races').doc(raceData.raceId);
    await raceRef.update({
      splits: raceData.correctSplits,
      timingPoints: raceData.correctTimingPoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Carrera principal actualizada");
    
    // 4. Verificar los cambios
    console.log("\n🔍 Verificando cambios...");
    
    const updatedEventDoc = await eventRef.get();
    const updatedEventData = updatedEventDoc.data();
    
    console.log("📊 DATOS ACTUALIZADOS:");
    console.log(`   ✅ Splits: ${JSON.stringify(updatedEventData.splits)}`);
    console.log(`   ✅ Timing Points: ${JSON.stringify(updatedEventData.timingPoints)}`);
    
    // 5. Mostrar resumen final
    console.log("\n🎉 CORRECCIÓN COMPLETADA");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${raceData.raceId}`);
    console.log(`📱 App ID: ${raceData.appId}`);
    console.log(`🏃‍♂️ Evento: ${raceData.eventId}`);
    console.log(`📊 Splits: ${raceData.correctSplits.join(', ')}`);
    console.log(`⏱️ Timing Points: ${raceData.correctTimingPoints.join(', ')}`);
    
    console.log("\n🧪 DATOS ACTUALIZADOS PARA PRUEBAS:");
    console.log(`{
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "${raceData.raceId}",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "PARTICIPANT_ID_FROM_COPERNICO",
  "extraData": {
    "point": "10K",
    "event": "Maratón",
    "location": "10K"
  }
}`);

    console.log("\n📋 SPLITS DISPONIBLES PARA PRUEBAS:");
    raceData.correctSplits.forEach((split, index) => {
      console.log(`  ${index + 1}. ${split}`);
    });
    
    console.log("\n⏱️ TIMING POINTS DISPONIBLES:");
    raceData.correctTimingPoints.forEach((point, index) => {
      console.log(`  ${index + 1}. ${point}`);
    });
    
    console.log("\n✅ ¡SPLITS Y TIMING POINTS CORREGIDOS EXITOSAMENTE!");
    
  } catch (error) {
    console.error("❌ Error corrigiendo splits:", error);
    throw error;
  }
}

// Ejecutar
fixSplitsAndTimingPoints()
  .then(() => {
    console.log("\n✅ Corrección completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
