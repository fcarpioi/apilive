#!/usr/bin/env node

/**
 * Script para verificar directamente si se crearon split-clips en Firestore
 */

const SPLITS_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Medio%20Maratón/participants/1ZZCB42Y/splits-with-clips?appId=Ryx7YFWobBfGTJqkciCV';

async function checkSplitClips() {
  console.log('🔍 Verificando split-clips directamente...');
  console.log('🔗 URL:', SPLITS_ENDPOINT);

  try {
    const response = await fetch(SPLITS_ENDPOINT);
    const result = await response.json();
    
    console.log('\n📊 Respuesta completa:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.splits && result.splits.length > 0) {
      console.log('\n✅ ¡Split-clips encontrados!');
      console.log(`📈 Total: ${result.splits.length}`);
      
      result.splits.forEach((split, index) => {
        console.log(`\n🎯 Split ${index + 1}:`);
        console.log(`  📍 Nombre: ${split.splitName}`);
        console.log(`  🎬 Clip URL: ${split.clipUrl}`);
        console.log(`  ⏰ Timestamp: ${split.timestamp}`);
        console.log(`  🔢 Índice: ${split.splitIndex}`);
        console.log(`  🏃 Participante: ${split.participantId}`);
      });
    } else {
      console.log('\n❌ No se encontraron split-clips');
      
      // Verificar si hay algún error específico
      if (result.error) {
        console.log(`🚨 Error: ${result.error}`);
      }
      
      // Verificar si el participante existe
      if (result.participantId) {
        console.log(`✅ Participante ID confirmado: ${result.participantId}`);
      }
    }

    // También verificar el resumen
    console.log('\n🔍 Verificando resumen...');
    const summaryUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/69200553-464c-4bfd-9b35-4ca6ac1f17f5/events/Medio%20Maratón/participants/1ZZCB42Y/splits-with-clips/summary?appId=Ryx7YFWobBfGTJqkciCV';
    
    const summaryResponse = await fetch(summaryUrl);
    const summaryResult = await summaryResponse.json();
    
    console.log('📋 Resumen de splits:');
    console.log(JSON.stringify(summaryResult, null, 2));

  } catch (error) {
    console.error('\n❌ Error verificando split-clips:', error.message);
  }
}

// Ejecutar verificación
checkSplitClips();
