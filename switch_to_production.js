#!/usr/bin/env node

/**
 * Script para cambiar la configuración de Copernico a producción
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Inicializar Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./functions/serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function switchToProduction() {
  console.log("🔄 CAMBIANDO CONFIGURACIÓN A PRODUCCIÓN");
  console.log("=" * 50);
  
  try {
    // Mostrar configuraciones disponibles
    console.log("📋 ENTORNOS DISPONIBLES EN COPERNICO:");
    console.log("1. 🧪 demo   - https://demo-api.copernico.cloud/api/races");
    console.log("2. 🚀 pro    - https://api.copernico.cloud/api/races");
    console.log("3. 🔬 alpha  - https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races");
    console.log("4. 💻 dev    - http://copernico.local.sportmaniacs.com/api/races");
    
    console.log("\n🎯 CONFIGURACIÓN ACTUAL:");
    console.log(`   Entorno por defecto: ${process.env.COPERNICO_ENV || 'demo'}`);
    
    console.log("\n🔧 OPCIONES PARA CAMBIAR A PRODUCCIÓN:");
    
    console.log("\n📝 OPCIÓN 1: Variable de entorno (Recomendada)");
    console.log("   Ejecutar antes de iniciar el servidor:");
    console.log("   export COPERNICO_ENV=pro");
    console.log("   npm start");
    
    console.log("\n📝 OPCIÓN 2: Firebase Functions Config");
    console.log("   firebase functions:config:set copernico.env=pro");
    console.log("   firebase deploy --only functions");
    
    console.log("\n📝 OPCIÓN 3: Cambiar default en código");
    console.log("   Editar functions/config/copernicoConfig.mjs línea 43:");
    console.log("   const currentEnv = process.env.COPERNICO_ENV || 'pro';");
    
    console.log("\n🚀 CONFIGURACIÓN DE PRODUCCIÓN:");
    console.log("   URL: https://api.copernico.cloud/api/races");
    console.log("   Token: MISSING_COPERNICO_API_KEY");
    console.log("   Socket: https://socket-ss.sportmaniacs.com:4319/");
    
    console.log("\n⚠️ IMPORTANTE:");
    console.log("   - Asegúrate de que tu carrera 'generali-maraton-malaga-2025' exista en producción");
    console.log("   - Los participantes deben estar registrados en el entorno de producción");
    console.log("   - Las credenciales de producción deben ser válidas");
    
    console.log("\n🧪 PARA PROBAR EL CAMBIO:");
    console.log("   1. Cambiar entorno usando una de las opciones arriba");
    console.log("   2. Reiniciar el servidor");
    console.log("   3. Verificar que apunte a producción con:");
    console.log("   curl https://api.copernico.cloud/api/races \\");
    console.log("     -H 'x-api-key: MISSING_COPERNICO_API_KEY'");
    
    console.log("\n✅ INSTRUCCIONES COMPLETADAS");
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Ejecutar
switchToProduction().catch(console.error);
