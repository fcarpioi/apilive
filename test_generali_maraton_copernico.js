#!/usr/bin/env node

/**
 * Script para probar la nueva carrera Generali Maratón Málaga con Copernico
 */

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'MISSING_COPERNICO_API_KEY',
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

const newRaceData = {
  raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  appId: "Ryx7YFWobBfGTJqkciCV",
  eventId: "Maratón",
  copernicoId: "generali-maraton-malaga-2025"
};

async function testGeneraliMaratonCopernico() {
  console.log("🏃‍♂️ PROBANDO GENERALI MARATÓN MÁLAGA 2025 CON COPERNICO");
  console.log("=" * 70);
  
  try {
    // 1. Verificar si la carrera existe en Copernico
    console.log(`🔍 Verificando carrera en Copernico: ${newRaceData.copernicoId}`);
    
    const baseUrl = 'https://demo-api.copernico.cloud/api/races';
    
    // Obtener lista de carreras
    const racesResponse = await fetch(baseUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    if (!racesResponse.ok) {
      throw new Error(`Error obteniendo carreras: ${racesResponse.status}`);
    }
    
    const racesData = await racesResponse.json();
    console.log(`📋 ${racesData.data.length} carreras encontradas en Copernico`);
    
    // Buscar nuestra carrera
    const raceExists = racesData.data.includes(newRaceData.copernicoId);
    
    if (raceExists) {
      console.log(`✅ ¡Carrera encontrada en Copernico: ${newRaceData.copernicoId}!`);
      
      // 2. Obtener detalles de la carrera
      console.log(`\n📋 Obteniendo detalles de la carrera...`);
      const raceDetailsResponse = await fetch(`${baseUrl}/${newRaceData.copernicoId}`, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });
      
      if (raceDetailsResponse.ok) {
        const raceDetails = await raceDetailsResponse.json();
        console.log("✅ Detalles de la carrera obtenidos");
        console.log(`   Result code: ${raceDetails.result?.code}`);
        console.log(`   Data exists: ${!!raceDetails.data}`);
        
        if (raceDetails.data && Object.keys(raceDetails.data).length > 0) {
          console.log("📋 Datos de la carrera:", JSON.stringify(raceDetails.data, null, 2));
        }
      }
      
      // 3. Obtener participantes
      console.log(`\n👥 Obteniendo participantes...`);
      const participantsResponse = await fetch(`${baseUrl}/${newRaceData.copernicoId}/athletes`, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });
      
      if (participantsResponse.ok) {
        const participantsData = await participantsResponse.json();
        console.log(`📊 Result code: ${participantsData.result?.code}`);
        console.log(`📊 Participantes encontrados: ${participantsData.data?.length || 0}`);
        
        if (participantsData.data && participantsData.data.length > 0) {
          console.log("\n👤 PRIMEROS 3 PARTICIPANTES:");
          participantsData.data.slice(0, 3).forEach((participant, index) => {
            const participantId = typeof participant === 'object' ? participant.id : participant;
            console.log(`  ${index + 1}. ID: ${participantId}`);
            if (typeof participant === 'object') {
              console.log(`     Nombre: ${participant.name} ${participant.surname}`);
              console.log(`     Dorsal: ${participant.dorsal}`);
            }
          });
          
          // 4. Probar con el primer participante
          const firstParticipant = participantsData.data[0];
          const participantId = typeof firstParticipant === 'object' ? firstParticipant.id : firstParticipant;
          
          console.log(`\n🧪 PROBANDO CON PARTICIPANTE: ${participantId}`);
          await testParticipantData(newRaceData.copernicoId, participantId);
          
          // 5. Probar endpoint completo
          console.log(`\n🎯 PROBANDO ENDPOINT COMPLETO`);
          await testCompleteEndpoint(participantId);
          
        } else {
          console.log("⚠️ No hay participantes en esta carrera aún");
          console.log("💡 Puedes crear participantes de prueba o esperar a que se registren");
        }
        
      } else {
        console.log(`❌ Error obteniendo participantes: ${participantsResponse.status}`);
      }
      
    } else {
      console.log(`❌ Carrera NO encontrada en Copernico: ${newRaceData.copernicoId}`);
      console.log("📋 Carreras disponibles:");
      racesData.data.slice(0, 10).forEach((raceId, index) => {
        console.log(`  ${index + 1}. ${raceId}`);
      });
      
      console.log("\n💡 OPCIONES:");
      console.log("1. Verificar que el copernicoId sea correcto");
      console.log("2. Crear la carrera en Copernico primero");
      console.log("3. Usar una carrera existente para pruebas");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testParticipantData(raceId, participantId) {
  const baseUrl = 'https://demo-api.copernico.cloud/api/races';
  
  try {
    const response = await fetch(`${baseUrl}/${raceId}/athlete/${participantId}`, {
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
      console.log(`   - Data empty: ${Object.keys(data.data || {}).length === 0}`);
      
      if (data.data && Object.keys(data.data).length > 0) {
        console.log(`   - Nombre: ${data.data.name} ${data.data.surname}`);
        console.log(`   - Dorsal: ${data.data.dorsal}`);
        console.log(`   - Status: ${data.data.status}`);
        console.log(`   - Times: ${Object.keys(data.data.times || {}).length} checkpoints`);
        
        return data.data;
      }
    } else {
      console.log(`   ❌ Error: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`   💥 Exception: ${error.message}`);
  }
  
  return null;
}

async function testCompleteEndpoint(participantId) {
  const testPayload = {
    "apiKey": "MISSING_WEBHOOK_API_KEY",
    "competitionId": newRaceData.raceId,
    "copernicoId": newRaceData.copernicoId,
    "type": "detection",
    "participantId": participantId,
    "extraData": {
      "point": "10K",
      "event": "Maratón",
      "location": "10K"
    }
  };
  
  console.log("📤 Enviando request al endpoint:");
  console.log(JSON.stringify(testPayload, null, 2));
  
  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();
    
    console.log(`📥 Status: ${response.status}`);
    console.log("📥 Respuesta:", JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log("\n✅ ¡ENDPOINT FUNCIONANDO CORRECTAMENTE!");
      console.log(`🔑 Queue Key: ${result.data.queueKey}`);
      
      // Esperar y consultar estado
      console.log("\n⏳ Esperando 30 segundos para consultar estado...");
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      const statusResponse = await fetch(`https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant/status/${result.data.queueKey}`);
      const statusResult = await statusResponse.json();
      
      console.log("📊 Estado final:", JSON.stringify(statusResult, null, 2));
    }

  } catch (error) {
    console.error("💥 Error en endpoint:", error.message);
  }
}

// Ejecutar
testGeneraliMaratonCopernico().catch(console.error);
