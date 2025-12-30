#!/usr/bin/env node

/**
 * Script para debuggear por qué no se crean split-clips
 * Verifica la configuración del evento "Medio Maratón"
 */

async function debugEventSplits() {
  console.log('🔍 Debuggeando configuración del evento "Medio Maratón"...');
  
  const raceId = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
  const appId = 'Ryx7YFWobBfGTJqkciCV';
  const eventId = 'Medio Maratón';
  const participantId = '1ZZCB42Y';

  try {
    // 1. Verificar si el participante existe
    console.log('\n1️⃣ Verificando participante...');
    const participantUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/apps/participant?raceId=${raceId}&appId=${appId}&eventId=${encodeURIComponent(eventId)}&participantId=${participantId}`;
    
    console.log('🔗 URL:', participantUrl);
    
    const participantResponse = await fetch(participantUrl);
    const participantResult = await participantResponse.json();
    
    if (participantResponse.ok && participantResult.id) {
      console.log('✅ Participante encontrado');
      console.log(`📍 ID: ${participantResult.id}`);
      console.log(`🏃 Nombre: ${participantResult.name}`);
      
      // Verificar splits en el participante
      if (participantResult.splits && participantResult.splits.length > 0) {
        console.log('\n📊 Splits del participante:');
        participantResult.splits.forEach((split, index) => {
          console.log(`  ${index + 1}. ${split.split} - ${split.time} (${split.type})`);
        });
        
        // Verificar si tiene el split "Media"
        const hasMedia = participantResult.splits.some(split => 
          split.split === 'Media' || split.split === 'META'
        );
        
        if (hasMedia) {
          console.log('✅ El participante SÍ tiene el split "Media"');
        } else {
          console.log('❌ El participante NO tiene el split "Media"');
        }
      } else {
        console.log('⚠️ El participante no tiene splits registrados');
      }
    } else {
      console.log('❌ Participante no encontrado');
      console.log('Error:', participantResult.message || participantResult.error);
    }

    // 2. Verificar configuración de la app
    console.log('\n2️⃣ Verificando configuración de la app...');
    const configUrl = `https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/apps/config?raceId=${raceId}`;
    
    console.log('🔗 URL:', configUrl);
    
    const configResponse = await fetch(configUrl);
    const configResult = await configResponse.json();
    
    if (configResponse.ok && configResult.success) {
      console.log('✅ Configuración obtenida');
      
      // Buscar el evento "Medio Maratón"
      if (configResult.config && configResult.config.events) {
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
              console.log(`  ${index + 1}. "${splitName}"`);
            });
            
            // Verificar si "Media" está en los splits
            const hasMediaSplit = medioMaraton.splits.some(split => {
              if (typeof split === 'string') {
                return split === 'Media' || split === 'META';
              } else {
                return split.name === 'Media' || split.id === 'Media' || 
                       split.name === 'META' || split.id === 'META';
              }
            });
            
            if (hasMediaSplit) {
              console.log('\n✅ El checkpoint "Media" SÍ está en los splits del evento');
              console.log('🎯 Los split-clips deberían haberse creado');
              console.log('🔍 Posible problema en la función createSplitClipsFromStory()');
            } else {
              console.log('\n❌ El checkpoint "Media" NO está en los splits del evento');
              console.log('🎯 Esta es la razón por la que no se crearon split-clips');
              console.log('💡 Solución: Agregar "Media" a los splits del evento');
            }
          } else {
            console.log('\n⚠️ El evento no tiene splits configurados');
            console.log('💡 Solución: Configurar splits para el evento');
          }
          
          if (medioMaraton.timingPoints && medioMaraton.timingPoints.length > 0) {
            console.log('\n📊 Timing Points configurados:');
            medioMaraton.timingPoints.forEach((timing, index) => {
              const timingName = typeof timing === 'string' ? timing : (timing.name || timing.id || JSON.stringify(timing));
              console.log(`  ${index + 1}. "${timingName}"`);
            });
          }
        } else {
          console.log('\n❌ Evento "Medio Maratón" no encontrado en la configuración');
        }
      } else {
        console.log('❌ No se encontraron eventos en la configuración');
      }
    } else {
      console.log('❌ Error obteniendo configuración');
      console.log('Error:', configResult.error || 'Unknown error');
    }

  } catch (error) {
    console.error('\n❌ Error general:', error.message);
  }
}

// Ejecutar debug
debugEventSplits();
