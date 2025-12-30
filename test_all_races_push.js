#!/usr/bin/env node

/**
 * Script para enviar notificaciones a TODAS las carreras disponibles
 * Para asegurar que Fernando reciba la notificación
 */

const testAllRacesPush = async () => {
  console.log("🏁 ENVIANDO PUSH A TODAS LAS CARRERAS DISPONIBLES");
  console.log("=" * 60);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";

  // 1. OBTENER ESTADÍSTICAS PARA VER TODAS LAS CARRERAS
  console.log("📊 1. OBTENIENDO TODAS LAS CARRERAS DISPONIBLES...");
  
  let availableRaces = [];
  
  try {
    const statsResponse = await fetch(`${baseUrl}/api/fcm/stats`);
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      availableRaces = stats.stats.raceStats;
      
      console.log(`✅ Carreras encontradas: ${availableRaces.length}`);
      availableRaces.forEach((race, index) => {
        console.log(`   ${index + 1}. ${race.raceId}: ${race.activeTokenCount} usuarios activos`);
      });
    } else {
      console.log(`❌ Error obteniendo estadísticas: ${statsResponse.status}`);
      return;
    }
  } catch (error) {
    console.error("💥 Error:", error.message);
    return;
  }

  // 2. ENVIAR NOTIFICACIÓN A CADA CARRERA
  console.log("\n🚀 2. ENVIANDO NOTIFICACIÓN A CADA CARRERA...");
  
  for (let i = 0; i < availableRaces.length; i++) {
    const race = availableRaces[i];
    console.log(`\n🏃‍♂️ Enviando a carrera ${i + 1}/${availableRaces.length}: ${race.raceId}`);
    console.log(`   👥 Usuarios esperados: ${race.activeTokenCount}`);
    
    try {
      const notificationPayload = {
        raceId: race.raceId,
        title: `🔔 ¡Hola Fernando! Carrera ${i + 1}`,
        body: `Mensaje de prueba para la carrera ${race.raceId.substring(0, 8)}... (${race.activeTokenCount} usuarios)`,
        data: {
          notificationType: "fernando_test",
          raceId: race.raceId,
          action: "open_race",
          testNumber: i + 1,
          timestamp: new Date().toISOString()
        }
      };

      const pushResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Fernando-Test-API/1.0'
        },
        body: JSON.stringify(notificationPayload)
      });

      if (pushResponse.ok) {
        const result = await pushResponse.json();
        console.log(`   📤 Enviadas: ${result.results.totalSent}`);
        console.log(`   ✅ Exitosas: ${result.results.successful}`);
        console.log(`   ❌ Fallidas: ${result.results.failed}`);
        
        if (result.results.successful > 0) {
          console.log(`   🎉 ¡ÉXITO! ${result.results.successful} notificaciones llegaron`);
        }
      } else {
        const errorText = await pushResponse.text();
        console.log(`   ❌ Error: ${errorText}`);
      }

      // Esperar un poco entre envíos
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   💥 Error enviando a ${race.raceId}:`, error.message);
    }
  }

  // 3. TAMBIÉN ENVIAR BROADCAST GLOBAL (por si acaso)
  console.log("\n🌍 3. ENVIANDO BROADCAST GLOBAL (A TODOS LOS USUARIOS)...");
  
  try {
    const globalPayload = {
      // Sin raceId ni userId = TODOS los usuarios
      title: "🌟 ¡Hola Fernando! (Broadcast Global)",
      body: "Este mensaje va a TODOS los usuarios registrados en el sistema",
      data: {
        notificationType: "fernando_global_test",
        action: "open_app",
        timestamp: new Date().toISOString()
      }
    };

    const globalResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Fernando-Global-Test-API/1.0'
      },
      body: JSON.stringify(globalPayload)
    });

    if (globalResponse.ok) {
      const result = await globalResponse.json();
      console.log(`📤 Broadcast enviado a: ${result.results.totalSent} usuarios`);
      console.log(`✅ Exitosas: ${result.results.successful}`);
      console.log(`❌ Fallidas: ${result.results.failed}`);
      
      if (result.results.successful > 0) {
        console.log(`🎉 ¡ÉXITO GLOBAL! ${result.results.successful} notificaciones llegaron`);
      }
    } else {
      const errorText = await globalResponse.text();
      console.log(`❌ Error en broadcast global: ${errorText}`);
    }

  } catch (error) {
    console.error("💥 Error en broadcast global:", error.message);
  }

  console.log("\n🎯 RESUMEN:");
  console.log("=" * 40);
  console.log(`📊 Carreras probadas: ${availableRaces.length}`);
  console.log(`🌍 Broadcast global: Enviado`);
  console.log(`📱 Si no recibes nada, puede ser que:`);
  console.log(`   • Tu token FCM no esté registrado`);
  console.log(`   • Tu dispositivo esté offline`);
  console.log(`   • Los permisos de notificación estén deshabilitados`);
  console.log(`   • Tu userId no esté en ninguna carrera`);
  
  console.log("\n🔍 PARA VERIFICAR TU ESTADO:");
  console.log(`curl "${baseUrl}/api/fcm/stats"`);
};

// Ejecutar la prueba
testAllRacesPush().catch(console.error);
