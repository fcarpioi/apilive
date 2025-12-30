#!/usr/bin/env node

/**
 * Script para verificar la carrera usando nuestro propio servicio
 */

import fetch from 'node-fetch';

const API_BASE = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api';
const RACE_ID = 'generali-maraton-malaga-2025';

async function checkRaceViaService() {
  console.log("🔍 VERIFICANDO CARRERA VÍA NUESTRO SERVICIO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`🌐 API Base: ${API_BASE}`);
  console.log(`⏰ Hora actual: ${new Date().toLocaleString()}`);
  console.log("");
  
  try {
    // 1. Verificar información de la carrera
    console.log("📊 PASO 1: Información de la carrera...");
    
    const raceUrl = `${API_BASE}/race/${RACE_ID}`;
    console.log(`🔗 URL: ${raceUrl}`);
    
    const raceResponse = await fetch(raceUrl);
    
    if (raceResponse.ok) {
      const raceData = await raceResponse.json();
      console.log("✅ Información de la carrera obtenida:");
      console.log(JSON.stringify(raceData, null, 2));
    } else {
      console.log(`❌ Error ${raceResponse.status}: ${raceResponse.statusText}`);
      const errorText = await raceResponse.text();
      console.log(`📄 Respuesta: ${errorText.substring(0, 200)}...`);
    }
    
    // 2. Verificar participantes específicos
    console.log("\n📊 PASO 2: Verificando participantes específicos...");
    
    const participantsToCheck = ['64D271D9', '2B5C4YZD', '4FYA421Z'];
    
    for (const participantId of participantsToCheck) {
      console.log(`\n🔍 Verificando participante: ${participantId}`);
      
      try {
        const participantUrl = `${API_BASE}/participant/${participantId}?raceId=${RACE_ID}`;
        console.log(`🔗 URL: ${participantUrl}`);
        
        const participantResponse = await fetch(participantUrl);
        
        if (participantResponse.ok) {
          const participantData = await participantResponse.json();
          
          console.log(`   ✅ Participante encontrado:`);
          console.log(`   • Nombre: ${participantData.name || 'N/A'}`);
          console.log(`   • Dorsal: ${participantData.bib || participantData.dorsal || 'N/A'}`);
          console.log(`   • Categoría: ${participantData.category || 'N/A'}`);
          
          // Verificar si tiene splits/tiempos
          if (participantData.splits) {
            const splitCount = Object.keys(participantData.splits).length;
            console.log(`   • Splits disponibles: ${splitCount}`);
            
            if (splitCount > 0) {
              console.log("   • Splits:");
              Object.entries(participantData.splits).forEach(([splitName, splitData]) => {
                console.log(`     - ${splitName}: ${splitData.time || splitData.netTime || 'N/A'}`);
              });
            }
          }
          
          // Verificar última actualización
          if (participantData.lastUpdate || participantData.updatedAt) {
            const lastUpdate = new Date(participantData.lastUpdate || participantData.updatedAt);
            const timeDiff = Date.now() - lastUpdate.getTime();
            const minutesAgo = Math.floor(timeDiff / (1000 * 60));
            
            console.log(`   • Última actualización: hace ${minutesAgo} minutos`);
            
            if (minutesAgo < 30) {
              console.log("   🟢 ACTUALIZACIÓN RECIENTE");
            } else if (minutesAgo < 120) {
              console.log("   🟡 ACTUALIZACIÓN MODERADA");
            } else {
              console.log("   🔴 SIN ACTUALIZACIONES RECIENTES");
            }
          }
          
        } else {
          console.log(`   ❌ Error ${participantResponse.status}: ${participantResponse.statusText}`);
        }
        
      } catch (participantError) {
        console.log(`   💥 Error: ${participantError.message}`);
      }
      
      await delay(1000);
    }
    
    // 3. Verificar logs de Firebase Functions
    console.log("\n📊 PASO 3: Verificando logs recientes...");
    
    try {
      const logsUrl = `${API_BASE}/logs?limit=10`;
      const logsResponse = await fetch(logsUrl);
      
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        
        if (logsData.success && logsData.data && logsData.data.length > 0) {
          console.log("✅ Logs recientes encontrados:");
          
          logsData.data.slice(0, 5).forEach((log, index) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            console.log(`   ${index + 1}. ${time} - ${log.level}: ${log.message.substring(0, 80)}...`);
          });
          
        } else {
          console.log("🔴 No hay logs recientes disponibles");
        }
      } else {
        console.log(`❌ Error obteniendo logs: ${logsResponse.status}`);
      }
      
    } catch (logsError) {
      console.log(`💥 Error logs: ${logsError.message}`);
    }
    
    // 4. Verificar estado del socket nuevamente
    console.log("\n📊 PASO 4: Estado del socket...");
    
    try {
      const socketUrl = `${API_BASE}/copernico/status`;
      const socketResponse = await fetch(socketUrl);
      
      if (socketResponse.ok) {
        const socketData = await socketResponse.json();
        
        console.log("✅ Estado del socket:");
        console.log(`   • Conectado: ${socketData.data?.connected ? '🟢 SÍ' : '🔴 NO'}`);
        console.log(`   • Carreras activas: ${socketData.data?.activeRaces?.length || 0}`);
        console.log(`   • Total suscripciones: ${socketData.data?.totalSubscriptions || 0}`);
        
        if (socketData.data?.websocketStatus) {
          const ws = socketData.data.websocketStatus;
          console.log(`   • WebSocket conectado: ${ws.connected ? '🟢 SÍ' : '🔴 NO'}`);
          console.log(`   • Carrera actual: ${ws.race || 'Ninguna'}`);
          console.log(`   • Ambiente: ${ws.environment || 'N/A'}`);
        }
        
      } else {
        console.log(`❌ Error obteniendo estado socket: ${socketResponse.status}`);
      }
      
    } catch (socketError) {
      console.log(`💥 Error socket: ${socketError.message}`);
    }
    
  } catch (error) {
    console.error("💥 Error general:", error.message);
  }
  
  console.log("\n🔍 DIAGNÓSTICO Y RECOMENDACIONES:");
  console.log("=" * 60);
  console.log("Posibles causas de la falta de datos:");
  console.log("");
  console.log("1. 🕐 TIMING DE LA CARRERA:");
  console.log("   • La carrera puede no haber comenzado aún");
  console.log("   • Verificar hora oficial de inicio");
  console.log("");
  console.log("2. 🔧 CONFIGURACIÓN:");
  console.log("   • Token de Copernico puede haber expirado");
  console.log("   • Permisos insuficientes para la carrera");
  console.log("");
  console.log("3. 📡 CONECTIVIDAD:");
  console.log("   • Socket conectado pero sin datos");
  console.log("   • Copernico puede no estar enviando eventos");
  console.log("");
  console.log("4. 🎯 ACCIONES RECOMENDADAS:");
  console.log("   • Verificar hora oficial de la carrera");
  console.log("   • Contactar con Copernico para verificar estado");
  console.log("   • Revisar logs de Firebase Functions");
  console.log("   • Probar con datos de prueba mientras tanto");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
checkRaceViaService().catch(console.error);
