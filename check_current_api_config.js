#!/usr/bin/env node

/**
 * Script para verificar qué API y configuración estamos usando actualmente
 */

import fetch from 'node-fetch';

// Simular la configuración como está en el código
const copernicoEnvironments = {
  "dev": {
    socket: "http://socketadmin-copernico.local.sportmaniacs.com/",
    api: "http://copernico.local.sportmaniacs.com/api/races",
    admin: "http://copernico.local.sportmaniacs.com/api/races",
    token: "MISSING_COPERNICO_API_KEY"
  },
  "pro": {
    socket: "https://socket-ss.sportmaniacs.com:4319/",
    api: "https://api.copernico.cloud/api/races",
    admin: "https://api.copernico.cloud/api/races",
    token: "MISSING_COPERNICO_API_KEY"
  },
  "alpha": {
    socket: "https://socket-ss.sportmaniacs.com:4319/",
    api: "https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
    admin: "https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
    token: "MISSING_COPERNICO_API_KEY"
  },
  "demo": {
    socket: "https://socket-ss.sportmaniacs.com:4319/",
    api: "https://demo-api.copernico.cloud/api/races",
    admin: "https://demo-api.copernico.cloud/api/races",
    token: "MISSING_COPERNICO_API_KEY"
  }
};

async function checkCurrentConfig() {
  console.log("🔍 VERIFICANDO CONFIGURACIÓN ACTUAL DE COPERNICO");
  console.log("=" * 60);
  
  // Determinar entorno actual (como en el código)
  const currentEnv = process.env.COPERNICO_ENV || 'pro';
  const selectedConfig = copernicoEnvironments[currentEnv];
  
  console.log("⚙️ CONFIGURACIÓN DETECTADA:");
  console.log(`   🌍 Entorno actual: ${currentEnv}`);
  console.log(`   🌐 API URL: ${selectedConfig.api}`);
  console.log(`   📡 Socket URL: ${selectedConfig.socket}`);
  console.log(`   🔑 Token: ${selectedConfig.token.substring(0, 20)}...`);
  console.log("");
  
  // Mostrar todas las configuraciones disponibles
  console.log("📋 TODAS LAS CONFIGURACIONES DISPONIBLES:");
  console.log("=" * 60);
  
  for (const [envName, config] of Object.entries(copernicoEnvironments)) {
    const isActive = envName === currentEnv;
    const indicator = isActive ? "🟢 ACTIVO" : "⚪ Disponible";
    
    console.log(`${indicator} ${envName.toUpperCase()}:`);
    console.log(`   🌐 API: ${config.api}`);
    console.log(`   📡 Socket: ${config.socket}`);
    console.log(`   🔑 Token: ${config.token.substring(0, 20)}...`);
    console.log("");
  }
  
  // Probar conectividad con la configuración actual
  console.log("🔍 PROBANDO CONFIGURACIÓN ACTUAL:");
  console.log("=" * 60);
  
  try {
    console.log(`📡 Probando API: ${selectedConfig.api}`);
    
    const response = await fetch(selectedConfig.api, {
      headers: {
        'Authorization': `Bearer ${selectedConfig.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      console.log("   ❌ TOKEN INVÁLIDO");
    } else if (response.status === 403) {
      console.log("   ❌ SIN PERMISOS");
    } else if (response.ok) {
      console.log("   ✅ CONECTIVIDAD OK");
      
      const data = await response.json();
      console.log(`   📊 Carreras disponibles: ${data.length || 'N/A'}`);
      
      // Buscar carrera de Málaga
      const malagaRaces = data.filter(race => 
        race.name?.toLowerCase().includes('malaga') ||
        race.id?.toLowerCase().includes('malaga') ||
        race.id === 'generali-maraton-malaga-2025'
      );
      
      if (malagaRaces.length > 0) {
        console.log("   🏁 Carreras de Málaga encontradas:");
        malagaRaces.forEach(race => {
          console.log(`      • ${race.id} - ${race.name} (${race.status || 'N/A'})`);
        });
      } else {
        console.log("   ⚠️ No se encontraron carreras de Málaga");
      }
      
    } else {
      console.log(`   ❌ ERROR: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`   💥 Error de conectividad: ${error.message}`);
  }
  
  // Probar otras configuraciones
  console.log("\n🔍 PROBANDO OTRAS CONFIGURACIONES:");
  console.log("=" * 60);
  
  for (const [envName, config] of Object.entries(copernicoEnvironments)) {
    if (envName === currentEnv) continue; // Ya probamos la actual
    
    console.log(`\n📡 Probando ${envName.toUpperCase()}: ${config.api}`);
    
    try {
      const response = await fetch(config.api, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        console.log("   ✅ FUNCIONA");
        
        const data = await response.json();
        const malagaRaces = data.filter(race => 
          race.name?.toLowerCase().includes('malaga') ||
          race.id?.toLowerCase().includes('malaga') ||
          race.id === 'generali-maraton-malaga-2025'
        );
        
        if (malagaRaces.length > 0) {
          console.log(`   🏁 Carreras de Málaga: ${malagaRaces.length}`);
          malagaRaces.forEach(race => {
            console.log(`      • ${race.id} - ${race.status || 'N/A'}`);
          });
        }
        
      } else if (response.status === 401) {
        console.log("   ❌ Token inválido");
      } else if (response.status === 403) {
        console.log("   ❌ Sin permisos");
      } else {
        console.log(`   ❌ Error ${response.status}`);
      }
      
    } catch (error) {
      console.log(`   💥 Error: ${error.message}`);
    }
  }
  
  console.log("\n🎯 RECOMENDACIONES:");
  console.log("=" * 60);
  console.log("1. Si la configuración actual NO funciona:");
  console.log("   • Cambiar a un entorno que SÍ funcione");
  console.log("   • Actualizar token para el entorno actual");
  console.log("");
  console.log("2. Para cambiar entorno:");
  console.log("   • Modificar copernicoConfig.mjs");
  console.log("   • Cambiar línea 43: const currentEnv = 'NUEVO_ENTORNO';");
  console.log("   • Redesplegar: firebase deploy --only functions");
  console.log("");
  console.log("3. Entornos disponibles:");
  Object.keys(copernicoEnvironments).forEach(env => {
    console.log(`   • ${env}`);
  });
}

// Ejecutar
checkCurrentConfig().catch(console.error);
