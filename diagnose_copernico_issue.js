#!/usr/bin/env node

/**
 * Script para diagnosticar problemas con Copernico
 */

import fetch from 'node-fetch';

const COPERNICO_CONFIG = {
  api: "https://api.copernico.cloud/api/races",
  socket: "https://socket-ss.sportmaniacs.com:4319/",
  token: "CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF"
};

const RACE_ID = 'generali-maraton-malaga-2025';

async function diagnoseCopernicoIssue() {
  console.log("🔍 DIAGNÓSTICO COMPLETO DE COPERNICO");
  console.log("=" * 60);
  console.log(`⏰ Hora actual: ${new Date().toLocaleString()}`);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log("");
  
  // 1. Verificar conectividad básica con Copernico
  console.log("📡 PASO 1: Verificando conectividad básica...");
  
  try {
    const baseResponse = await fetch(COPERNICO_CONFIG.api, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   Status: ${baseResponse.status} ${baseResponse.statusText}`);
    
    if (baseResponse.status === 401) {
      console.log("   ❌ TOKEN INVÁLIDO O EXPIRADO");
      console.log("   🔧 SOLUCIÓN: Contactar Copernico para renovar token");
      return;
    } else if (baseResponse.status === 403) {
      console.log("   ❌ SIN PERMISOS");
      console.log("   🔧 SOLUCIÓN: Verificar permisos del token");
      return;
    } else if (baseResponse.ok) {
      console.log("   ✅ Conectividad básica OK");
    }
    
  } catch (error) {
    console.log(`   ❌ Error de conectividad: ${error.message}`);
    return;
  }
  
  // 2. Verificar si podemos listar carreras
  console.log("\n📊 PASO 2: Verificando acceso a carreras...");
  
  try {
    const racesResponse = await fetch(COPERNICO_CONFIG.api, {
      headers: {
        'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (racesResponse.ok) {
      const racesData = await racesResponse.json();
      console.log(`   ✅ Acceso a carreras OK`);
      console.log(`   📊 Total carreras disponibles: ${racesData.length || 'N/A'}`);
      
      // Buscar nuestra carrera específica
      const ourRace = racesData.find(race => race.id === RACE_ID || race.slug === RACE_ID);
      
      if (ourRace) {
        console.log(`   ✅ Carrera encontrada: ${ourRace.name || RACE_ID}`);
        console.log(`   📅 Estado: ${ourRace.status || 'N/A'}`);
        console.log(`   👥 Participantes: ${ourRace.participants?.length || 'N/A'}`);
      } else {
        console.log(`   ❌ Carrera ${RACE_ID} NO encontrada en la lista`);
        console.log("   🔧 PROBLEMA: La carrera no existe o no tenemos acceso");
        
        // Mostrar las primeras 5 carreras disponibles
        console.log("\n   📋 Carreras disponibles (primeras 5):");
        racesData.slice(0, 5).forEach((race, index) => {
          console.log(`      ${index + 1}. ${race.id || race.slug} - ${race.name}`);
        });
        
        return;
      }
      
    } else {
      console.log(`   ❌ Error accediendo carreras: ${racesResponse.status}`);
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return;
  }
  
  // 3. Verificar acceso específico a nuestra carrera
  console.log("\n🏁 PASO 3: Verificando acceso específico a la carrera...");
  
  try {
    const raceUrl = `${COPERNICO_CONFIG.api}/${RACE_ID}`;
    const raceResponse = await fetch(raceUrl, {
      headers: {
        'Authorization': `Bearer ${COPERNICO_CONFIG.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (raceResponse.ok) {
      const raceData = await raceResponse.json();
      console.log(`   ✅ Acceso a carrera específica OK`);
      console.log(`   📊 Nombre: ${raceData.name || 'N/A'}`);
      console.log(`   📅 Estado: ${raceData.status || 'N/A'}`);
      console.log(`   👥 Participantes: ${raceData.participants?.length || 'N/A'}`);
      console.log(`   🕐 Última actualización: ${raceData.lastUpdate || 'N/A'}`);
      
      // Verificar si la carrera está activa
      if (raceData.status === 'active' || raceData.status === 'running') {
        console.log("   🟢 CARRERA ACTIVA - Debería haber datos");
      } else if (raceData.status === 'finished') {
        console.log("   🏁 CARRERA TERMINADA - Datos históricos disponibles");
      } else {
        console.log(`   ⏰ CARRERA EN ESTADO: ${raceData.status}`);
      }
      
    } else {
      console.log(`   ❌ Error accediendo carrera: ${raceResponse.status}`);
      
      if (raceResponse.status === 404) {
        console.log("   🔧 PROBLEMA: Carrera no encontrada");
      } else if (raceResponse.status === 403) {
        console.log("   🔧 PROBLEMA: Sin permisos para esta carrera específica");
      }
      
      return;
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return;
  }
  
  // 4. Verificar WebSocket
  console.log("\n📡 PASO 4: Verificando WebSocket...");
  
  try {
    // Verificar que el socket esté disponible
    const socketUrl = COPERNICO_CONFIG.socket.replace('https://', 'http://');
    console.log(`   🔗 Socket URL: ${COPERNICO_CONFIG.socket}`);
    
    // No podemos hacer una request HTTP al socket, pero podemos verificar nuestro estado
    const ourSocketUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/copernico/status';
    const socketResponse = await fetch(ourSocketUrl);
    
    if (socketResponse.ok) {
      const socketData = await socketResponse.json();
      
      console.log("   📊 Estado de nuestro socket:");
      console.log(`      • Conectado: ${socketData.data?.connected ? '✅' : '❌'}`);
      console.log(`      • Carrera activa: ${socketData.data?.websocketStatus?.race || 'Ninguna'}`);
      console.log(`      • Ambiente: ${socketData.data?.websocketStatus?.environment || 'N/A'}`);
      console.log(`      • Suscripciones: ${socketData.data?.totalSubscriptions || 0}`);
      
      if (!socketData.data?.connected) {
        console.log("   ❌ SOCKET DESCONECTADO");
        console.log("   🔧 SOLUCIÓN: Reconectar socket");
      } else if (socketData.data?.websocketStatus?.race !== RACE_ID) {
        console.log("   ❌ SOCKET CONECTADO A CARRERA INCORRECTA");
        console.log("   🔧 SOLUCIÓN: Re-suscribirse a la carrera correcta");
      } else {
        console.log("   ✅ Socket configurado correctamente");
      }
      
    } else {
      console.log(`   ❌ Error verificando nuestro socket: ${socketResponse.status}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error socket: ${error.message}`);
  }
  
  console.log("\n🎯 DIAGNÓSTICO FINAL:");
  console.log("=" * 60);
  console.log("Basado en el análisis:");
  console.log("");
  console.log("✅ SI TODO ESTÁ OK:");
  console.log("   • Token válido y con permisos");
  console.log("   • Carrera existe y está activa");
  console.log("   • Socket conectado correctamente");
  console.log("   • PROBLEMA: Copernico no está enviando eventos");
  console.log("   • SOLUCIÓN: Contactar soporte de Copernico");
  console.log("");
  console.log("❌ SI HAY PROBLEMAS:");
  console.log("   • Token inválido → Renovar con Copernico");
  console.log("   • Sin permisos → Verificar acceso a la carrera");
  console.log("   • Carrera no encontrada → Verificar ID de carrera");
  console.log("   • Socket desconectado → Reconectar");
  console.log("");
  console.log("📞 CONTACTOS:");
  console.log("   • Soporte Copernico: verificar token y eventos");
  console.log("   • Organizador carrera: confirmar integración activa");
}

// Ejecutar
diagnoseCopernicoIssue().catch(console.error);
