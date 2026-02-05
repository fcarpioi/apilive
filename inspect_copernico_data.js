#!/usr/bin/env node

/**
 * Script para inspeccionar la estructura real de datos de Copernico
 */

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'MISSING_COPERNICO_API_KEY',
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function inspectRealData() {
  console.log("🔍 INSPECCIONANDO ESTRUCTURA REAL DE DATOS");
  console.log("=" * 50);
  
  const baseUrl = 'https://demo-api.copernico.cloud/api/races';
  
  try {
    // 1. Obtener lista de competiciones
    console.log("📋 Obteniendo lista de competiciones...");
    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ ${data.data.length} competiciones encontradas`);
    
    // 2. Mostrar estructura de la primera competición
    if (data.data && data.data.length > 0) {
      console.log("\n🏁 ESTRUCTURA DE LA PRIMERA COMPETICIÓN:");
      const firstRace = data.data[0];
      console.log("Campos disponibles:", Object.keys(firstRace));
      console.log("Datos completos:", JSON.stringify(firstRace, null, 2));
      
      // 3. Buscar nuestra competición específica
      console.log("\n🔍 BUSCANDO NUESTRA COMPETICIÓN:");
      const ourCompetitionId = "a98265e7-3e1d-43d5-bca3-50af15a8d974";
      
      const foundRace = data.data.find(race => {
        // Buscar en todos los campos posibles
        const searchFields = [
          race.id, race._id, race.uuid, race.raceId, 
          race.competitionId, race.externalId, race.key
        ];
        return searchFields.some(field => field === ourCompetitionId);
      });
      
      if (foundRace) {
        console.log("✅ ¡COMPETICIÓN ENCONTRADA!");
        console.log(JSON.stringify(foundRace, null, 2));
      } else {
        console.log("❌ Competición no encontrada");
        console.log("IDs disponibles:");
        data.data.slice(0, 10).forEach((race, index) => {
          const possibleIds = [
            race.id, race._id, race.uuid, race.raceId, 
            race.competitionId, race.externalId, race.key
          ].filter(id => id);
          console.log(`  ${index + 1}. ${possibleIds.join(' | ')}`);
        });
      }
      
      // 4. Probar con la primera competición válida
      const testRace = data.data[0];
      const raceId = testRace.id || testRace._id || testRace.uuid || testRace.key;
      
      if (raceId) {
        console.log(`\n🧪 PROBANDO CON COMPETICIÓN: ${raceId}`);
        await testRaceParticipants(raceId);
      }
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

async function testRaceParticipants(raceId) {
  const baseUrl = 'https://demo-api.copernico.cloud/api/races';
  
  try {
    // 1. Obtener detalles de la competición
    console.log(`📋 Obteniendo detalles de la competición: ${raceId}`);
    const raceResponse = await fetch(`${baseUrl}/${raceId}`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    if (raceResponse.ok) {
      const raceData = await raceResponse.json();
      console.log("✅ Detalles de la competición:");
      console.log(JSON.stringify(raceData, null, 2));
    }
    
    // 2. Obtener participantes
    console.log(`\n👥 Obteniendo participantes de: ${raceId}`);
    const participantsResponse = await fetch(`${baseUrl}/${raceId}/athletes`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    if (participantsResponse.ok) {
      const participantsData = await participantsResponse.json();
      
      if (participantsData.data && participantsData.data.length > 0) {
        console.log(`✅ ${participantsData.data.length} participantes encontrados`);
        
        // Mostrar estructura del primer participante
        const firstParticipant = participantsData.data[0];
        console.log("\n👤 ESTRUCTURA DEL PRIMER PARTICIPANTE:");
        console.log("Campos disponibles:", Object.keys(firstParticipant));
        console.log("Datos completos:", JSON.stringify(firstParticipant, null, 2));
        
        // 3. Probar obtener datos completos del participante
        const participantId = firstParticipant.id || firstParticipant._id || firstParticipant.uuid;
        
        if (participantId) {
          console.log(`\n🎯 OBTENIENDO DATOS COMPLETOS DEL PARTICIPANTE: ${participantId}`);
          
          const participantResponse = await fetch(`${baseUrl}/${raceId}/athlete/${participantId}`, {
            method: 'GET',
            headers: headers,
            timeout: 10000
          });
          
          if (participantResponse.ok) {
            const participantData = await participantResponse.json();
            console.log("✅ Datos completos del participante:");
            console.log(JSON.stringify(participantData, null, 2));
            
            // Verificar si tiene times
            if (participantData.data && participantData.data.times) {
              console.log(`\n⏱️ TIMES DISPONIBLES: ${Object.keys(participantData.data.times).length}`);
              Object.entries(participantData.data.times).forEach(([checkpoint, timeData]) => {
                console.log(`  - ${checkpoint}: ${timeData.split || timeData.time}`);
              });
            }
            
          } else {
            console.log("❌ Error obteniendo datos del participante");
          }
        }
        
      } else {
        console.log("❌ No hay participantes en esta competición");
      }
      
    } else {
      console.log("❌ Error obteniendo participantes");
    }
    
  } catch (error) {
    console.error("💥 Error probando participantes:", error.message);
  }
}

// Ejecutar
inspectRealData().catch(console.error);
