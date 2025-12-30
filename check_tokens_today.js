#!/usr/bin/env node

/**
 * Script para verificar qué usuarios tienen tokens FCM creados hoy (14 de diciembre 2025)
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function checkTokensCreatedToday() {
  console.log("🔍 VERIFICANDO TOKENS FCM CREADOS HOY (14 DE DICIEMBRE 2025)");
  console.log("=" * 70);
  
  const db = admin.firestore();
  
  // Definir el rango de fechas para hoy (14 de diciembre 2025)
  const today = new Date('2025-12-14');
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  
  console.log(`📅 Fecha objetivo: ${today.toDateString()}`);
  console.log(`⏰ Rango: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);
  console.log("");
  
  try {
    // 1. Buscar TODOS los usuarios con tokens FCM y filtrar por fecha en código
    console.log("📋 PASO 1: Buscando usuarios con tokens FCM...");

    const usersQuery = db.collection('users')
      .where('fcmToken', '!=', null);

    const allUsersSnapshot = await usersQuery.get();

    // Filtrar por fecha en el código (para evitar índices complejos)
    const usersSnapshot = {
      docs: allUsersSnapshot.docs.filter(doc => {
        const userData = doc.data();
        if (!userData.fcmTokenUpdatedAt) return false;

        const tokenDate = userData.fcmTokenUpdatedAt.toDate();
        return tokenDate >= startOfDay && tokenDate <= endOfDay;
      }),
      size: 0
    };
    usersSnapshot.size = usersSnapshot.docs.length;
    
    console.log(`👥 Total usuarios con tokens FCM (histórico): ${allUsersSnapshot.size}`);
    console.log(`👥 Total usuarios con tokens FCM creados/actualizados hoy: ${usersSnapshot.size}`);
    console.log("");

    if (usersSnapshot.size === 0) {
      console.log("❌ No se encontraron usuarios con tokens FCM creados hoy");

      if (allUsersSnapshot.size > 0) {
        console.log("\n📋 TOKENS EXISTENTES (últimos 10):");
        allUsersSnapshot.docs.slice(0, 10).forEach((doc, index) => {
          const userData = doc.data();
          console.log(`   ${index + 1}. ${doc.id}`);
          console.log(`      Token: ${userData.fcmToken?.substring(0, 20)}...`);
          console.log(`      Actualizado: ${userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString() || 'N/A'}`);
          console.log(`      Dispositivo: ${userData.deviceInfo?.platform || 'unknown'}`);
          console.log(`      Última actividad: ${userData.lastActiveAt?.toDate?.()?.toISOString() || 'N/A'}`);
        });
      }

      return;
    }
    
    // 2. Analizar cada usuario con token creado hoy
    console.log("📊 PASO 2: Analizando usuarios con tokens de hoy...");
    console.log("");
    
    const tokensData = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;
      
      console.log(`👤 Usuario: ${userId}`);
      console.log(`🔑 Token: ${userData.fcmToken?.substring(0, 30)}...`);
      console.log(`⏰ Creado/Actualizado: ${userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString()}`);
      console.log(`📱 Dispositivo: ${userData.deviceInfo?.platform || 'unknown'}`);
      console.log(`📱 Device ID: ${userData.deviceInfo?.deviceId || 'N/A'}`);
      console.log(`📱 App Version: ${userData.deviceInfo?.appVersion || 'N/A'}`);
      console.log(`🕐 Última actividad: ${userData.lastActiveAt?.toDate?.()?.toISOString() || 'N/A'}`);
      
      // 3. Verificar suscripciones a carreras
      const raceSubscriptionsQuery = db.collection('users').doc(userId)
        .collection('race-subscriptions')
        .where('isActive', '==', true);
      
      const subscriptionsSnapshot = await raceSubscriptionsQuery.get();
      
      console.log(`🏁 Carreras suscritas: ${subscriptionsSnapshot.size}`);
      
      const raceSubscriptions = [];
      subscriptionsSnapshot.docs.forEach(subDoc => {
        const subData = subDoc.data();
        raceSubscriptions.push({
          raceId: subDoc.id,
          subscribedAt: subData.subscribedAt?.toDate?.()?.toISOString(),
          isActive: subData.isActive
        });
        console.log(`   • ${subDoc.id} (desde: ${subData.subscribedAt?.toDate?.()?.toISOString()})`);
      });
      
      // 4. Verificar seguimientos de participantes
      const followingsQuery = db.collection('users').doc(userId)
        .collection('followings');
      
      const followingsSnapshot = await followingsQuery.get();
      
      console.log(`👥 Participantes seguidos: ${followingsSnapshot.size}`);
      
      const followings = [];
      followingsSnapshot.docs.forEach(followDoc => {
        const followData = followDoc.data();
        followings.push({
          participantId: followDoc.id,
          profileType: followData.profileType,
          raceId: followData.raceId,
          eventId: followData.eventId
        });
        console.log(`   • ${followDoc.id} (${followData.profileType}) en ${followData.eventId}`);
      });
      
      tokensData.push({
        userId: userId,
        fcmToken: userData.fcmToken?.substring(0, 30) + '...',
        fcmTokenUpdatedAt: userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString(),
        deviceInfo: userData.deviceInfo,
        lastActiveAt: userData.lastActiveAt?.toDate?.()?.toISOString(),
        raceSubscriptions: raceSubscriptions,
        followings: followings
      });
      
      console.log("");
    }
    
    // 5. Resumen final
    console.log("📊 RESUMEN FINAL");
    console.log("=" * 70);
    
    const totalTokensToday = tokensData.length;
    const androidTokens = tokensData.filter(t => t.deviceInfo?.platform === 'android').length;
    const iosTokens = tokensData.filter(t => t.deviceInfo?.platform === 'ios').length;
    const webTokens = tokensData.filter(t => t.deviceInfo?.platform === 'web').length;
    const unknownTokens = tokensData.filter(t => !t.deviceInfo?.platform || t.deviceInfo?.platform === 'unknown').length;
    
    const usersWithSubscriptions = tokensData.filter(t => t.raceSubscriptions.length > 0).length;
    const usersWithFollowings = tokensData.filter(t => t.followings.length > 0).length;
    
    console.log(`📅 Fecha: 14 de diciembre 2025`);
    console.log(`🔑 Total tokens creados/actualizados hoy: ${totalTokensToday}`);
    console.log(`📱 Por plataforma:`);
    console.log(`   • Android: ${androidTokens}`);
    console.log(`   • iOS: ${iosTokens}`);
    console.log(`   • Web: ${webTokens}`);
    console.log(`   • Desconocido: ${unknownTokens}`);
    console.log(`🏁 Usuarios con suscripciones a carreras: ${usersWithSubscriptions}`);
    console.log(`👥 Usuarios siguiendo participantes: ${usersWithFollowings}`);
    
    if (totalTokensToday > 0) {
      console.log("\n✅ USUARIOS ACTIVOS HOY:");
      tokensData.forEach((token, index) => {
        console.log(`   ${index + 1}. ${token.userId}`);
        console.log(`      Plataforma: ${token.deviceInfo?.platform || 'unknown'}`);
        console.log(`      Carreras: ${token.raceSubscriptions.length}`);
        console.log(`      Siguiendo: ${token.followings.length} participantes`);
      });
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
checkTokensCreatedToday().catch(console.error);
