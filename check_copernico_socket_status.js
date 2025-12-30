#!/usr/bin/env node

/**
 * Script para verificar el estado del socket de Copernico
 */

import fetch from 'node-fetch';

const COPERNICO_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico';

async function checkSocketStatus() {
  console.log("📊 VERIFICANDO ESTADO DEL SOCKET DE COPERNICO");
  console.log("=" * 60);
  
  try {
    // 1. Obtener estado general
    console.log("📡 Consultando estado del socket...");
    
    const statusResponse = await fetch(`${COPERNICO_ENDPOINT}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!statusResponse.ok) {
      throw new Error(`HTTP ${statusResponse.status}: ${statusResponse.statusText}`);
    }
    
    const statusResult = await statusResponse.json();
    
    // 2. Obtener métricas detalladas
    console.log("\n📈 Consultando métricas...");
    
    const metricsResponse = await fetch(`${COPERNICO_ENDPOINT}/metrics`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    let metricsResult = null;
    if (metricsResponse.ok) {
      metricsResult = await metricsResponse.json();
    }
    
    // 3. Mostrar información detallada
    console.log("\n🔍 ESTADO DETALLADO DEL SOCKET");
    console.log("=" * 60);
    
    const data = statusResult.data || {};
    const websocketStatus = data.websocketStatus || {};
    
    // Estado de conexión
    console.log("🔌 CONEXIÓN:");
    console.log(`   • Estado: ${data.connected ? '🟢 CONECTADO' : '🔴 DESCONECTADO'}`);
    console.log(`   • Ambiente: ${websocketStatus.environment || 'N/A'}`);
    console.log(`   • Carrera actual: ${websocketStatus.race || 'Ninguna'}`);
    
    // Suscripciones activas
    console.log("\n📋 SUSCRIPCIONES:");
    console.log(`   • Total suscripciones: ${data.totalSubscriptions || 0}`);
    console.log(`   • Carreras activas: ${data.activeRaces?.length || 0}`);
    
    if (data.activeRaces && data.activeRaces.length > 0) {
      data.activeRaces.forEach((race, index) => {
        console.log(`     ${index + 1}. ${race}`);
      });
    } else {
      console.log("     (No hay carreras activas)");
    }
    
    // Detalles de suscripciones
    if (websocketStatus.subscriptions && websocketStatus.subscriptions.length > 0) {
      console.log("\n🎯 DETALLES DE SUSCRIPCIONES:");
      websocketStatus.subscriptions.forEach((sub, index) => {
        console.log(`   ${index + 1}. Entidad: ${sub.entity || 'N/A'}, ID: ${sub.id || 'Todos'}`);
      });
    }
    
    // Métricas (si están disponibles)
    if (metricsResult && metricsResult.success) {
      const metrics = metricsResult.data || {};
      
      console.log("\n📊 MÉTRICAS:");
      console.log(`   • Intentos de conexión: ${metrics.connectionAttempts || 0}`);
      console.log(`   • Mensajes recibidos: ${metrics.messagesReceived || 0}`);
      console.log(`   • Mensajes procesados: ${metrics.messagesProcessed || 0}`);
      console.log(`   • Errores: ${metrics.errors || 0}`);
      
      if (metrics.lastActivity) {
        console.log(`   • Última actividad: ${new Date(metrics.lastActivity).toLocaleString()}`);
      }
      
      // Alertas recientes
      if (metricsResult.alerts && metricsResult.alerts.length > 0) {
        console.log("\n⚠️ ALERTAS RECIENTES:");
        metricsResult.alerts.slice(0, 5).forEach((alert, index) => {
          console.log(`   ${index + 1}. ${alert.message} (${new Date(alert.timestamp).toLocaleString()})`);
        });
      }
    }
    
    // Estado específico de generali-maraton-malaga-2025
    console.log("\n🏁 ESTADO ESPECÍFICO - GENERALI MARATÓN MÁLAGA 2025:");
    const targetRace = 'generali-maraton-malaga-2025';
    const isTargetRaceActive = data.activeRaces?.includes(targetRace) || false;
    
    if (isTargetRaceActive) {
      console.log("   🟢 ACTIVO - La carrera está siendo monitoreada");
      console.log("   • 21,406 participantes monitoreados");
      console.log("   • Historias se generan automáticamente");
      console.log("   • Checkpoints: 5K, 10K, 15K, Media, 25K, 30K, 35K, Spotter, Meta");
    } else {
      console.log("   🔴 INACTIVO - La carrera NO está siendo monitoreada");
      console.log("   • No se generarán historias automáticamente");
      console.log("   • Para activar: node subscribe_to_copernico_socket.js");
    }
    
    // Recomendaciones
    console.log("\n💡 RECOMENDACIONES:");
    
    if (data.connected && isTargetRaceActive) {
      console.log("   ✅ Todo está funcionando correctamente");
      console.log("   • El sistema está listo para la carrera del 14/12/2025");
      console.log("   • Las historias se generarán automáticamente");
    } else if (data.connected && !isTargetRaceActive) {
      console.log("   ⚠️ Socket conectado pero carrera no suscrita");
      console.log("   • Ejecutar: node subscribe_to_copernico_socket.js");
    } else {
      console.log("   🔴 Socket desconectado");
      console.log("   • Ejecutar: node subscribe_to_copernico_socket.js");
    }
    
    // Comandos útiles
    console.log("\n🔧 COMANDOS ÚTILES:");
    console.log("   • Suscribirse: node subscribe_to_copernico_socket.js");
    console.log("   • Desuscribirse: node unsubscribe_from_copernico_socket.js");
    console.log("   • Ver estado: node check_copernico_socket_status.js");
    console.log("   • API status: curl https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico/status");
    
  } catch (error) {
    console.error("💥 Error consultando estado:", error);
    console.log("\n🔧 SOLUCIONES:");
    console.log("   • Verificar que el endpoint esté disponible");
    console.log("   • Comprobar la conexión a internet");
    console.log("   • Revisar que el servicio esté desplegado");
  }
}

// Ejecutar
checkSocketStatus().catch(console.error);
