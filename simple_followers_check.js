#!/usr/bin/env node

/**
 * Script simple para encontrar participantes más seguidos
 */

import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function checkFollowers() {
  console.log("🔍 ANALIZANDO SEGUIDORES POR PARTICIPANTE");
  console.log("=" * 50);
  
  const db = admin.firestore();
  const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
  
  try {
    // Lista de usuarios con tokens que vimos antes
    const usersWithTokens = [
      'cd6091f9-b51d-42d0-99f9-764be28e937a',
      '69fc2de0-edf3-4ace-8545-3efe29012f11', 
      '1b0c0807-67cb-456b-a09f-7cd36f597e77',
      'bebf656d-1937-4fe3-93c9-749b4a60ca0a',
      '4abaddf2-2564-4dca-860d-13450d239001'
    ];
    
    console.log(`👥 Analizando ${usersWithTokens.length} usuarios con tokens FCM`);
    console.log("");
    
    const participantFollowers = {};
    
    // Para cada usuario, ver qué participantes sigue
    for (const userId of usersWithTokens) {
      console.log(`👤 Usuario: ${userId}`);
      
      const followingsQuery = db.collection('users').doc(userId)
        .collection('followings')
        .where('profileType', '==', 'participant');
      
      const followingsSnapshot = await followingsQuery.get();
      
      console.log(`   👥 Sigue a ${followingsSnapshot.size} participantes:`);
      
      followingsSnapshot.docs.forEach(doc => {
        const followData = doc.data();
        const participantId = followData.profileId;
        
        // Solo contar si es del Maratón de Málaga
        if (followData.raceId === raceId) {
          if (!participantFollowers[participantId]) {
            participantFollowers[participantId] = [];
          }
          participantFollowers[participantId].push(userId);
          
          console.log(`      • ${participantId} (${followData.eventId})`);
        }
      });
      
      console.log("");
    }
    
    // Ordenar por número de seguidores
    const sortedParticipants = Object.entries(participantFollowers)
      .map(([participantId, followers]) => ({
        participantId,
        followers: followers,
        count: followers.length
      }))
      .sort((a, b) => b.count - a.count);
    
    console.log("🏆 RANKING DE PARTICIPANTES MÁS SEGUIDOS:");
    console.log("=" * 50);
    
    sortedParticipants.slice(0, 15).forEach((participant, index) => {
      console.log(`${index + 1}. 👤 ${participant.participantId}`);
      console.log(`   👥 Seguidores: ${participant.count}/${usersWithTokens.length}`);
      console.log(`   🔔 Usuarios: ${participant.followers.join(', ')}`);
      console.log("");
    });
    
    // Responder la pregunta específica
    console.log("🎯 RESPUESTA A TU PREGUNTA:");
    console.log("=" * 50);
    
    const followedByAll = sortedParticipants.filter(p => p.count === usersWithTokens.length);
    
    if (followedByAll.length > 0) {
      console.log(`✅ PARTICIPANTES SEGUIDOS POR TODOS (${usersWithTokens.length} usuarios):`);
      followedByAll.forEach(p => {
        console.log(`   • ${p.participantId}`);
      });
    } else {
      console.log(`❌ NINGÚN participante es seguido por TODOS los ${usersWithTokens.length} usuarios`);
      
      const mostFollowed = sortedParticipants[0];
      if (mostFollowed) {
        console.log(`🏆 El MÁS seguido es: ${mostFollowed.participantId}`);
        console.log(`   👥 Seguido por: ${mostFollowed.count}/${usersWithTokens.length} usuarios`);
        console.log(`   🔔 Si generas historia para este participante → ${mostFollowed.count} notificaciones`);
      }
    }
    
    console.log("");
    console.log("💡 PARA PROBAR NOTIFICACIONES MÚLTIPLES:");
    const multiFollowed = sortedParticipants.filter(p => p.count > 1);
    if (multiFollowed.length > 0) {
      console.log("   Usa cualquiera de estos participantes:");
      multiFollowed.slice(0, 5).forEach(p => {
        console.log(`   • ${p.participantId} (${p.count} notificaciones)`);
      });
    } else {
      console.log("   Actualmente solo D21D9C3F tiene seguidores");
      console.log("   Necesitas que más usuarios sigan al mismo participante");
    }
    
  } catch (error) {
    console.error("💥 Error:", error.message);
  }
}

// Ejecutar
checkFollowers().catch(console.error);
