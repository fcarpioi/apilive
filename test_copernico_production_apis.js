#!/usr/bin/env node

/**
 * Script para probar las APIs de Copernico en producción
 */

const PRODUCTION_CONFIG = {
  baseUrl: 'https://api.copernico.cloud/api/races',
  apiKey: 'MISSING_COPERNICO_API_KEY',
  raceId: 'generali-maraton-malaga-2025'
};

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': PRODUCTION_CONFIG.apiKey,
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function testCopernicoProductionAPIs() {
  console.log("🚀 PROBANDO APIs DE COPERNICO EN PRODUCCIÓN");
  console.log("=" * 60);
  console.log(`🌐 Base URL: ${PRODUCTION_CONFIG.baseUrl}`);
  console.log(`🔑 API Key: ${PRODUCTION_CONFIG.apiKey.substring(0, 10)}...`);
  console.log(`🏁 Race ID: ${PRODUCTION_CONFIG.raceId}`);
  
  try {
    // 1. Obtener lista de carreras
    console.log("\n📋 1. OBTENIENDO LISTA DE CARRERAS...");
    const racesResponse = await fetch(PRODUCTION_CONFIG.baseUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`   Status: ${racesResponse.status}`);
    
    if (racesResponse.ok) {
      const racesData = await racesResponse.json();
      console.log(`   ✅ ${racesData.data?.length || 0} carreras encontradas`);
      
      if (racesData.data && racesData.data.length > 0) {
        console.log("   📋 Primeras 5 carreras:");
        racesData.data.slice(0, 5).forEach((race, index) => {
          console.log(`      ${index + 1}. ${race}`);
        });
        
        // Verificar si nuestra carrera existe
        const raceExists = racesData.data.includes(PRODUCTION_CONFIG.raceId);
        if (raceExists) {
          console.log(`   ✅ ¡Carrera '${PRODUCTION_CONFIG.raceId}' encontrada!`);
        } else {
          console.log(`   ❌ Carrera '${PRODUCTION_CONFIG.raceId}' NO encontrada`);
          console.log("   💡 Usa una de las carreras existentes para probar");
        }
      }
    } else {
      console.log(`   ❌ Error: ${racesResponse.status} ${racesResponse.statusText}`);
    }
    
    // 2. Obtener participantes de la carrera
    console.log(`\n👥 2. OBTENIENDO PARTICIPANTES DE: ${PRODUCTION_CONFIG.raceId}`);
    const participantsResponse = await fetch(`${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athletes`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`   Status: ${participantsResponse.status}`);
    
    if (participantsResponse.ok) {
      const participantsData = await participantsResponse.json();
      console.log(`   Result code: ${participantsData.result?.code}`);
      console.log(`   ✅ ${participantsData.data?.length || 0} participantes encontrados`);
      
      if (participantsData.data && participantsData.data.length > 0) {
        console.log("   👤 Primeros 3 participantes:");
        participantsData.data.slice(0, 3).forEach((participant, index) => {
          const participantId = typeof participant === 'object' ? participant.id : participant;
          console.log(`      ${index + 1}. ID: ${participantId}`);
          if (typeof participant === 'object') {
            console.log(`         Nombre: ${participant.name} ${participant.surname}`);
            console.log(`         Dorsal: ${participant.dorsal}`);
          }
        });
        
        // 3. Probar con el primer participante
        const firstParticipant = participantsData.data[0];
        const participantId = typeof firstParticipant === 'object' ? firstParticipant.id : firstParticipant;
        
        console.log(`\n👤 3. OBTENIENDO DATOS DEL PARTICIPANTE: ${participantId}`);
        await testParticipantDetails(PRODUCTION_CONFIG.raceId, participantId);
        
      } else {
        console.log("   ⚠️ No hay participantes registrados en esta carrera");
      }
      
    } else {
      const errorText = await participantsResponse.text();
      console.log(`   ❌ Error: ${participantsResponse.status} ${participantsResponse.statusText}`);
      console.log(`   📄 Response: ${errorText}`);
    }
    
    // 4. Mostrar resumen de APIs disponibles
    console.log("\n📚 RESUMEN DE APIs DISPONIBLES:");
    console.log("=" * 60);
    console.log("1. 📋 Lista de carreras:");
    console.log(`   GET ${PRODUCTION_CONFIG.baseUrl}`);
    console.log("");
    console.log("2. 👥 Participantes de una carrera:");
    console.log(`   GET ${PRODUCTION_CONFIG.baseUrl}/{raceId}/athletes`);
    console.log("");
    console.log("3. 👤 Datos de un participante:");
    console.log(`   GET ${PRODUCTION_CONFIG.baseUrl}/{raceId}/athlete/{participantId}`);
    console.log("");
    console.log("4. 🔑 Headers requeridos:");
    console.log("   x-api-key: MISSING_COPERNICO_API_KEY");
    console.log("   Content-Type: application/json");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testParticipantDetails(raceId, participantId) {
  try {
    const response = await fetch(`${PRODUCTION_CONFIG.baseUrl}/${raceId}/athlete/${participantId}`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Datos obtenidos exitosamente`);
      console.log(`   - Result code: ${data.result?.code}`);
      console.log(`   - Data exists: ${!!data.data}`);
      
      if (data.data && Object.keys(data.data).length > 0) {
        console.log(`   - Nombre: ${data.data.name} ${data.data.surname}`);
        console.log(`   - Dorsal: ${data.data.dorsal}`);
        console.log(`   - Status: ${data.data.status}`);
        console.log(`   - Events: ${data.data.events?.length || 0}`);
        
        if (data.data.events && data.data.events.length > 0) {
          const event = data.data.events[0];
          console.log(`   - Times: ${Object.keys(event.times || {}).length} checkpoints`);
          console.log(`   - Rankings: ${Object.keys(event.rankings || {}).length} rankings`);
        }
        
        return data.data;
      }
    } else {
      const errorText = await response.text();
      console.log(`   ❌ Error: ${response.status} ${response.statusText}`);
      console.log(`   📄 Response: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`   💥 Exception: ${error.message}`);
  }
  
  return null;
}

// Ejecutar
testCopernicoProductionAPIs().catch(console.error);
