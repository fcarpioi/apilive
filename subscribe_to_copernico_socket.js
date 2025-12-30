#!/usr/bin/env node

/**
 * Script para suscribirse al socket de Copernico usando el endpoint existente
 */

import fetch from 'node-fetch';

const RACE_ID = 'generali-maraton-malaga-2025';
const COMPETITION_ID = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const COPERNICO_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico';
const API_KEY = '9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0';

// Suscribirse a TODOS los participantes de la carrera (no especificar participantIds = todos)

async function subscribeToSocket() {
  console.log("🚀 SUSCRIBIÉNDOSE AL SOCKET DE COPERNICO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`🆔 Competition ID: ${COMPETITION_ID}`);
  console.log(`👥 Participantes: TODOS (21,406 participantes)`);

  try {
    // 1. Verificar estado actual
    console.log("\n📊 PASO 1: Verificando estado actual...");

    const statusResponse = await fetch(`${COPERNICO_ENDPOINT}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const statusResult = await statusResponse.json();
    console.log("📋 Estado actual:", statusResult);
    
    // 2. Suscribirse a TODOS los participantes de la carrera
    console.log("\n🏁 PASO 2: Suscribiéndose a TODOS los participantes...");

    const subscribePayload = {
      raceId: RACE_ID,
      // No incluir participantIds = suscribirse a TODOS los participantes
      apiKey: API_KEY
    };

    const subscribeResponse = await fetch(`${COPERNICO_ENDPOINT}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscribePayload)
    });

    const subscribeResult = await subscribeResponse.json();
    console.log("✅ Suscripción a carrera:", subscribeResult);
    
    // 3. Verificar estado después de la suscripción
    console.log("\n� PASO 3: Verificando estado después de suscripción...");

    await delay(3000); // Esperar 3 segundos

    const finalStatusResponse = await fetch(`${COPERNICO_ENDPOINT}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const finalStatusResult = await finalStatusResponse.json();
    console.log("📋 Estado final:", finalStatusResult);
    
    // Resumen final
    console.log("\n🎉 RESUMEN DE SUSCRIPCIÓN");
    console.log("=" * 60);

    if (subscribeResult.success) {
      console.log(`✅ Suscripción exitosa a carrera: ${RACE_ID}`);
      console.log(`� Participantes monitoreados: TODOS (21,406 participantes)`);
      console.log(`📈 Estado: ACTIVO`);

      console.log("\n🎯 SISTEMA ACTIVO:");
      console.log("   • Socket conectado a Copernico");
      console.log("   • Participantes monitoreados en tiempo real");
      console.log("   • Historias se generarán automáticamente");
      console.log("   • Cuando atletas pasen checkpoints → API se ejecuta");

      console.log("\n📍 CHECKPOINTS MONITOREADOS:");
      console.log("   • 5K, 10K, 15K, Media, 25K, 30K, 35K, Spotter, Meta");

      console.log("\n🔔 PRÓXIMOS PASOS:");
      console.log("   • El sistema está escuchando eventos en tiempo real");
      console.log("   • Cuando un atleta pase un checkpoint, se generará una historia automáticamente");
      console.log("   • Puedes verificar el estado en cualquier momento con /api/copernico/status");
    } else {
      console.log(`❌ Error en suscripción: ${subscribeResult.message}`);
      console.log("\n⚠️ RECOMENDACIONES:");
      console.log("   • Verificar que la carrera exista en Copernico");
      console.log("   • Revisar logs del sistema para más detalles");
    }
    
  } catch (error) {
    console.error("💥 Error fatal:", error);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
subscribeToSocket().catch(console.error);
