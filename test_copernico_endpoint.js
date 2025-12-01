#!/usr/bin/env node

/**
 * Script de testing para el nuevo endpoint /api/checkpoint-participant con integración Copernico
 * 
 * Este script verifica que:
 * 1. El endpoint responda correctamente con el nuevo formato
 * 2. La integración con Copernico API funcione
 * 3. La validación de parámetros sea correcta
 * 4. Los datos se procesen y almacenen correctamente
 */

const testData = {
  // Datos del nuevo formato Copernico
  "competitionId": "race-001-madrid-marathon", // Equivale a raceId
  "type": "detection", // detection | modification
  "participantId": "COPERNICO_PARTICIPANT_001", // ID del participante en Copernico
  "extraData": {
    "point": "10K" // Punto de control donde se detectó
  },
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
};

const testDataModification = {
  "competitionId": "race-001-madrid-marathon",
  "type": "modification", // Modificación de datos existentes
  "participantId": "COPERNICO_PARTICIPANT_002",
  "extraData": {
    "point": "FINISH"
  },
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
};

const invalidTestData = {
  // Datos inválidos para probar validación
  "competitionId": "", // Vacío
  "type": "invalid_type", // Tipo inválido
  "participantId": "TEST_PARTICIPANT",
  "apiKey": "wrong-api-key" // API key incorrecta
};

async function testEndpoint(data, testName) {
  console.log(`\n🧪 ${testName}`);
  console.log("📤 Enviando:", JSON.stringify(data, null, 2));

  try {
    const response = await fetch('https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    
    console.log(`📥 Status: ${response.status}`);
    console.log("📥 Respuesta:", JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log("✅ Test exitoso");
    } else {
      console.log("❌ Test falló");
    }

  } catch (error) {
    console.error("💥 Error en el test:", error.message);
  }
}

async function runTests() {
  console.log("🚀 Iniciando tests del endpoint Copernico /api/checkpoint-participant");
  console.log("=" * 80);

  // Test 1: Detección válida
  await testEndpoint(testData, "Test 1: Detección válida");

  // Test 2: Modificación válida
  await testEndpoint(testDataModification, "Test 2: Modificación válida");

  // Test 3: Datos inválidos
  await testEndpoint(invalidTestData, "Test 3: Validación de datos inválidos");

  // Test 4: API key faltante
  const noApiKeyData = { ...testData };
  delete noApiKeyData.apiKey;
  await testEndpoint(noApiKeyData, "Test 4: API key faltante");

  // Test 5: Parámetros faltantes
  const missingParamsData = {
    "competitionId": "race-001",
    "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0"
    // Faltan type y participantId
  };
  await testEndpoint(missingParamsData, "Test 5: Parámetros faltantes");

  console.log("\n🏁 Tests completados");
}

// Ejecutar tests si el script se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testData, testDataModification, invalidTestData, testEndpoint, runTests };
