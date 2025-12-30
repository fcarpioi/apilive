#!/usr/bin/env node

/**
 * Script para probar la API de Push Notifications
 * Demuestra cómo enviar notificaciones a usuarios específicos, por carrera, o a todos
 */

const testPushNotifications = async () => {
  console.log("🔔 PROBANDO API DE PUSH NOTIFICATIONS");
  console.log("=" * 50);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";

  // 1. OBTENER ESTADÍSTICAS ACTUALES
  console.log("\n📊 1. OBTENIENDO ESTADÍSTICAS DE FCM...");
  
  try {
    const statsResponse = await fetch(`${baseUrl}/api/fcm/stats`);
    console.log(`📡 Status: ${statsResponse.status}`);

    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      console.log("✅ ESTADÍSTICAS OBTENIDAS:");
      console.log(`   👥 Usuarios con tokens FCM: ${stats.stats.usersWithFcmTokens}`);
      console.log(`   🏁 Usuarios activos en carreras: ${stats.stats.activeUsersInRaces}`);
      console.log(`   📱 Tokens válidos: ${stats.stats.validTokens.length}`);
      
      if (stats.stats.raceStats.length > 0) {
        console.log("   🏃 Estadísticas por carrera:");
        stats.stats.raceStats.forEach(race => {
          console.log(`      • ${race.raceId}: ${race.activeTokenCount} tokens activos`);
        });
      }
    } else {
      console.log("❌ Error obteniendo estadísticas");
    }
  } catch (error) {
    console.error("💥 Error:", error.message);
  }

  // 2. ENVIAR NOTIFICACIÓN A TODOS LOS USUARIOS
  console.log("\n🌍 2. ENVIANDO NOTIFICACIÓN A TODOS LOS USUARIOS...");
  
  try {
    const broadcastResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Push-API/1.0'
      },
      body: JSON.stringify({
        // Sin userId ni raceId = envía a TODOS
        title: "🌟 ¡Notificación Global!",
        body: "Esta es una notificación enviada a todos los usuarios registrados",
        data: {
          notificationType: "broadcast",
          priority: "high",
          action: "open_app",
          timestamp: new Date().toISOString()
        }
      })
    });

    console.log(`📡 Status: ${broadcastResponse.status}`);

    if (broadcastResponse.ok) {
      const result = await broadcastResponse.json();
      console.log("✅ NOTIFICACIÓN GLOBAL ENVIADA:");
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    } else {
      const errorText = await broadcastResponse.text();
      console.log("❌ Error enviando notificación global:", errorText);
    }

  } catch (error) {
    console.error("💥 Error en notificación global:", error.message);
  }

  // 3. ENVIAR NOTIFICACIÓN A UNA CARRERA ESPECÍFICA
  console.log("\n🏁 3. ENVIANDO NOTIFICACIÓN A CARRERA ESPECÍFICA...");
  
  try {
    const raceNotificationResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Push-API/1.0'
      },
      body: JSON.stringify({
        raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5", // Maratón Málaga
        title: "🏃‍♂️ ¡Actualización de Carrera!",
        body: "Nueva información disponible para el Maratón de Málaga",
        data: {
          notificationType: "race_update",
          raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
          action: "open_race",
          timestamp: new Date().toISOString()
        }
      })
    });

    console.log(`📡 Status: ${raceNotificationResponse.status}`);

    if (raceNotificationResponse.ok) {
      const result = await raceNotificationResponse.json();
      console.log("✅ NOTIFICACIÓN DE CARRERA ENVIADA:");
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    } else {
      const errorText = await raceNotificationResponse.text();
      console.log("❌ Error enviando notificación de carrera:", errorText);
    }

  } catch (error) {
    console.error("💥 Error en notificación de carrera:", error.message);
  }

  // 4. ENVIAR NOTIFICACIÓN A USUARIO ESPECÍFICO
  console.log("\n👤 4. ENVIANDO NOTIFICACIÓN A USUARIO ESPECÍFICO...");
  
  try {
    const userNotificationResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Push-API/1.0'
      },
      body: JSON.stringify({
        userId: "test-user-123", // Usuario específico
        title: "👋 ¡Hola Usuario!",
        body: "Esta es una notificación personalizada solo para ti",
        data: {
          notificationType: "personal",
          userId: "test-user-123",
          action: "open_profile",
          timestamp: new Date().toISOString()
        }
      })
    });

    console.log(`📡 Status: ${userNotificationResponse.status}`);

    if (userNotificationResponse.ok) {
      const result = await userNotificationResponse.json();
      console.log("✅ NOTIFICACIÓN PERSONAL ENVIADA:");
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    } else {
      const errorText = await userNotificationResponse.text();
      console.log("❌ Error enviando notificación personal:", errorText);
    }

  } catch (error) {
    console.error("💥 Error en notificación personal:", error.message);
  }

  console.log("\n🎯 PRUEBAS DE PUSH NOTIFICATIONS COMPLETADAS");
};

// Ejecutar las pruebas
testPushNotifications().catch(console.error);
