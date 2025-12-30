#!/usr/bin/env node

/**
 * Script para corregir la estructura completa de splits del evento Generali Maratón Málaga
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
  eventId: "Maratón"
};

// SPLITS CORRECTOS con estructura completa según tus especificaciones
const correctSplits = [
  {
    distance: 0,
    name: "Salida",
    order: 1,
    physicalLocation: "Salida",
    type: "start"
  },
  {
    distance: 10000,
    name: "10K",
    order: 2,
    physicalLocation: "10K",
    type: "split"
  },
  {
    distance: 15000,
    name: "15K",
    order: 3,
    physicalLocation: "15K",
    type: "split"
  },
  {
    distance: 21097,
    name: "Media",
    order: 4,
    physicalLocation: "Media Maratón",
    type: "split"
  },
  {
    distance: 25000,
    name: "25K",
    order: 5,
    physicalLocation: "25K",
    type: "split"
  },
  {
    distance: 35000,
    name: "35K",
    order: 6,
    physicalLocation: "35K",
    type: "split"
  },
  {
    distance: 37000,
    name: "Spotter",
    order: 7,
    physicalLocation: "Spotter",
    type: "checkpoint"
  },
  {
    distance: 42195,
    name: "Meta",
    order: 8,
    physicalLocation: "Meta",
    type: "finish"
  }
];

// TIMING POINTS como array simple
const correctTimingPoints = ["Salida", "10K", "15K", "Media", "25K", "35K", "Spotter", "Meta"];

async function fixSplitsStructure() {
  console.log("🔧 CORRIGIENDO ESTRUCTURA COMPLETA DE SPLITS");
  console.log("=" * 60);
  
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
    console.log(`   Splits actuales: ${currentEventData.splits?.length || 0} elementos`);
    
    if (currentEventData.splits && currentEventData.splits.length > 0) {
      console.log("📋 Estructura actual de splits:");
      currentEventData.splits.forEach((split, index) => {
        console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type}`);
      });
    }
    
    // 2. Actualizar con la estructura correcta
    console.log("\n🔄 Actualizando con estructura correcta...");
    console.log("📋 Nueva estructura de splits:");
    correctSplits.forEach((split, index) => {
      console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type}`);
    });
    
    const updateData = {
      splits: correctSplits,
      timingPoints: correctTimingPoints,
      distance: 42195, // Asegurar que la distancia total esté correcta
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await eventRef.update(updateData);
    console.log("✅ Evento actualizado exitosamente");
    
    // 3. También actualizar la carrera principal
    console.log("\n🔄 Actualizando carrera principal...");
    
    const raceRef = db.collection('races').doc(raceData.raceId);
    await raceRef.update({
      splits: correctSplits,
      timingPoints: correctTimingPoints,
      distance: 42195,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Carrera principal actualizada");
    
    // 4. Verificar los cambios
    console.log("\n🔍 Verificando cambios...");
    
    const updatedEventDoc = await eventRef.get();
    const updatedEventData = updatedEventDoc.data();
    
    console.log("📊 DATOS ACTUALIZADOS:");
    console.log(`   ✅ Splits: ${updatedEventData.splits?.length || 0} elementos`);
    console.log(`   ✅ Timing Points: ${updatedEventData.timingPoints?.length || 0} elementos`);
    console.log(`   ✅ Distancia: ${updatedEventData.distance}m`);
    
    if (updatedEventData.splits) {
      console.log("\n📋 SPLITS VERIFICADOS:");
      updatedEventData.splits.forEach((split, index) => {
        console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type} - Orden: ${split.order}`);
      });
    }
    
    // 5. Mostrar resumen final
    console.log("\n🎉 ESTRUCTURA DE SPLITS CORREGIDA");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${raceData.raceId}`);
    console.log(`📱 App ID: ${raceData.appId}`);
    console.log(`🏃‍♂️ Evento: ${raceData.eventId}`);
    console.log(`📏 Distancia Total: 42195m`);
    console.log(`📊 Total Splits: ${correctSplits.length}`);
    console.log(`⏱️ Total Timing Points: ${correctTimingPoints.length}`);
    
    console.log("\n📋 SPLITS FINALES (con distancias):");
    correctSplits.forEach((split, index) => {
      console.log(`  ${index + 1}. ${split.name} - ${split.distance}m (${split.type})`);
    });
    
    console.log("\n🧪 PUNTOS DISPONIBLES PARA PRUEBAS:");
    correctTimingPoints.forEach((point, index) => {
      console.log(`  ${index + 1}. ${point}`);
    });
    
    console.log("\n✅ ¡ESTRUCTURA DE SPLITS COMPLETAMENTE CORREGIDA!");
    
  } catch (error) {
    console.error("❌ Error corrigiendo estructura de splits:", error);
    throw error;
  }
}

// Ejecutar
fixSplitsStructure()
  .then(() => {
    console.log("\n✅ Corrección de estructura completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
