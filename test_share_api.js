#!/usr/bin/env node

/**
 * Script para probar el nuevo API de comparticiones
 */

const testShareAPI = async () => {
  console.log("📤 PROBANDO API DE COMPARTICIONES");
  console.log("=" * 50);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";

  // Primero obtener una historia real del feed
  console.log("🔍 1. OBTENIENDO HISTORIA REAL DEL FEED...");

  try {
    const feedUrl = `${baseUrl}/api/apps/feed/extended?appId=Ryx7YFWobBfGTJqkciCV&raceId=69200553-464c-4bfd-9b35-4ca6ac1f17f5&eventId=Maratón&limit=1`;
    console.log(`🌐 Feed URL: ${feedUrl}`);

    const feedResponse = await fetch(feedUrl);
    console.log(`📡 Feed Status: ${feedResponse.status}`);

    if (!feedResponse.ok) {
      throw new Error(`Feed API failed: ${feedResponse.status}`);
    }

    const feedData = await feedResponse.json();
    console.log(`📊 Stories encontradas: ${feedData.stories?.length || 0}`);

    if (!feedData.stories || feedData.stories.length === 0) {
      throw new Error("No se encontraron historias en el feed");
    }

    const story = feedData.stories[0];
    console.log(`✅ Historia obtenida: ${story.storyId}`);
    console.log(`   Participante: ${story.participant?.name || 'N/A'}`);
    console.log(`   Descripción: ${story.description || 'N/A'}`);

    // Datos de prueba usando la historia real
    const testData = {
      raceId: story.raceId,
      appId: story.appId,
      eventId: story.eventId,
      participantId: story.participantId,
      storyId: story.storyId,
      userId: "test-user-123"
    };

    console.log("📋 Datos de prueba (historia real):", testData);

    // 2. PROBAR COMPARTIR UNA HISTORIA
    console.log("\n🔄 2. PROBANDO COMPARTIR HISTORIA...");

    const shareResponse = await fetch(`${baseUrl}/api/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Share-API/1.0'
      },
      body: JSON.stringify({
        ...testData,
        shareType: "social_media",
        platform: "whatsapp"
      })
    });

    console.log(`📡 Status: ${shareResponse.status} ${shareResponse.statusText}`);

    if (shareResponse.ok) {
      const shareResult = await shareResponse.json();
      console.log("✅ COMPARTICIÓN EXITOSA:");
      console.log(`   ShareId: ${shareResult.shareId}`);
      console.log(`   Tipo: ${shareResult.shareType}`);
      console.log(`   Plataforma: ${shareResult.platform}`);
      console.log(`   Fecha: ${shareResult.sharedAt}`);
    } else {
      const errorText = await shareResponse.text();
      console.log("❌ ERROR AL COMPARTIR:", errorText);
      return; // Salir si no se puede compartir
    }

    // 3. PROBAR OTRA COMPARTICIÓN CON DIFERENTE TIPO
    console.log("\n🔄 3. PROBANDO SEGUNDA COMPARTICIÓN...");

    const shareResponse2 = await fetch(`${baseUrl}/api/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Share-API/1.0'
      },
      body: JSON.stringify({
        ...testData,
        userId: "test-user-456", // Diferente usuario
        shareType: "copy_link",
        platform: "instagram"
      })
    });

    console.log(`📡 Status: ${shareResponse2.status} ${shareResponse2.statusText}`);

    if (shareResponse2.ok) {
      const shareResult2 = await shareResponse2.json();
      console.log("✅ SEGUNDA COMPARTICIÓN EXITOSA:");
      console.log(`   ShareId: ${shareResult2.shareId}`);
      console.log(`   Tipo: ${shareResult2.shareType}`);
      console.log(`   Plataforma: ${shareResult2.platform}`);
    } else {
      const errorText = await shareResponse2.text();
      console.log("❌ ERROR EN SEGUNDA COMPARTICIÓN:", errorText);
    }

    // 4. PROBAR CONTADOR DE COMPARTICIONES
    console.log("\n🔄 4. PROBANDO CONTADOR DE COMPARTICIONES...");

    const countUrl = `${baseUrl}/api/shares/count?${new URLSearchParams(testData)}`;
    console.log(`🌐 URL: ${countUrl}`);

    const countResponse = await fetch(countUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-Share-API/1.0'
      }
    });

    console.log(`📡 Status: ${countResponse.status} ${countResponse.statusText}`);

    if (countResponse.ok) {
      const countResult = await countResponse.json();
      console.log("✅ CONTADOR OBTENIDO:");
      console.log(`   Total comparticiones: ${countResult.totalShares}`);
      console.log(`   Por tipo:`, countResult.sharesByType);
      console.log(`   Por plataforma:`, countResult.sharesByPlatform);
    } else {
      const errorText = await countResponse.text();
      console.log("❌ ERROR AL OBTENER CONTADOR:", errorText);
    }

    console.log("\n🎯 PRUEBAS COMPLETADAS");

  } catch (error) {
    console.error("💥 ERROR GENERAL:", error.message);
  }
};

// Ejecutar las pruebas
testShareAPI().catch(console.error);
