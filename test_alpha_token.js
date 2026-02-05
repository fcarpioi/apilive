#!/usr/bin/env node

/**
 * Script para probar el token de alpha en producción
 */

import fetch from 'node-fetch';

const TOKENS = {
  current: "MISSING_COPERNICO_API_KEY",
  alpha: "MISSING_COPERNICO_API_KEY"
};

const COPERNICO_API = "https://api.copernico.cloud/api/races";
const RACE_ID = 'generali-maraton-malaga-2025';

async function testTokens() {
  console.log("🔑 PROBANDO TOKENS DE COPERNICO");
  console.log("=" * 60);
  console.log(`🏁 Carrera: ${RACE_ID}`);
  console.log(`🌐 API: ${COPERNICO_API}`);
  console.log("");
  
  for (const [tokenName, token] of Object.entries(TOKENS)) {
    console.log(`🔍 PROBANDO TOKEN: ${tokenName.toUpperCase()}`);
    console.log(`🔑 Token: ${token.substring(0, 20)}...`);
    
    try {
      // Test 1: Acceso básico a la API
      console.log("   📡 Test 1: Acceso básico...");
      
      const baseResponse = await fetch(COPERNICO_API, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`      Status: ${baseResponse.status} ${baseResponse.statusText}`);
      
      if (baseResponse.status === 401) {
        console.log("      ❌ TOKEN INVÁLIDO");
        continue;
      } else if (baseResponse.status === 403) {
        console.log("      ❌ SIN PERMISOS");
        continue;
      } else if (!baseResponse.ok) {
        console.log(`      ❌ ERROR: ${baseResponse.status}`);
        continue;
      }
      
      console.log("      ✅ Acceso básico OK");
      
      // Test 2: Listar carreras
      console.log("   📊 Test 2: Listando carreras...");
      
      const racesData = await baseResponse.json();
      console.log(`      📋 Total carreras: ${racesData.length || 'N/A'}`);
      
      // Buscar nuestra carrera
      const ourRace = racesData.find(race => 
        race.id === RACE_ID || 
        race.slug === RACE_ID ||
        race.name?.toLowerCase().includes('malaga')
      );
      
      if (ourRace) {
        console.log(`      ✅ Carrera encontrada: ${ourRace.name || ourRace.id}`);
        console.log(`      📊 Estado: ${ourRace.status || 'N/A'}`);
        console.log(`      👥 Participantes: ${ourRace.participants?.length || 'N/A'}`);
      } else {
        console.log("      ⚠️ Carrera no encontrada en la lista");
        
        // Mostrar carreras disponibles que contengan "malaga"
        const malagaRaces = racesData.filter(race => 
          race.name?.toLowerCase().includes('malaga') ||
          race.id?.toLowerCase().includes('malaga')
        );
        
        if (malagaRaces.length > 0) {
          console.log("      📋 Carreras de Málaga encontradas:");
          malagaRaces.forEach(race => {
            console.log(`         • ${race.id || race.slug} - ${race.name}`);
          });
        }
      }
      
      // Test 3: Acceso específico a la carrera
      console.log("   🏁 Test 3: Acceso específico a la carrera...");
      
      const raceUrl = `${COPERNICO_API}/${RACE_ID}`;
      const raceResponse = await fetch(raceUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`      Status: ${raceResponse.status} ${raceResponse.statusText}`);
      
      if (raceResponse.ok) {
        const raceData = await raceResponse.json();
        console.log("      ✅ Acceso específico OK");
        console.log(`      📊 Nombre: ${raceData.name || 'N/A'}`);
        console.log(`      📅 Estado: ${raceData.status || 'N/A'}`);
        console.log(`      👥 Participantes: ${raceData.participants?.length || 'N/A'}`);
        
        if (raceData.status === 'active' || raceData.status === 'running') {
          console.log("      🟢 CARRERA ACTIVA - Token válido para datos en tiempo real");
        }
        
      } else {
        console.log(`      ❌ Error acceso específico: ${raceResponse.status}`);
      }
      
      // Test 4: Probar participante específico
      console.log("   👤 Test 4: Acceso a participante...");
      
      const participantUrl = `${COPERNICO_API}/${RACE_ID}/athlete/64D271D9`;
      const participantResponse = await fetch(participantUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`      Status: ${participantResponse.status} ${participantResponse.statusText}`);
      
      if (participantResponse.ok) {
        const participantData = await participantResponse.json();
        console.log("      ✅ Acceso a participante OK");
        console.log(`      👤 Nombre: ${participantData.name || 'N/A'}`);
        console.log(`      🏃‍♂️ Dorsal: ${participantData.bib || 'N/A'}`);
        
        // Verificar splits
        if (participantData.events && participantData.events[0]?.splits) {
          const splits = Object.keys(participantData.events[0].splits);
          console.log(`      📍 Splits disponibles: ${splits.length}`);
          if (splits.length > 0) {
            console.log(`      📊 Últimos splits: ${splits.slice(-3).join(', ')}`);
          }
        }
        
      } else {
        console.log(`      ❌ Error acceso participante: ${participantResponse.status}`);
      }
      
      console.log(`\n🎯 RESULTADO PARA TOKEN ${tokenName.toUpperCase()}: ✅ FUNCIONA`);
      
    } catch (error) {
      console.log(`   💥 Error: ${error.message}`);
      console.log(`\n🎯 RESULTADO PARA TOKEN ${tokenName.toUpperCase()}: ❌ ERROR`);
    }
    
    console.log("\n" + "=" * 60 + "\n");
  }
  
  console.log("🔍 RECOMENDACIÓN:");
  console.log("Si el token ALPHA funciona:");
  console.log("1. Actualizar configuración para usar token correcto");
  console.log("2. Redesplegar Firebase Functions");
  console.log("3. Reconectar socket con nuevo token");
}

// Ejecutar
testTokens().catch(console.error);
