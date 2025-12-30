#!/usr/bin/env node

/**
 * Script para debuggear por qué solo 1 usuario recibe notificaciones
 * cuando hay 5 usuarios siguiendo participantes del Maratón de Málaga
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function debugNotificationIssue() {
  console.log("🔍 DEBUGGING: ¿Por qué solo 1 usuario recibe notificaciones?");
  console.log("=" * 70);
  
  const db = admin.firestore();
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5"; // Maratón Málaga
  const participantId = "D21D9C3F"; // Astrid de Zeeuw
  
  console.log(`🏁 Carrera: ${raceId}`);
  console.log(`👤 Participante de prueba: ${participantId}`);
  console.log("");
  
  try {
    // 1. Buscar TODOS los seguidores de D21D9C3F
    console.log("📋 PASO 1: Buscando TODOS los seguidores de D21D9C3F...");
    
    const followersQuery = db.collectionGroup('followings')
      .where('profileId', '==', participantId)
      .where('profileType', '==', 'participant');
    
    const followersSnapshot = await followersQuery.get();
    
    console.log(`👥 Total seguidores encontrados: ${followersSnapshot.size}`);
    console.log("");
    
    if (followersSnapshot.empty) {
      console.log("❌ No se encontraron seguidores para D21D9C3F");
      return;
    }
    
    // 2. Analizar cada seguidor en detalle
    console.log("📊 PASO 2: Analizando cada seguidor...");
    console.log("");
    
    for (const doc of followersSnapshot.docs) {
      const followingData = doc.data();
      const docPath = doc.ref.path;
      const userId = docPath.split('/')[1];
      
      console.log(`👤 USUARIO: ${userId}`);
      console.log(`📍 Path: ${docPath}`);
      console.log(`📄 Datos seguimiento:`, followingData);
      
      // 3. Verificar token FCM
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        console.log(`❌ Usuario no existe en colección 'users'`);
        console.log("");
        continue;
      }
      
      const userData = userDoc.data();
      const hasToken = !!userData.fcmToken;
      
      console.log(`🔑 Token FCM: ${hasToken ? '✅ SÍ' : '❌ NO'}`);
      if (hasToken) {
        console.log(`📱 Token: ${userData.fcmToken.substring(0, 20)}...`);
      }
      
      // 4. Verificar suscripción a la carrera
      const raceSubscriptionDoc = await db.collection('users').doc(userId)
        .collection('race-subscriptions').doc(raceId).get();
      
      const isSubscribedToRace = raceSubscriptionDoc.exists;
      console.log(`🏁 Suscrito a carrera: ${isSubscribedToRace ? '✅ SÍ' : '❌ NO'}`);
      
      if (isSubscribedToRace) {
        const subscriptionData = raceSubscriptionDoc.data();
        console.log(`📊 Datos suscripción:`, {
          isActive: subscriptionData.isActive,
          subscribedAt: subscriptionData.subscribedAt?.toDate?.()?.toISOString(),
          lastActiveAt: subscriptionData.lastActiveAt?.toDate?.()?.toISOString()
        });
      }
      
      // 5. Verificar en índice global
      const globalIndexDoc = await db.collection('race-fcm-tokens')
        .doc(`${raceId}_${userId}`).get();
      
      const inGlobalIndex = globalIndexDoc.exists;
      console.log(`🌐 En índice global: ${inGlobalIndex ? '✅ SÍ' : '❌ NO'}`);
      
      if (inGlobalIndex) {
        const globalData = globalIndexDoc.data();
        console.log(`📊 Datos índice global:`, {
          isActive: globalData.isActive,
          subscribedAt: globalData.subscribedAt?.toDate?.()?.toISOString(),
          lastActiveAt: globalData.lastActiveAt?.toDate?.()?.toISOString()
        });
      }
      
      // 6. Verificar compatibilidad de datos de seguimiento
      const followingRaceId = followingData.raceId;
      const followingEventId = followingData.eventId;
      const followingAppId = followingData.appId;
      
      console.log(`🔍 Compatibilidad de datos:`);
      console.log(`   • RaceId coincide: ${followingRaceId === raceId ? '✅' : '❌'} (${followingRaceId})`);
      console.log(`   • EventId: ${followingEventId}`);
      console.log(`   • AppId: ${followingAppId}`);
      
      // 7. Determinar si debería recibir notificaciones
      const shouldReceiveNotifications = hasToken && isSubscribedToRace && (followingRaceId === raceId);
      
      console.log(`🔔 DEBERÍA RECIBIR NOTIFICACIONES: ${shouldReceiveNotifications ? '✅ SÍ' : '❌ NO'}`);
      
      if (!shouldReceiveNotifications) {
        console.log(`⚠️ RAZONES POR LAS QUE NO RECIBE:`);
        if (!hasToken) console.log(`   • ❌ No tiene token FCM`);
        if (!isSubscribedToRace) console.log(`   • ❌ No está suscrito a la carrera`);
        if (followingRaceId !== raceId) console.log(`   • ❌ RaceId no coincide`);
      }
      
      console.log("");
      console.log("-" * 50);
      console.log("");
    }
    
    // 8. Verificar la lógica del trigger
    console.log("📋 PASO 3: Verificando lógica del trigger...");
    console.log("");
    
    console.log("🔍 El trigger busca seguidores usando:");
    console.log(`   Query: collectionGroup('followings').where('profileId', '==', '${participantId}').where('profileType', '==', 'participant')`);
    console.log("");
    
    console.log("🔍 Luego para cada seguidor verifica:");
    console.log("   1. ✅ Que el usuario exista en /users/{userId}");
    console.log("   2. ✅ Que tenga fcmToken válido");
    console.log("   3. ✅ Que esté suscrito a la carrera en /users/{userId}/race-subscriptions/{raceId}");
    console.log("");
    
    // 9. Resumen final
    console.log("📊 RESUMEN Y DIAGNÓSTICO");
    console.log("=" * 70);
    
    const totalFollowers = followersSnapshot.size;
    console.log(`👥 Total seguidores de D21D9C3F: ${totalFollowers}`);
    
    if (totalFollowers === 1) {
      console.log("🎯 DIAGNÓSTICO: Solo hay 1 seguidor de D21D9C3F");
      console.log("   • Esto explica por qué solo 1 usuario recibe notificaciones");
      console.log("   • Los otros usuarios siguen OTROS participantes, no a D21D9C3F");
      console.log("");
      console.log("💡 SOLUCIÓN:");
      console.log("   • Para probar con más usuarios, usar un participante que tenga más seguidores");
      console.log("   • O hacer que más usuarios sigan a D21D9C3F");
    } else {
      console.log("🎯 DIAGNÓSTICO: Hay múltiples seguidores pero algunos no reciben notificaciones");
      console.log("   • Revisar los detalles arriba para identificar qué falta en cada caso");
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
debugNotificationIssue().catch(console.error);
