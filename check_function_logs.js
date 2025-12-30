#!/usr/bin/env node

/**
 * Script para revisar los logs de Cloud Functions y diagnosticar el problema
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkFunctionLogs() {
  console.log("📋 REVISANDO LOGS DE CLOUD FUNCTIONS");
  console.log("=" * 60);
  
  try {
    // Obtener logs recientes de la función
    console.log("🔍 Obteniendo logs de los últimos 10 minutos...");
    
    const { stdout, stderr } = await execAsync(
      'gcloud functions logs read liveApiGateway --limit=50 --format="table(timestamp,severity,textPayload)" --filter="timestamp>=\\"2025-12-13T12:00:00Z\\""',
      { timeout: 30000 }
    );
    
    if (stderr) {
      console.log("⚠️ Warnings:", stderr);
    }
    
    console.log("📄 LOGS RECIENTES:");
    console.log(stdout);
    
    // También intentar con Firebase CLI
    console.log("\n🔥 INTENTANDO CON FIREBASE CLI...");
    
    try {
      const { stdout: firebaseLogs } = await execAsync(
        'firebase functions:log --only liveApiGateway --lines 20',
        { timeout: 30000 }
      );
      
      console.log("📄 LOGS DE FIREBASE:");
      console.log(firebaseLogs);
      
    } catch (firebaseError) {
      console.log("❌ Error con Firebase CLI:", firebaseError.message);
    }
    
  } catch (error) {
    console.error("❌ Error obteniendo logs:", error.message);
    
    console.log("\n💡 ALTERNATIVAS PARA REVISAR LOGS:");
    console.log("1. 🌐 Google Cloud Console:");
    console.log("   https://console.cloud.google.com/functions/list");
    console.log("");
    console.log("2. 🔥 Firebase Console:");
    console.log("   https://console.firebase.google.com/project/live-copernico/functions/logs");
    console.log("");
    console.log("3. 📱 Comando manual:");
    console.log("   gcloud functions logs read liveApiGateway --limit=50");
    console.log("");
    console.log("4. 🧪 Revisar endpoint de status directamente:");
    console.log("   curl https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant/status/69200553-464c-4bfd-9b35-4ca6ac1f17f5_64D271D9_detection");
  }
  
  // Información de debugging adicional
  console.log("\n🔧 INFORMACIÓN DE DEBUGGING:");
  console.log("=" * 60);
  console.log("📋 Request exitosa:");
  console.log("   ✅ Endpoint responde 200 OK");
  console.log("   ✅ Request se encola correctamente");
  console.log("   ✅ Queue Key generado: 69200553-464c-4bfd-9b35-4ca6ac1f17f5_64D271D9_detection");
  console.log("");
  console.log("❌ Problema identificado:");
  console.log("   ❌ Endpoint de status devuelve {} vacío");
  console.log("   ❌ No hay progreso visible en el procesamiento");
  console.log("");
  console.log("🔍 Posibles causas:");
  console.log("   1. Error en el procesamiento interno de la función");
  console.log("   2. Problema con la conexión a Copernico API");
  console.log("   3. Error en la transformación de datos");
  console.log("   4. Problema con la escritura en Firestore");
  console.log("   5. Error en la configuración de producción vs demo");
  console.log("");
  console.log("🧪 Participante de prueba:");
  console.log("   ID: 64D271D9");
  console.log("   Nombre: Alvaro Pons palma");
  console.log("   Dorsal: 2467");
  console.log("   Categoría: Sub 23 M");
  console.log("   Status: notstarted");
  console.log("   ✅ Existe en Copernico producción");
  console.log("");
  console.log("🌐 URLs verificadas:");
  console.log("   ✅ https://api.copernico.cloud/api/races/generali-maraton-malaga-2025/athlete/64D271D9");
  console.log("   ✅ Configuración apunta a producción");
  console.log("   ✅ API Key válida");
}

// Ejecutar
checkFunctionLogs().catch(console.error);
