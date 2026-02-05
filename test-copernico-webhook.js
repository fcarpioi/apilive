#!/usr/bin/env node

/**
 * Script de prueba para el webhook de Copernico
 * 
 * Uso:
 * node test-copernico-webhook.js [raceId] [environment]
 * 
 * Ejemplos:
 * node test-copernico-webhook.js race123 pro
 * node test-copernico-webhook.js test-race dev
 */

const BASE_URL = 'https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api';
const API_KEY = 'MISSING_WEBHOOK_API_KEY';

// Obtener argumentos de línea de comandos
const raceId = process.argv[2] || 'test-race-' + Date.now();
const environment = process.argv[3] || 'pro';

console.log('🧪 Iniciando pruebas del webhook de Copernico');
console.log(`📍 Race ID: ${raceId}`);
console.log(`🌍 Environment: ${environment}`);
console.log(`🔗 Base URL: ${BASE_URL}`);
console.log('');

/**
 * Realizar petición HTTP
 */
async function makeRequest(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`📤 ${method} ${endpoint}`);
  if (body) {
    console.log(`📄 Body:`, JSON.stringify(body, null, 2));
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    console.log(`📥 Status: ${response.status}`);
    console.log(`📄 Response:`, JSON.stringify(data, null, 2));
    console.log('');
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    console.log('');
    return { status: 500, error: error.message };
  }
}

/**
 * Esperar un tiempo determinado
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecutar pruebas
 */
async function runTests() {
  try {
    console.log('🔍 1. Verificando estado inicial...');
    await makeRequest('/copernico/status');

    console.log('📊 2. Obteniendo métricas iniciales...');
    await makeRequest('/copernico/metrics');

    console.log('🧪 3. Probando conexión...');
    await makeRequest('/copernico/test-connection', 'POST', {
      raceId,
      environment,
      apiKey: API_KEY
    });

    console.log('⏳ Esperando 3 segundos para que se establezca la conexión...');
    await sleep(3000);

    console.log('📡 4. Suscribiéndose a la carrera...');
    await makeRequest('/copernico/subscribe', 'POST', {
      raceId,
      participantIds: ['test-participant-1', 'test-participant-2'],
      apiKey: API_KEY
    });

    console.log('⏳ Esperando 5 segundos para recibir datos...');
    await sleep(5000);

    console.log('🔍 5. Verificando estado después de suscripción...');
    await makeRequest('/copernico/status');

    console.log('📊 6. Obteniendo métricas finales...');
    await makeRequest('/copernico/metrics');

    console.log('🛑 7. Desuscribiéndose de la carrera...');
    await makeRequest('/copernico/unsubscribe', 'POST', {
      raceId,
      apiKey: API_KEY
    });

    console.log('✅ Pruebas completadas exitosamente!');
    console.log('');
    console.log('📝 Notas:');
    console.log('- Si no ves actualizaciones de atletas, verifica que la carrera esté activa en Copernico');
    console.log('- Revisa los logs de Firebase Functions para más detalles');
    console.log('- Las métricas muestran el estado del sistema de monitoreo');

  } catch (error) {
    console.error('❌ Error ejecutando pruebas:', error);
  }
}

// Verificar si fetch está disponible (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ Este script requiere Node.js 18+ o instalar node-fetch');
  console.log('💡 Instala node-fetch: npm install node-fetch');
  process.exit(1);
}

// Ejecutar pruebas
runTests().catch(console.error);
