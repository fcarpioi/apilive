/**
 * Script para verificar directamente en Firestore la estructura de datos de Copernico
 */

const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

const db = admin.firestore();

async function verifyFirestoreStructure() {
  try {
    console.log("🔍 Verificando estructura en Firestore...");
    
    const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
    const appId = "Ryx7YFWobBfGTJqkciCV";
    const eventId = "Media";
    const participantId = "D21D9C3F";
    
    // Buscar en la estructura nueva
    const participantRef = db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants')
      .doc(participantId);
    
    const participantDoc = await participantRef.get();
    
    if (participantDoc.exists) {
      const data = participantDoc.data();
      
      console.log("✅ PARTICIPANTE ENCONTRADO:");
      console.log("🔹 Datos básicos:", {
        externalId: data.externalId,
        name: data.name,
        lastName: data.lastName,
        dorsal: data.dorsal,
        category: data.category
      });
      
      console.log("\n🔹 CopernicoData presente:", !!data.copernicoData);
      
      if (data.copernicoData) {
        console.log("🔹 Times disponibles:", Object.keys(data.copernicoData.times || {}));
        console.log("🔹 Rankings disponibles:", Object.keys(data.copernicoData.rankings || {}));
        console.log("🔹 RawData presente:", !!data.copernicoData.rawData);
        
        // Verificar estructura específica del punto META
        const timesMeta = data.copernicoData.times?.['META'];
        if (timesMeta) {
          console.log("\n🎯 DATOS DE META - TIMES:");
          console.log("  - split:", timesMeta.split);
          console.log("  - time:", timesMeta.time);
          console.log("  - netTime:", timesMeta.netTime);
          console.log("  - raw.rawTime:", timesMeta.raw?.rawTime);
          console.log("  - raw.device:", timesMeta.raw?.device);
          console.log("  - raw.originalTime:", timesMeta.raw?.originalTime);
          console.log("  - raw.created:", timesMeta.raw?.created);
          console.log("  - raw.chip:", timesMeta.raw?.chip);
          console.log("  - raw.location:", timesMeta.raw?.location);
        } else {
          console.log("⚠️ No se encontraron datos de times para META");
        }

        const rankingsMeta = data.copernicoData.rankings?.['META'];
        if (rankingsMeta) {
          console.log("\n🏆 DATOS DE META - RANKINGS:");
          console.log("  - pos:", rankingsMeta.pos);
          console.log("  - posGen:", rankingsMeta.posGen);
          console.log("  - posCat:", rankingsMeta.posCat);
          console.log("  - posNet:", rankingsMeta.posNet);
          console.log("  - posGenNet:", rankingsMeta.posGenNet);
          console.log("  - posCatNet:", rankingsMeta.posCatNet);
          console.log("  - rawTime:", rankingsMeta.rawTime);
        } else {
          console.log("⚠️ No se encontraron datos de rankings para META");
        }
        
        // Mostrar estructura completa de rawData (primeros niveles)
        if (data.copernicoData.rawData) {
          console.log("\n📋 ESTRUCTURA DE RAWDATA:");
          console.log("  - id:", data.copernicoData.rawData.id);
          console.log("  - name:", data.copernicoData.rawData.name);
          console.log("  - surname:", data.copernicoData.rawData.surname);
          console.log("  - events length:", data.copernicoData.rawData.events?.length);
          
          if (data.copernicoData.rawData.events && data.copernicoData.rawData.events.length > 0) {
            const event = data.copernicoData.rawData.events[0];
            console.log("  - event.times keys:", Object.keys(event.times || {}));
            console.log("  - event.rankings keys:", Object.keys(event.rankings || {}));
          }
        }
      } else {
        console.log("❌ No se encontró copernicoData");
      }
      
      console.log("\n🔹 LastCheckpoint:", data.lastCheckpoint);
      console.log("🔹 WebhookProcessedAt:", data.webhookProcessedAt);
      console.log("🔹 UpdatedAt:", data.updatedAt);
      
    } else {
      console.log("❌ Participante no encontrado en Firestore");
      
      // Buscar en estructura legacy
      console.log("\n🔍 Buscando en estructura legacy...");
      const legacyRef = db.collection('races').doc(raceId)
        .collection('events').doc(eventId)
        .collection('participants')
        .doc(participantId);
      
      const legacyDoc = await legacyRef.get();
      if (legacyDoc.exists) {
        console.log("✅ Encontrado en estructura legacy");
        const legacyData = legacyDoc.data();
        console.log("🔹 Datos básicos:", {
          externalId: legacyData.externalId,
          name: legacyData.name,
          dorsal: legacyData.dorsal
        });
      } else {
        console.log("❌ Tampoco encontrado en estructura legacy");
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Ejecutar verificación
verifyFirestoreStructure();
