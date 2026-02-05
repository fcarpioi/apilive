#!/usr/bin/env node

/**
 * Script para simular una competencia real con 100 participantes
 * Secuencia: Salida → 10K (10min) → 15K (5min) → 20K (5min) → 25K (5min) → 35K (5min) → Meta (5min)
 */

import fetch from 'node-fetch';

const ENDPOINT_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';
const CSV_PARTICIPANTS_PATH = process.env.PARTICIPANTS_CSV_PATH || '/Users/fernandocarpio/Downloads/media_maraton.csv';

// Configuración de timing
const TIMING_MODE = process.argv[2] || 'test'; // 'real' o 'test'
const REAL_TIMING = TIMING_MODE === 'test';

console.log(`🕐 MODO DE TIMING: ${REAL_TIMING ? 'REAL (minutos reales)' : 'TEST (segundos acelerados)'}`);

// Lista completa de 100 participantes (fallback si no hay CSV)
const defaultParticipants = [
'6F6Y42FF',
'3A38D64A',
'3YZA549C',
'1AB77Y18',
'AAF93Y67',
'Z4777894',
'DA66CBB9',
'Z3BB248B',
'FDC64C8B',
'21B63186',
'D3ZY54YA',
'5YZBF965',
'28CCF14F',
'54FY9924',
'CY74D84Z',
'F9F9ACCF',
'6AC3C3B3',
'15FA2B76',
'A9B2321C',
'9Y8573A1',
'121D1BBD',
'131Y57B4',
'FY8Z7772',
'4688BCFZ',
'1ZZCB42Y'
];

// Checkpoints en secuencia real de competencia
const checkpoints = [
{ name: 'Salida', delay: 0, type: 'ATHLETE_STARTED', point: 'Salida', location: 'Meta' },
{ name: '10K', delay: 10, type: 'ATHLETE_CROSSED_TIMING_SPLIT', point: '10K', location: '10K' },
{ name: '15K', delay: 5, type: 'ATHLETE_CROSSED_TIMING_SPLIT', point: '15K', location: '15K' },
{ name: 'Meta 21K', delay: 5, type: 'ATHLETE_FINISHED', point: 'Media', location: 'Meta 21K' }
];

// Configuración base
const basePayload = {
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection"
};

async function loadParticipantsFromCsv(csvPath) {
  try {
    const fs = await import('fs/promises');
    const raw = await fs.readFile(csvPath, 'utf8');

    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      throw new Error('CSV vacío');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const idIndex = headers.indexOf('id');
    if (idIndex === -1) {
      throw new Error('No se encontró la columna "id" en el CSV');
    }

    const ids = [];
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      const id = (columns[idIndex] || '').trim().replace(/^"|"$/g, '');
      if (id) ids.push(id);
    }

    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      throw new Error('No se encontraron IDs en el CSV');
    }

    console.log(`📂 Participantes cargados desde CSV: ${uniqueIds.length} IDs`);
    return uniqueIds;
  } catch (error) {
    console.warn(`⚠️ No se pudo leer participantes desde CSV (${csvPath}): ${error.message}`);
    return null;
  }
}

