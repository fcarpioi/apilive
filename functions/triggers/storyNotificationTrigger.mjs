// storyNotificationTrigger.mjs
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";

/**
 * Función para normalizar eventId corrupto
 */
function normalizeEventId(eventId) {
  if (typeof eventId !== 'string') return eventId;

  // Corregir encoding UTF-8 corrupto
  const replacements = {
    'Ã³': 'ó',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã­': 'í',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã': 'Á',
    'Ã‰': 'É',
    'Ã': 'Í',
    'Ã"': 'Ó',
    'Ãš': 'Ú',
    'Ã\u0091': 'Ñ'
  };

  let normalized = eventId;
  for (const [corrupted, correct] of Object.entries(replacements)) {
    normalized = normalized.replace(new RegExp(corrupted, 'g'), correct);
  }

  return normalized;
}

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
      let { raceId, appId, eventId, participantId, storyId } = event.params;

      console.log(`📖 Historia: ${storyId}`);
      console.log(`🏃 Participante: ${participantId}`);
      console.log(`🏁 Carrera: ${raceId}, App: ${appId}, Evento: ${eventId}`);
      console.log(`🔤 [TRIGGER] EventID encoding: [${Array.from(eventId).map(c => c.charCodeAt(0)).join(', ')}]`);

      // NORMALIZAR EVENTID CORRUPTO EN EL TRIGGER
      const originalEventId = eventId;
      eventId = normalizeEventId(eventId);

      if (originalEventId !== eventId) {
        console.log(`🔧 [TRIGGER] EventID normalizado: "${originalEventId}" → "${eventId}"`);
      }

      console.log(`📄 Datos de la historia:`, storyData);

      // Obtener información del participante
      // NOTA: participantId en la ruta es el externalId, no el ID del documento
      const db = admin.firestore();

      console.log(`🔍 [TRIGGER] Buscando participante con ID: ${participantId}`);
      console.log(`🔍 [TRIGGER] Ruta: races/${raceId}/apps/${appId}/events/${eventId}/participants`);

      let participantDoc;
      try {
        // Buscar participante directamente por document ID (ahora participantId = externalId = document ID)
        const participantRef = db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants')
          .doc(participantId);

        participantDoc = await participantRef.get();

        console.log(`🔍 [TRIGGER] Búsqueda directa por ID: ${participantId}, existe: ${participantDoc.exists}`);
      } catch (error) {
        console.error(`❌ [TRIGGER] Error en consulta de participante:`, error);
        return;
      }

      if (!participantDoc.exists) {
        console.log(`⚠️ Participante no encontrado con ID: ${participantId}, saltando notificación`);

        // Debug: Listar algunos participantes para verificar la estructura
        const allParticipants = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants')
          .limit(3)
          .get();

        console.log(`🔍 [DEBUG] Total participantes en evento: ${allParticipants.size}`);
        allParticipants.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`🔍 [DEBUG] Participante ${index + 1}: ID=${doc.id}, externalId=${data.externalId}, name=${data.name || data.fullName}`);
        });

        return;
      }

      console.log(`✅ [TRIGGER] Participante encontrado: ${participantDoc.id}`);
      console.log(`✅ [TRIGGER] Datos del participante:`, participantDoc.data());

      const participantData = participantDoc.data();
      console.log(`👤 Participante: ${participantData.fullName || participantData.name || 'Sin nombre'}`);

      // 1. ENVIAR SOLO A SEGUIDORES (implementación activa)
      await sendNotificationToFollowers(participantId, storyData, participantData, {
        raceId, appId, eventId, participantId, storyId
      });

      // 2. ENVIAR A TODOS LOS USUARIOS (deshabilitado para testing de seguidores)
      // await sendNotificationToAllUsers(storyData, participantData, {
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
    
    // ✅ OPTIMIZADO: Obtener todos los tokens FCM de usuarios (fuente única de verdad)
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
  // Buscar el tipo en diferentes ubicaciones posibles
  const storyType = storyData.type || storyData.checkpointInfo?.type || 'unknown';

  let eventType = 'passed through a checkpoint';
  let emoji = '🏃';

  console.log(`🎯 [NOTIFICATION] Detectando tipo de evento: storyType="${storyType}"`);
  console.log(`🎯 [NOTIFICATION] CheckpointInfo disponible:`, storyData.checkpointInfo);

  if (storyType === 'ATHLETE_STARTED') {
    eventType = 'started the race';
    emoji = '🚀';
  } else if (storyType === 'ATHLETE_FINISHED') {
    eventType = 'finished the race';
    emoji = '🏁';
  } else if (storyType === 'ATHLETE_CROSSED_TIMING_SPLIT') {
    const checkpoint = storyData.split_time?.checkpoint || storyData.checkpointInfo?.point || 'checkpoint';
    eventType = `passed through ${checkpoint}`;
    emoji = '⏱️';
  } else {
    // Para checkpoints genéricos, usar el point específico
    const checkpointPoint = storyData.checkpointInfo?.point || storyData.split_time?.checkpoint || 'checkpoint';
    eventType = `passed through ${checkpointPoint}`;
    emoji = '🏃';
  }

  console.log(`🎯 [NOTIFICATION] Tipo detectado: "${storyType}" → eventType="${eventType}", emoji="${emoji}"`);

  const title = `${emoji} ${participantName} (#${dorsal})`;
  const body = `${eventType}${storyData.split_time?.time ? ` - Tiempo: ${storyData.split_time.time}` : ''}`;

  // Validar URL de imagen
  let imageUrl = null;
  const potentialImageUrl = storyData.image_url || storyData.video_url || storyData.fileUrl;
  if (potentialImageUrl && typeof potentialImageUrl === 'string' && potentialImageUrl.startsWith('http')) {
    imageUrl = potentialImageUrl;
  }

  // Construir un meta compacto para no exceder el límite de 4KB de FCM
  const mediaType =
    storyData.video_url || storyData.fileUrl
      ? 'video'
      : (storyData.image_url ? 'image' : 'none');

  const compactMeta = {
    storyId: storyInfo.storyId,
    participantId: storyInfo.participantId,
    raceId: storyInfo.raceId,
    eventId: storyInfo.eventId,
    storyType: storyType,
    checkpoint: storyData.checkpointInfo?.point || storyData.split_time?.checkpoint || '',
    mediaType: mediaType
  };

  return {
    notification: {
      title: title,
      body: body,
      ...(imageUrl && { imageUrl: imageUrl })
    },
    data: {
      // ✅ ESTRUCTURA SOLICITADA POR EL DESARROLLADOR BACKEND
      notificationType: "NEW_STORY",
      storyId: storyInfo.storyId,
      participantId: storyInfo.participantId,
      timestamp: new Date().toISOString(),

      // ✅ INFORMACIÓN ADICIONAL PARA COMPATIBILIDAD Y FUNCIONALIDAD
      raceId: storyInfo.raceId,
      appId: storyInfo.appId,
      eventId: storyInfo.eventId,
      storyType: storyType,
      participantName: participantName,
      participantDorsal: dorsal,
      checkpointTime: storyData.split_time?.time || '',
      checkpointName: storyData.split_time?.checkpoint || '',
      mediaUrl: storyData.video_url || storyData.image_url || storyData.fileUrl || '',
      mediaType: mediaType,
      description: storyData.description || '',

      // Meta compacto (evitar payloads grandes que rompen FCM)
      storyMeta: JSON.stringify(compactMeta)
    },
    android: {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: '#FF6B35',
        sound: 'default',
        channelId: 'story_notifications'
      },
      data: {}
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
      ...(imageUrl && {
        fcm_options: {
          image: imageUrl
        }
      })
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
    console.log(`🔍 [FOLLOWERS] Buscando seguidores para participantId: ${participantId}`);

    const db = admin.firestore();

    // Buscar usuarios que siguen a este participante
    console.log(`🔍 [FOLLOWERS] Ejecutando query: collectionGroup('followings').where('profileId', '==', '${participantId}').where('profileType', '==', 'participant')`);

    const followersSnapshot = await db.collectionGroup('followings')
      .where('profileId', '==', participantId)
      .where('profileType', '==', 'participant')
      .get();

    console.log(`🔍 [FOLLOWERS] Query ejecutada. Documentos encontrados: ${followersSnapshot.size}`);

    if (followersSnapshot.empty) {
      console.log("⚠️ No se encontraron seguidores para este participante");

      // Debug: Mostrar algunos documentos de followings para verificar estructura
      console.log("🔍 [DEBUG] Verificando estructura de followings...");
      const allFollowings = await db.collectionGroup('followings').limit(5).get();
      console.log(`🔍 [DEBUG] Total documentos en followings: ${allFollowings.size}`);
      allFollowings.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`🔍 [DEBUG] Following ${index + 1}: path=${doc.ref.path}, profileId=${data.profileId}, profileType=${data.profileType}`);
      });

      return;
    }

    const followerUserIds = followersSnapshot.docs.map(doc => {
      const path = doc.ref.path;
      const userId = path.split('/')[1]; // Extraer userId de users/{userId}/followings/{followingId}
      console.log(`🔍 [FOLLOWERS] Seguidor encontrado: path=${path}, userId=${userId}`);
      return userId;
    });

    console.log(`👥 Encontrados ${followerUserIds.length} seguidores: [${followerUserIds.join(', ')}]`);

    // ✅ OPTIMIZADO: Obtener tokens FCM de los seguidores (fuente única de verdad)
    const tokens = [];
    const userTokenDetails = [];

    for (const userId of followerUserIds) {
      console.log(`🔍 [TOKENS] Buscando token para usuario: ${userId}`);
      const userDoc = await db.collection('users').doc(userId).get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`🔍 [TOKENS] Usuario ${userId} existe. FCM Token: ${userData.fcmToken ? userData.fcmToken.substring(0, 30) + '...' : 'NO TIENE TOKEN'}`);

        if (userData.fcmToken) {
          tokens.push(userData.fcmToken);
          userTokenDetails.push({
            userId: userId,
            token: userData.fcmToken.substring(0, 30) + '...',
            fullToken: userData.fcmToken
          });
        }
      } else {
        console.log(`❌ [TOKENS] Usuario ${userId} NO EXISTE en colección users`);
      }
    }

    console.log(`📱 [TOKENS] Tokens válidos encontrados: ${tokens.length}`);
    userTokenDetails.forEach((detail, index) => {
      console.log(`📱 [TOKENS] ${index + 1}. Usuario: ${detail.userId}, Token: ${detail.token}`);
    });

    if (tokens.length === 0) {
      console.log("⚠️ Ningún seguidor tiene token FCM válido");
      return;
    }

    // Crear payload personalizado para seguidores
    const notificationPayload = createNotificationPayload(storyData, participantData, storyInfo);
    notificationPayload.notification.title = `🔔 ${notificationPayload.notification.title}`;
    notificationPayload.notification.body = `Your followed athlete ${notificationPayload.notification.body}`;

    console.log(`📤 [FCM] Preparando envío a ${tokens.length} tokens`);
    console.log(`📤 [FCM] Título: ${notificationPayload.notification.title}`);
    console.log(`📤 [FCM] Cuerpo: ${notificationPayload.notification.body}`);
    console.log(`📤 [FCM] Tokens a enviar: [${tokens.map(t => t.substring(0, 30) + '...').join(', ')}]`);
    console.log(`📤 [FCM] PAYLOAD COMPLETO:`, JSON.stringify(notificationPayload, null, 2));

    // Log específico del payload de datos
    console.log(`📊 [FCM] PAYLOAD DATA (lo que recibe la app):`, JSON.stringify(notificationPayload.data, null, 2));

    // Enviar notificación
    console.log(`🚀 [FCM] Ejecutando sendEachForMulticast...`);
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: notificationPayload.notification,
      data: notificationPayload.data,
      android: notificationPayload.android,
      apns: notificationPayload.apns
    });

    console.log(`✅ [FCM] Respuesta recibida: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

    // Log detallado de errores si los hay
    if (response.failureCount > 0) {
      console.log(`❌ [FCM] Errores detallados:`);
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          console.log(`❌ [FCM] Token ${index + 1} (${tokens[index].substring(0, 30)}...): ${resp.error?.code} - ${resp.error?.message}`);
        } else {
          console.log(`✅ [FCM] Token ${index + 1} (${tokens[index].substring(0, 30)}...): ENVIADO EXITOSAMENTE`);
        }
      });
    } else {
      // Log de éxito para todos los tokens
      tokens.forEach((token, index) => {
        console.log(`✅ [FCM] Token ${index + 1} (${token.substring(0, 30)}...): ENVIADO EXITOSAMENTE`);
      });
    }

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
