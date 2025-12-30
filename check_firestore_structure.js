#!/usr/bin/env node

/**
 * Script para verificar la estructura actual en Firestore
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function checkFirestoreStructure() {
  console.log("🔍 VERIFICANDO ESTRUCTURA EN FIRESTORE");
  console.log("=" * 50);
  
  const db = admin.firestore();
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
  const appId = "Ryx7YFWobBfGTJqkciCV";
  
  try {
    console.log(`📂 Verificando: races/${raceId}/apps/${appId}/events/`);
    console.log("");
    
    // Obtener todos los eventos
    const eventsRef = db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events');
    
    const eventsSnapshot = await eventsRef.get();
    
    console.log(`📊 Total eventos encontrados: ${eventsSnapshot.size}`);
    console.log("");
    
    eventsSnapshot.forEach((eventDoc) => {
      const eventId = eventDoc.id;
      const eventData = eventDoc.data();
      
      console.log(`📁 Evento ID: "${eventId}"`);
      console.log(`🔤 Encoding: [${Array.from(eventId).map(c => c.charCodeAt(0)).join(', ')}]`);
      console.log(`📄 Datos:`, {
        name: eventData.name,
        eventName: eventData.eventName,
        competitionId: eventData.competitionId
      });
      
      // Verificar si es el evento corrupto
      if (eventId.includes('Ã³')) {
        console.log(`🚨 ¡EVENTO CORRUPTO ENCONTRADO!`);
        console.log(`   ID corrupto: "${eventId}"`);
        console.log(`   Debería ser: "Maratón"`);
      }
      
      // Verificar si es el evento correcto
      if (eventId === 'Maratón') {
        console.log(`✅ ¡EVENTO CORRECTO ENCONTRADO!`);
        console.log(`   ID correcto: "${eventId}"`);
      }
      
      console.log("");
    });
    
    // Verificar participantes en ambos eventos (si existen)
    console.log("🏃 VERIFICANDO PARTICIPANTES:");
    console.log("");
    
    const eventIds = ['Maratón', 'MaratÃ³n'];
    
    for (const eventId of eventIds) {
      try {
        const participantsRef = db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants');
        
        const participantsSnapshot = await participantsRef.get();
        
        console.log(`📁 Evento: "${eventId}"`);
        console.log(`👥 Participantes: ${participantsSnapshot.size}`);
        
        if (participantsSnapshot.size > 0) {
          console.log(`   ✅ Participantes encontrados en: events/${eventId}/participants`);
          
          // Verificar si D21D9C3F está aquí
          const participantDoc = await participantsRef.doc('D21D9C3F').get();
          if (participantDoc.exists) {
            console.log(`   🎯 ¡Participante D21D9C3F encontrado aquí!`);
          }
        } else {
          console.log(`   ❌ No hay participantes en: events/${eventId}/participants`);
        }
        console.log("");
        
      } catch (error) {
        console.log(`   ⚠️ Error accediendo a evento "${eventId}": ${error.message}`);
        console.log("");
      }
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
checkFirestoreStructure().catch(console.error);
