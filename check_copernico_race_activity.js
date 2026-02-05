#!/usr/bin/env node

/**
 * Script para verificar actividad en tiempo real de la carrera en Copernico
 */

import fetch from 'node-fetch';

const COPERNICO_CONFIG = {
  api: process.env.COPERNICO_ACTIVITY_BASE_URL || "https://api.copernico.cloud/api/races",
  token: process.env.COPERNICO_ACTIVITY_TOKEN
};

if (!COPERNICO_CONFIG.token) {
  console.warn("⚠️ Missing COPERNICO_ACTIVITY_TOKEN env var.");
}

const RACE_ID = 'generali-maraton-malaga-2025';

async function checkRaceActivity() {
  console.log("🔍 VERIFICANDO ACTIVIDAD DE LA CARRERA EN COPERNICO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`🌐 API: ${COPERNICO_CONFIG.api}`);
  console.log(`⏰ Hora actual: ${new Date().toLocaleString()}`);
  console.log("");
  
  try {
    // 1. Verificar información general de la carrera
    console.log("📊 PASO 1: Información general de la carrera...");
    
    const raceInfoUrl = `${COPERNICO_CONFIG.api}/${RACE_ID}`;
    const raceResponse = await fetch(raceInfoUrl, {
      headers: {
        'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!raceResponse.ok) {
      throw new Error(`Error ${raceResponse.status}: ${raceResponse.statusText}`);
    }
    
    const raceData = await raceResponse.json();
    console.log("✅ Información de la carrera:");
    console.log(`   • Nombre: ${raceData.name || 'N/A'}`);
    console.log(`   • Estado: ${raceData.status || 'N/A'}`);
    console.log(`   • Fecha: ${raceData.date || 'N/A'}`);
    console.log(`   • Participantes: ${raceData.participants?.length || 'N/A'}`);
    
    if (raceData.startTime) {
      console.log(`   • Hora de inicio: ${raceData.startTime}`);
    }
    
    if (raceData.status) {
      console.log(`   • Estado actual: ${raceData.status}`);
      
      if (raceData.status === 'finished') {
        console.log("🏁 LA CARRERA YA TERMINÓ");
      } else if (raceData.status === 'active' || raceData.status === 'running') {
        console.log("🏃‍♂️ LA CARRERA ESTÁ ACTIVA");
      } else if (raceData.status === 'pending' || raceData.status === 'scheduled') {
        console.log("⏰ LA CARRERA AÚN NO HA COMENZADO");
      }
    }
    
    // 2. Verificar actividad reciente de participantes
    console.log("\n📊 PASO 2: Verificando actividad reciente...");
    
    // Obtener algunos participantes para verificar si tienen datos recientes
    const participantsToCheck = ['64D271D9', '2B5C4YZD', '4FYA421Z'];
    
    for (const participantId of participantsToCheck) {
      try {
        console.log(`\n🔍 Verificando participante: ${participantId}`);
        
        const participantUrl = `${COPERNICO_CONFIG.api}/${RACE_ID}/participants/${participantId}`;
        const participantResponse = await fetch(participantUrl, {
          headers: {
            'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (participantResponse.ok) {
          const participantData = await participantResponse.json();
          
          console.log(`   • Nombre: ${participantData.name || 'N/A'}`);
          console.log(`   • Dorsal: ${participantData.bib || 'N/A'}`);
          
          // Verificar si tiene splits/tiempos recientes
          if (participantData.events && participantData.events.length > 0) {
            const event = participantData.events[0];
            
            if (event.splits && Object.keys(event.splits).length > 0) {
              console.log(`   • Splits disponibles: ${Object.keys(event.splits).length}`);
              
              // Mostrar los splits más recientes
              const splits = Object.entries(event.splits);
              const recentSplits = splits.slice(-3); // Últimos 3 splits
              
              console.log("   • Splits recientes:");
              recentSplits.forEach(([splitName, splitData]) => {
                const time = splitData.time || splitData.netTime || 'N/A';
                console.log(`     - ${splitName}: ${time}`);
              });
              
              // Verificar timestamps
              const lastSplit = splits[splits.length - 1];
              if (lastSplit && lastSplit[1].timestamp) {
                const lastTime = new Date(lastSplit[1].timestamp);
                const timeDiff = Date.now() - lastTime.getTime();
                const minutesAgo = Math.floor(timeDiff / (1000 * 60));
                
                console.log(`   • Último split hace: ${minutesAgo} minutos`);
                
                if (minutesAgo < 60) {
                  console.log("   🟢 ACTIVIDAD RECIENTE DETECTADA");
                } else if (minutesAgo < 240) {
                  console.log("   🟡 ACTIVIDAD MODERADA");
                } else {
                  console.log("   🔴 SIN ACTIVIDAD RECIENTE");
                }
              }
              
            } else {
              console.log("   🔴 Sin splits disponibles");
            }
          } else {
            console.log("   🔴 Sin eventos disponibles");
          }
          
        } else {
          console.log(`   ❌ Error ${participantResponse.status}: ${participantResponse.statusText}`);
        }
        
      } catch (participantError) {
        console.log(`   💥 Error: ${participantError.message}`);
      }
      
      await delay(1000); // Pausa entre requests
    }
    
    // 3. Verificar leaderboard/clasificación general
    console.log("\n📊 PASO 3: Verificando leaderboard...");
    
    try {
      const leaderboardUrl = `${COPERNICO_CONFIG.api}/${RACE_ID}/leaderboard`;
      const leaderboardResponse = await fetch(leaderboardUrl, {
        headers: {
          'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        
        if (leaderboardData && leaderboardData.length > 0) {
          console.log(`✅ Leaderboard disponible con ${leaderboardData.length} entradas`);
          
          // Mostrar top 3
          const top3 = leaderboardData.slice(0, 3);
          console.log("🏆 Top 3 actual:");
          top3.forEach((entry, index) => {
            console.log(`   ${index + 1}. ${entry.name || 'N/A'} - ${entry.time || entry.netTime || 'N/A'}`);
          });
          
        } else {
          console.log("🔴 Leaderboard vacío");
        }
      } else {
        console.log(`❌ Error obteniendo leaderboard: ${leaderboardResponse.status}`);
      }
      
    } catch (leaderboardError) {
      console.log(`💥 Error leaderboard: ${leaderboardError.message}`);
    }
    
  } catch (error) {
    console.error("💥 Error general:", error.message);
    
    if (error.message.includes('401')) {
      console.log("🔧 DIAGNÓSTICO: Token de autenticación inválido");
      console.log("   • Verificar que el token de Copernico sea correcto");
      console.log("   • El token puede haber expirado");
    } else if (error.message.includes('404')) {
      console.log("🔧 DIAGNÓSTICO: Carrera no encontrada");
      console.log("   • Verificar que el ID de la carrera sea correcto");
      console.log("   • La carrera puede haber sido eliminada o renombrada");
    } else if (error.message.includes('403')) {
      console.log("🔧 DIAGNÓSTICO: Sin permisos");
      console.log("   • El token no tiene permisos para esta carrera");
    }
  }
  
  console.log("\n🔍 DIAGNÓSTICO FINAL:");
  console.log("=" * 60);
  console.log("Si no hay actividad reciente:");
  console.log("1. 🕐 La carrera puede no haber comenzado aún");
  console.log("2. 🏁 La carrera puede haber terminado");
  console.log("3. 📡 Problema de conectividad con Copernico");
  console.log("4. 🔧 Configuración incorrecta del socket");
  console.log("5. ⚙️ El sistema de timing puede estar inactivo");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
checkRaceActivity().catch(console.error);
