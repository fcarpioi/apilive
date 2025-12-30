#!/usr/bin/env node

/**
 * Script para debuggear por qué no se están creando split-clips
 * Simula exactamente lo que hace la función createSplitClipsFromStory()
 */

async function debugSplitClipsCreation() {
  console.log('🔍 Debuggeando creación de split-clips...');
  
  const raceId = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
  const appId = 'Ryx7YFWobBfGTJqkciCV';
  const eventId = 'Medio Maratón';
  const participantId = '1ZZCB42Y';
  const checkpointId = 'Media'; // Este es el checkpoint que se procesó
  const clipUrl = 'https://stream.mux.com/uNn3BvFC00YAxQozJnZY7i6y2EJchCEqmOudFPFH6CTI.m3u8';

  console.log('\n📊 Parámetros de la función:');
  console.log(`  raceId: ${raceId}`);
  console.log(`  appId: ${appId}`);
  console.log(`  eventId: ${eventId}`);
  console.log(`  participantId: ${participantId}`);
  console.log(`  checkpointId: ${checkpointId}`);
  console.log(`  clipUrl: ${clipUrl}`);

  try {
    // 1. Verificar si el evento existe y tiene splits
    console.log('\n1️⃣ Verificando configuración del evento...');
    
    // Intentar obtener la configuración del evento usando la API
    const configUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/apps/config?raceId=${raceId}`;
    
    console.log('🔗 URL de configuración:', configUrl);
    
    const configResponse = await fetch(configUrl);
    
    if (configResponse.ok) {
      const configResult = await configResponse.json();
      
      if (configResult.success && configResult.config && configResult.config.events) {
        console.log('✅ Configuración obtenida exitosamente');
        
        // Buscar el evento "Medio Maratón"
        const medioMaraton = configResult.config.events.find(event => 
          event.eventId === eventId || event.name === eventId
        );
        
        if (medioMaraton) {
          console.log('\n🎯 Evento "Medio Maratón" encontrado:');
          console.log(`📍 ID: ${medioMaraton.eventId}`);
          console.log(`📝 Nombre: ${medioMaraton.name || 'N/A'}`);
          
          if (medioMaraton.splits && medioMaraton.splits.length > 0) {
            console.log('\n📊 Splits configurados en el evento:');
            medioMaraton.splits.forEach((split, index) => {
              const splitName = typeof split === 'string' ? split : (split.name || split.id || JSON.stringify(split));
              console.log(`  ${index}. "${splitName}"`);
            });
            
            // Simular la lógica de la función createSplitClipsFromStory
            console.log(`\n🔍 Buscando checkpoint "${checkpointId}" en splits...`);
            
            const splitIndex = medioMaraton.splits.findIndex(split =>
              split === checkpointId ||
              (typeof split === 'object' && (split.name === checkpointId || split.id === checkpointId))
            );
            
            if (splitIndex !== -1) {
              console.log(`✅ Split encontrado en índice ${splitIndex}: ${checkpointId}`);
              console.log('🎯 La función createSplitClipsFromStory() DEBERÍA haber creado el split-clip');
              
              // Verificar si existe el split-clip
              console.log('\n2️⃣ Verificando si el split-clip fue creado...');
              
              const splitClipsUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/races/${raceId}/events/${encodeURIComponent(eventId)}/participants/${participantId}/splits-with-clips?appId=${appId}`;
              
              console.log('🔗 URL de split-clips:', splitClipsUrl);
              
              const splitClipsResponse = await fetch(splitClipsUrl);
              const splitClipsResult = await splitClipsResponse.json();
              
              console.log('📊 Resultado de split-clips:');
              console.log(JSON.stringify(splitClipsResult, null, 2));
              
              if (splitClipsResult.success && splitClipsResult.splitsWithClips && splitClipsResult.splitsWithClips.length > 0) {
                console.log('\n✅ ¡Split-clips encontrados!');
                console.log('🎯 La función SÍ funcionó correctamente');
              } else {
                console.log('\n❌ No se encontraron split-clips');
                console.log('🎯 Posibles causas:');
                console.log('   1. La función createSplitClipsFromStory() no se ejecutó');
                console.log('   2. Hubo un error en la función');
                console.log('   3. Los datos no se guardaron correctamente');
                console.log('   4. Hay un delay en la sincronización');
              }
            } else {
              console.log(`❌ Checkpoint "${checkpointId}" NO encontrado en splits`);
              console.log('🎯 Esta es la razón por la que no se crearon split-clips');
              console.log('💡 El checkpoint debe estar en la lista de splits del evento');
            }
          } else {
            console.log('\n⚠️ El evento no tiene splits configurados');
            console.log('💡 Solución: Configurar splits para el evento');
          }
          
          if (medioMaraton.timingPoints && medioMaraton.timingPoints.length > 0) {
            console.log('\n📊 Timing Points configurados:');
            medioMaraton.timingPoints.forEach((timing, index) => {
              const timingName = typeof timing === 'string' ? timing : (timing.name || timing.id || JSON.stringify(timing));
              console.log(`  ${index}. "${timingName}"`);
            });
            
            // También verificar timing points
            const timingIndex = medioMaraton.timingPoints.findIndex(timing =>
              timing === checkpointId ||
              (typeof timing === 'object' && (timing.name === checkpointId || timing.id === checkpointId))
            );
            
            if (timingIndex !== -1) {
              console.log(`✅ Checkpoint "${checkpointId}" encontrado en timing points en índice ${timingIndex}`);
            }
          }
        } else {
          console.log('\n❌ Evento "Medio Maratón" no encontrado en la configuración');
        }
      } else {
        console.log('❌ Error en la respuesta de configuración');
        console.log('Error:', configResult.error || 'Unknown error');
      }
    } else {
      console.log(`❌ Error HTTP ${configResponse.status} obteniendo configuración`);
      const errorText = await configResponse.text();
      console.log('Error:', errorText.substring(0, 200));
    }

  } catch (error) {
    console.error('\n❌ Error general:', error.message);
  }
}

// Ejecutar debug
debugSplitClipsCreation();
