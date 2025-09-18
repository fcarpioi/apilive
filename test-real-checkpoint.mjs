#!/usr/bin/env node

/**
 * Prueba del endpoint /api/participant-checkpoint con datos REALES
 * StreamId: ca7a9dec-b50b-510c-bf86-058664b46422
 * Time: 2025-06-08T08:02:10Z
 * RaceId: 57640500-c3ac-4afa-8f6b-6d55bc5ffd28
 * EventId: 57640500-c3ac-4afa-8f6b-6d55bc5ffd28
 */

import fetch from 'node-fetch';

const BASE_URL = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";
const API_KEY = "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";

async function testRealCheckpoint() {
  try {
    console.log("🧪 Probando endpoint con datos REALES de AWS...\n");

    // ✅ Datos REALES con participante que SÍ existe en Firestore
    const realTestData = {
      runnerId: "3455", // ✅ Participante REAL que existe
      raceId: "57640500-c3ac-4afa-8f6b-6d55bc5ffd28", // ✅ REAL
      eventId: "57640500-c3ac-4afa-8f6b-6d55bc5ffd28", // ✅ REAL
      apiKey: API_KEY,
      data: {
        id: "3455",
        name: "DORSAL 3455",
        fullname: "DORSAL 3455",
        events: [{
          dorsal: "3455", // ✅ Dorsal REAL que existe
          times: {
            "META": {
              split: "02:15:30",
              time: "02:15:30",
              netTime: "02:15:28",
              raw: {
                chip: "123456789",
                location: "META",
                device: "ca7a9dec-b50b-510c-bf86-058664b46422", // ✅ StreamId REAL
                originalTime: "2025-06-08T08:02:10Z" // ✅ Timestamp REAL
              }
            }
          },
          rankings: {
            position: 156
          }
        }]
      }
    };

    console.log("📤 Datos REALES a enviar:");
    console.log(`   🏃 Participante: ${realTestData.data.name} (Dorsal: ${realTestData.data.events[0].dorsal})`);
    console.log(`   🆔 RunnerId: ${realTestData.runnerId}`);
    console.log(`   🏁 RaceId: ${realTestData.raceId}`);
    console.log(`   🎯 EventId: ${realTestData.eventId}`);
    console.log(`   📹 StreamId: ${realTestData.data.events[0].times.META.raw.device}`);
    console.log(`   ⏰ Timestamp: ${realTestData.data.events[0].times.META.raw.originalTime}`);
    console.log(`   📍 Checkpoint: META`);

    console.log("\n🚀 Enviando petición al endpoint...");

    // Enviar petición
    const response = await fetch(`${BASE_URL}/api/participant-checkpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(realTestData)
    });

    console.log(`\n📊 Respuesta: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const result = await response.json();
      console.log("\n✅ ¡ÉXITO! Endpoint funcionando correctamente:");
      
      console.log(`\n👤 Participante procesado:`);
      console.log(`   Nombre: ${result.data.participantName || 'N/A'}`);
      console.log(`   ID: ${result.data.participantId || 'N/A'}`);
      
      console.log(`\n📊 Estadísticas:`);
      console.log(`   Checkpoints procesados: ${result.data.checkpointsProcessed || 0}`);
      console.log(`   Checkpoints nuevos: ${result.data.newCheckpoints || 0}`);
      console.log(`   Historias creadas: ${result.data.storiesCreated || 0}`);

      if (result.data.checkpoints && result.data.checkpoints.length > 0) {
        console.log(`\n📋 Detalles de checkpoints:`);
        result.data.checkpoints.forEach((checkpoint, index) => {
          console.log(`   ${index + 1}. ${checkpoint.checkpointId}:`);
          console.log(`      ⚡ Acción: ${checkpoint.action}`);
          
          if (checkpoint.storyId) {
            console.log(`      📖 Historia ID: ${checkpoint.storyId}`);
          }
          
          if (checkpoint.clipGenerated !== undefined) {
            const clipStatus = checkpoint.clipGenerated ? '✅ SÍ' : '❌ NO';
            console.log(`      🎬 Clip generado: ${clipStatus}`);
          }
          
          if (checkpoint.clipUrl) {
            console.log(`      🔗 URL del clip: ${checkpoint.clipUrl}`);
          }
          
          if (checkpoint.reason) {
            console.log(`      💭 Razón: ${checkpoint.reason}`);
          }
          
          if (checkpoint.error) {
            console.log(`      ⚠️ Error: ${checkpoint.error}`);
          }
        });
      }

      // Verificar si se generó clip de video
      const clipsGenerated = result.data.checkpoints ? 
        result.data.checkpoints.filter(c => c.clipGenerated).length : 0;
      
      console.log(`\n🎬 Resumen de clips:`);
      console.log(`   Clips generados: ${clipsGenerated}`);
      
      if (clipsGenerated > 0) {
        console.log(`   ✅ El endpoint está llamando correctamente al generador de clips`);
      } else {
        console.log(`   ⚠️ No se generaron clips (puede ser normal si ya existían historias)`);
      }

    } else {
      const errorText = await response.text();
      console.log("\n❌ Error en la respuesta:");
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${errorText}`);
      
      if (response.status === 404) {
        console.log("\n💡 Posibles causas del error 404:");
        console.log("   - El participante con dorsal '3541' no existe en la base de datos");
        console.log("   - El raceId o eventId no coinciden con los datos reales");
        console.log("   - El participante no tiene el campo 'runnerId' o 'bib' configurado");
      }
    }

    // Test adicional: Verificar que no se dupliquen
    console.log("\n🔄 Probando prevención de duplicados...");
    const duplicateResponse = await fetch(`${BASE_URL}/api/participant-checkpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(realTestData)
    });

    if (duplicateResponse.ok) {
      const duplicateResult = await duplicateResponse.json();
      const newStories = duplicateResult.data.storiesCreated || 0;
      
      console.log(`✅ Segunda llamada completada:`);
      console.log(`   Historias creadas: ${newStories}`);
      
      if (newStories === 0) {
        console.log(`   ✅ Prevención de duplicados funciona correctamente`);
      } else {
        console.log(`   ⚠️ Se crearon historias duplicadas`);
      }
    } else {
      console.log(`⚠️ Error en segunda llamada: ${duplicateResponse.status}`);
    }

  } catch (error) {
    console.error("❌ Error durante la prueba:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Ejecutar prueba
console.log("🎯 Iniciando prueba con datos reales de AWS...");
testRealCheckpoint();
