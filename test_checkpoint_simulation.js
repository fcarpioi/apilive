#!/usr/bin/env node

/**
 * Script para simular datos de checkpoint y verificar que el sistema responde
 */

import fetch from 'node-fetch';

const CHECKPOINT_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';
const API_KEY = '9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0';

// Datos de prueba simulando un evento real de Copernico
const TEST_PARTICIPANTS = [
  { id: '64D271D9', name: 'Test Runner 1' },
  { id: '2B5C4YZD', name: 'Test Runner 2' },
  { id: '4FYA421Z', name: 'Test Runner 3' }
];

const TEST_CHECKPOINTS = ['5K', '10K', '15K'];

async function simulateCheckpointData() {
  console.log("🧪 SIMULANDO DATOS DE CHECKPOINT");
  console.log("=" * 60);
  console.log(`🎯 Objetivo: Verificar que el sistema responde a eventos de checkpoint`);
  console.log(`👥 Participantes de prueba: ${TEST_PARTICIPANTS.length}`);
  console.log(`📍 Checkpoints de prueba: ${TEST_CHECKPOINTS.join(', ')}`);
  console.log("");
  
  let totalTests = 0;
  let successfulTests = 0;
  let failedTests = 0;
  
  for (const participant of TEST_PARTICIPANTS) {
    for (const checkpoint of TEST_CHECKPOINTS) {
      totalTests++;
      
      console.log(`🏃‍♂️ Simulando: ${participant.name} (${participant.id}) pasa por ${checkpoint}`);
      
      try {
        // Simular datos como los que llegarían de Copernico (estructura correcta)
        const checkpointData = {
          competitionId: 'generali-maraton-malaga-2025',
          copernicoId: 'generali-maraton-malaga-2025', // ID en Copernico
          participantId: participant.id,
          type: 'detection', // Tipo de evento válido: 'detection' o 'modification'
          apiKey: API_KEY,
          extraData: {
            point: checkpoint, // El checkpoint específico va en extraData
            location: checkpoint,
            distance: getDistanceForCheckpoint(checkpoint),
            position: Math.floor(Math.random() * 1000) + 1,
            checkpointName: checkpoint // Nombre del checkpoint
          },
          rawTime: new Date().toISOString() // Timestamp exacto del checkpoint
        };
        
        const response = await fetch(CHECKPOINT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(checkpointData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          console.log(`   ✅ Éxito: ${result.message || 'Historia generada correctamente'}`);
          successfulTests++;
          
          if (result.storyId) {
            console.log(`   🎬 Story ID: ${result.storyId}`);
          }
          
          if (result.videoUrl) {
            console.log(`   🎥 Video URL: ${result.videoUrl.substring(0, 50)}...`);
          }
          
        } else {
          console.log(`   ❌ Error: ${result.message || 'Error desconocido'}`);
          failedTests++;
        }
        
      } catch (error) {
        console.log(`   💥 Exception: ${error.message}`);
        failedTests++;
      }
      
      // Pausa entre simulaciones
      await delay(2000);
    }
    
    console.log(""); // Línea en blanco entre participantes
  }
  
  // Resumen final
  console.log("🎯 RESUMEN DE SIMULACIÓN");
  console.log("=" * 60);
  console.log(`📊 Total pruebas: ${totalTests}`);
  console.log(`✅ Exitosas: ${successfulTests}`);
  console.log(`❌ Fallidas: ${failedTests}`);
  console.log(`📈 Tasa de éxito: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
  
  if (successfulTests > 0) {
    console.log("\n🎉 SISTEMA FUNCIONANDO:");
    console.log("   • El endpoint /api/checkpoint-participant responde correctamente");
    console.log("   • Las historias se están generando");
    console.log("   • El sistema está listo para datos reales de Copernico");
    
    console.log("\n🔍 VERIFICACIONES RECOMENDADAS:");
    console.log("   • Revisar Firestore para ver las historias generadas");
    console.log("   • Verificar que los videos se estén creando");
    console.log("   • Comprobar que las notificaciones funcionen");
    
  } else {
    console.log("\n⚠️ PROBLEMAS DETECTADOS:");
    console.log("   • El endpoint no está respondiendo correctamente");
    console.log("   • Verificar que el servicio esté desplegado");
    console.log("   • Revisar logs de Firebase Functions");
    console.log("   • Comprobar configuración de API keys");
  }
  
  if (failedTests > 0) {
    console.log("\n🔧 ACCIONES RECOMENDADAS:");
    console.log("   • Revisar logs detallados del sistema");
    console.log("   • Verificar configuración de Copernico");
    console.log("   • Comprobar conectividad con servicios externos");
  }
  
  console.log("\n📡 PRÓXIMO PASO:");
  console.log("   • Continuar monitoreando datos reales con: node monitor_copernico_data.js");
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateRandomTime(checkpoint) {
  // Generar tiempos realistas basados en el checkpoint
  const baseTimes = {
    '5K': 20 * 60, // 20 minutos base para 5K
    '10K': 45 * 60, // 45 minutos base para 10K
    '15K': 70 * 60, // 70 minutos base para 15K
    'Media': 95 * 60, // 95 minutos base para media maratón
    '25K': 120 * 60, // 120 minutos base para 25K
    '30K': 145 * 60, // 145 minutos base para 30K
    '35K': 170 * 60, // 170 minutos base para 35K
    'Meta': 200 * 60 // 200 minutos base para maratón completo
  };
  
  const baseTime = baseTimes[checkpoint] || 60 * 60;
  const variation = Math.random() * 30 * 60; // Variación de ±30 minutos
  const totalSeconds = baseTime + variation;
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getDistanceForCheckpoint(checkpoint) {
  const distances = {
    '5K': '5.0 km',
    '10K': '10.0 km',
    '15K': '15.0 km',
    'Media': '21.1 km',
    '25K': '25.0 km',
    '30K': '30.0 km',
    '35K': '35.0 km',
    'Meta': '42.2 km'
  };
  
  return distances[checkpoint] || '0.0 km';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar
simulateCheckpointData().catch(console.error);
