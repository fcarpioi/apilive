/**
 * Script para probar que la estructura completa de Copernico se está guardando correctamente
 */

const testPayload = {
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "D21D9C3F",
  "rawTime": Date.now(), // ← AGREGAR ESTE CAMPO
  "extraData": {
    "point": "Meta",
    "event": "Media",
    "location": "Meta"
  }
};

async function testCopernicoDataStructure() {
  try {
    console.log("🧪 Probando estructura completa de Copernico Data...");
    console.log("📤 Payload:", JSON.stringify(testPayload, null, 2));

    const response = await fetch("https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/checkpoint-participant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();
    console.log("📥 Respuesta:", JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("✅ Webhook procesado exitosamente");
      
      // Esperar un poco para que se procese en background
      console.log("⏳ Esperando 10 segundos para que se procese...");
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Verificar que los datos se guardaron correctamente
      await verifyDataStructure();
    } else {
      console.error("❌ Error en webhook:", result.error);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function verifyDataStructure() {
  try {
    console.log("\n🔍 Verificando estructura de datos guardada...");
    
    // Buscar el participante en la API
    const searchUrl = `https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/search/participants?raceId=69200553-464c-4bfd-9b35-4ca6ac1f17f5&appId=Ryx7YFWobBfGTJqkciCV&eventId=Media&query=D21D9C3F`;
    
    const searchResponse = await fetch(searchUrl);
    const searchResult = await searchResponse.json();
    
    console.log("📊 Resultado de búsqueda:", JSON.stringify(searchResult, null, 2));
    
    if (searchResult.participants && searchResult.participants.length > 0) {
      const participant = searchResult.participants[0];
      
      console.log("\n✅ VERIFICACIÓN DE ESTRUCTURA:");
      console.log("🔹 Datos básicos:", {
        externalId: participant.externalId,
        name: participant.name,
        dorsal: participant.dorsal
      });
      
      console.log("🔹 CopernicoData presente:", !!participant.copernicoData);
      
      if (participant.copernicoData) {
        console.log("🔹 Times disponibles:", Object.keys(participant.copernicoData.times || {}));
        console.log("🔹 Rankings disponibles:", Object.keys(participant.copernicoData.rankings || {}));
        console.log("🔹 RawData presente:", !!participant.copernicoData.rawData);
        
        // Verificar estructura específica del punto Meta
        const timesMeta = participant.copernicoData.times?.['META'];
        if (timesMeta) {
          console.log("🔹 Datos de META:", {
            split: timesMeta.split,
            time: timesMeta.time,
            rawTime: timesMeta.raw?.rawTime,
            device: timesMeta.raw?.device,
            originalTime: timesMeta.raw?.originalTime
          });
        }

        const rankingsMeta = participant.copernicoData.rankings?.['META'];
        if (rankingsMeta) {
          console.log("🔹 Rankings de META:", {
            pos: rankingsMeta.pos,
            posGen: rankingsMeta.posGen,
            posCat: rankingsMeta.posCat,
            rawTime: rankingsMeta.rawTime
          });
        }
      }
      
      console.log("🔹 LastCheckpoint:", participant.lastCheckpoint);
      
    } else {
      console.log("⚠️ No se encontró el participante");
    }
    
  } catch (error) {
    console.error("❌ Error verificando estructura:", error.message);
  }
}

// Ejecutar test
testCopernicoDataStructure();
