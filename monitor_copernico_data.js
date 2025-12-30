#!/usr/bin/env node

/**
 * Script para monitorear datos en tiempo real del socket de Copernico
 */

import fetch from 'node-fetch';

const COPERNICO_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico';
const RACE_ID = 'generali-maraton-malaga-2025';

let monitoringActive = true;
let dataReceived = 0;
let lastDataTime = null;
let startTime = new Date();

async function monitorData() {
  console.log("📡 MONITOREANDO DATOS DEL SOCKET DE COPERNICO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`⏰ Inicio: ${startTime.toLocaleString()}`);
  console.log(`🔄 Presiona Ctrl+C para detener el monitoreo`);
  console.log("");
  
  // Verificar estado inicial
  await checkInitialStatus();
  
  // Iniciar monitoreo continuo
  console.log("🔍 INICIANDO MONITOREO EN TIEMPO REAL...");
  console.log("=" * 60);
  
  const monitorInterval = setInterval(async () => {
    if (!monitoringActive) {
      clearInterval(monitorInterval);
      return;
    }
    
    try {
      await checkForNewData();
    } catch (error) {
      console.error(`❌ Error en monitoreo: ${error.message}`);
    }
  }, 5000); // Verificar cada 5 segundos
  
  // Mostrar estadísticas cada 30 segundos
  const statsInterval = setInterval(() => {
    if (!monitoringActive) {
      clearInterval(statsInterval);
      return;
    }
    showStatistics();
  }, 30000);
  
  // Manejar Ctrl+C
  process.on('SIGINT', () => {
    console.log("\n\n🛑 DETENIENDO MONITOREO...");
    monitoringActive = false;
    clearInterval(monitorInterval);
    clearInterval(statsInterval);
    showFinalSummary();
    process.exit(0);
  });
}

async function checkInitialStatus() {
  try {
    console.log("📊 Verificando estado inicial...");
    
    const statusResponse = await fetch(`${COPERNICO_ENDPOINT}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const statusResult = await statusResponse.json();
    const data = statusResult.data || {};
    
    console.log(`🔌 Estado: ${data.connected ? '🟢 CONECTADO' : '🔴 DESCONECTADO'}`);
    console.log(`🏁 Carreras activas: ${data.activeRaces?.length || 0}`);
    console.log(`📊 Total suscripciones: ${data.totalSubscriptions || 0}`);
    
    if (!data.connected) {
      console.log("⚠️ ADVERTENCIA: Socket no conectado");
      console.log("   Para conectar: node subscribe_to_copernico_socket.js");
    }
    
    if (!data.activeRaces?.includes(RACE_ID)) {
      console.log(`⚠️ ADVERTENCIA: Carrera ${RACE_ID} no está suscrita`);
    }
    
    console.log("");
    
  } catch (error) {
    console.error(`❌ Error verificando estado: ${error.message}`);
  }
}

async function checkForNewData() {
  try {
    // Verificar métricas
    const metricsResponse = await fetch(`${COPERNICO_ENDPOINT}/metrics`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (metricsResponse.ok) {
      const metricsResult = await metricsResponse.json();
      
      if (metricsResult.success && metricsResult.data) {
        const metrics = metricsResult.data;
        const currentMessages = metrics.messagesReceived || 0;
        
        if (currentMessages > dataReceived) {
          const newMessages = currentMessages - dataReceived;
          dataReceived = currentMessages;
          lastDataTime = new Date();
          
          console.log(`📨 ${lastDataTime.toLocaleTimeString()} - Nuevos mensajes: ${newMessages} (Total: ${dataReceived})`);
          
          // Mostrar detalles adicionales si están disponibles
          if (metrics.lastMessage) {
            console.log(`   📄 Último mensaje: ${JSON.stringify(metrics.lastMessage).substring(0, 100)}...`);
          }
          
          if (metrics.messagesProcessed) {
            console.log(`   ✅ Procesados: ${metrics.messagesProcessed}`);
          }
          
          if (metrics.errors && metrics.errors > 0) {
            console.log(`   ❌ Errores: ${metrics.errors}`);
          }
        }
      }
    }
    
    // Verificar logs recientes (si están disponibles)
    const logsResponse = await fetch(`${COPERNICO_ENDPOINT}/logs?limit=5`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (logsResponse.ok) {
      const logsResult = await logsResponse.json();
      
      if (logsResult.success && logsResult.data && logsResult.data.length > 0) {
        const recentLogs = logsResult.data.filter(log => {
          const logTime = new Date(log.timestamp);
          const timeDiff = Date.now() - logTime.getTime();
          return timeDiff < 10000; // Últimos 10 segundos
        });
        
        recentLogs.forEach(log => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          console.log(`📝 ${time} - ${log.level}: ${log.message}`);
        });
      }
    }
    
  } catch (error) {
    // Error silencioso para no spam
    if (Date.now() % 60000 < 5000) { // Mostrar error solo cada minuto
      console.error(`⚠️ Error consultando datos: ${error.message}`);
    }
  }
}

function showStatistics() {
  const now = new Date();
  const elapsed = Math.floor((now - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  console.log("\n📊 ESTADÍSTICAS DE MONITOREO:");
  console.log(`   ⏱️ Tiempo transcurrido: ${minutes}m ${seconds}s`);
  console.log(`   📨 Total mensajes recibidos: ${dataReceived}`);
  console.log(`   📈 Promedio: ${dataReceived > 0 ? (dataReceived / (elapsed / 60)).toFixed(2) : 0} msg/min`);
  
  if (lastDataTime) {
    const timeSinceLastData = Math.floor((now - lastDataTime) / 1000);
    console.log(`   🕐 Último dato hace: ${timeSinceLastData}s`);
  } else {
    console.log(`   🕐 Último dato: Ninguno recibido`);
  }
  
  console.log("");
}

function showFinalSummary() {
  const endTime = new Date();
  const totalTime = Math.floor((endTime - startTime) / 1000);
  const minutes = Math.floor(totalTime / 60);
  const seconds = totalTime % 60;
  
  console.log("\n🎯 RESUMEN FINAL DEL MONITOREO:");
  console.log("=" * 50);
  console.log(`⏱️ Duración total: ${minutes}m ${seconds}s`);
  console.log(`📨 Total mensajes: ${dataReceived}`);
  console.log(`📈 Promedio: ${dataReceived > 0 ? (dataReceived / (totalTime / 60)).toFixed(2) : 0} msg/min`);
  
  if (dataReceived > 0) {
    console.log("✅ DATOS RECIBIDOS - El socket está funcionando");
    console.log("   • Los atletas están enviando datos");
    console.log("   • Las historias se están generando automáticamente");
  } else {
    console.log("⚠️ NO SE RECIBIERON DATOS");
    console.log("   • Posibles causas:");
    console.log("     - La carrera aún no ha comenzado");
    console.log("     - Los atletas no están pasando checkpoints");
    console.log("     - Problema de conectividad con Copernico");
    console.log("     - Socket no está correctamente suscrito");
  }
  
  console.log("\n🔧 PRÓXIMOS PASOS:");
  if (dataReceived === 0) {
    console.log("   • Verificar estado: node check_copernico_socket_status.js");
    console.log("   • Re-suscribirse: node subscribe_to_copernico_socket.js");
    console.log("   • Verificar que la carrera esté activa en Copernico");
  } else {
    console.log("   • El sistema está funcionando correctamente");
    console.log("   • Continuar monitoreando si es necesario");
  }
}

// Ejecutar
monitorData().catch(console.error);
