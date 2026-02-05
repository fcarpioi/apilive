#!/usr/bin/env node

/**
 * Script para probar la creación de split-clips con el endpoint checkpoint-participant
 * 
 * Este script verifica que:
 * 1. El endpoint checkpoint-participant genere clips
 * 2. Se creen automáticamente los split-clips
 * 3. Los split-clips se guarden en la estructura correcta
 */

const ENDPOINT_URL = 'https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/checkpoint-participant';

// Datos de prueba con un checkpoint que sabemos que tiene clips
const testPayload = {
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection",
  "participantId": "1ZZCB42Y", // Participante conocido
  "extraData": {
    "point": "Media",      // ← Checkpoint que sabemos que tiene clips
    "event": "Medio Maratón",
    "location": "Meta 21K" // ← Location que coincide con los datos existentes
  },
  "rawTime": Date.now() - 30000 // 30 segundos atrás para simular checkpoint real
};

async function testSplitClipsCreation() {
  console.log('🧪 Iniciando prueba de creación de split-clips...');
  console.log('📡 Endpoint:', ENDPOINT_URL);
  console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));

  try {
    // 1. Enviar checkpoint
    console.log('\n🚀 Enviando checkpoint...');
    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();
    console.log('📥 Respuesta del endpoint:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${result.error || 'Unknown error'}`);
    }

    // 2. Esperar un poco para que se procese en background
    console.log('\n⏳ Esperando procesamiento en background (10 segundos)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 3. Verificar si se creó el split-clip
    console.log('\n🔍 Verificando creación de split-clips...');
    
    const checkUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/${testPayload.competitionId}/events/Medio%20Maratón/participants/${testPayload.participantId}/splits-with-clips/summary?appId=Ryx7YFWobBfGTJqkciCV`;
    
    console.log('🔗 URL de verificación:', checkUrl);
    
    const checkResponse = await fetch(checkUrl);
    const checkResult = await checkResponse.json();
    
    console.log('📊 Resultado de verificación:', JSON.stringify(checkResult, null, 2));

    // 4. Analizar resultados
    if (checkResult.success && checkResult.totalSplits > 0) {
      console.log('\n✅ ¡ÉXITO! Split-clips creados correctamente');
      console.log(`📈 Total de splits con clips: ${checkResult.totalSplits}`);
      console.log(`📋 Splits encontrados: ${checkResult.splitsWithClips.join(', ')}`);
      
      if (checkResult.splitsWithClips.includes('Media')) {
        console.log('🎯 ¡El split "Media" fue creado exitosamente!');
      } else {
        console.log('⚠️ El split "Media" no aparece en la lista');
      }
    } else {
      console.log('\n❌ No se encontraron split-clips');
      console.log('🔍 Posibles causas:');
      console.log('  - El checkpoint "Media" no está en la lista de splits del evento');
      console.log('  - No se generó clip de video');
      console.log('  - Error en el procesamiento');
    }

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error.message);
    console.error('📋 Detalles:', error);
  }
}

// Ejecutar la prueba
testSplitClipsCreation();
