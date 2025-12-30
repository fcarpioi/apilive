#!/usr/bin/env node

/**
 * Script para corregir los splits dentro de copernico_data del evento Generali Maratón Málaga
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

// SPLITS CORRECTOS dentro de copernico_data según tus especificaciones
const correctCopernicoSplits = [
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

async function fixCopernicoDataSplits() {
  console.log("🔧 CORRIGIENDO SPLITS EN COPERNICO_DATA");
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
    
    // Mostrar estructura actual
    if (currentEventData.copernico_data) {
      console.log("📋 Copernico_data actual encontrado");
      if (currentEventData.copernico_data.splits) {
        console.log(`   Splits actuales en copernico_data: ${currentEventData.copernico_data.splits.length} elementos`);
        currentEventData.copernico_data.splits.forEach((split, index) => {
          console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type}`);
        });
      }
      if (currentEventData.copernico_data.timingPoints) {
        console.log(`   Timing Points en copernico_data: ${currentEventData.copernico_data.timingPoints.length} elementos`);
      }
    } else {
      console.log("⚠️ No se encontró copernico_data, se creará");
    }
    
    // 2. Preparar la actualización de copernico_data
    console.log("\n🔄 Actualizando copernico_data con estructura correcta...");
    console.log("📋 Nuevos splits para copernico_data:");
    correctCopernicoSplits.forEach((split, index) => {
      console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type}`);
    });
    
    // Mantener la estructura existente de copernico_data y solo actualizar splits y timingPoints
    const updatedCopernicoData = {
      ...currentEventData.copernico_data,
      splits: correctCopernicoSplits,
      timingPoints: correctTimingPoints,
      distance: 42195,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const updateData = {
      copernico_data: updatedCopernicoData,
      // También actualizar a nivel raíz para compatibilidad
      splits: correctCopernicoSplits,
      timingPoints: correctTimingPoints,
      distance: 42195,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await eventRef.update(updateData);
    console.log("✅ Evento actualizado exitosamente");
    
    // 3. Verificar los cambios
    console.log("\n🔍 Verificando cambios...");
    
    const updatedEventDoc = await eventRef.get();
    const updatedEventData = updatedEventDoc.data();
    
    console.log("📊 DATOS ACTUALIZADOS:");
    if (updatedEventData.copernico_data) {
      console.log(`   ✅ Copernico_data.splits: ${updatedEventData.copernico_data.splits?.length || 0} elementos`);
      console.log(`   ✅ Copernico_data.timingPoints: ${updatedEventData.copernico_data.timingPoints?.length || 0} elementos`);
      console.log(`   ✅ Copernico_data.distance: ${updatedEventData.copernico_data.distance}m`);
      
      if (updatedEventData.copernico_data.splits) {
        console.log("\n📋 SPLITS EN COPERNICO_DATA VERIFICADOS:");
        updatedEventData.copernico_data.splits.forEach((split, index) => {
          console.log(`   ${index + 1}. ${split.name} - ${split.distance}m - ${split.type} - Orden: ${split.order}`);
        });
      }
      
      if (updatedEventData.copernico_data.timingPoints) {
        console.log("\n⏱️ TIMING POINTS EN COPERNICO_DATA:");
        updatedEventData.copernico_data.timingPoints.forEach((point, index) => {
          console.log(`   ${index + 1}. ${point}`);
        });
      }
    }
    
    // 4. Mostrar resumen final
    console.log("\n🎉 COPERNICO_DATA CORREGIDO");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${raceData.raceId}`);
    console.log(`📱 App ID: ${raceData.appId}`);
    console.log(`🏃‍♂️ Evento: ${raceData.eventId}`);
    console.log(`📏 Distancia Total: 42195m`);
    console.log(`📊 Total Splits en copernico_data: ${correctCopernicoSplits.length}`);
    console.log(`⏱️ Total Timing Points en copernico_data: ${correctTimingPoints.length}`);
    
    console.log("\n📋 SPLITS FINALES EN COPERNICO_DATA:");
    correctCopernicoSplits.forEach((split, index) => {
      console.log(`  ${index + 1}. ${split.name} - ${split.distance}m (${split.type})`);
    });
    
    console.log("\n🧪 TIMING POINTS PARA PRUEBAS:");
    correctTimingPoints.forEach((point, index) => {
      console.log(`  ${index + 1}. ${point}`);
    });
    
    console.log("\n✅ ¡COPERNICO_DATA COMPLETAMENTE CORREGIDO!");
    
  } catch (error) {
    console.error("❌ Error corrigiendo copernico_data:", error);
    throw error;
  }
}

// Ejecutar
fixCopernicoDataSplits()
  .then(() => {
    console.log("\n✅ Corrección de copernico_data completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
