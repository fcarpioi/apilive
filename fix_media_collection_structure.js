#!/usr/bin/env node

/**
 * Script para corregir la ubicación de la configuración de media
 * Debe estar en /races/{raceId}/apps/{appId}/media, NO en events
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
  sourceRaceId: "52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49"
};

async function fixMediaCollectionStructure() {
  console.log("🔧 CORRIGIENDO UBICACIÓN DE CONFIGURACIÓN DE MEDIA");
  console.log("=" * 60);
  
  try {
    // 1. Eliminar configuración de media incorrecta (si existe en events)
    console.log("🗑️ Eliminando configuración de media incorrecta en events...");
    
    const incorrectMediaRef = db.collection('races').doc(raceData.raceId)
      .collection('apps').doc(raceData.appId)
      .collection('events').doc(raceData.eventId)
      .collection('media');
    
    const incorrectMediaSnapshot = await incorrectMediaRef.get();
    
    if (!incorrectMediaSnapshot.empty) {
      console.log(`   Encontradas ${incorrectMediaSnapshot.size} configuraciones incorrectas`);
      
      // Eliminar documentos incorrectos
      const batch = db.batch();
      incorrectMediaSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      console.log("   ✅ Configuraciones incorrectas eliminadas");
    } else {
      console.log("   ✅ No hay configuraciones incorrectas que eliminar");
    }
    
    // 2. Obtener configuración de media de la carrera de referencia
    console.log(`\n📋 Obteniendo configuración de media de la carrera de referencia: ${raceData.sourceRaceId}`);
    
    // Buscar apps en la carrera de referencia
    const sourceAppsSnapshot = await db.collection('races').doc(raceData.sourceRaceId)
      .collection('apps').get();
    
    if (sourceAppsSnapshot.empty) {
      throw new Error("No se encontraron apps en la carrera de referencia");
    }
    
    let sourceMediaConfigs = [];
    
    // Buscar configuración de media en las apps de la carrera de referencia
    for (const sourceAppDoc of sourceAppsSnapshot.docs) {
      const sourceMediaSnapshot = await sourceAppDoc.ref.collection('media').get();
      
      if (!sourceMediaSnapshot.empty) {
        console.log(`   ✅ Encontrada configuración de media en app: ${sourceAppDoc.id}`);
        sourceMediaSnapshot.docs.forEach(mediaDoc => {
          sourceMediaConfigs.push({
            id: mediaDoc.id,
            data: mediaDoc.data()
          });
        });
        break; // Usar la primera app que tenga configuración de media
      }
    }
    
    if (sourceMediaConfigs.length === 0) {
      console.log("   ⚠️ No se encontró configuración de media en la carrera de referencia");
      console.log("   📝 Creando configuración básica de media...");
      
      // Crear configuración básica si no existe en la referencia
      sourceMediaConfigs = [{
        id: 'config',
        data: {
          raceId: raceData.sourceRaceId,
          videoSettings: {
            enabled: true,
            quality: "720p",
            duration: 30,
            format: "mp4"
          },
          streamSettings: {
            enabled: true,
            provider: "aws",
            autoGenerate: true
          },
          uploadSettings: {
            maxFileSize: 100 * 1024 * 1024, // 100MB
            allowedFormats: ["mp4", "mov", "avi"],
            compressionEnabled: true
          }
        }
      }];
    }
    
    // 3. Crear configuración de media en la ubicación correcta
    console.log(`\n📁 Creando configuración de media en la ubicación correcta:`);
    console.log(`   Ruta: /races/${raceData.raceId}/apps/${raceData.appId}/media`);
    
    const correctMediaRef = db.collection('races').doc(raceData.raceId)
      .collection('apps').doc(raceData.appId)
      .collection('media');
    
    // Crear cada configuración de media
    for (const mediaConfig of sourceMediaConfigs) {
      const newMediaConfig = {
        ...mediaConfig.data,
        // Actualizar con datos de la nueva carrera
        raceId: raceData.raceId,
        appId: raceData.appId,
        eventId: raceData.eventId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await correctMediaRef.doc(mediaConfig.id).set(newMediaConfig);
      console.log(`   ✅ Configuración '${mediaConfig.id}' creada`);
    }
    
    // 4. Verificar la configuración creada
    console.log("\n🔍 Verificando configuración de media creada...");
    
    const verifyMediaSnapshot = await correctMediaRef.get();
    
    if (!verifyMediaSnapshot.empty) {
      console.log(`   ✅ ${verifyMediaSnapshot.size} configuraciones de media creadas correctamente`);
      
      verifyMediaSnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`   📄 ${doc.id}:`);
        console.log(`      - Race ID: ${data.raceId}`);
        console.log(`      - App ID: ${data.appId}`);
        console.log(`      - Event ID: ${data.eventId}`);
        if (data.videoSettings) {
          console.log(`      - Video: ${data.videoSettings.quality} ${data.videoSettings.format}`);
        }
      });
    }
    
    // 5. Mostrar resumen final
    console.log("\n🎉 CONFIGURACIÓN DE MEDIA CORREGIDA");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${raceData.raceId}`);
    console.log(`📱 App ID: ${raceData.appId}`);
    console.log(`🏃‍♂️ Evento: ${raceData.eventId}`);
    console.log(`📁 Ubicación correcta: /races/${raceData.raceId}/apps/${raceData.appId}/media`);
    console.log(`📄 Configuraciones: ${sourceMediaConfigs.length}`);
    
    console.log("\n✅ ¡CONFIGURACIÓN DE MEDIA EN LA UBICACIÓN CORRECTA!");
    
  } catch (error) {
    console.error("❌ Error corrigiendo configuración de media:", error);
    throw error;
  }
}

// Ejecutar
fixMediaCollectionStructure()
  .then(() => {
    console.log("\n✅ Corrección de configuración de media completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
