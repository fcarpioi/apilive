#!/usr/bin/env node

/**
 * Script para probar notificaciones silenciosas (data-only messages)
 * Estas notificaciones NO aparecen en la bandeja, pero SÍ despiertan la app
 */

const testSilentNotifications = async () => {
  console.log("🔕 PROBANDO NOTIFICACIONES SILENCIOSAS");
  console.log("=" * 60);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";

  console.log("📋 ¿Qué son las notificaciones silenciosas?");
  console.log("   🔕 NO aparecen en la bandeja de notificaciones");
  console.log("   📱 SÍ despiertan la app en background");
  console.log("   📊 Solo envían datos para sincronización");
  console.log("   ⚡ Perfectas para actualizar datos sin molestar al usuario");

  // 1. NOTIFICACIÓN SILENCIOSA GLOBAL
  console.log("\n🌍 1. ENVIANDO NOTIFICACIÓN SILENCIOSA GLOBAL...");
  
  try {
    const silentGlobalPayload = {
      // ❌ NO incluir userId ni raceId = broadcast global
      silent: true, // 🔑 CLAVE: silent = true
      data: {
        action: "sync_data",
        dataType: "race_updates",
        syncTimestamp: new Date().toISOString(),
        priority: "background",
        changes: JSON.stringify({
          races: ["updated_race_1", "updated_race_2"],
          participants: ["participant_123", "participant_456"],
          stories: 5
        })
      }
    };

    console.log("📋 Payload silencioso global:");
    console.log(JSON.stringify(silentGlobalPayload, null, 2));

    const globalResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Silent-Test-Global/1.0'
      },
      body: JSON.stringify(silentGlobalPayload)
    });

    if (globalResponse.ok) {
      const result = await globalResponse.json();
      console.log(`✅ Notificación silenciosa global enviada:`);
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    } else {
      console.log(`❌ Error: ${globalResponse.status}`);
    }

  } catch (error) {
    console.error("💥 Error en notificación silenciosa global:", error.message);
  }

  // 2. NOTIFICACIÓN SILENCIOSA POR CARRERA
  console.log("\n🏁 2. ENVIANDO NOTIFICACIÓN SILENCIOSA A CARRERA ESPECÍFICA...");
  
  try {
    const silentRacePayload = {
      raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5", // Maratón de Málaga
      silent: true, // 🔑 CLAVE: silent = true
      data: {
        action: "sync_race_data",
        raceId: "69200553-464c-4bfd-9b35-4ca6ac1f17f5",
        dataType: "race_specific_update",
        syncTimestamp: new Date().toISOString(),
        changes: JSON.stringify({
          leaderboard: "updated",
          newStories: 3,
          weatherUpdate: "sunny_25c",
          routeChanges: false
        })
      }
    };

    console.log("📋 Payload silencioso por carrera:");
    console.log(JSON.stringify(silentRacePayload, null, 2));

    const raceResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Silent-Test-Race/1.0'
      },
      body: JSON.stringify(silentRacePayload)
    });

    if (raceResponse.ok) {
      const result = await raceResponse.json();
      console.log(`✅ Notificación silenciosa de carrera enviada:`);
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    } else {
      console.log(`❌ Error: ${raceResponse.status}`);
    }

  } catch (error) {
    console.error("💥 Error en notificación silenciosa de carrera:", error.message);
  }

  // 3. COMPARACIÓN: NOTIFICACIÓN NORMAL VS SILENCIOSA
  console.log("\n🔔 3. COMPARACIÓN: ENVIANDO NOTIFICACIÓN NORMAL...");
  
  try {
    const normalPayload = {
      title: "🔔 Notificación NORMAL",
      body: "Esta SÍ aparece en la bandeja de notificaciones",
      silent: false, // o simplemente no incluir el campo
      data: {
        action: "show_message",
        messageType: "visible_notification",
        timestamp: new Date().toISOString()
      }
    };

    const normalResponse = await fetch(`${baseUrl}/api/fcm/push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Normal-Test/1.0'
      },
      body: JSON.stringify(normalPayload)
    });

    if (normalResponse.ok) {
      const result = await normalResponse.json();
      console.log(`✅ Notificación normal enviada:`);
      console.log(`   📤 Total enviadas: ${result.results.totalSent}`);
      console.log(`   ✅ Exitosas: ${result.results.successful}`);
      console.log(`   ❌ Fallidas: ${result.results.failed}`);
    }

  } catch (error) {
    console.error("💥 Error en notificación normal:", error.message);
  }

  console.log("\n📱 RESULTADOS ESPERADOS:");
  console.log("=" * 50);
  console.log("🔕 Notificaciones silenciosas:");
  console.log("   • NO aparecen en la bandeja");
  console.log("   • SÍ despiertan la app en background");
  console.log("   • La app recibe los datos en onMessageReceived()");
  console.log("   • Perfectas para sincronización automática");
  console.log("");
  console.log("🔔 Notificación normal:");
  console.log("   • SÍ aparece en la bandeja");
  console.log("   • Usuario puede verla y tocarla");
  console.log("   • Incluye título, cuerpo, sonido, etc.");
  console.log("");
  console.log("🎯 CASOS DE USO PARA NOTIFICACIONES SILENCIOSAS:");
  console.log("   📊 Sincronizar datos de carreras");
  console.log("   🏃 Actualizar posiciones de participantes");
  console.log("   📸 Descargar nuevas fotos/videos");
  console.log("   🔄 Refrescar caché de la app");
  console.log("   ⚡ Cualquier actualización que no requiera atención del usuario");
};

// Ejecutar la prueba
testSilentNotifications().catch(console.error);
