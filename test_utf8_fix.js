#!/usr/bin/env node

/**
 * Script para probar que la corrección UTF-8 funciona correctamente
 */

import fetch from 'node-fetch';

const ENDPOINT_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';

// Configuración base
const basePayload = {
  "apiKey": "MISSING_WEBHOOK_API_KEY",
  "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
  "copernicoId": "generali-maraton-malaga-2025",
  "type": "detection"
};

async function testUTF8Fix() {
  console.log("🧪 PROBANDO CORRECCIÓN UTF-8");
  console.log("=" * 50);
  console.log("🎯 Objetivo: Verificar que 'Maratón' no se corrompe a 'MaratÃ³n'");
  console.log("");

  const participantId = 'D21D9C3F'; // El mismo que falló antes
  const checkpoint = '20K'; // Probar con 20K para diferenciarlo

  console.log(`🏃 Participante: ${participantId}`);
  console.log(`📍 Checkpoint: ${checkpoint}`);
  console.log(`🔤 EventID correcto: "Maratón" [${Array.from("Maratón").map(c => c.charCodeAt(0)).join(', ')}]`);
  console.log("");

  const payload = {
    ...basePayload,
    participantId: participantId,
    extraData: {
      point: checkpoint,
      event: "Maratón", // Usar el eventId con tilde
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
        'Content-Type': 'application/json; charset=utf-8'
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
      console.log("");
      console.log("🔍 VERIFICAR EN LOGS:");
      console.log("   1. Que el eventId en logs sea 'Maratón' y no 'MaratÃ³n'");
      console.log("   2. Que el trigger encuentre el participante correctamente");
      console.log("   3. Que NO aparezca 'Participante no encontrado'");
      
    } else {
      console.log(`   ❌ Error: ${result.message}`);
      console.log(`   📄 Detalles:`, result);
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
  
  console.log("");
  console.log("⏰ Esperar 2-3 minutos y revisar Firebase Functions logs");
  console.log("🔗 https://console.firebase.google.com/project/live-copernico/functions/logs");
}

// Ejecutar
testUTF8Fix().catch(console.error);
