#!/usr/bin/env node

/**
 * Script de debugging específico para tu caso de prueba
 */

const testData = {
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "competitionId": "a98265e7-3e1d-43d5-bca3-50af15a8d974",
  "copernicoId": "marathon-demo",
  "type": "detection",
  "participantId": "f5c6deb2-3b12-5152-854a-2fdc8b1abea9",
  "extraData": {
    "point": "5K",
    "event": "Marathon",
    "location": "5K"
  }
};

async function debugCopernicoCall() {
  console.log("🔍 DEBUGGING COPERNICO CALL");
  console.log("=" * 50);
  
  // 1. Verificar qué URL se está construyendo
  const competitionId = testData.competitionId;
  const participantId = testData.participantId;
  
  console.log("📋 Datos de entrada:");
  console.log(`  - competitionId: ${competitionId}`);
  console.log(`  - participantId: ${participantId}`);
  console.log(`  - copernicoId: ${testData.copernicoId}`);
  
  // 2. URLs que se van a probar en TODOS los entornos
  const environments = {
    "DEMO": "https://demo-api.copernico.cloud/api/races",
    "ALPHA": "https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
    "PROD": "https://api.copernico.cloud/api/races"
  };

  const urlsToTest = [];

  // Generar URLs para todos los entornos
  Object.entries(environments).forEach(([envName, baseUrl]) => {
    // Con competitionId UUID
    urlsToTest.push({
      name: `${envName} - UUID`,
      url: `${baseUrl}/${competitionId}/athlete/${participantId}`
    });

    // Con copernicoId legible
    urlsToTest.push({
      name: `${envName} - CopernicoId`,
      url: `${baseUrl}/${testData.copernicoId}/athlete/${participantId}`
    });
  });
  
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': 'CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF',
    'User-Agent': 'LiveCopernico-API/1.0',
    'Accept': 'application/json'
  };
  
  console.log("\n🌐 Probando URLs:");
  
  for (let i = 0; i < urlsToTest.length; i++) {
    const urlObj = urlsToTest[i];
    console.log(`\n${i + 1}. Probando: ${urlObj.name}`);
    console.log(`   URL: ${urlObj.url}`);

    try {
      const response = await fetch(urlObj.url, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ RESPUESTA RECIBIDA:`);
        console.log(`   - result.code: ${data.result?.code}`);
        console.log(`   - result.message: ${data.result?.message}`);
        console.log(`   - data exists: ${!!data.data}`);
        console.log(`   - data is empty: ${Object.keys(data.data || {}).length === 0}`);

        if (data.data && Object.keys(data.data).length > 0) {
          console.log(`   - participant name: ${data.data.name} ${data.data.surname}`);
          console.log(`   - dorsal: ${data.data.dorsal}`);
          console.log(`   - status: ${data.data.status}`);
          console.log(`   - times count: ${Object.keys(data.data.times || {}).length}`);
          console.log(`\n📥 Respuesta completa:`, JSON.stringify(data, null, 2));
          break; // Salir del loop si encontramos datos válidos
        } else {
          console.log(`   ⚠️ Datos vacíos - continuando con siguiente URL`);
          console.log(`\n📥 Respuesta:`, JSON.stringify(data, null, 2));
        }

      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error: ${errorText}`);
      }

    } catch (error) {
      console.log(`   💥 Exception: ${error.message}`);
    }
  }
  
  console.log("\n🧪 Ahora probando el endpoint completo:");
  
  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    console.log(`📥 Status: ${response.status}`);
    console.log("📥 Respuesta del endpoint:", JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("💥 Error en el endpoint:", error.message);
  }
}

// Ejecutar debug
debugCopernicoCall().catch(console.error);
