#!/usr/bin/env node

/**
 * Script para encontrar qué participantes tienen más seguidores
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function checkPopularParticipants() {
  console.log("🔍 BUSCANDO PARTICIPANTES MÁS POPULARES (CON MÁS SEGUIDORES)");
  console.log("=" * 70);
  
  const db = admin.firestore();
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
  
  try {
    // 1. Obtener TODOS los seguimientos de participantes (sin filtro de raceId para evitar índices)
    console.log("📋 PASO 1: Obteniendo todos los seguimientos...");

    const followingsQuery = db.collectionGroup('followings')
      .where('profileType', '==', 'participant');

    const allFollowingsSnapshot = await followingsQuery.get();

    // Filtrar por raceId en código
    const followingsSnapshot = {
      docs: allFollowingsSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.raceId === raceId;
      }),
      size: 0
    };
    followingsSnapshot.size = followingsSnapshot.docs.length;
    
    console.log(`👥 Total seguimientos encontrados: ${followingsSnapshot.size}`);
    console.log("");
    
    // 2. Contar seguidores por participante
    const participantFollowers = {};
    const userTokens = {};
    
    for (const doc of followingsSnapshot.docs) {
      const followingData = doc.data();
      const participantId = followingData.profileId;
      const userId = doc.ref.path.split('/')[1];
      
      // Contar seguidores
      if (!participantFollowers[participantId]) {
        participantFollowers[participantId] = [];
      }
      participantFollowers[participantId].push(userId);
      
      // Verificar si el usuario tiene token FCM
      if (!userTokens[userId]) {
        const userDoc = await db.collection('users').doc(userId).get();
        userTokens[userId] = {
          hasToken: userDoc.exists && !!userDoc.data()?.fcmToken,
          token: userDoc.exists ? userDoc.data()?.fcmToken?.substring(0, 20) + '...' : null
        };
      }
    }
    
    // 3. Ordenar participantes por número de seguidores
    const sortedParticipants = Object.entries(participantFollowers)
      .map(([participantId, followers]) => ({
        participantId,
        totalFollowers: followers.length,
        followers: followers,
        followersWithTokens: followers.filter(userId => userTokens[userId].hasToken).length
      }))
      .sort((a, b) => b.totalFollowers - a.totalFollowers);
    
    console.log("📊 PASO 2: Ranking de participantes por seguidores...");
    console.log("");
    
    sortedParticipants.slice(0, 10).forEach((participant, index) => {
      console.log(`${index + 1}. 👤 Participante: ${participant.participantId}`);
      console.log(`   👥 Total seguidores: ${participant.totalFollowers}`);
      console.log(`   🔑 Con token FCM: ${participant.followersWithTokens}`);
      console.log(`   🔔 Notificaciones potenciales: ${participant.followersWithTokens}`);
      
      // Mostrar detalles de seguidores
      participant.followers.forEach(userId => {
        const tokenInfo = userTokens[userId];
        console.log(`      • ${userId} ${tokenInfo.hasToken ? '✅' : '❌'} ${tokenInfo.token || ''}`);
      });
      
      console.log("");
    });
    
    // 4. Resumen estadístico
    console.log("📊 RESUMEN ESTADÍSTICO");
    console.log("=" * 70);
    
    const totalParticipants = sortedParticipants.length;
    const totalFollowings = followingsSnapshot.size;
    const uniqueUsers = Object.keys(userTokens).length;
    const usersWithTokens = Object.values(userTokens).filter(u => u.hasToken).length;
    
    const maxFollowers = sortedParticipants[0]?.totalFollowers || 0;
    const avgFollowers = totalFollowings / totalParticipants;
    
    console.log(`👥 Total participantes seguidos: ${totalParticipants}`);
    console.log(`📊 Total seguimientos: ${totalFollowings}`);
    console.log(`👤 Usuarios únicos: ${uniqueUsers}`);
    console.log(`🔑 Usuarios con tokens: ${usersWithTokens}`);
    console.log(`📈 Máximo seguidores por participante: ${maxFollowers}`);
    console.log(`📊 Promedio seguidores por participante: ${avgFollowers.toFixed(1)}`);
    console.log("");
    
    // 5. Recomendación para pruebas
    const bestTestParticipant = sortedParticipants.find(p => p.followersWithTokens > 1);
    
    if (bestTestParticipant) {
      console.log("🎯 RECOMENDACIÓN PARA PRUEBAS:");
      console.log(`   Usar participante: ${bestTestParticipant.participantId}`);
      console.log(`   Seguidores con tokens: ${bestTestParticipant.followersWithTokens}`);
      console.log(`   Esto permitirá probar notificaciones múltiples`);
    } else {
      console.log("⚠️ LIMITACIÓN ACTUAL:");
      console.log("   Ningún participante tiene más de 1 seguidor con token FCM");
      console.log("   Para probar notificaciones múltiples, necesitas:");
      console.log("   • Más usuarios siguiendo al mismo participante");
      console.log("   • O generar historias para participantes con más seguidores");
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
checkPopularParticipants().catch(console.error);
