#!/usr/bin/env node

// setupWebSocket.mjs
// Script para configurar y probar la conexión WebSocket

import fetch from 'node-fetch';

const BASE_URL = process.env.FIREBASE_URL || 'https://us-central1-live-copernico.cloudfunctions.net';

async function setupWebSocket() {
  console.log('🚀 Configurando WebSocket con AWS...\n');

  try {
    // 1. Inicializar WebSocket
    console.log('1️⃣ Inicializando conexión WebSocket...');
    const initResponse = await fetch(`${BASE_URL}/websocketManager/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (initResponse.ok) {
      const result = await initResponse.json();
      console.log('✅ WebSocket inicializado:', result);
    } else {
      console.error('❌ Error inicializando WebSocket:', await initResponse.text());
      return;
    }

    // 2. Esperar un momento
    console.log('\n⏳ Esperando 3 segundos...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Verificar estado
    console.log('\n2️⃣ Verificando estado de la conexión...');
    const statusResponse = await fetch(`${BASE_URL}/websocketManager/status`);
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('📊 Estado actual:', JSON.stringify(status, null, 2));
    } else {
      console.error('❌ Error obteniendo estado:', await statusResponse.text());
    }

    // 4. Probar suscripción manual
    console.log('\n3️⃣ Probando suscripción manual...');
    const subscribeResponse = await fetch(`${BASE_URL}/websocketManager/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raceId: 'test_race',
        eventId: 'test_event', 
        participantId: 'test_participant'
      })
    });

    if (subscribeResponse.ok) {
      const subResult = await subscribeResponse.json();
      console.log('✅ Suscripción de prueba:', subResult);
    } else {
      console.error('❌ Error en suscripción:', await subscribeResponse.text());
    }

    // 5. Verificar estado final
    console.log('\n4️⃣ Estado final...');
    const finalStatusResponse = await fetch(`${BASE_URL}/websocketManager/status`);
    
    if (finalStatusResponse.ok) {
      const finalStatus = await finalStatusResponse.json();
      console.log('📊 Estado final:', JSON.stringify(finalStatus, null, 2));
    }

    console.log('\n✅ Configuración completada!');
    console.log('\n📋 Próximos pasos:');
    console.log('1. Configurar variables de entorno AWS_WEBSOCKET_URL y AWS_API_KEY');
    console.log('2. Coordinar con AWS el formato de mensajes');
    console.log('3. Probar con datos reales');

  } catch (error) {
    console.error('❌ Error en configuración:', error);
  }
}

// Función para probar el nuevo endpoint simplificado
async function testNewEndpoint() {
  console.log('\n🧪 Probando nuevo endpoint simplificado con modelo AWS...');

  const payload = {
    runnerId: "test123",
    raceId: "test_race",
    eventId: "test_event",
    apiKey: "MISSING_WEBHOOK_API_KEY",
    data: {
      id: "test123",
      name: "Juan",
      fullname: "Juan Pérez",
      surname: "Pérez",
      birthdate: "1990-01-01",
      gender: "M",
      events: [
        {
          status: "running",
          realStatus: "running",
          event: "test_event",
          dorsal: "001",
          chip: ["chip123"],
          category: "M30-39",
          wave: "1",
          team: "Team Test",
          club: "Club Test",
          featured: false,
          times: {
            "start_line": {
              split: "start_line",
              order: 0,
              distance: 0,
              time: 0,
              netTime: 0,
              average: 0,
              averageNet: 0,
              raw: {
                created: Date.now(),
                time: new Date().toISOString(),
                chip: "chip123",
                location: "start_line",
                device: "ca7a9dec-b50b-510c-bf86-058664b46422", // UUID como streamId
                rewind: false,
                import: false,
                valid: true,
                offset: 0,
                originalTime: Date.now(),
                rawTime: Date.now(),
                times: {
                  official: Date.now(),
                  real: Date.now(),
                  rawTime: Date.now()
                }
              }
            },
            "checkpoint_5km": {
              split: "checkpoint_5km",
              order: 1,
              distance: 5000,
              time: 1800000, // 30 minutos
              netTime: 1800000,
              average: 6.0,
              averageNet: 6.0,
              raw: {
                created: Date.now() + 1800000,
                time: new Date(Date.now() + 1800000).toISOString(),
                chip: "chip123",
                location: "checkpoint_5km",
                device: "f1e2d3c4-a5b6-7c8d-9e0f-123456789abc", // Otro UUID
                rewind: false,
                import: false,
                valid: true,
                offset: 0,
                originalTime: Date.now() + 1800000,
                rawTime: Date.now() + 1800000,
                times: {
                  official: Date.now() + 1800000,
                  real: Date.now() + 1800000,
                  rawTime: Date.now() + 1800000
                }
              }
            }
          },
          rankings: {},
          backups: [],
          mst: [],
          penalties: [],
          issuesCount: {
            data: 0,
            times: 0
          }
        }
      ],
      locations: ["start_line", "checkpoint_5km"],
      extrafield1: "",
      extrafield2: "",
      extrafield3: "",
      extrafield4: "",
      extrafield5: ""
    }
  };

  try {
    console.log('📤 Enviando datos del participante con 2 checkpoints...');
    console.log('📍 Checkpoints: start_line, checkpoint_5km');
    console.log('👤 Participante: Juan Pérez (001)');

    const response = await fetch(`${BASE_URL}/liveApiGateway/api/participant-checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Nuevo endpoint funcionando:');
      console.log(`   - Checkpoints procesados: ${result.data.checkpointsProcessed}`);
      console.log(`   - Checkpoints nuevos: ${result.data.newCheckpoints}`);
      console.log(`   - Historias creadas: ${result.data.storiesCreated}`);
      console.log(`   - Participante: ${result.data.participantName} (${result.data.runnerBib})`);

      // Probar enviar los mismos datos otra vez (debería decir que historias ya existen)
      console.log('\n🔄 Probando duplicado (debería decir que historias ya existen)...');
      const response2 = await fetch(`${BASE_URL}/liveApiGateway/api/participant-checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response2.ok) {
        const result2 = await response2.json();
        console.log('📊 Respuesta duplicado:');
        console.log(`   - Checkpoints procesados: ${result2.data.checkpointsProcessed}`);
        console.log(`   - Historias creadas: ${result2.data.storiesCreated} (debería ser 0)`);
        console.log(`   - Mensaje: ${result2.message}`);
      } else {
        console.log('⚠️ Error en duplicado:', response2.status);
      }

    } else {
      const error = await response.text();
      console.log('⚠️ Error en endpoint:', response.status, error);
    }
  } catch (error) {
    console.error('❌ Error probando nuevo endpoint:', error);
  }
}

