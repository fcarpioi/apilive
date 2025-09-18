#!/usr/bin/env node

/**
 * Script para agregar el campo raceId a todas las historias
 * raceId = eventId (mismo valor)
 * 
 * Uso: node add-raceId-field-to-stories.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin inicializado con serviceAccountKey.json');
  } catch (error) {
    admin.initializeApp();
    console.log('✅ Firebase Admin inicializado con credenciales por defecto');
  }
}

const db = admin.firestore();

/**
 * Función para procesar historias en lotes
 */
async function processStoriesInBatches() {
  console.log('🚀 Iniciando migración de campo raceId...\n');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  
  try {
    // 1. Obtener todas las carreras
    console.log('📋 Paso 1: Obteniendo carreras...');
    const racesSnapshot = await db.collection('races').get();
    console.log(`✅ Encontradas ${racesSnapshot.size} carreras\n`);
    
    // 2. Procesar cada carrera
    for (const raceDoc of racesSnapshot.docs) {
      const raceId = raceDoc.id;
      console.log(`🏁 Procesando carrera: ${raceId}`);
      
      // 3. Obtener eventos de la carrera
      const eventsSnapshot = await db.collection('races').doc(raceId)
        .collection('events').get();
      
      console.log(`  📅 Encontrados ${eventsSnapshot.size} eventos`);
      
      // 4. Procesar cada evento
      for (const eventDoc of eventsSnapshot.docs) {
        const eventId = eventDoc.id;
        console.log(`    🎯 Procesando evento: ${eventId}`);
        
        // 5. Obtener participantes del evento
        const participantsSnapshot = await db.collection('races').doc(raceId)
          .collection('events').doc(eventId)
          .collection('participants').get();
        
        console.log(`      👥 Encontrados ${participantsSnapshot.size} participantes`);
        
        // 6. Procesar historias de cada participante
        for (const participantDoc of participantsSnapshot.docs) {
          const participantId = participantDoc.id;
          
          try {
            // 7. Obtener historias del participante
            const storiesSnapshot = await db.collection('races').doc(raceId)
              .collection('events').doc(eventId)
              .collection('participants').doc(participantId)
              .collection('stories').get();
            
            if (storiesSnapshot.size > 0) {
              console.log(`        📚 Participante ${participantId}: ${storiesSnapshot.size} historias`);
              
              // 8. Procesar historias en lotes de 500 (límite de Firestore batch)
              const batchSize = 500;
              const storyDocs = storiesSnapshot.docs;
              
              for (let i = 0; i < storyDocs.length; i += batchSize) {
                const batch = db.batch();
                const batchDocs = storyDocs.slice(i, i + batchSize);
                let batchUpdates = 0;
                
                for (const storyDoc of batchDocs) {
                  const storyData = storyDoc.data();
                  totalProcessed++;
                  
                  // 9. Verificar si ya tiene raceId
                  if (!storyData.raceId) {
                    // Agregar raceId = eventId
                    batch.update(storyDoc.ref, {
                      raceId: eventId, // raceId = eventId (mismo valor)
                      eventId: eventId, // Asegurar que eventId esté presente
                      participantId: participantId, // Asegurar que participantId esté presente
                      updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    batchUpdates++;
                    totalUpdated++;
                  }
                }
                
                // 10. Ejecutar batch si hay actualizaciones
                if (batchUpdates > 0) {
                  await batch.commit();
                  console.log(`          ✅ Actualizadas ${batchUpdates} historias en lote ${Math.floor(i/batchSize) + 1}`);
                } else {
                  console.log(`          ⚠️  Lote ${Math.floor(i/batchSize) + 1}: todas las historias ya tienen raceId`);
                }
                
                // Pausa pequeña para no sobrecargar Firestore
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          } catch (error) {
            console.error(`        ❌ Error procesando participante ${participantId}:`, error.message);
            totalErrors++;
          }
        }
      }
      
      console.log(`  ✅ Carrera ${raceId} completada\n`);
    }
    
  } catch (error) {
    console.error('💥 Error durante la migración:', error);
    totalErrors++;
  }
  
  // 11. Reporte final
  console.log('📊 REPORTE FINAL DE MIGRACIÓN');
  console.log('=' .repeat(50));
  console.log(`📚 Total historias procesadas: ${totalProcessed}`);
  console.log(`✅ Total historias actualizadas: ${totalUpdated}`);
  console.log(`❌ Total errores: ${totalErrors}`);
  console.log(`📈 Porcentaje actualizado: ${totalProcessed > 0 ? ((totalUpdated/totalProcessed)*100).toFixed(1) : 0}%`);
  
  if (totalUpdated > 0) {
    console.log('\n🎉 ¡Migración completada exitosamente!');
    console.log('💡 Ahora las Collection Group Queries funcionarán correctamente');
    console.log('🚀 El endpoint /feed/extended debería ser súper rápido');
  } else {
    console.log('\n⚠️  No se actualizaron historias (posiblemente ya tenían raceId)');
  }
}

/**
 * Función para verificar el progreso
 */
async function verifyMigration() {
  console.log('\n🔍 Verificando migración...');
  
  try {
    // Contar historias con raceId
    const storiesWithRaceId = await db.collectionGroup('stories')
      .where('raceId', '!=', null)
      .limit(10)
      .get();
    
    console.log(`✅ Encontradas ${storiesWithRaceId.size} historias con raceId (muestra de 10)`);
    
    if (storiesWithRaceId.size > 0) {
      console.log('📋 Ejemplo de historia migrada:');
      const example = storiesWithRaceId.docs[0].data();
      console.log({
        raceId: example.raceId,
        eventId: example.eventId,
        participantId: example.participantId,
        originType: example.originType,
        moderationStatus: example.moderationStatus
      });
    }
    
  } catch (error) {
    console.error('❌ Error verificando migración:', error.message);
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🔧 Migración de Campo raceId para Historias\n');
  console.log('=' .repeat(60));
  console.log('📝 Objetivo: Agregar raceId = eventId a todas las historias');
  console.log('🎯 Beneficio: Habilitar Collection Group Queries ultra-rápidas\n');
  
  const startTime = Date.now();
  
  try {
    // Ejecutar migración
    await processStoriesInBatches();
    
    // Verificar resultados
    await verifyMigration();
    
    const totalTime = Date.now() - startTime;
    console.log(`\n⏱️  Tiempo total: ${(totalTime/1000).toFixed(2)} segundos`);
    
  } catch (error) {
    console.error('\n💥 Error durante la ejecución:', error);
  } finally {
    // Cerrar conexión
    await admin.app().delete();
    console.log('\n👋 Migración finalizada');
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