async function simulateRealCompetition() {
  let participants;
  let participantsSource;

  if (!REAL_TIMING) {
    // En modo test siempre usar el fallback embebido para que sea determinista
    participants = defaultParticipants;
    participantsSource = 'DEFAULT_EMBEDDED_TEST_MODE';
  } else {
    participants = (await loadParticipantsFromCsv(CSV_PARTICIPANTS_PATH)) || defaultParticipants;
    participantsSource = participants === defaultParticipants ? 'DEFAULT_EMBEDDED' : 'CSV';
  }

  console.log("🏃‍♂️ SIMULANDO COMPETENCIA REAL - MARATÓN MÁLAGA 2025");
  console.log("=" * 80);
  console.log(`👥 Participantes: ${participants.length} (${participantsSource})`);
  console.log(`📍 Secuencia: ${checkpoints.map(cp => cp.name).join(' → ')}`);
  console.log(`🎯 Total historias: ${participants.length * checkpoints.length} (${checkpoints.length} por participante)`);
  console.log(`⏰ Timing: Salida → 10K (10min) → 15K/20K/25K/35K/Meta (5min c/u)`);
  console.log(`🕐 Modo: ${REAL_TIMING ? 'TIEMPO REAL (40 minutos totales)' : 'MODO TEST (35 segundos totales)'}`);
  console.log("");

  const results = {
    success: [],
    failed: [],
    total: 0
  };

  const startTime = new Date();
  console.log(`🚀 INICIO DE COMPETENCIA: ${startTime.toLocaleTimeString()}`);
  console.log("=" * 80);

  // Procesar cada checkpoint secuencialmente para todos los participantes
  for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex++) {
    const checkpoint = checkpoints[checkpointIndex];

    // Calcular tiempo de espera antes de este checkpoint
    if (checkpointIndex > 0) {
      const delayMinutes = checkpoint.delay;
      const delayMs = delayMinutes * 60 * 1000; // Convertir a millisegundos

      if (REAL_TIMING) {
        console.log(`\n⏳ ESPERANDO ${delayMinutes} MINUTOS REALES HASTA ${checkpoint.name}...`);
        console.log(`   ⏰ Tiempo real de espera: ${delayMinutes} minutos (${delayMs / 1000} segundos)`);
        console.log(`   🔄 Iniciando espera real...`);

        // Mostrar countdown cada minuto
        for (let minute = delayMinutes; minute > 0; minute--) {
          if (minute === delayMinutes) {
            console.log(`   ⏰ Esperando ${minute} minutos...`);
          } else {
            console.log(`   ⏰ Quedan ${minute} minutos...`);
          }
          await delay(60000); // 1 minuto real
        }

        console.log(`   ✅ Espera completada. Procesando checkpoint ${checkpoint.name}`);
      } else {
        // Modo testing: delays acelerados
        const testDelaySeconds = delayMinutes; // 1 segundo por cada minuto real
        console.log(`\n⏳ MODO TEST: Esperando ${testDelaySeconds} segundos (simulando ${delayMinutes} minutos)`);
        await delay(testDelaySeconds * 1000);
        console.log(`   ✅ Espera test completada. Procesando checkpoint ${checkpoint.name}`);
      }
    }

    const currentTime = new Date();
    console.log(`\n📍 CHECKPOINT: ${checkpoint.name.toUpperCase()}`);
    console.log(`⏰ Tiempo: ${currentTime.toLocaleTimeString()}`);
    console.log(`🏃‍♂️ Procesando ${participants.length} participantes...`);
    console.log("-" * 60);

    // Procesar todos los participantes para este checkpoint
    for (let i = 0; i < participants.length; i++) {
      const participantId = participants[i];

      console.log(`  ${i + 1}/${participants.length}. ${participantId} → ${checkpoint.name}`);

      const payload = {
        ...basePayload,
        participantId: participantId,
        extraData: {
          point: checkpoint.point || checkpoint.name,
          event: "Medio Maratón",
          location: checkpoint.location || checkpoint.name,
          checkpointType: checkpoint.type,
          simulatedTime: currentTime.toISOString(),
          competitionPhase: `checkpoint_${checkpointIndex + 1}_of_${checkpoints.length}`
        }
      };

      try {
        const requestStart = Date.now();

        const response = await fetch(ENDPOINT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const responseTime = Date.now() - requestStart;
        const result = await response.json();

        if (response.ok && result.success) {
          console.log(`     ✅ OK (${responseTime}ms)`);
          results.success.push({
            participantId,
            checkpoint: checkpoint.name,
            type: checkpoint.type,
            queueKey: result.data?.queueKey,
            requestId: result.data?.requestId
          });
        } else {
          console.log(`     ❌ Error: ${result.message || 'Unknown error'}`);
          results.failed.push({
            participantId,
            checkpoint: checkpoint.name,
            error: result.message || `HTTP ${response.status}`,
            status: response.status
          });
        }

      } catch (error) {
        console.log(`     💥 Exception: ${error.message}`);
        results.failed.push({
          participantId,
          checkpoint: checkpoint.name,
          error: error.message,
          status: 'EXCEPTION'
        });
      }

      results.total++;

      // Pausa pequeña entre participantes del mismo checkpoint
      await delay(100); // 100ms entre participantes
    }

    console.log(`✅ Checkpoint ${checkpoint.name} completado para todos los participantes`);
  }
  
  // Resumen final
  console.log("\n🎉 RESUMEN FINAL");
  console.log("=" * 70);
  console.log(`📊 Total requests: ${results.total}`);
  console.log(`✅ Exitosos: ${results.success.length}`);
  console.log(`❌ Fallidos: ${results.failed.length}`);
  console.log(`📈 Tasa de éxito: ${((results.success.length / results.total) * 100).toFixed(1)}%`);
  
  if (results.failed.length > 0) {
    console.log("\n❌ REQUESTS FALLIDOS:");
    results.failed.forEach((fail, index) => {
      console.log(`   ${index + 1}. ${fail.participantId} - ${fail.checkpoint}: ${fail.error}`);
    });
  }
  
  if (results.success.length > 0) {
    console.log("\n✅ REQUESTS EXITOSOS:");
    console.log(`   ${results.success.length} historias encoladas para procesamiento`);
    console.log(`   Secuencia: Salida → 10K → 15K → 20K → 25K → 35K → Meta`);
    console.log("   Las historias se generarán en segundo plano en los próximos minutos");
  }

  console.log("\n📋 RESUMEN POR CHECKPOINT:");
  checkpoints.forEach(checkpoint => {
    const successCount = results.success.filter(r => r.checkpoint === checkpoint.name).length;
    const failedCount = results.failed.filter(r => r.checkpoint === checkpoint.name).length;
    console.log(`   📍 ${checkpoint.name}: ${successCount}✅ ${failedCount}❌ (${checkpoint.type})`);
  });

  console.log("\n🔗 MONITOREO:");
  console.log("   📊 Firebase Console: https://console.firebase.google.com/project/live-copernico/functions/logs");
  console.log("   📱 App para ver historias generadas");
  console.log("   ⏰ Las historias aparecerán en 2-5 minutos");
  console.log(`   🎯 Total esperado: ${participants.length * checkpoints.length} historias`);

  // Guardar resultados en archivo
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = `competition_simulation_${timestamp}.json`;

  try {
    const fs = await import('fs');
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      participants: participants,
      checkpoints: checkpoints,
      results: results,
      summary: {
        totalParticipants: participants.length,
        totalCheckpoints: checkpoints.length,
        totalExpectedStories: participants.length * checkpoints.length,
        successfulRequests: results.success.length,
        failedRequests: results.failed.length,
        successRate: ((results.success.length / results.total) * 100).toFixed(1) + '%'
      }
    }, null, 2));

    console.log(`\n📄 Resultados guardados en: ${resultsFile}`);
  } catch (error) {
    console.log(`\n⚠️ No se pudo guardar el archivo de resultados: ${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecutar la simulación de competencia real
simulateRealCompetition().catch(console.error);
