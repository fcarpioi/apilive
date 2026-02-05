#!/usr/bin/env node

/**
 * Script para probar con los IDs reales de Copernico
 */

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'MISSING_COPERNICO_API_KEY',
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function testRealCopernicoIds() {
  console.log("🔍 PROBANDO CON IDs REALES DE COPERNICO");
  console.log("=" * 50);
  
  const baseUrl = 'https://demo-api.copernico.cloud/api/races';
  
  try {
    // 1. Obtener lista real de competiciones
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
    
    // 2. Mostrar todas las competiciones disponibles
    console.log("\n🏁 COMPETICIONES DISPONIBLES:");
    data.data.forEach((raceId, index) => {
      console.log(`  ${index + 1}. ${raceId}`);
    });
    
    // 3. Buscar si existe nuestra competición
    const ourCompetitionId = "a98265e7-3e1d-43d5-bca3-50af15a8d974";
    const foundRace = data.data.includes(ourCompetitionId);
    
    if (foundRace) {
      console.log(`\n✅ ¡NUESTRA COMPETICIÓN EXISTE: ${ourCompetitionId}!`);
    } else {
      console.log(`\n❌ Nuestra competición NO EXISTE: ${ourCompetitionId}`);
      console.log("Probemos con el copernicoId: marathon-demo");
      
      const foundCopernicoId = data.data.includes("marathon-demo");
      if (foundCopernicoId) {
        console.log("✅ ¡marathon-demo EXISTE!");
      } else {
        console.log("❌ marathon-demo tampoco existe");
      }
    }
    
    // 4. Probar con la primera competición disponible
    if (data.data.length > 0) {
      const testRaceId = data.data[0];
      console.log(`\n🧪 PROBANDO CON LA PRIMERA COMPETICIÓN: ${testRaceId}`);
      await testRaceDetails(testRaceId);
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

async function testRaceDetails(raceId) {
  const baseUrl = 'https://demo-api.copernico.cloud/api/races';
  
  try {
    // 1. Obtener detalles de la competición
    console.log(`\n📋 Obteniendo detalles de: ${raceId}`);
    const raceResponse = await fetch(`${baseUrl}/${raceId}`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`Status: ${raceResponse.status}`);
    
    if (raceResponse.ok) {
      const raceData = await raceResponse.json();
      console.log("✅ Detalles obtenidos:");
      console.log(`- result.code: ${raceData.result?.code}`);
      console.log(`- data exists: ${!!raceData.data}`);
      console.log(`- data keys: ${Object.keys(raceData.data || {})}`);
      
      if (raceData.data && Object.keys(raceData.data).length > 0) {
        console.log("📋 Datos de la competición:", JSON.stringify(raceData.data, null, 2));
      }
    }
    
    // 2. Obtener participantes
    console.log(`\n👥 Obteniendo participantes de: ${raceId}`);
    const participantsResponse = await fetch(`${baseUrl}/${raceId}/athletes`, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`Status: ${participantsResponse.status}`);
    
    if (participantsResponse.ok) {
      const participantsData = await participantsResponse.json();
      console.log(`- result.code: ${participantsData.result?.code}`);
      console.log(`- data is array: ${Array.isArray(participantsData.data)}`);
      console.log(`- participants count: ${participantsData.data?.length || 0}`);
      
      if (participantsData.data && participantsData.data.length > 0) {
        console.log("\n👤 PRIMEROS 3 PARTICIPANTES:");
        participantsData.data.slice(0, 3).forEach((participant, index) => {
          console.log(`  ${index + 1}. ID: ${participant.id || participant}`);
          if (typeof participant === 'object') {
            console.log(`     Nombre: ${participant.name} ${participant.surname}`);
            console.log(`     Dorsal: ${participant.dorsal}`);
          }
        });
        
        // 3. Probar obtener datos de un participante
        const firstParticipant = participantsData.data[0];
        const participantId = typeof firstParticipant === 'object' ? firstParticipant.id : firstParticipant;
        
        if (participantId) {
          console.log(`\n🎯 PROBANDO PARTICIPANTE: ${participantId}`);
          
          const participantResponse = await fetch(`${baseUrl}/${raceId}/athlete/${participantId}`, {
            method: 'GET',
            headers: headers,
            timeout: 10000
          });
          
          console.log(`Status: ${participantResponse.status}`);
          
          if (participantResponse.ok) {
            const participantData = await participantResponse.json();
            console.log("✅ ¡DATOS DEL PARTICIPANTE OBTENIDOS!");
            console.log(`- result.code: ${participantData.result?.code}`);
            console.log(`- data exists: ${!!participantData.data}`);
            console.log(`- data is empty: ${Object.keys(participantData.data || {}).length === 0}`);
            
            if (participantData.data && Object.keys(participantData.data).length > 0) {
              console.log("📋 Datos del participante:", JSON.stringify(participantData.data, null, 2));
              
              // Mostrar ejemplo de cómo usar estos datos
              console.log("\n🎯 EJEMPLO PARA TU ENDPOINT:");
              console.log(`{
  "competitionId": "${raceId}",
  "type": "detection",
  "participantId": "${participantId}",
  "extraData": { "point": "5K" },
  "apiKey": "MISSING_WEBHOOK_API_KEY"
}`);
              
            } else {
              console.log("❌ Datos del participante están vacíos");
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error("💥 Error probando detalles:", error.message);
  }
}

// Ejecutar
testRealCopernicoIds().catch(console.error);
