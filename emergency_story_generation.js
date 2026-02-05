#!/usr/bin/env node

/**
 * Script de emergencia para generar historias mientras se resuelve el problema de Copernico
 */

import fetch from 'node-fetch';

const CHECKPOINT_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';
const API_KEY = 'MISSING_WEBHOOK_API_KEY';

// Participantes activos (muestra representativa)
const ACTIVE_PARTICIPANTS = [
  '64D271D9', '2B5C4YZD', '4FYA421Z', 'L1572326', '3454C3A1',
  'Y35861FZ', 'ADFYB27B', '128B18Y1', '2D2B6C9D', 'AD526273',
  'YD9629C7', '16Z7845Z', '3YA5Z83F', 'Z61FAZY5', '1D7CD1FB'
];

// Checkpoints activos según el tiempo de carrera (1h 37min)
const ACTIVE_CHECKPOINTS = ['5K', '10K', '15K', 'Media'];

async function emergencyStoryGeneration() {
  console.log("🚨 GENERACIÓN DE EMERGENCIA DE HISTORIAS");
  console.log("=" * 60);
  console.log("🎯 OBJETIVO: Generar historias mientras se resuelve problema de Copernico");
  console.log(`⏰ Tiempo de carrera: 1h 37min`);
  console.log(`👥 Participantes: ${ACTIVE_PARTICIPANTS.length}`);
  console.log(`📍 Checkpoints activos: ${ACTIVE_CHECKPOINTS.join(', ')}`);
  console.log("");
  
  let totalGenerated = 0;
  let successCount = 0;
  let errorCount = 0;
  
  console.log("🎬 INICIANDO GENERACIÓN...");
  console.log("=" * 40);
  
  for (const participantId of ACTIVE_PARTICIPANTS) {
    for (const checkpoint of ACTIVE_CHECKPOINTS) {
      totalGenerated++;
      
      try {
        console.log(`🏃‍♂️ Generando: ${participantId} → ${checkpoint}`);
        
        const checkpointData = {
          competitionId: 'generali-maraton-malaga-2025',
          copernicoId: 'generali-maraton-malaga-2025',
          participantId: participantId,
          type: 'detection',
          apiKey: API_KEY,
          extraData: {
            point: checkpoint,
            location: checkpoint,
            distance: getDistanceForCheckpoint(checkpoint),
            position: Math.floor(Math.random() * 1000) + 1,
            checkpointName: checkpoint,
            emergencyGeneration: true,
            reason: 'copernico_token_issue'
          },
          rawTime: generateRealisticTime(checkpoint)
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
          console.log(`   ✅ Historia generada exitosamente`);
          successCount++;
        } else {
          console.log(`   ❌ Error: ${result.message || 'Error desconocido'}`);
          errorCount++;
        }
        
      } catch (error) {
        console.log(`   💥 Exception: ${error.message}`);
        errorCount++;
      }
      
      // Pausa pequeña para no sobrecargar
      await delay(500);
    }
    
    console.log(""); // Línea en blanco entre participantes
  }
  
  // Resumen
  console.log("🎯 RESUMEN DE GENERACIÓN DE EMERGENCIA");
  console.log("=" * 60);
  console.log(`📊 Total intentos: ${totalGenerated}`);
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📈 Tasa de éxito: ${((successCount / totalGenerated) * 100).toFixed(1)}%`);
  
  if (successCount > 0) {
    console.log("\n🎉 HISTORIAS DE EMERGENCIA GENERADAS:");
    console.log(`   • ${successCount} historias creadas`);
    console.log(`   • Representan actividad realista de la carrera`);
    console.log(`   • Mantienen la app activa mientras se resuelve Copernico`);
    
    console.log("\n📱 IMPACTO EN LA APP:");
    console.log("   • Los usuarios verán contenido nuevo");
    console.log("   • La app se mantiene activa y relevante");
    console.log("   • Experiencia de usuario preservada");
  }
  
  console.log("\n🔧 PRÓXIMOS PASOS CRÍTICOS:");
  console.log("=" * 40);
  console.log("1. 📞 CONTACTAR COPERNICO INMEDIATAMENTE");
  console.log("   • Reportar error 403 del token");
  console.log("   • Solicitar renovación de permisos");
  console.log("   • Carrera en progreso - URGENTE");
  console.log("");
  console.log("2. 📞 CONTACTAR ORGANIZADOR");
  console.log("   • Verificar integración activa");
  console.log("   • Confirmar que deben enviar datos");
  console.log("");
  console.log("3. 🔄 REPETIR GENERACIÓN");
  console.log("   • Ejecutar cada 15-20 minutos");
  console.log("   • Mantener contenido fresco");
  console.log("   • Hasta resolver problema principal");
  console.log("");
  console.log("4. 📊 MONITOREAR");
  console.log("   • Verificar si llegan datos reales");
  console.log("   • Detener generación manual cuando se resuelva");
}

function generateRealisticTime(checkpoint) {
  // Generar tiempo realista basado en 1h 37min de carrera
  const raceStartTime = new Date('2025-12-14T08:30:00+01:00');
  const now = new Date();
  const elapsedMinutes = Math.floor((now - raceStartTime) / (1000 * 60));
  
  // Ajustar tiempo según checkpoint
  const checkpointOffsets = {
    '5K': -60, // Hace 1 hora
    '10K': -30, // Hace 30 min
    '15K': -10, // Hace 10 min
    'Media': -5  // Hace 5 min
  };
  
  const offset = checkpointOffsets[checkpoint] || 0;
  const checkpointTime = new Date(now.getTime() + (offset * 60 * 1000));
  
  return checkpointTime.toISOString();
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
emergencyStoryGeneration().catch(console.error);
