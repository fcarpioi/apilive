#!/usr/bin/env node

/**
 * Script para obtener datos del participante 2B5C4YZD de Copernico producción
 */

const PRODUCTION_CONFIG = {
  baseUrl: 'https://api.copernico.cloud/api/races',
  apiKey: 'CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF',
  raceId: 'generali-maraton-malaga-2025',
  participantId: '64D271D9'
};

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': PRODUCTION_CONFIG.apiKey,
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function getParticipantData() {
  console.log("👤 OBTENIENDO DATOS DEL PARTICIPANTE 64D271D9");
  console.log("=" * 60);
  console.log(`🌐 URL: ${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`);
  console.log(`🔑 API Key: ${PRODUCTION_CONFIG.apiKey.substring(0, 10)}...`);
  
  try {
    const response = await fetch(`${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`, {
      method: 'GET',
      headers: headers,
      timeout: 15000
    });
    
    console.log(`\n📡 Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      
      console.log("\n✅ DATOS OBTENIDOS EXITOSAMENTE");
      console.log("=" * 60);
      
      // Información básica
      console.log("📋 INFORMACIÓN BÁSICA:");
      console.log(`   Result Code: ${data.result?.code}`);
      console.log(`   Message: ${data.result?.message || 'N/A'}`);
      console.log(`   Data exists: ${!!data.data}`);
      
      if (data.data && Object.keys(data.data).length > 0) {
        const participant = data.data;
        
        console.log("\n👤 DATOS DEL PARTICIPANTE:");
        console.log(`   ID: ${participant.id}`);
        console.log(`   Nombre: ${participant.name || 'N/A'}`);
        console.log(`   Apellido: ${participant.surname || 'N/A'}`);
        console.log(`   Nombre Completo: ${participant.fullname || 'N/A'}`);
        console.log(`   Dorsal: ${participant.dorsal || 'N/A'}`);
        console.log(`   Status: ${participant.status || 'N/A'}`);
        console.log(`   Real Status: ${participant.realStatus || 'N/A'}`);
        
        // Eventos
        if (participant.events && participant.events.length > 0) {
          console.log(`\n🏃‍♂️ EVENTOS (${participant.events.length}):`);
          
          participant.events.forEach((event, index) => {
            console.log(`\n   📋 Evento ${index + 1}:`);
            console.log(`      Event: ${event.event || 'N/A'}`);
            console.log(`      Dorsal: ${event.dorsal || 'N/A'}`);
            console.log(`      Categoría: ${event.category || 'N/A'}`);
            console.log(`      Wave: ${event.wave || 'N/A'}`);
            console.log(`      Team: ${event.team || 'N/A'}`);
            console.log(`      Club: ${event.club || 'N/A'}`);
            console.log(`      Featured: ${event.featured || false}`);
            console.log(`      Status: ${event.status || 'N/A'}`);
            console.log(`      Real Status: ${event.realStatus || 'N/A'}`);
            
            // Chips
            if (event.chip && event.chip.length > 0) {
              console.log(`      Chips: ${event.chip.join(', ')}`);
            }
            
            // Times (checkpoints)
            if (event.times && Object.keys(event.times).length > 0) {
              console.log(`\n      ⏱️ TIMES/CHECKPOINTS (${Object.keys(event.times).length}):`);
              Object.entries(event.times).forEach(([checkpoint, timeData]) => {
                console.log(`         📍 ${checkpoint}:`);
                console.log(`            Split: ${timeData.split || 'N/A'}`);
                console.log(`            Order: ${timeData.order || 'N/A'}`);
                console.log(`            Distance: ${timeData.distance || 'N/A'}m`);
                console.log(`            Time: ${timeData.time || 'N/A'}`);
                console.log(`            Net Time: ${timeData.netTime || 'N/A'}`);
                console.log(`            Average: ${timeData.average || 'N/A'}`);
                if (timeData.raw) {
                  console.log(`            Raw Time: ${timeData.raw.time || 'N/A'}`);
                  console.log(`            Device: ${timeData.raw.device || 'N/A'}`);
                  console.log(`            Location: ${timeData.raw.location || 'N/A'}`);
                }
              });
            } else {
              console.log(`      ⏱️ Times: No hay checkpoints registrados aún`);
            }
            
            // Rankings
            if (event.rankings && Object.keys(event.rankings).length > 0) {
              console.log(`\n      🏆 RANKINGS (${Object.keys(event.rankings).length}):`);
              Object.entries(event.rankings).forEach(([category, ranking]) => {
                console.log(`         🏅 ${category}: Posición ${ranking.position || 'N/A'}`);
              });
            } else {
              console.log(`      🏆 Rankings: No hay rankings disponibles aún`);
            }
          });
        } else {
          console.log("\n🏃‍♂️ EVENTOS: No hay eventos registrados");
        }
        
        // Mostrar JSON completo para debugging
        console.log("\n📄 JSON COMPLETO (para debugging):");
        console.log(JSON.stringify(data, null, 2));
        
        // Datos para testing del endpoint
        console.log("\n🧪 DATOS PARA PROBAR TU ENDPOINT:");
        console.log(`{
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "${PRODUCTION_CONFIG.participantId}",
  "extraData": {
    "point": "10K",
    "event": "Maratón",
    "location": "10K"
  }
}`);
        
      } else {
        console.log("\n⚠️ NO HAY DATOS DEL PARTICIPANTE");
        console.log("   El participante existe pero no tiene información disponible");
      }
      
    } else {
      const errorText = await response.text();
      console.log(`\n❌ ERROR: ${response.status} ${response.statusText}`);
      console.log(`📄 Response: ${errorText}`);
      
      if (response.status === 404) {
        console.log("\n💡 POSIBLES CAUSAS:");
        console.log("   - El participante no existe en esta carrera");
        console.log("   - El ID del participante es incorrecto");
        console.log("   - La carrera no existe o no está disponible");
      }
    }
    
  } catch (error) {
    console.error("\n💥 EXCEPCIÓN:", error.message);
    console.log("\n🔧 VERIFICAR:");
    console.log("   - Conexión a internet");
    console.log("   - API key válida");
    console.log("   - URL correcta");
  }
}

// Ejecutar
getParticipantData().catch(console.error);
