// storyNotificationTrigger.mjs
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Trigger que se ejecuta cuando se crea una nueva historia
 * Escucha: races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories/{storyId}
 * Acción: Envía push notifications a usuarios relevantes
 */
export const onStoryCreated = onDocumentCreated(
  "races/{raceId}/apps/{appId}/events/{eventId}/participants/{participantId}/stories/{storyId}",
  async (event) => {
    try {
      console.log("🎬 Nueva historia creada - enviando notificaciones");
      
      // Obtener datos del documento creado
      const storyData = event.data.data();
      const { raceId, appId, eventId, participantId, storyId } = event.params;
      
      console.log(`📖 Historia: ${storyId}`);
      console.log(`🏃 Participante: ${participantId}`);
      console.log(`🏁 Carrera: ${raceId}, App: ${appId}, Evento: ${eventId}`);
      console.log(`📄 Datos de la historia:`, storyData);

      // Obtener información del participante
      const db = admin.firestore();
      const participantRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId);
      
      const participantDoc = await participantRef.get();
      
      if (!participantDoc.exists) {
        console.log("⚠️ Participante no encontrado, saltando notificación");
        return;
      }

      const participantData = participantDoc.data();
      console.log(`👤 Participante: ${participantData.fullName || participantData.name || 'Sin nombre'}`);

      // 1. ENVIAR A TODOS LOS USUARIOS (por ahora)
      await sendNotificationToAllUsers(storyData, participantData, {
        raceId, appId, eventId, participantId, storyId
      });

      // 2. TODO: ENVIAR SOLO A SEGUIDORES (implementar después)
      // await sendNotificationToFollowers(participantId, storyData, participantData, {
      //   raceId, appId, eventId, participantId, storyId
      // });

      console.log("✅ Notificaciones enviadas exitosamente");
      
    } catch (error) {
      console.error("❌ Error en trigger de notificación de historia:", error);
    }
  }
);

/**
 * Enviar notificación a todos los usuarios registrados
 */
async function sendNotificationToAllUsers(storyData, participantData, storyInfo) {
  try {
    console.log("📢 Enviando notificación a todos los usuarios...");
    
    const db = admin.firestore();
    
    // Obtener todos los tokens FCM de usuarios
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .limit(1000) // Limitar para evitar problemas de rendimiento
      .get();

    if (usersSnapshot.empty) {
      console.log("⚠️ No se encontraron usuarios con tokens FCM");
      return;
    }

    const tokens = [];
    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    console.log(`📱 Enviando a ${tokens.length} dispositivos`);

    if (tokens.length === 0) {
      console.log("⚠️ No hay tokens válidos para enviar");
      return;
    }

    // Crear el payload de la notificación
    const notificationPayload = createNotificationPayload(storyData, participantData, storyInfo);

    // Enviar notificación usando FCM
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: notificationPayload.notification,
      data: notificationPayload.data,
      android: notificationPayload.android,
      apns: notificationPayload.apns
    });

    console.log(`✅ Notificaciones enviadas: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

    // Limpiar tokens inválidos
    if (response.failureCount > 0) {
      await cleanupInvalidTokens(response.responses, tokens);
    }

    // Guardar estadísticas
    await saveNotificationStats(storyInfo, {
      totalSent: tokens.length,
      successful: response.successCount,
      failed: response.failureCount,
      type: 'broadcast_all_users'
    });

  } catch (error) {
    console.error("❌ Error enviando notificación a todos los usuarios:", error);
    throw error;
  }
}

/**
 * Crear el payload de la notificación con toda la información de la historia
 */
function createNotificationPayload(storyData, participantData, storyInfo) {
  const participantName = participantData.fullName || participantData.name || 'Atleta';
  const dorsal = participantData.dorsal || 'Sin dorsal';
  
  // Determinar el tipo de evento basado en el tipo de historia
  let eventType = 'pasó por un checkpoint';
  let emoji = '🏃';
  
  if (storyData.type === 'ATHELETE_STARTED') {
    eventType = 'inició la carrera';
    emoji = '🚀';
  } else if (storyData.type === 'ATHELETE_FINISHED') {
    eventType = 'terminó la carrera';
    emoji = '🏁';
  } else if (storyData.type === 'ATHELETE_CROSSED_TIMING_SPLIT') {
    const checkpoint = storyData.split_time?.checkpoint || 'checkpoint';
    eventType = `pasó por ${checkpoint}`;
    emoji = '⏱️';
  }

  const title = `${emoji} ${participantName} (#${dorsal})`;
  const body = `${eventType}${storyData.split_time?.time ? ` - Tiempo: ${storyData.split_time.time}` : ''}`;

  return {
    notification: {
      title: title,
      body: body,
      imageUrl: storyData.image_url || storyData.video_url || null
    },
    data: {
      // Información de la historia (como string para compatibilidad)
      storyId: storyInfo.storyId,
      participantId: storyInfo.participantId,
      raceId: storyInfo.raceId,
      appId: storyInfo.appId,
      eventId: storyInfo.eventId,
      storyType: storyData.type || 'unknown',
      participantName: participantName,
      participantDorsal: dorsal,
      checkpointTime: storyData.split_time?.time || '',
      checkpointName: storyData.split_time?.checkpoint || '',
      mediaUrl: storyData.video_url || storyData.image_url || '',
      mediaType: storyData.video_url ? 'video' : (storyData.image_url ? 'image' : 'none'),
      description: storyData.description || '',
      // Payload completo de la historia como JSON string
      storyPayload: JSON.stringify({
        story: storyData,
        participant: participantData,
        meta: storyInfo
      }),
      // Tipo de notificación
      notificationType: 'story_created',
      timestamp: new Date().toISOString()
    },
    android: {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: '#FF6B35',
        sound: 'default',
        channelId: 'story_notifications',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      }
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: title,
            body: body
          },
          badge: 1,
          sound: 'default',
          category: 'STORY_NOTIFICATION',
          'mutable-content': 1
        }
      },
      fcm_options: {
        image: storyData.image_url || storyData.video_url || null
      }
    }
  };
}