// Función para probar webhook anterior (COMENTADO - MANTENER)
async function testOldWebhook() {
  console.log('\n🧪 Probando webhook anterior (flujo WebSocket)...');

  const webhookPayload = {
    runnerId: "test123",
    runnerBib: "001",
    checkpointId: "start_line",
    timestamp: new Date().toISOString(),
    raceId: "test_race",
    eventId: "test_event",
    streamId: "ca7a9dec-b50b-510c-bf86-058664b46422",
    apiKey: "MISSING_WEBHOOK_API_KEY"
  };

  try {
    const response = await fetch(`${BASE_URL}/liveApiGateway/api/webhook/runner-checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook anterior funcionando:', result);
    } else {
      const error = await response.text();
      console.log('⚠️ Webhook response:', response.status, error);
    }
  } catch (error) {
    console.error('❌ Error probando webhook anterior:', error);
  }
}

// Función para probar métricas y monitoreo
async function testMonitoring() {
  console.log('\n📊 Probando sistema de monitoreo...');

  try {
    // Verificar métricas
    const response = await fetch(`${BASE_URL}/websocketManager/status`);
    const result = await response.json();

    if (result.success) {
      console.log('✅ Monitoreo funcionando');
      console.log('📈 Métricas:', {
        connected: result.status.connection.connected,
        subscriptions: result.status.subscriptions.localCount,
        uptime: result.status.connection.uptime
      });
    }
  } catch (error) {
    console.error('❌ Error en monitoreo:', error);
  }
}

// Función para probar generación de clips
async function testVideoClips() {
  console.log('\n🎬 Probando generación de clips de video...');

  // Simular múltiples checkpoints con streamIds únicos
  const testCheckpoints = [
    {
      checkpointId: "start_line",
      streamId: "ca7a9dec-b50b-510c-bf86-058664b46422",
      description: "Línea de salida"
    },
    {
      checkpointId: "checkpoint_5km",
      streamId: "f1e2d3c4-a5b6-7c8d-9e0f-123456789abc",
      description: "Kilómetro 5"
    },
    {
      checkpointId: "finish_line",
      streamId: "11223344-5566-7788-99aa-bbccddeeff00",
      description: "Línea de meta"
    }
  ];

  for (let i = 0; i < testCheckpoints.length; i++) {
    const checkpoint = testCheckpoints[i];

    console.log(`\n📍 Probando checkpoint ${i + 1}/${testCheckpoints.length}: ${checkpoint.description}`);

    const testPayload = {
      runnerId: `test_clip_${i + 1}`,
      runnerBib: `88${i + 1}`,
      checkpointId: checkpoint.checkpointId,
      timestamp: new Date().toISOString(),
      raceId: "test_race_video",
      eventId: "test_event_video",
      streamId: checkpoint.streamId, // UUID único por checkpoint
      apiKey: "MISSING_WEBHOOK_API_KEY"
    };

    try {
      console.log('📤 Enviando mensaje con streamId único...');
      console.log('📹 StreamId:', testPayload.streamId);
      console.log('🏁 Checkpoint:', testPayload.checkpointId);
      console.log('⏰ Timestamp:', testPayload.timestamp);

      const response = await fetch(`${BASE_URL}/liveApiGateway/api/webhook/runner-checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Respuesta del webhook:', result.success ? 'Exitoso' : 'Error');
        console.log('🎬 Clip generado para checkpoint:', checkpoint.checkpointId);
      } else {
        const error = await response.text();
        console.log('❌ Error en webhook:', response.status, error);
      }

      // Esperar un poco entre requests
      if (i < testCheckpoints.length - 1) {
        console.log('⏳ Esperando 2 segundos...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error('❌ Error probando clip:', error);
    }
  }

  console.log('\n✅ Prueba de clips completada');
  console.log('📊 Se probaron 3 checkpoints con streamIds únicos');
  console.log('🔍 Verificar en Firestore la colección "video-clips" para ver los resultados');
}

// Función para probar deduplicación
async function testDeduplication() {
  console.log('\n🔄 Probando deduplicación de mensajes...');

  const testPayload = {
    runnerId: "test_dedup_123",
    runnerBib: "999",
    checkpointId: "test_checkpoint",
    timestamp: new Date().toISOString(),
    raceId: "test_race_dedup",
    eventId: "test_event_dedup",
    streamId: "ca7a9dec-b50b-510c-bf86-058664b46422",
    apiKey: "MISSING_WEBHOOK_API_KEY"
  };

  try {
    // Enviar el mismo mensaje dos veces
    console.log('📤 Enviando mensaje 1...');
    const response1 = await fetch(`${BASE_URL}/liveApiGateway/api/webhook/runner-checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    console.log('📤 Enviando mensaje 2 (duplicado)...');
    const response2 = await fetch(`${BASE_URL}/liveApiGateway/api/webhook/runner-checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    console.log('✅ Respuesta 1:', response1.status);
    console.log('✅ Respuesta 2:', response2.status);
    console.log('🔍 El segundo mensaje debería ser detectado como duplicado');

  } catch (error) {
    console.error('❌ Error probando deduplicación:', error);
  }
}

// Función principal
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'setup':
      await setupWebSocket();
      break;
    case 'test-new':
      await testNewEndpoint();
      break;
    case 'test-old-webhook':
      await testOldWebhook();
      break;
    case 'test-monitoring':
      await testMonitoring();
      break;
    case 'test-clips':
      await testVideoClips();
      break;
    case 'test-dedup':
      await testDeduplication();
      break;
    case 'status':
      try {
        const response = await fetch(`${BASE_URL}/websocketManager/status`);
        const status = await response.json();
        console.log('📊 Estado WebSocket:', JSON.stringify(status, null, 2));
      } catch (error) {
        console.error('❌ Error:', error);
      }
      break;
    case 'full-test':
      console.log('🧪 Ejecutando suite completa de pruebas...\n');
      await testNewEndpoint();  // NUEVO: Probar endpoint simplificado
      await testVideoClips();
      await testDeduplication();
      console.log('\n✅ Suite de pruebas completada');
      break;
    case 'full-test-old':
      console.log('🧪 Ejecutando suite de pruebas del flujo anterior...\n');
      await setupWebSocket();
      await testOldWebhook();
      await testMonitoring();
      await testVideoClips();
      await testDeduplication();
      console.log('\n✅ Suite de pruebas anterior completada');
      break;
    default:
      console.log('📖 Uso:');
      console.log('  🆕 NUEVO FLUJO SIMPLIFICADO:');
      console.log('  node setupWebSocket.mjs test-new        # Probar nuevo endpoint simplificado');
      console.log('  node setupWebSocket.mjs test-clips      # Probar generación de clips');
      console.log('  node setupWebSocket.mjs test-dedup      # Probar deduplicación');
      console.log('  node setupWebSocket.mjs full-test       # Ejecutar pruebas del nuevo flujo');
      console.log('');
      console.log('  📚 FLUJO ANTERIOR (MANTENIDO):');
      console.log('  node setupWebSocket.mjs setup           # Configurar WebSocket');
      console.log('  node setupWebSocket.mjs test-old-webhook # Probar webhook anterior');
      console.log('  node setupWebSocket.mjs test-monitoring # Probar monitoreo');
      console.log('  node setupWebSocket.mjs status          # Ver estado WebSocket');
      console.log('  node setupWebSocket.mjs full-test-old   # Ejecutar pruebas del flujo anterior');
      break;
  }
}

main().catch(console.error);
