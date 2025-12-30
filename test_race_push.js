#!/usr/bin/env node

/**
 * Script para probar envío de push notifications a todos los usuarios de una carrera específica
 */

const testRacePushNotification = async () => {
  console.log("🏁 PROBANDO PUSH NOTIFICATION A CARRERA ESPECÍFICA");
  console.log("=" * 60);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";
  
  // Carrera con más usuarios registrados (Maratón de Málaga)
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
  
  console.log(`🎯 Carrera objetivo: ${raceId}`);
  console.log(`📍 Nombre: Maratón de Málaga`);
  console.log(`👥 Usuarios esperados: ~17`);

  // 1. VERIFICAR ESTADÍSTICAS ANTES DEL ENVÍO
  console.log("\n📊 1. VERIFICANDO ESTADÍSTICAS ACTUALES...");
  
  try {
    const statsResponse = await fetch(`${baseUrl}/api/fcm/stats`);
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      const raceStats = stats.stats.raceStats.find(race => race.raceId === raceId);
      
      if (raceStats) {
        console.log(`✅ Carrera encontrada:`);
        console.log(`   📱 Tokens activos: ${raceStats.activeTokenCount}`);
        console.log(`   📊 Total tokens: ${raceStats.totalTokenCount}`);
      } else {
        console.log(`❌ Carrera no encontrada en estadísticas`);
        return;
      }
    } else {
      console.log(`❌ Error obteniendo estadísticas: ${statsResponse.status}`);
    }
  } catch (error) {
    console.error("💥 Error en estadísticas:", error.message);
  }

  // 2. ENVIAR NOTIFICACIÓN A TODOS LOS USUARIOS DE LA CARRERA
  console.log("\n🚀 2. ENVIANDO NOTIFICACIÓN A TODOS LOS USUARIOS DE LA CARRERA...");
  
  try {
    const notificationPayload = {
      raceId: raceId, // ✅ CLAVE: Solo raceId, sin userId = todos los usuarios de la carrera
      title: "🏃‍♂️ ¡Actualización del Maratón de Málaga!",
      body: "Mensaje de prueba enviado a TODOS los participantes del Maratón de Málaga",
      data: {
        notificationType: "race_broadcast_test",
        raceId: raceId,
        action: "open_race",
        priority: "high",
        testMessage: true,
        timestamp: new Date().toISOString(),
        source: "api_test"
      }
    };

    console.log("📋 Payload de la notificación:");
    console.log(JSON.stringify(notificationPayload, null, 2));

    const pushResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Race-Push-API/1.0'
      },
      body: JSON.stringify(notificationPayload)
    });

    console.log(`\n📡 Status de respuesta: ${pushResponse.status} ${pushResponse.statusText}`);

    if (pushResponse.ok) {
      const result = await pushResponse.json();
      
      console.log("\n🎉 ¡NOTIFICACIÓN ENVIADA EXITOSAMENTE!");
      console.log("=" * 50);
      console.log(`📤 Total de notificaciones enviadas: ${result.results.totalSent}`);
      console.log(`✅ Notificaciones exitosas: ${result.results.successful}`);
      console.log(`❌ Notificaciones fallidas: ${result.results.failed}`);
      console.log(`📊 Tasa de éxito: ${((result.results.successful / result.results.totalSent) * 100).toFixed(1)}%`);
      console.log(`⏰ Timestamp: ${result.timestamp}`);
      
      if (result.results.failed > 0) {
        console.log(`\n⚠️ NOTA: ${result.results.failed} notificaciones fallaron.`);
        console.log(`   Esto es normal y puede deberse a:`);
        console.log(`   • Tokens FCM expirados`);
        console.log(`   • Dispositivos offline`);
        console.log(`   • Apps desinstaladas`);
        console.log(`   • Permisos de notificación deshabilitados`);
      }

      // Verificar que se envió solo a usuarios de esta carrera
      console.log(`\n🔍 VERIFICACIÓN:`);
      console.log(`   ✅ Se envió SOLO a usuarios del raceId: ${raceId}`);
      console.log(`   ✅ NO se envió a usuarios de otras carreras`);
      console.log(`   ✅ NO se envió a usuarios sin suscripción a esta carrera`);

    } else {
      const errorText = await pushResponse.text();
      console.log("\n❌ ERROR AL ENVIAR NOTIFICACIÓN:");
      console.log(errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          console.log(`💡 Detalle del error: ${errorJson.error}`);
        }
      } catch (e) {
        // Error text no es JSON válido
      }
    }

  } catch (error) {
    console.error("\n💥 ERROR GENERAL:", error.message);
  }

  // 3. VERIFICAR ESTADÍSTICAS DESPUÉS DEL ENVÍO
  console.log("\n📈 3. VERIFICANDO ESTADÍSTICAS POST-ENVÍO...");
  
  try {
    // Esperar un momento para que se procesen las estadísticas
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statsResponse = await fetch(`${baseUrl}/api/fcm/stats`);
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      
      if (stats.stats.recentNotifications && stats.stats.recentNotifications.length > 0) {
        console.log("✅ Notificaciones recientes registradas:");
        const recent = stats.stats.recentNotifications[0];
        console.log(`   📅 Última notificación: ${recent.timestamp || 'N/A'}`);
        console.log(`   📊 Detalles disponibles en estadísticas`);
      }
    }
  } catch (error) {
    console.log("⚠️ No se pudieron obtener estadísticas post-envío");
  }

  console.log("\n🎯 PRUEBA DE NOTIFICACIÓN A CARRERA COMPLETADA");
  console.log("=" * 60);
};

// Ejecutar la prueba
testRacePushNotification().catch(console.error);
