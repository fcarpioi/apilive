#!/usr/bin/env node

/**
 * Script para probar el endpoint checkpoint-participant con participante real 2B5C4YZD
 */

const ENDPOINT_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';

const testPayload = {
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "64D271D9",
  "extraData": {
    "point": "10K",
    "event": "Maratón",
    "location": "10K"
  }
};

async function testEndpointWithRealParticipant() {
  console.log("🧪 PROBANDO ENDPOINT CON PARTICIPANTE REAL");
  console.log("=" * 60);
  console.log(`🌐 Endpoint: ${ENDPOINT_URL}`);
  console.log(`👤 Participante: ${testPayload.participantId} (Alvaro Pons palma)`);
  console.log(`🏁 Carrera: ${testPayload.copernicoId}`);
  console.log(`📍 Checkpoint: ${testPayload.extraData.point}`);
  
  try {
    console.log("\n📤 ENVIANDO REQUEST...");
    console.log("📋 Payload:");
    console.log(JSON.stringify(testPayload, null, 2));
    
    const startTime = Date.now();
    
    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`\n📥 RESPUESTA RECIBIDA (${responseTime}ms):`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    const result = await response.json();
    console.log("   Body:", JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log("\n✅ ¡ENDPOINT FUNCIONANDO CORRECTAMENTE!");
      console.log(`🔑 Queue Key: ${result.data?.queueKey || 'N/A'}`);
      console.log(`📊 Status: ${result.data?.status || 'N/A'}`);
      console.log(`⏱️ Tiempo de respuesta: ${responseTime}ms`);
      
      if (result.data?.queueKey) {
        console.log("\n⏳ ESPERANDO PROCESAMIENTO...");
        console.log("   Consultando estado cada 10 segundos...");
        
        // Consultar estado cada 10 segundos por 2 minutos
        await monitorProcessingStatus(result.data.queueKey);
      }
      
    } else {
      console.log("\n❌ ERROR EN EL ENDPOINT:");
      console.log(`   Status: ${response.status}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Message: ${result.message || 'N/A'}`);
      console.log(`   Error: ${result.error || 'N/A'}`);
      
      if (result.details) {
        console.log("   Details:", JSON.stringify(result.details, null, 2));
      }
    }

  } catch (error) {
    console.error("\n💥 EXCEPCIÓN:", error.message);
    console.log("\n🔧 VERIFICAR:");
    console.log("   - Conexión a internet");
    console.log("   - Endpoint disponible");
    console.log("   - Payload correcto");
  }
}

async function monitorProcessingStatus(queueKey) {
  const statusUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant/status/${queueKey}`;
  const maxAttempts = 12; // 2 minutos (12 x 10 segundos)
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    attempt++;
    
    try {
      console.log(`\n🔍 Consulta ${attempt}/${maxAttempts} - Esperando 10 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const statusResponse = await fetch(statusUrl);
      const statusResult = await statusResponse.json();
      
      console.log(`   Status: ${statusResponse.status}`);
      console.log(`   Estado: ${statusResult.data?.status || 'N/A'}`);
      console.log(`   Progress: ${statusResult.data?.progress || 'N/A'}`);
      
      if (statusResult.data?.status === 'completed') {
        console.log("\n🎉 ¡PROCESAMIENTO COMPLETADO!");
        console.log("📊 Resultado final:");
        console.log(JSON.stringify(statusResult, null, 2));
        
        if (statusResult.data?.result?.storyId) {
          console.log(`\n📖 Story creada: ${statusResult.data.result.storyId}`);
          console.log(`👤 Participante: ${statusResult.data.result.participantId}`);
          console.log(`📍 Checkpoint: ${statusResult.data.result.checkpoint}`);
        }
        
        break;
        
      } else if (statusResult.data?.status === 'failed') {
        console.log("\n❌ PROCESAMIENTO FALLÓ:");
        console.log(`   Error: ${statusResult.data?.error || 'N/A'}`);
        console.log(`   Details: ${JSON.stringify(statusResult.data?.details || {}, null, 2)}`);
        break;
        
      } else if (statusResult.data?.status === 'processing') {
        console.log(`   ⏳ Procesando... ${statusResult.data?.progress || ''}%`);
        
      } else {
        console.log(`   📋 Estado: ${JSON.stringify(statusResult.data || {}, null, 2)}`);
      }
      
    } catch (error) {
      console.log(`   💥 Error consultando estado: ${error.message}`);
    }
  }
  
  if (attempt >= maxAttempts) {
    console.log("\n⏰ TIMEOUT: Se agotó el tiempo de espera");
    console.log("   El procesamiento puede continuar en segundo plano");
  }
}

// Ejecutar
testEndpointWithRealParticipant().catch(console.error);
