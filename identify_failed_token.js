#!/usr/bin/env node

/**
 * Script para identificar qué usuario tiene el token que falló
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function identifyFailedToken() {
  console.log("🔍 IDENTIFICANDO USUARIO CON TOKEN FALLIDO");
  console.log("=" * 60);
  
  const db = admin.firestore();
  
  // Token que falló según los logs
  const failedTokenPrefix = "duQBObBOSDG0QP_2y_DGHt:APA91bH";
  
  console.log(`❌ Token fallido: ${failedTokenPrefix}...`);
  console.log(`💥 Error: messaging/registration-token-not-registered`);
  console.log("");
  
  try {
    // Buscar en todos los usuarios
    console.log("📋 PASO 1: Buscando usuario con este token...");
    
    const usersQuery = db.collection('users');
    const usersSnapshot = await usersQuery.get();
    
    let foundUser = null;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      if (userData.fcmToken && userData.fcmToken.startsWith(failedTokenPrefix)) {
        foundUser = {
          userId: userDoc.id,
          userData: userData
        };
        break;
      }
    }
    
    if (!foundUser) {
      console.log("❌ No se encontró usuario con ese token");
      return;
    }
    
    console.log(`✅ USUARIO ENCONTRADO: ${foundUser.userId}`);
    console.log("");
    
    // Analizar detalles del usuario
    console.log("📊 DETALLES DEL USUARIO:");
    console.log(`🔑 Token completo: ${foundUser.userData.fcmToken}`);
    console.log(`⏰ Token actualizado: ${foundUser.userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString() || 'N/A'}`);
    console.log(`🕐 Última actividad: ${foundUser.userData.lastActiveAt?.toDate?.()?.toISOString() || 'N/A'}`);
    console.log(`📱 Device Info:`, foundUser.userData.deviceInfo || 'N/A');
    console.log("");
    
    // Verificar suscripciones a carreras
    console.log("🏁 SUSCRIPCIONES A CARRERAS:");
    
    const raceSubscriptionsQuery = db.collection('users').doc(foundUser.userId)
      .collection('race-subscriptions');
    const raceSubscriptionsSnapshot = await raceSubscriptionsQuery.get();
    
    if (raceSubscriptionsSnapshot.empty) {
      console.log("❌ No tiene suscripciones a carreras");
    } else {
      raceSubscriptionsSnapshot.docs.forEach(doc => {
        const subscriptionData = doc.data();
        console.log(`   • ${doc.id}`);
        console.log(`     Estado: ${subscriptionData.isActive ? '✅ Activo' : '❌ Inactivo'}`);
        console.log(`     Suscrito: ${subscriptionData.subscribedAt?.toDate?.()?.toISOString() || 'N/A'}`);
      });
    }
    console.log("");
    
    // Verificar seguimientos
    console.log("👥 PARTICIPANTES QUE SIGUE:");
    
    const followingsQuery = db.collection('users').doc(foundUser.userId)
      .collection('followings')
      .where('profileType', '==', 'participant');
    const followingsSnapshot = await followingsQuery.get();
    
    if (followingsSnapshot.empty) {
      console.log("❌ No sigue a ningún participante");
    } else {
      console.log(`✅ Sigue a ${followingsSnapshot.size} participantes:`);
      followingsSnapshot.docs.forEach(doc => {
        const followData = doc.data();
        console.log(`   • ${followData.profileId} (${followData.eventId}) - ${followData.raceId}`);
      });
    }
    console.log("");
    
    // Verificar en índice global
    console.log("🌐 PRESENCIA EN ÍNDICES GLOBALES:");
    
    const raceTokensQuery = db.collection('race-fcm-tokens')
      .where('userId', '==', foundUser.userId);
    const raceTokensSnapshot = await raceTokensQuery.get();
    
    if (raceTokensSnapshot.empty) {
      console.log("❌ No está en ningún índice global de carreras");
    } else {
      raceTokensSnapshot.docs.forEach(doc => {
        const tokenData = doc.data();
        console.log(`   • ${doc.id}`);
        console.log(`     RaceId: ${tokenData.raceId}`);
        console.log(`     Estado: ${tokenData.isActive ? '✅ Activo' : '❌ Inactivo'}`);
        console.log(`     Token: ${tokenData.fcmToken?.substring(0, 20)}...`);
      });
    }
    console.log("");
    
    // Diagnóstico del problema
    console.log("🔧 DIAGNÓSTICO DEL PROBLEMA:");
    console.log("=" * 60);
    console.log("❌ ERROR: messaging/registration-token-not-registered");
    console.log("");
    console.log("📋 POSIBLES CAUSAS:");
    console.log("1. 📱 La app fue desinstalada del dispositivo");
    console.log("2. 🔄 El token FCM expiró o fue invalidado");
    console.log("3. 🚫 El usuario deshabilitó las notificaciones");
    console.log("4. 📲 El dispositivo cambió y generó un nuevo token");
    console.log("5. ⏰ El token es muy antiguo y ya no es válido");
    console.log("");
    console.log("💡 SOLUCIONES:");
    console.log("1. ✅ El token debería ser eliminado automáticamente");
    console.log("2. 🔄 El usuario necesita volver a registrar su token");
    console.log("3. 🧹 Limpiar tokens inválidos de la base de datos");
    console.log("");
    
    // Verificar si el token debería ser limpiado
    const tokenAge = foundUser.userData.fcmTokenUpdatedAt?.toDate?.();
    if (tokenAge) {
      const daysSinceUpdate = (Date.now() - tokenAge.getTime()) / (1000 * 60 * 60 * 24);
      console.log(`⏰ Edad del token: ${daysSinceUpdate.toFixed(1)} días`);
      
      if (daysSinceUpdate > 60) {
        console.log("⚠️ Token muy antiguo (>60 días) - debería ser limpiado");
      } else {
        console.log("✅ Token relativamente reciente");
      }
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
identifyFailedToken().catch(console.error);
