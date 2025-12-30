#!/usr/bin/env node

/**
 * Script para debuggear la ruta exacta donde está el participante D21D9C3F
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const PARTICIPANT_ID = 'D21D9C3F';
const RACE_ID = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const APP_ID = 'Ryx7YFWobBfGTJqkciCV';

async function debugParticipantPath() {
  console.log("🔍 DEBUGGEANDO RUTA DEL PARTICIPANTE");
  console.log("=" * 60);
  console.log(`🏃 Participante: ${PARTICIPANT_ID}`);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`📱 App: ${APP_ID}`);
  console.log("");

  try {
    // 1. Verificar qué eventos existen en la carrera
    console.log("📋 PASO 1: Verificando eventos disponibles...");
    const eventsRef = db.collection('races').doc(RACE_ID)
      .collection('apps').doc(APP_ID)
      .collection('events');
    
    const eventsSnapshot = await eventsRef.get();
    console.log(`📊 Total eventos encontrados: ${eventsSnapshot.size}`);
    
    const eventIds = [];
    eventsSnapshot.docs.forEach((doc, index) => {
      const eventId = doc.id;
      const eventData = doc.data();
      eventIds.push(eventId);
      
      console.log(`   ${index + 1}. EventID: "${eventId}"`);
      console.log(`      Encoding: [${Array.from(eventId).map(c => c.charCodeAt(0)).join(', ')}]`);
      console.log(`      Nombre: ${eventData.name || 'Sin nombre'}`);
      console.log(`      Datos:`, eventData);
      console.log("");
    });

    // 2. Buscar el participante en cada evento
    console.log("🔍 PASO 2: Buscando participante en cada evento...");
    
    for (const eventId of eventIds) {
      console.log(`\n📍 Buscando en evento: "${eventId}"`);
      
      const participantsRef = db.collection('races').doc(RACE_ID)
        .collection('apps').doc(APP_ID)
        .collection('events').doc(eventId)
        .collection('participants');
      
      // Buscar participante específico
      const participantDoc = await participantsRef.doc(PARTICIPANT_ID).get();
      
      if (participantDoc.exists) {
        console.log(`   ✅ ¡ENCONTRADO! Participante existe en este evento`);
        console.log(`   📄 Datos:`, participantDoc.data());
        
        // Verificar si tiene historias
        const storiesRef = participantDoc.ref.collection('stories');
        const storiesSnapshot = await storiesRef.get();
        console.log(`   📚 Historias: ${storiesSnapshot.size}`);
        
        if (storiesSnapshot.size > 0) {
          console.log(`   📖 Últimas historias:`);
          storiesSnapshot.docs.slice(0, 3).forEach((storyDoc, index) => {
            const storyData = storyDoc.data();
            console.log(`      ${index + 1}. ${storyDoc.id}: ${storyData.description || 'Sin descripción'}`);
          });
        }
        
        console.log(`\n🎯 RUTA CORRECTA ENCONTRADA:`);
        console.log(`   races/${RACE_ID}/apps/${APP_ID}/events/${eventId}/participants/${PARTICIPANT_ID}`);
        
      } else {
        console.log(`   ❌ No encontrado en este evento`);
        
        // Listar algunos participantes para debug
        const allParticipants = await participantsRef.limit(3).get();
        console.log(`   📊 Total participantes en evento: ${allParticipants.size}`);
        allParticipants.docs.forEach((doc, index) => {
          console.log(`      ${index + 1}. ${doc.id}`);
        });
      }
    }

    // 3. Verificar encoding específico
    console.log("\n🔤 PASO 3: Verificando encoding de 'Maratón'...");
    
    const testStrings = [
      'Maratón',
      'MaratÃ³n', 
      'Maraton',
      'maratón',
      'MARATÓN'
    ];
    
    for (const testString of testStrings) {
      console.log(`\n🧪 Probando: "${testString}"`);
      console.log(`   Encoding: [${Array.from(testString).map(c => c.charCodeAt(0)).join(', ')}]`);
      
      const participantDoc = await db.collection('races').doc(RACE_ID)
        .collection('apps').doc(APP_ID)
        .collection('events').doc(testString)
        .collection('participants').doc(PARTICIPANT_ID).get();
      
      if (participantDoc.exists) {
        console.log(`   ✅ ¡ENCONTRADO con este encoding!`);
        console.log(`   🎯 EventID correcto: "${testString}"`);
      } else {
        console.log(`   ❌ No encontrado`);
      }
    }

    // 4. Buscar en estructura antigua (sin apps)
    console.log("\n🔍 PASO 4: Verificando estructura antigua (sin apps)...");
    
    const oldStructureRef = db.collection('races').doc(RACE_ID)
      .collection('events');
    
    const oldEventsSnapshot = await oldStructureRef.get();
    console.log(`📊 Eventos en estructura antigua: ${oldEventsSnapshot.size}`);
    
    for (const eventDoc of oldEventsSnapshot.docs) {
      const eventId = eventDoc.id;
      console.log(`\n📍 Verificando evento antiguo: "${eventId}"`);
      
      const participantDoc = await eventDoc.ref
        .collection('participants').doc(PARTICIPANT_ID).get();
      
      if (participantDoc.exists) {
        console.log(`   ✅ ¡ENCONTRADO en estructura antigua!`);
        console.log(`   🎯 Ruta: races/${RACE_ID}/events/${eventId}/participants/${PARTICIPANT_ID}`);
        console.log(`   📄 Datos:`, participantDoc.data());
      } else {
        console.log(`   ❌ No encontrado en estructura antigua`);
      }
    }

  } catch (error) {
    console.error("💥 Error:", error);
  }
}

// Ejecutar
debugParticipantPath().catch(console.error);
