#!/usr/bin/env node

/**
 * Script para listar competiciones disponibles en Copernico
 */

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF',
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function listRaces() {
  console.log("🏁 LISTANDO COMPETICIONES DISPONIBLES EN COPERNICO");
  console.log("=" * 60);
  
  const baseUrls = [
    'https://demo-api.copernico.cloud/api/races',
    'https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races'
  ];
  
  for (const baseUrl of baseUrls) {
    console.log(`\n🌐 Probando: ${baseUrl}`);
    
    try {
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ Respuesta recibida:`);
        console.log(`   - result.code: ${data.result?.code}`);
        console.log(`   - data type: ${typeof data.data}`);
        console.log(`   - data is array: ${Array.isArray(data.data)}`);
        
        if (data.data && Array.isArray(data.data)) {
          console.log(`   - races count: ${data.data.length}`);
          
          console.log(`\n📋 Primeras 5 competiciones:`);
          data.data.slice(0, 5).forEach((race, index) => {
            console.log(`   ${index + 1}. ID: ${race.id || race._id || 'N/A'}`);
            console.log(`      Nombre: ${race.name || race.title || 'N/A'}`);
            console.log(`      Estado: ${race.status || 'N/A'}`);
            console.log(`      Fecha: ${race.date || race.startDate || 'N/A'}`);
            console.log(`      ---`);
          });
          
          // Buscar si existe nuestra competición
          const ourCompetitionId = "a98265e7-3e1d-43d5-bca3-50af15a8d974";
          const foundRace = data.data.find(race => 
            race.id === ourCompetitionId || 
            race._id === ourCompetitionId ||
            race.uuid === ourCompetitionId
          );
          
          if (foundRace) {
            console.log(`\n🎯 ¡ENCONTRADA NUESTRA COMPETICIÓN!`);
            console.log(JSON.stringify(foundRace, null, 2));
          } else {
            console.log(`\n❌ No se encontró la competición: ${ourCompetitionId}`);
          }
          
        } else {
          console.log(`\n📥 Respuesta completa:`, JSON.stringify(data, null, 2));
        }
        
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error: ${errorText}`);
      }
      
    } catch (error) {
      console.log(`   💥 Exception: ${error.message}`);
    }
  }
}

async function testSpecificRace() {
  console.log("\n\n🧪 PROBANDO COMPETICIÓN ESPECÍFICA");
  console.log("=" * 40);
  
  // Probar algunas competiciones comunes de demo
  const testRaceIds = [
    "marathon-demo",
    "demo-race",
    "test-race",
    "sample-marathon"
  ];
  
  const baseUrl = "https://demo-api.copernico.cloud/api/races";
  
  for (const raceId of testRaceIds) {
    console.log(`\n🏃 Probando race: ${raceId}`);
    
    try {
      const response = await fetch(`${baseUrl}/${raceId}`, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ ¡Competición encontrada!`);
        console.log(`   - result.code: ${data.result?.code}`);
        console.log(`   - race name: ${data.data?.name || data.data?.title}`);
        console.log(`   - race status: ${data.data?.status}`);
        
        // Si encontramos una competición válida, probar con un participante
        if (data.data && Object.keys(data.data).length > 0) {
          console.log(`\n🧪 Probando participantes en esta competición...`);
          await testParticipantsInRace(raceId);
        }
        
      } else {
        console.log(`   ❌ No encontrada`);
      }
      
    } catch (error) {
      console.log(`   💥 Exception: ${error.message}`);
    }
  }
}

async function testParticipantsInRace(raceId) {
  const baseUrl = "https://demo-api.copernico.cloud/api/races";
  const participantsUrl = `${baseUrl}/${raceId}/athletes`;
  
  try {
    const response = await fetch(participantsUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`     Participantes Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        console.log(`     ✅ ${data.data.length} participantes encontrados`);
        
        // Mostrar primeros 3 participantes
        data.data.slice(0, 3).forEach((participant, index) => {
          console.log(`     ${index + 1}. ID: ${participant.id}`);
          console.log(`        Nombre: ${participant.name} ${participant.surname}`);
          console.log(`        Dorsal: ${participant.dorsal}`);
        });
        
        // Probar con el primer participante
        if (data.data[0]) {
          const testParticipantId = data.data[0].id;
          console.log(`\n     🎯 Probando datos del participante: ${testParticipantId}`);
          
          const participantUrl = `${baseUrl}/${raceId}/athlete/${testParticipantId}`;
          const participantResponse = await fetch(participantUrl, {
            method: 'GET',
            headers: headers,
            timeout: 10000
          });
          
          if (participantResponse.ok) {
            const participantData = await participantResponse.json();
            console.log(`     ✅ Datos del participante obtenidos exitosamente!`);
            console.log(`     - Nombre: ${participantData.data?.name} ${participantData.data?.surname}`);
            console.log(`     - Dorsal: ${participantData.data?.dorsal}`);
            console.log(`     - Status: ${participantData.data?.status}`);
            console.log(`     - Times: ${Object.keys(participantData.data?.times || {}).length} checkpoints`);
          }
        }
        
      } else {
        console.log(`     ❌ No hay participantes en esta competición`);
      }
    }
    
  } catch (error) {
    console.log(`     💥 Error obteniendo participantes: ${error.message}`);
  }
}

// Ejecutar
async function main() {
  await listRaces();
  await testSpecificRace();
}

main().catch(console.error);
