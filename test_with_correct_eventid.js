#!/usr/bin/env node

/**
 * Script para probar con el eventId correcto sin problemas de encoding
 */

import fetch from 'node-fetch';

const ENDPOINT_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';

// Configuración base
const basePayload = {
  "apiKey": "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection"
};

// Usar el eventId correcto que encontramos en Firebase
const CORRECT_EVENT_ID = "Maratón"; // Este es el correcto según nuestro debug

async function testWithCorrectEventId() {
  console.log("🧪 PROBANDO CON EVENTID CORRECTO");
  console.log("=" * 50);
  console.log(`✅ EventID correcto: "${CORRECT_EVENT_ID}"`);
  console.log(`🔤 Encoding: [${Array.from(CORRECT_EVENT_ID).map(c => c.charCodeAt(0)).join(', ')}]`);
  console.log("");

  const participantId = 'D21D9C3F'; // El mismo que falló antes
  const checkpoint = '10K'; // Probar con 10K

  console.log(`🏃 Participante: ${participantId}`);
  console.log(`📍 Checkpoint: ${checkpoint}`);
  console.log("");

  const payload = {
    ...basePayload,
    participantId: participantId,
    extraData: {
      point: checkpoint,
      event: CORRECT_EVENT_ID, // Usar el eventId correcto
      location: checkpoint
    }
  };

  console.log("📤 Payload a enviar:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");

  try {
    console.log("🚀 Enviando request...");
    const startTime = Date.now();
    
    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseTime = Date.now() - startTime;
    const result = await response.json();
    
    console.log(`📊 Respuesta (${responseTime}ms):`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Success: ${result.success}`);
    
    if (result.success) {
      console.log(`   ✅ Queue Key: ${result.data?.queueKey}`);
      console.log(`   ✅ Request ID: ${result.data?.requestId}`);
      console.log("");
      
      console.log("🎯 RESULTADO:");
      console.log("   ✅ Request procesado exitosamente");
      console.log("   📖 Historia debería crearse en los próximos minutos");
      console.log("   🔍 Verificar logs para confirmar que el eventId es correcto");
      
    } else {
      console.log(`   ❌ Error: ${result.message}`);
      console.log(`   📄 Detalles:`, result);
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
  
  console.log("");
  console.log("🔍 PRÓXIMOS PASOS:");
  console.log("1. Verificar logs de Firebase Functions");
  console.log("2. Confirmar que el eventId en los logs es 'Maratón' y no 'MaratÃ³n'");
  console.log("3. Verificar que el trigger encuentra el participante");
  console.log("4. Si funciona, el problema está en el encoding del script batch");
}

// Ejecutar
testWithCorrectEventId().catch(console.error);
