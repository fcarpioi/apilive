#!/usr/bin/env node

/**
 * Script para hacer debug del endpoint checkpoint-participant
 */

import fetch from 'node-fetch';

const CHECKPOINT_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';
const API_KEY = '9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0';

async function debugEndpoint() {
  console.log("🔍 DEBUG DEL ENDPOINT CHECKPOINT-PARTICIPANT");
  console.log("=" * 60);
  console.log(`🎯 URL: ${CHECKPOINT_ENDPOINT}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...`);
  console.log("");
  
  // Test 1: Verificar que el endpoint existe
  console.log("📡 TEST 1: Verificando conectividad...");
  
  try {
    const testPayload = {
      competitionId: 'generali-maraton-malaga-2025',
      copernicoId: 'generali-maraton-malaga-2025',
      participantId: '64D271D9',
      type: '5K',
      apiKey: API_KEY,
      extraData: {
        point: '5K',
        location: '5K'
      },
      rawTime: new Date().toISOString()
    };
    
    console.log("📤 Enviando payload:");
    console.log(JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(CHECKPOINT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log(`\n📥 Respuesta HTTP: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log("📄 Respuesta completa:");
    console.log(responseText);
    
    // Intentar parsear como JSON
    try {
      const responseJson = JSON.parse(responseText);
      console.log("\n✅ JSON parseado exitosamente:");
      console.log(JSON.stringify(responseJson, null, 2));
    } catch (parseError) {
      console.log("\n❌ Error parseando JSON:", parseError.message);
      console.log("📄 Respuesta raw:", responseText.substring(0, 500));
    }
    
  } catch (error) {
    console.error("💥 Error en la request:", error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.log("🔧 DIAGNÓSTICO: Problema de DNS/conectividad");
      console.log("   • Verificar que el endpoint esté desplegado");
      console.log("   • Comprobar la URL del endpoint");
    } else if (error.code === 'ECONNREFUSED') {
      console.log("🔧 DIAGNÓSTICO: Conexión rechazada");
      console.log("   • El servicio no está corriendo");
      console.log("   • Verificar despliegue de Firebase Functions");
    } else {
      console.log("🔧 DIAGNÓSTICO: Error desconocido");
      console.log(`   • Código: ${error.code}`);
      console.log(`   • Mensaje: ${error.message}`);
    }
  }
  
  // Test 2: Verificar endpoint base
  console.log("\n📡 TEST 2: Verificando endpoint base...");
  
  try {
    const baseUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api';
    const baseResponse = await fetch(baseUrl, {
      method: 'GET'
    });
    
    console.log(`📥 Respuesta base: ${baseResponse.status} ${baseResponse.statusText}`);
    
    if (baseResponse.ok) {
      console.log("✅ El servicio base está funcionando");
    } else {
      console.log("❌ El servicio base tiene problemas");
    }
    
  } catch (baseError) {
    console.error("💥 Error verificando base:", baseError.message);
  }
  
  // Test 3: Verificar con curl equivalente
  console.log("\n🔧 COMANDO CURL EQUIVALENTE:");
  console.log("=" * 60);
  
  const curlCommand = `curl -X POST "${CHECKPOINT_ENDPOINT}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "competitionId": "generali-maraton-malaga-2025",
    "copernicoId": "generali-maraton-malaga-2025", 
    "participantId": "64D271D9",
    "type": "5K",
    "apiKey": "${API_KEY}",
    "extraData": {
      "point": "5K",
      "location": "5K"
    },
    "rawTime": "${new Date().toISOString()}"
  }'`;
  
  console.log(curlCommand);
  
  console.log("\n🔍 PRÓXIMOS PASOS:");
  console.log("1. Ejecutar el comando curl manualmente");
  console.log("2. Verificar logs de Firebase Functions:");
  console.log("   firebase functions:log --only liveApiGateway");
  console.log("3. Verificar que el servicio esté desplegado:");
  console.log("   firebase deploy --only functions");
}

// Ejecutar
debugEndpoint().catch(console.error);