/**
 * Limpiar tokens FCM inválidos
 */
async function cleanupInvalidTokens(responses, tokens) {
  try {
    const db = admin.firestore();
    const invalidTokens = [];

    responses.forEach((response, index) => {
      if (!response.success) {
        const error = response.error;
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      console.log(`🧹 Limpiando ${invalidTokens.length} tokens inválidos`);
      
      // Buscar y limpiar tokens inválidos de la base de datos
      const batch = db.batch();
      
      for (const invalidToken of invalidTokens) {
        const usersWithToken = await db.collection('users')
          .where('fcmToken', '==', invalidToken)
          .get();
          
        usersWithToken.docs.forEach(doc => {
          batch.update(doc.ref, { fcmToken: admin.firestore.FieldValue.delete() });
        });
      }
      
      await batch.commit();
      console.log(`✅ Tokens inválidos limpiados`);
    }
  } catch (error) {
    console.error("❌ Error limpiando tokens inválidos:", error);
  }
}

/**
 * Guardar estadísticas de notificaciones
 */
async function saveNotificationStats(storyInfo, stats) {
  try {
    const db = admin.firestore();
    await db.collection('notification-stats').add({
      ...storyInfo,
      ...stats,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("❌ Error guardando estadísticas:", error);
  }
}

/**
 * TODO: Función para enviar solo a seguidores del participante
 * (implementar cuando se necesite funcionalidad específica)
 */
async function sendNotificationToFollowers(participantId, storyData, participantData, storyInfo) {
  try {
    console.log("👥 Enviando notificación solo a seguidores...");
    
    const db = admin.firestore();
    
    // Buscar usuarios que siguen a este participante
    const followersSnapshot = await db.collectionGroup('followings')
      .where('profileId', '==', participantId)
      .where('profileType', '==', 'participant')
      .get();

    if (followersSnapshot.empty) {
      console.log("⚠️ No se encontraron seguidores para este participante");
      return;
    }

    const followerUserIds = followersSnapshot.docs.map(doc => {
      const path = doc.ref.path;
      return path.split('/')[1]; // Extraer userId de users/{userId}/followings/{followingId}
    });

    console.log(`👥 Encontrados ${followerUserIds.length} seguidores`);

    // Obtener tokens FCM de los seguidores
    const tokens = [];
    for (const userId of followerUserIds) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().fcmToken) {
        tokens.push(userDoc.data().fcmToken);
      }
    }

    if (tokens.length === 0) {
      console.log("⚠️ Ningún seguidor tiene token FCM válido");
      return;
    }

    // Crear payload personalizado para seguidores
    const notificationPayload = createNotificationPayload(storyData, participantData, storyInfo);
    notificationPayload.notification.title = `🔔 ${notificationPayload.notification.title}`;
    notificationPayload.notification.body = `Tu atleta seguido ${notificationPayload.notification.body}`;

    // Enviar notificación
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: notificationPayload.notification,
      data: notificationPayload.data,
      android: notificationPayload.android,
      apns: notificationPayload.apns
    });

    console.log(`✅ Notificaciones a seguidores: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

    // Guardar estadísticas
    await saveNotificationStats(storyInfo, {
      totalSent: tokens.length,
      successful: response.successCount,
      failed: response.failureCount,
      type: 'followers_only',
      followersCount: followerUserIds.length
    });

  } catch (error) {
    console.error("❌ Error enviando notificación a seguidores:", error);
    throw error;
  }
}
