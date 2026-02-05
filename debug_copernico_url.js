#!/usr/bin/env node

/**
 * Script para debuggear la URL de Copernico y encontrar el problema
 */

const PRODUCTION_CONFIG = {
  baseUrl: 'https://api.copernico.cloud/api/races',
  apiKey: 'MISSING_COPERNICO_API_KEY',
  raceId: 'generali-maraton-malaga-2025',
  participantId: '64D271D9'
};

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': PRODUCTION_CONFIG.apiKey,
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function debugCopernicoURL() {
  console.log("🔍 DEBUGGEANDO URL DE COPERNICO");
  console.log("=" * 60);
  
  // URLs a probar
  const urlsToTest = [
    // URL actual que se está construyendo
    `${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`,
    
    // URL que sabemos que funciona (la que probamos antes)
    `${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`,
    
    // Variaciones posibles
    `https://api.copernico.cloud/api/races/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`,
    `https://api.copernico.cloud/races/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`,
    `https://api.copernico.cloud/api/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`,
  ];
  
  console.log("🧪 PROBANDO DIFERENTES URLs:");
  
  for (let i = 0; i < urlsToTest.length; i++) {
    const url = urlsToTest[i];
    console.log(`\n${i + 1}. 🌐 ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });
      
      console.log(`   📡 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ SUCCESS! Result code: ${data.result?.code}`);
        console.log(`   📊 Data exists: ${!!data.data}`);
        
        if (data.data) {
          console.log(`   👤 Participante: ${data.data.name} ${data.data.surname}`);
          console.log(`   🏃‍♂️ Eventos: ${data.data.events?.length || 0}`);
        }
        
        console.log("\n🎯 ¡ESTA ES LA URL CORRECTA!");
        console.log(`   URL: ${url}`);
        break;
        
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Error: ${response.status}`);
        console.log(`   📄 Response: ${errorText.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.log(`   💥 Exception: ${error.message}`);
    }
  }
  
  // Probar también la URL base para verificar conectividad
  console.log("\n🔗 PROBANDO URL BASE:");
  try {
    const baseResponse = await fetch(PRODUCTION_CONFIG.baseUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    console.log(`   📡 Status: ${baseResponse.status}`);
    
    if (baseResponse.ok) {
      const baseData = await baseResponse.json();
      console.log(`   ✅ Base URL funciona - ${baseData.data?.length || 0} carreras`);
    } else {
      console.log(`   ❌ Base URL falla: ${baseResponse.status}`);
    }
    
  } catch (error) {
    console.log(`   💥 Base URL error: ${error.message}`);
  }
  
  // Mostrar configuración actual del sistema
  console.log("\n⚙️ CONFIGURACIÓN ACTUAL DEL SISTEMA:");
  console.log(`   Base URL: ${PRODUCTION_CONFIG.baseUrl}`);
  console.log(`   Race ID: ${PRODUCTION_CONFIG.raceId}`);
  console.log(`   Participant ID: ${PRODUCTION_CONFIG.participantId}`);
  console.log(`   API Key: ${PRODUCTION_CONFIG.apiKey.substring(0, 10)}...`);
  
  // Mostrar cómo se construye la URL en el código
  console.log("\n🔧 CONSTRUCCIÓN DE URL EN EL CÓDIGO:");
  console.log("   Archivo: functions/config/copernicoConfig.mjs");
  console.log("   Línea 138: return `${envConfig.baseUrl}/${raceId}/athlete/${participantId}`;");
  console.log(`   Resultado: ${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`);
}

// Ejecutar
debugCopernicoURL().catch(console.error);
