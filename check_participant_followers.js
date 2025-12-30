#!/usr/bin/env node

/**
 * Script para verificar qué usuarios siguen al participante D21D9C3F
 * y si estos usuarios tienen tokens FCM en la carrera actual
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function checkParticipantFollowers() {
  console.log("🔍 VERIFICANDO SEGUIDORES DEL PARTICIPANTE D21D9C3F");
  console.log("=" * 60);
  
  const db = admin.firestore();
  const participantId = "D21D9C3F";
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
  
  try {
    console.log(`👤 Participante: ${participantId}`);
    console.log(`🏁 Carrera: ${raceId}`);
    console.log("");
    
    // 1. Buscar seguidores del participante usando Collection Group
    console.log("📋 PASO 1: Buscando seguidores...");
    
    const followersQuery = db.collectionGroup('followings')
      .where('profileId', '==', participantId)
      .where('profileType', '==', 'participant');
    
    const followersSnapshot = await followersQuery.get();
    
    console.log(`👥 Total seguidores encontrados: ${followersSnapshot.size}`);
    console.log("");
    
    if (followersSnapshot.empty) {
      console.log("❌ No se encontraron seguidores para este participante");
      return;
    }
    
    // 2. Analizar cada seguidor
    console.log("📊 PASO 2: Analizando cada seguidor...");
    console.log("");
    
    const followersData = [];
    
    for (const doc of followersSnapshot.docs) {
      const followingData = doc.data();
      const docPath = doc.ref.path;
      
      // Extraer userId del path: users/{userId}/followings/{participantId}
      const userId = docPath.split('/')[1];
      
      console.log(`👤 Seguidor: ${userId}`);
      console.log(`📍 Path: ${docPath}`);
      console.log(`📄 Datos:`, followingData);
      
      // 3. Verificar si el usuario tiene token FCM
      const userDoc = await db.collection('users').doc(userId).get();
      
      let userInfo = {
        userId: userId,
        hasToken: false,
        fcmToken: null,
        deviceInfo: null,
        lastActiveAt: null,
        isSubscribedToRace: false,
        raceSubscriptionData: null
      };
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        userInfo.hasToken = !!userData.fcmToken;
        userInfo.fcmToken = userData.fcmToken ? `${userData.fcmToken.substring(0, 20)}...` : null;
        userInfo.deviceInfo = userData.deviceInfo || null;
        userInfo.lastActiveAt = userData.lastActiveAt?.toDate?.()?.toISOString() || null;
        
        console.log(`🔑 Token FCM: ${userInfo.hasToken ? '✅ SÍ' : '❌ NO'}`);
        if (userInfo.hasToken) {
          console.log(`📱 Token: ${userInfo.fcmToken}`);
          console.log(`📱 Dispositivo:`, userInfo.deviceInfo);
        }
        
        // 4. Verificar suscripción a la carrera específica
        const raceSubscriptionDoc = await db.collection('users').doc(userId)
          .collection('race-subscriptions').doc(raceId).get();
        
        if (raceSubscriptionDoc.exists) {
          userInfo.isSubscribedToRace = true;
          userInfo.raceSubscriptionData = raceSubscriptionDoc.data();
          console.log(`🏁 Suscrito a carrera: ✅ SÍ`);
          console.log(`📊 Datos suscripción:`, userInfo.raceSubscriptionData);
        } else {
          console.log(`🏁 Suscrito a carrera: ❌ NO`);
        }
        
      } else {
        console.log(`❌ Usuario no encontrado en base de datos`);
      }
      
      followersData.push(userInfo);
      console.log("");
    }
    
    // 5. Resumen final
    console.log("📊 RESUMEN FINAL");
    console.log("=" * 60);
    
    const totalFollowers = followersData.length;
    const followersWithTokens = followersData.filter(f => f.hasToken).length;
    const followersSubscribedToRace = followersData.filter(f => f.isSubscribedToRace).length;
    const followersReadyForNotifications = followersData.filter(f => f.hasToken && f.isSubscribedToRace).length;
    
    console.log(`👥 Total seguidores: ${totalFollowers}`);
    console.log(`🔑 Con token FCM: ${followersWithTokens}`);
    console.log(`🏁 Suscritos a esta carrera: ${followersSubscribedToRace}`);
    console.log(`🔔 Listos para notificaciones: ${followersReadyForNotifications}`);
    console.log("");
    
    if (followersReadyForNotifications > 0) {
      console.log("✅ USUARIOS QUE RECIBIRÁN NOTIFICACIONES:");
      followersData
        .filter(f => f.hasToken && f.isSubscribedToRace)
        .forEach((follower, index) => {
          console.log(`   ${index + 1}. ${follower.userId}`);
          console.log(`      Token: ${follower.fcmToken}`);
          console.log(`      Dispositivo: ${follower.deviceInfo?.platform || 'unknown'}`);
          console.log(`      Última actividad: ${follower.lastActiveAt || 'N/A'}`);
        });
    } else {
      console.log("❌ NINGÚN USUARIO RECIBIRÁ NOTIFICACIONES");
      console.log("   Razones posibles:");
      console.log("   • No tienen token FCM registrado");
      console.log("   • No están suscritos a esta carrera específica");
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
checkParticipantFollowers().catch(console.error);
