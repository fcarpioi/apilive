#!/usr/bin/env node

/**
 * Script para debuggear el flujo completo de creación de historias
 */

import fetch from 'node-fetch';

const ENDPOINT_URL = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';

async function debugStoryCreationFlow() {
  console.log("🔍 DEBUGGING FLUJO DE CREACIÓN DE HISTORIAS");
  console.log("=" * 60);
  
  const payload = {
    "apiKey": "MISSING_WEBHOOK_API_KEY",
    "competitionId": "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
    "copernicoId": "generali-maraton-malaga-2025",
    "type": "detection",
    "participantId": "D21D9C3F",
    "extraData": {
      "point": "25K",
      "event": "Maratón",
      "location": "25K"
    }
  };

  console.log("📤 Enviando request con eventName: 'Maratón'");
  console.log(`🔤 Encoding de 'Maratón': [${Array.from("Maratón").map(c => c.charCodeAt(0)).join(', ')}]`);
  console.log("");

  try {
    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
    console.log(`✅ Success: ${result.success}`);
    
    if (result.success) {
      console.log(`🔑 Queue Key: ${result.data?.queueKey}`);
      console.log("");
      
      console.log("🔍 BUSCAR EN LOGS DE FIREBASE:");
      console.log("1. 🔤 [BACKGROUND] EventName normalizado: 'Maratón' → 'Maratón'");
      console.log("2. ✅ [BACKGROUND] Evento específico encontrado: .../MaratÃ³n → usando eventId normalizado: 'Maratón'");
      console.log("3. 📍 [STORY] Ruta final del documento: races/.../events/Maratón/participants/...");
      console.log("4. 🔤 [STORY] EventID en ruta: 'Maratón' [77, 97, 114, 97, 116, 243, 110]");
      console.log("5. 🔤 [TRIGGER] EventID encoding: [77, 97, 114, 97, 116, 243, 110] (debería ser correcto)");
      console.log("");
      
      console.log("❌ SI SIGUE APARECIENDO:");
      console.log("- Evento: MaratÃ³n (corrupto)");
      console.log("- EventID encoding: [77, 97, 114, 97, 116, 195, 179, 110] (corrupto)");
      console.log("");
      console.log("🚨 ENTONCES EL PROBLEMA ES QUE:");
      console.log("- El documento se está creando en la ruta corrupta");
      console.log("- La función findSpecificEvent no se está ejecutando");
      console.log("- O hay otro lugar donde se corrompe el eventId");
      
    } else {
      console.log(`❌ Error: ${result.message}`);
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
  
  console.log("");
  console.log("⏰ Esperar 2-3 minutos y revisar logs detalladamente");
  console.log("🔗 https://console.firebase.google.com/project/live-copernico/functions/logs");
  console.log("");
  console.log("🎯 OBJETIVO: Confirmar si findSpecificEvent se ejecuta y normaliza correctamente");
}

// Ejecutar
debugStoryCreationFlow().catch(console.error);
