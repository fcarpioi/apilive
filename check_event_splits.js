#!/usr/bin/env node

/**
 * Script para verificar qué splits tiene configurado el evento "Medio Maratón"
 */

async function checkEventSplits() {
  console.log('🔍 Verificando splits del evento "Medio Maratón"...');

  try {
    // Primero, vamos a obtener la lista de participantes para ver la estructura
    const participantsUrl = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/search/participants?raceId=69200553-464c-4bfd-9b35-4ca6ac1f17f5&appId=Ryx7YFWobBfGTJqkciCV&eventId=Medio%20Maratón&query=1ZZCB42Y';
    
    console.log('🔗 Consultando participante para ver estructura del evento...');
    console.log('URL:', participantsUrl);
    
    const participantsResponse = await fetch(participantsUrl);
    const participantsResult = await participantsResponse.json();
    
    console.log('\n📊 Respuesta de participantes:');
    console.log(JSON.stringify(participantsResult, null, 2));

    // Si encontramos el participante, podemos ver si tiene información del evento
    if (participantsResult.success && participantsResult.participants && participantsResult.participants.length > 0) {
      const participant = participantsResult.participants[0];
      console.log('\n✅ Participante encontrado:');
      console.log(`📍 ID: ${participant.id}`);
      console.log(`🏃 Nombre: ${participant.name}`);
      console.log(`🏁 Evento: ${participant.eventId}`);
      
      // Verificar si tiene información de splits en sus stories
      if (participant.stories && participant.stories.length > 0) {
        console.log('\n📖 Stories del participante:');
        participant.stories.forEach((story, index) => {
          console.log(`\n  Story ${index + 1}:`);
          console.log(`    📍 Tipo: ${story.type}`);
          console.log(`    📝 Descripción: ${story.description}`);
          if (story.checkpointInfo) {
            console.log(`    🎯 Checkpoint: ${story.checkpointInfo.point}`);
            console.log(`    📍 Location: ${story.checkpointInfo.location}`);
          }
          if (story.fileUrl) {
            console.log(`    🎬 Tiene clip: ✅`);
          }
        });
      }
    }

    // También vamos a intentar consultar directamente el documento del evento en Firestore
    // usando la API de configuración
    console.log('\n🔍 Intentando obtener configuración del evento...');
    
    // Probar diferentes endpoints para obtener la configuración
    const configUrls = [
      'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/apps/config?bundleId=com.copernico.live&raceId=69200553-464c-4bfd-9b35-4ca6ac1f17f5',
      'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/apps/config?raceId=69200553-464c-4bfd-9b35-4ca6ac1f17f5'
    ];

    for (const configUrl of configUrls) {
      try {
        console.log(`\n🔗 Probando: ${configUrl}`);
        const configResponse = await fetch(configUrl);
        const configResult = await configResponse.json();
        
        if (configResponse.ok && configResult.success) {
          console.log('✅ Configuración obtenida exitosamente');
          
          // Buscar el evento "Medio Maratón"
          if (configResult.config && configResult.config.events) {
            const medioMaraton = configResult.config.events.find(event => 
              event.eventId === 'Medio Maratón' || event.name === 'Medio Maratón'
            );
            
            if (medioMaraton) {
              console.log('\n🎯 Evento "Medio Maratón" encontrado:');
              console.log(`📍 ID: ${medioMaraton.eventId}`);
              console.log(`📝 Nombre: ${medioMaraton.name}`);
              
              if (medioMaraton.splits) {
                console.log('\n📊 Splits configurados:');
                medioMaraton.splits.forEach((split, index) => {
                  console.log(`  ${index + 1}. ${typeof split === 'string' ? split : split.name || split.id}`);
                });
                
                // Verificar si "Media" está en los splits
                const hasMedia = medioMaraton.splits.some(split => 
                  split === 'Media' || 
                  (typeof split === 'object' && (split.name === 'Media' || split.id === 'Media'))
                );
                
                if (hasMedia) {
                  console.log('\n✅ El checkpoint "Media" SÍ está en los splits del evento');
                } else {
                  console.log('\n❌ El checkpoint "Media" NO está en los splits del evento');
                  console.log('🔍 Esto explica por qué no se crearon split-clips');
                }
              } else {
                console.log('\n⚠️ El evento no tiene splits configurados');
              }
              
              if (medioMaraton.timingPoints) {
                console.log('\n📊 Timing Points configurados:');
                medioMaraton.timingPoints.forEach((timing, index) => {
                  console.log(`  ${index + 1}. ${typeof timing === 'string' ? timing : timing.name || timing.id}`);
                });
              }
            } else {
              console.log('\n❌ Evento "Medio Maratón" no encontrado en la configuración');
            }
          }
          break; // Si obtuvimos configuración exitosa, salir del loop
        } else {
          console.log(`❌ Error: ${configResult.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.log(`❌ Error consultando configuración: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error general:', error.message);
  }
}

// Ejecutar verificación
checkEventSplits();
