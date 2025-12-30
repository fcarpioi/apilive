#!/usr/bin/env node

/**
 * Test final con copernicoId correcto
 */

const testData = {
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "competitionId": "a98265e7-3e1d-43d5-bca3-50af15a8d974",
  "copernicoId": "marathon-demo",  // ← ESTE ES EL CAMPO CLAVE
  "type": "detection",
  "participantId": "f5c6deb2-3b12-5152-854a-2fdc8b1abea9",
  "extraData": {
    "point": "5K",
    "event": "Marathon",
    "location": "5K"
  }
};

async function testFinalEndpoint() {
  console.log("🎯 PRUEBA FINAL CON COPERNICO ID CORRECTO");
  console.log("=" * 50);
  
  console.log("📤 Enviando request:");
  console.log(JSON.stringify(testData, null, 2));
  
  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    console.log(`\n📥 Status: ${response.status}`);
    console.log("📥 Respuesta:", JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log("\n✅ ¡REQUEST ENCOLADA EXITOSAMENTE!");
      console.log(`🔑 Queue Key: ${result.data.queueKey}`);
      console.log(`⏰ Tiempo estimado: ${result.data.estimatedProcessingTime}`);
      
      // Esperar un poco y consultar el estado
      console.log("\n⏳ Esperando 30 segundos para consultar el estado...");
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      await checkProcessingStatus(result.data.queueKey);
      
    } else {
      console.log("\n❌ Error en la request");
    }

  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

async function checkProcessingStatus(queueKey) {
  console.log(`\n🔍 CONSULTANDO ESTADO DE: ${queueKey}`);
  
  try {
    const response = await fetch(`https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant/status/${queueKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    console.log(`📥 Status: ${response.status}`);
    console.log("📥 Estado:", JSON.stringify(result, null, 2));
    
    if (result.status === 'completed') {
      console.log("\n🎉 ¡PROCESAMIENTO COMPLETADO!");
      if (result.results) {
        console.log("📋 Resultados:");
        result.results.forEach((res, index) => {
          console.log(`  ${index + 1}. Race: ${res.raceId}`);
          console.log(`     Participante: ${res.participant?.name}`);
          console.log(`     Stories creadas: ${res.stories?.created || 0}`);
        });
      }
    } else if (result.status === 'processing') {
      console.log("\n⏳ Aún procesando... Consulta de nuevo en unos minutos");
    } else if (result.status === 'failed') {
      console.log("\n❌ Procesamiento falló:");
      console.log(`Error: ${result.error}`);
    }

  } catch (error) {
    console.error("💥 Error consultando estado:", error.message);
  }
}

// Ejecutar
testFinalEndpoint().catch(console.error);
