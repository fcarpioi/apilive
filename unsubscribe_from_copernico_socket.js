#!/usr/bin/env node

/**
 * Script para desuscribirse del socket de Copernico
 */

import fetch from 'node-fetch';

const RACE_ID = 'generali-maraton-malaga-2025';
const COMPETITION_ID = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const COPERNICO_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico';
const API_KEY = 'MISSING_WEBHOOK_API_KEY';

async function unsubscribeFromSocket() {
  console.log("🛑 DESUSCRIBIÉNDOSE DEL SOCKET DE COPERNICO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`🆔 Competition ID: ${COMPETITION_ID}`);
  
  try {
    // 1. Verificar estado actual antes de desuscribirse
    console.log("\n📊 PASO 1: Verificando estado actual...");
    
    const statusResponse = await fetch(`${COPERNICO_ENDPOINT}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const statusResult = await statusResponse.json();
    console.log("📋 Estado antes de desuscribirse:", statusResult);
    
    // Verificar si hay suscripciones activas
    const isConnected = statusResult.data?.connected || false;
    const activeRaces = statusResult.data?.activeRaces || [];
    const totalSubscriptions = statusResult.data?.totalSubscriptions || 0;
    
    if (!isConnected) {
      console.log("\n⚠️ El socket no está conectado actualmente");
      console.log("   No hay nada que desuscribir");
      return;
    }
    
    if (!activeRaces.includes(RACE_ID)) {
      console.log(`\n⚠️ La carrera ${RACE_ID} no está en las suscripciones activas`);
      console.log(`   Carreras activas: ${activeRaces.join(', ') || 'Ninguna'}`);
      return;
    }
    
    console.log(`\n✅ Suscripción activa encontrada:`);
    console.log(`   • Carreras activas: ${activeRaces.length}`);
    console.log(`   • Total suscripciones: ${totalSubscriptions}`);
    console.log(`   • Estado conexión: ${isConnected ? 'CONECTADO' : 'DESCONECTADO'}`);
    
    // 2. Desuscribirse de la carrera
    console.log("\n🛑 PASO 2: Desuscribiéndose de la carrera...");
    
    const unsubscribePayload = {
      raceId: RACE_ID,
      apiKey: API_KEY
    };
    
    const unsubscribeResponse = await fetch(`${COPERNICO_ENDPOINT}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(unsubscribePayload)
    });
    
    const unsubscribeResult = await unsubscribeResponse.json();
    console.log("✅ Respuesta de desuscripción:", unsubscribeResult);
    
    // 3. Verificar estado después de la desuscripción
    console.log("\n📊 PASO 3: Verificando estado después de desuscripción...");
    
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
    console.log("\n🎉 RESUMEN DE DESUSCRIPCIÓN");
    console.log("=" * 60);
    
    if (unsubscribeResult.success) {
      const finalConnected = finalStatusResult.data?.connected || false;
      const finalActiveRaces = finalStatusResult.data?.activeRaces || [];
      const finalTotalSubscriptions = finalStatusResult.data?.totalSubscriptions || 0;
      
      console.log(`✅ Desuscripción exitosa de carrera: ${RACE_ID}`);
      console.log(`📈 Estado final: ${finalConnected ? 'CONECTADO' : 'DESCONECTADO'}`);
      console.log(`🏁 Carreras activas restantes: ${finalActiveRaces.length}`);
      console.log(`📊 Total suscripciones restantes: ${finalTotalSubscriptions}`);
      
      if (finalActiveRaces.length > 0) {
        console.log(`   • Carreras aún activas: ${finalActiveRaces.join(', ')}`);
      }
      
      console.log("\n🎯 SISTEMA DESACTIVADO PARA ESTA CARRERA:");
      console.log("   • Socket desconectado de generali-maraton-malaga-2025");
      console.log("   • Ya no se monitoreará a los 21,406 participantes");
      console.log("   • No se generarán historias automáticamente");
      console.log("   • Los checkpoints ya no activarán el API");
      
      if (finalTotalSubscriptions === 0) {
        console.log("\n🔌 SOCKET COMPLETAMENTE DESCONECTADO:");
        console.log("   • No hay suscripciones activas");
        console.log("   • El socket está completamente inactivo");
      }
      
      console.log("\n🔔 PRÓXIMOS PASOS:");
      console.log("   • El sistema ya no procesará eventos en tiempo real");
      console.log("   • Para reactivar, ejecuta: node subscribe_to_copernico_socket.js");
      console.log("   • Puedes verificar el estado con /api/copernico/status");
      
    } else {
      console.log(`❌ Error en desuscripción: ${unsubscribeResult.message}`);
      console.log("\n⚠️ RECOMENDACIONES:");
      console.log("   • Verificar que la carrera esté actualmente suscrita");
      console.log("   • Revisar logs del sistema para más detalles");
      console.log("   • Intentar nuevamente en unos segundos");
    }
    
  } catch (error) {
    console.error("💥 Error fatal:", error);
    console.log("\n🔧 SOLUCIONES:");
    console.log("   • Verificar que el endpoint esté disponible");
    console.log("   • Comprobar la conexión a internet");
    console.log("   • Revisar que el API key sea correcto");
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
unsubscribeFromSocket().catch(console.error);
