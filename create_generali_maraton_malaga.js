#!/usr/bin/env node

/**
 * Script para crear la carrera Generali Maratón Málaga 2025
 * Copiando configuración de la carrera existente 52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Datos de la nueva carrera
const newRaceData = {
  raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  copernicoId: "generali-maraton-malaga-2025",
  eventName: "Maratón", // Nota: Contiene carácter especial "ó"
  timingPoints: ["Salida", "10K", "15K", "Media", "25K", "35K", "Spotter", "Meta"],
  splits: ["10K", "15K", "Media", "25K", "35K", "Meta"],
  distance: 42195,
  date: "2025-12-14T00:00:00.000Z" // 14/12/2025
};

// ID de la carrera de referencia para copiar configuración
const sourceRaceId = "52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49";

async function createGeneraliMaratonMalaga() {
  console.log("🏃‍♂️ CREANDO GENERALI MARATÓN MÁLAGA 2025");
  console.log("=" * 60);
  
  try {
    // 1. OBTENER CONFIGURACIÓN DE LA CARRERA EXISTENTE
    console.log(`📋 Obteniendo configuración de la carrera: ${sourceRaceId}`);
    
    const sourceRaceRef = db.collection('races').doc(sourceRaceId);
    const sourceRaceDoc = await sourceRaceRef.get();
    
    if (!sourceRaceDoc.exists) {
      throw new Error(`Carrera de referencia ${sourceRaceId} no encontrada`);
    }
    
    const sourceRaceData = sourceRaceDoc.data();
    console.log("✅ Configuración de carrera obtenida");
    
    // 2. OBTENER APPS DE LA CARRERA EXISTENTE
    console.log("📱 Obteniendo apps de la carrera existente...");
    const sourceAppsSnapshot = await sourceRaceRef.collection('apps').get();
    
    if (sourceAppsSnapshot.empty) {
      throw new Error("No se encontraron apps en la carrera de referencia");
    }
    
    console.log(`✅ ${sourceAppsSnapshot.size} apps encontradas`);
    
    // 3. CREAR LA NUEVA CARRERA
    console.log(`🏁 Creando nueva carrera: ${newRaceData.raceId}`);
    
    const newRaceRef = db.collection('races').doc(newRaceData.raceId);
    
    // Copiar configuración base y actualizar con nuevos datos
    const newRaceConfig = {
      ...sourceRaceData,
      // Sobrescribir con datos específicos de la nueva carrera
      id: newRaceData.raceId,
      name: "Generali Maratón Málaga 2025",
      copernicoId: newRaceData.copernicoId,
      date: newRaceData.date,
      distance: newRaceData.distance,
      location: "Málaga, España",
      timingPoints: newRaceData.timingPoints,
      splits: newRaceData.splits,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Mantener configuración original pero actualizar metadatos
      race_info: {
        ...sourceRaceData.race_info,
        id: newRaceData.copernicoId,
        name: "Generali Maratón Málaga 2025",
        date: newRaceData.date
      }
    };
    
    await newRaceRef.set(newRaceConfig);
    console.log("✅ Carrera creada exitosamente");
    
    // 4. CREAR APP AUTOMÁTICAMENTE
    console.log("📱 Creando app automáticamente...");
    
    // Obtener la primera app de la carrera de referencia como template
    const sourceAppDoc = sourceAppsSnapshot.docs[0];
    const sourceAppData = sourceAppDoc.data();
    
    // Generar ID automático para la nueva app
    const newAppRef = newRaceRef.collection('apps').doc();
    const newAppId = newAppRef.id;
    
    console.log(`📱 Nuevo App ID generado: ${newAppId}`);
    
    const newAppConfig = {
      ...sourceAppData,
      id: newAppId,
      name: `App Generali Maratón Málaga 2025`,
      raceId: newRaceData.raceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await newAppRef.set(newAppConfig);
    console.log("✅ App creada exitosamente");
    
    // 5. CREAR EVENTO "Maratón"
    console.log(`🏃‍♂️ Creando evento: ${newRaceData.eventName}`);
    
    // Obtener eventos de la app de referencia
    const sourceEventsSnapshot = await db.collection('races').doc(sourceRaceId)
      .collection('apps').doc(sourceAppDoc.id)
      .collection('events').get();
    
    if (sourceEventsSnapshot.empty) {
      throw new Error("No se encontraron eventos en la app de referencia");
    }
    
    // Usar el primer evento como template
    const sourceEventDoc = sourceEventsSnapshot.docs[0];
    const sourceEventData = sourceEventDoc.data();
    
    const newEventRef = newAppRef.collection('events').doc(newRaceData.eventName);
    
    const newEventConfig = {
      ...sourceEventData,
      id: newRaceData.eventName,
      name: newRaceData.eventName,
      raceId: newRaceData.raceId,
      appId: newAppId,
      eventId: newRaceData.eventName,
      distance: newRaceData.distance,
      timingPoints: newRaceData.timingPoints,
      splits: newRaceData.splits,
      date: newRaceData.date,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await newEventRef.set(newEventConfig);
    console.log("✅ Evento creado exitosamente");
    
    // 6. COPIAR CONFIGURACIÓN DE MEDIA
    console.log("🎬 Copiando configuración de media...");
    
    // Buscar configuración de media en la carrera de referencia
    const sourceMediaSnapshot = await db.collectionGroup('media').where('raceId', '==', sourceRaceId).get();
    
    if (!sourceMediaSnapshot.empty) {
      for (const mediaDoc of sourceMediaSnapshot.docs) {
        const mediaData = mediaDoc.data();
        
        // Crear configuración de media para la nueva carrera
        const newMediaRef = newEventRef.collection('media').doc(mediaDoc.id);
        
        const newMediaConfig = {
          ...mediaData,
          raceId: newRaceData.raceId,
          appId: newAppId,
          eventId: newRaceData.eventName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await newMediaRef.set(newMediaConfig);
      }
      console.log(`✅ ${sourceMediaSnapshot.size} configuraciones de media copiadas`);
    } else {
      console.log("⚠️ No se encontró configuración de media en la carrera de referencia");
    }
    
    // 7. MOSTRAR RESUMEN
    console.log("\n🎉 ¡CARRERA CREADA EXITOSAMENTE!");
    console.log("=" * 60);
    console.log(`🏁 Race ID: ${newRaceData.raceId}`);
    console.log(`🔗 Copernico ID: ${newRaceData.copernicoId}`);
    console.log(`📱 App ID: ${newAppId}`);
    console.log(`🏃‍♂️ Evento: ${newRaceData.eventName}`);
    console.log(`📅 Fecha: ${newRaceData.date}`);
    console.log(`📏 Distancia: ${newRaceData.distance}m`);
    console.log(`⏱️ Timing Points: ${newRaceData.timingPoints.join(', ')}`);
    console.log(`📊 Splits: ${newRaceData.splits.join(', ')}`);
    
    console.log("\n🧪 DATOS PARA PRUEBAS:");
    console.log(`{
  "raceId": "${newRaceData.raceId}",
  "appId": "${newAppId}",
  "eventId": "${newRaceData.eventName}",
  "copernicoId": "${newRaceData.copernicoId}"
}`);
    
    return {
      raceId: newRaceData.raceId,
      appId: newAppId,
      eventId: newRaceData.eventName,
      copernicoId: newRaceData.copernicoId
    };
    
  } catch (error) {
    console.error("❌ Error creando la carrera:", error);
    throw error;
  }
}

// Ejecutar
createGeneraliMaratonMalaga()
  .then((result) => {
    console.log("\n✅ Proceso completado exitosamente");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error en el proceso:", error.message);
    process.exit(1);
  });
