#!/usr/bin/env node

/**
 * Script para listar todos los usuarios creados hoy (14 de diciembre 2025)
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function listUsersCreatedToday() {
  console.log("📋 LISTA DE USUARIOS CREADOS HOY (14 DE DICIEMBRE 2025)");
  console.log("=" * 70);
  
  const db = admin.firestore();
  
  // Definir el rango de fechas para hoy
  const today = new Date('2025-12-14');
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  
  console.log(`📅 Fecha objetivo: ${today.toDateString()}`);
  console.log(`⏰ Rango: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);
  console.log("");
  
  try {
    // Obtener todos los usuarios
    console.log("📋 PASO 1: Obteniendo todos los usuarios...");
    
    const usersQuery = db.collection('users');
    const usersSnapshot = await usersQuery.get();
    
    console.log(`👥 Total usuarios en la base de datos: ${usersSnapshot.size}`);
    console.log("");
    
    // Filtrar usuarios creados hoy
    const usersCreatedToday = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Verificar si tiene timestamp de creación
      let createdAt = null;
      
      // Buscar diferentes campos que podrían indicar creación
      if (userData.createdAt) {
        createdAt = userData.createdAt.toDate();
      } else if (userData.fcmTokenUpdatedAt) {
        // Si no hay createdAt, usar fcmTokenUpdatedAt como aproximación
        createdAt = userData.fcmTokenUpdatedAt.toDate();
      } else if (userData.lastActiveAt) {
        // Como último recurso, usar lastActiveAt
        createdAt = userData.lastActiveAt.toDate();
      }
      
      // Verificar si fue creado hoy
      if (createdAt && createdAt >= startOfDay && createdAt < endOfDay) {
        usersCreatedToday.push({
          userId: userId,
          createdAt: createdAt,
          userData: userData
        });
      }
    }
    
    // Ordenar por hora de creación
    usersCreatedToday.sort((a, b) => a.createdAt - b.createdAt);
    
    console.log("📊 PASO 2: Usuarios creados hoy...");
    console.log("");
    
    if (usersCreatedToday.length === 0) {
      console.log("❌ No se encontraron usuarios creados hoy");
      return;
    }
    
    console.log(`✅ Total usuarios creados hoy: ${usersCreatedToday.length}`);
    console.log("");
    
    // Mostrar detalles de cada usuario
    for (let i = 0; i < usersCreatedToday.length; i++) {
      const user = usersCreatedToday[i];
      const userData = user.userData;
      
      console.log(`${i + 1}. 👤 Usuario: ${user.userId}`);
      console.log(`   ⏰ Creado: ${user.createdAt.toISOString()}`);
      console.log(`   🕐 Hora local: ${user.createdAt.toLocaleTimeString('es-ES')}`);
      
      // Token FCM
      const hasToken = !!userData.fcmToken;
      console.log(`   🔑 Token FCM: ${hasToken ? '✅ SÍ' : '❌ NO'}`);
      if (hasToken) {
        console.log(`   📱 Token: ${userData.fcmToken.substring(0, 25)}...`);
      }
      
      // Device Info
      if (userData.deviceInfo) {
        console.log(`   📱 Dispositivo: ${userData.deviceInfo.platform || 'unknown'}`);
        console.log(`   📲 Device ID: ${userData.deviceInfo.deviceId || 'N/A'}`);
        console.log(`   📋 App Version: ${userData.deviceInfo.appVersion || 'N/A'}`);
      } else {
        console.log(`   📱 Dispositivo: unknown`);
      }
      
      // Verificar suscripciones a carreras
      const raceSubscriptionsQuery = db.collection('users').doc(user.userId)
        .collection('race-subscriptions');
      const raceSubscriptionsSnapshot = await raceSubscriptionsQuery.get();
      
      console.log(`   🏁 Carreras suscritas: ${raceSubscriptionsSnapshot.size}`);
      
      if (raceSubscriptionsSnapshot.size > 0) {
        raceSubscriptionsSnapshot.docs.forEach(doc => {
          const subscriptionData = doc.data();
          const raceId = doc.id;
          const raceName = raceId === '69200553-464c-4bfd-9b35-4ca6ac1f17f5' ? 'Maratón Málaga' : 'Otra carrera';
          console.log(`      • ${raceName} (${subscriptionData.isActive ? 'Activo' : 'Inactivo'})`);
        });
      }
      
      // Verificar seguimientos
      const followingsQuery = db.collection('users').doc(user.userId)
        .collection('followings')
        .where('profileType', '==', 'participant');
      const followingsSnapshot = await followingsQuery.get();
      
      console.log(`   👥 Participantes seguidos: ${followingsSnapshot.size}`);
      
      if (followingsSnapshot.size > 0 && followingsSnapshot.size <= 5) {
        followingsSnapshot.docs.forEach(doc => {
          const followData = doc.data();
          console.log(`      • ${followData.profileId} (${followData.eventId})`);
        });
      } else if (followingsSnapshot.size > 5) {
        console.log(`      • (Lista muy larga - ${followingsSnapshot.size} participantes)`);
      }
      
      console.log("");
    }
    
    // Resumen estadístico
    console.log("📊 RESUMEN ESTADÍSTICO");
    console.log("=" * 70);
    
    const usersWithTokens = usersCreatedToday.filter(u => !!u.userData.fcmToken).length;
    const totalSubscriptions = await Promise.all(
      usersCreatedToday.map(async (user) => {
        const subs = await db.collection('users').doc(user.userId)
          .collection('race-subscriptions').get();
        return subs.size;
      })
    );
    const totalFollowings = await Promise.all(
      usersCreatedToday.map(async (user) => {
        const follows = await db.collection('users').doc(user.userId)
          .collection('followings').where('profileType', '==', 'participant').get();
        return follows.size;
      })
    );
    
    console.log(`👥 Total usuarios creados hoy: ${usersCreatedToday.length}`);
    console.log(`🔑 Usuarios con tokens FCM: ${usersWithTokens} (${((usersWithTokens/usersCreatedToday.length)*100).toFixed(1)}%)`);
    console.log(`🏁 Total suscripciones a carreras: ${totalSubscriptions.reduce((a,b) => a+b, 0)}`);
    console.log(`👥 Total seguimientos de participantes: ${totalFollowings.reduce((a,b) => a+b, 0)}`);
    console.log(`📈 Promedio seguimientos por usuario: ${(totalFollowings.reduce((a,b) => a+b, 0) / usersCreatedToday.length).toFixed(1)}`);
    
    // Distribución por hora
    console.log("");
    console.log("⏰ DISTRIBUCIÓN POR HORA:");
    const hourDistribution = {};
    usersCreatedToday.forEach(user => {
      const hour = user.createdAt.getHours();
      hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
    });
    
    Object.entries(hourDistribution)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([hour, count]) => {
        console.log(`   ${hour.padStart(2, '0')}:00 - ${count} usuario${count > 1 ? 's' : ''}`);
      });
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
listUsersCreatedToday().catch(console.error);
