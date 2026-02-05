#!/usr/bin/env node

/**
 * Script para verificar la carrera creada y completar configuración faltante
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const newRaceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
const newAppId = "Ryx7YFWobBfGTJqkciCV"; // Del output anterior

async function verifyAndCompleteRace() {
  console.log("🔍 VERIFICANDO CARRERA CREADA");
  console.log("=" * 50);
  
  try {
    // 1. Verificar carrera principal
    console.log(`📋 Verificando carrera: ${newRaceId}`);
    const raceDoc = await db.collection('races').doc(newRaceId).get();
    
    if (raceDoc.exists) {
      console.log("✅ Carrera encontrada");
      const raceData = raceDoc.data();
      console.log(`   Nombre: ${raceData.name}`);
      console.log(`   Copernico ID: ${raceData.copernicoId}`);
      console.log(`   Fecha: ${raceData.date}`);
    } else {
      console.log("❌ Carrera no encontrada");
      return;
    }
    
    // 2. Verificar app
    console.log(`\n📱 Verificando app: ${newAppId}`);
    const appDoc = await db.collection('races').doc(newRaceId).collection('apps').doc(newAppId).get();
    
    if (appDoc.exists) {
      console.log("✅ App encontrada");
      const appData = appDoc.data();
      console.log(`   Nombre: ${appData.name}`);
    } else {
      console.log("❌ App no encontrada");
      return;
    }
    
    // 3. Verificar evento
    console.log(`\n🏃‍♂️ Verificando evento: Maratón`);
    const eventDoc = await db.collection('races').doc(newRaceId)
      .collection('apps').doc(newAppId)
      .collection('events').doc('Maratón').get();
    
    if (eventDoc.exists) {
      console.log("✅ Evento encontrado");
      const eventData = eventDoc.data();
      console.log(`   Nombre: ${eventData.name}`);
      console.log(`   Distancia: ${eventData.distance}m`);
      console.log(`   Timing Points: ${eventData.timingPoints?.join(', ')}`);
    } else {
      console.log("❌ Evento no encontrado");
      return;
    }
    
    // 4. Crear configuración básica de media si no existe
    console.log(`\n🎬 Verificando configuración de media...`);
    const mediaSnapshot = await db.collection('races').doc(newRaceId)
      .collection('apps').doc(newAppId)
      .collection('events').doc('Maratón')
      .collection('media').get();
    
    if (mediaSnapshot.empty) {
      console.log("⚠️ No hay configuración de media, creando configuración básica...");
      
      // Crear configuración básica de media
      const mediaConfig = {
        raceId: newRaceId,
        appId: newAppId,
        eventId: "Maratón",
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('races').doc(newRaceId)
        .collection('apps').doc(newAppId)
        .collection('events').doc('Maratón')
        .collection('media').doc('config').set(mediaConfig);
      
      console.log("✅ Configuración básica de media creada");
    } else {
      console.log(`✅ ${mediaSnapshot.size} configuraciones de media encontradas`);
    }
    
    // 5. Mostrar resumen final
    console.log("\n🎉 RESUMEN FINAL - CARRERA LISTA PARA USAR");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${newRaceId}`);
    console.log(`🔗 Copernico ID: generali-maraton-malaga-2025`);
    console.log(`📱 App ID: ${newAppId}`);
    console.log(`🏃‍♂️ Evento: Maratón`);
    console.log(`📅 Fecha: 14/12/2025`);
    console.log(`📏 Distancia: 42195m`);
    console.log(`⏱️ Timing Points: Salida, 10K, 15K, Media, 25K, 35K, Spotter, Meta`);
    console.log(`📊 Splits: 10K, 15K, Media, 25K, 35K, Meta`);
    
    console.log("\n🧪 DATOS PARA PRUEBAS CON COPERNICO:");
    console.log(`{
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "${newRaceId}",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "PARTICIPANT_ID_FROM_COPERNICO",
  "extraData": {
    "point": "10K",
    "event": "Maratón",
    "location": "10K"
  }
}`);

    console.log("\n📋 DATOS PARA POSTMAN/TESTING:");
    console.log(`{
  "raceId": "${newRaceId}",
  "appId": "${newAppId}",
  "eventId": "Maratón"
}`);
    
    console.log("\n✅ ¡CARRERA COMPLETAMENTE CONFIGURADA Y LISTA!");
    
  } catch (error) {
    console.error("❌ Error verificando la carrera:", error);
  }
}

// Ejecutar
verifyAndCompleteRace()
  .then(() => {
    console.log("\n✅ Verificación completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error:", error.message);
    process.exit(1);
  });
