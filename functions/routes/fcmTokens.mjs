// fcmTokens.mjs - Gestión de tokens FCM para push notifications
import express from "express";
import admin from "firebase-admin";

const router = express.Router();

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * @openapi
 * /api/fcm/register-token:
 *   post:
 *     summary: Registrar token FCM para un usuario en una carrera
 *     description: Guarda o actualiza el token FCM de un usuario para recibir push notifications específicas de una carrera
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - fcmToken
 *               - raceId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID único del usuario
 *               fcmToken:
 *                 type: string
 *                 description: Token FCM del dispositivo
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               deviceInfo:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     enum: [android, ios]
 *                   deviceId:
 *                     type: string
 *                   appVersion:
 *                     type: string
 *     responses:
 *       '200':
 *         description: Token registrado exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/register-token", async (req, res) => {
  try {
    const { userId, fcmToken, deviceInfo, raceId } = req.body;

    // Validaciones
    if (!userId || !fcmToken || !raceId) {
      return res.status(400).json({
        error: "userId, fcmToken y raceId son requeridos"
      });
    }

    const db = admin.firestore();
    
    // ✅ ESTRUCTURA OPTIMIZADA - SIN REDUNDANCIA

    // 1. Actualizar información del usuario con token FCM (ÚNICA FUENTE DE VERDAD)
    const userRef = db.collection('users').doc(userId);
    const userUpdateData = {
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Agregar información del dispositivo si se proporciona
    if (deviceInfo) {
      userUpdateData.deviceInfo = {
        platform: deviceInfo.platform || 'unknown',
        deviceId: deviceInfo.deviceId || null,
        appVersion: deviceInfo.appVersion || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
    }

    await userRef.set(userUpdateData, { merge: true });

    // 2. Crear suscripción a carrera (SIN duplicar token ni deviceInfo)
    const userRaceSubscriptionRef = db.collection('users').doc(userId)
      .collection('race-subscriptions').doc(raceId);

    await userRaceSubscriptionRef.set({
      raceId: raceId,
      subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true
    }, { merge: true });

    // 3. Crear índice global para consultas por carrera (SIN duplicar token ni deviceInfo)
    const globalRaceSubscriptionRef = db.collection('race-fcm-tokens').doc(`${raceId}_${userId}`);
    await globalRaceSubscriptionRef.set({
      userId: userId,
      raceId: raceId,
      subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true
    }, { merge: true });

    console.log(`✅ Token FCM registrado para usuario: ${userId} en carrera: ${raceId}`);

    res.status(200).json({
      success: true,
      message: "Token FCM registrado exitosamente",
      userId: userId,
      raceId: raceId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error registrando token FCM:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @openapi
 * /api/fcm/unregister-token:
 *   post:
 *     summary: Desregistrar token FCM de un usuario de una carrera
 *     description: Elimina el token FCM de un usuario para una carrera específica (útil al salir de una carrera)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - raceId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID único del usuario
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *     responses:
 *       '200':
 *         description: Token desregistrado exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/unregister-token", async (req, res) => {
  try {
    const { userId, raceId } = req.body;

    if (!userId || !raceId) {
      return res.status(400).json({
        error: "userId y raceId son requeridos"
      });
    }

    const db = admin.firestore();

    // ✅ ESTRUCTURA OPTIMIZADA - DESREGISTRO SIN REDUNDANCIA

    // 1. Marcar suscripción como inactiva
    const userRaceSubscriptionRef = db.collection('users').doc(userId)
      .collection('race-subscriptions').doc(raceId);

    await userRaceSubscriptionRef.update({
      isActive: false,
      unsubscribedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Eliminar del índice global
    const globalRaceSubscriptionRef = db.collection('race-fcm-tokens').doc(`${raceId}_${userId}`);
    await globalRaceSubscriptionRef.delete();

    // 3. Verificar si el usuario tiene otras carreras activas
    const userActiveSubscriptions = await db.collection('users').doc(userId)
      .collection('race-subscriptions')
      .where('isActive', '==', true)
      .get();

    // 4. Si no tiene carreras activas, limpiar token general del usuario
    if (userActiveSubscriptions.empty) {
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
        fcmToken: admin.firestore.FieldValue.delete(),
        fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ Token FCM desregistrado para usuario: ${userId} en carrera: ${raceId}`);

    res.status(200).json({
      success: true,
      message: "Token FCM desregistrado exitosamente",
      userId: userId,
      raceId: raceId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error desregistrando token FCM:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @openapi
 * /api/fcm/push-notification:
 *   post:
 *     summary: Enviar notificación push con filtros
 *     description: Envía notificaciones push con filtros por usuario y/o carrera. Soporta envío a usuario específico, carrera específica, o broadcast general
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID del usuario (opcional, si no se proporciona envía a todos)
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera (opcional, filtra usuarios por carrera)
 *               title:
 *                 type: string
 *                 description: Título de la notificación
 *               body:
 *                 type: string
 *                 description: Cuerpo de la notificación
 *               data:
 *                 type: object
 *                 description: Datos adicionales
 *               silent:
 *                 type: boolean
 *                 description: Si es true, envía notificación silenciosa (solo datos, sin UI visible)
 *                 default: false
 *     responses:
 *       '200':
 *         description: Notificación enviada exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/push-notification", async (req, res) => {
  try {
    const { userId, raceId, title, body, data, silent } = req.body;

    const db = admin.firestore();
    let tokens = [];

    if (userId && raceId) {
      // ✅ OPTIMIZADO: Enviar a un usuario específico en una carrera específica
      console.log(`🔍 [FCM] Buscando usuario: ${userId} en carrera: ${raceId}`);

      const userDoc = await db.collection('users').doc(userId).get();
      console.log(`👤 [FCM] Usuario existe: ${userDoc.exists}, tiene token: ${userDoc.exists && !!userDoc.data().fcmToken}`);

      if (userDoc.exists && userDoc.data().fcmToken) {
        const userToken = userDoc.data().fcmToken;
        console.log(`🔑 [FCM] Token encontrado: ${userToken.substring(0, 20)}...`);

        // Verificar si está suscrito a la carrera
        const subscriptionDoc = await db.collection('users').doc(userId)
          .collection('race-subscriptions').doc(raceId).get();

        console.log(`📋 [FCM] Suscripción existe: ${subscriptionDoc.exists}`);
        if (subscriptionDoc.exists) {
          const subscriptionData = subscriptionDoc.data();
          console.log(`📊 [FCM] Datos suscripción:`, subscriptionData);
          console.log(`✅ [FCM] isActive: ${subscriptionData.isActive}`);
        }

        // ✅ CORREGIR: Aceptar suscripción si existe, independientemente de isActive
        if (subscriptionDoc.exists) {
          tokens.push(userToken);
          console.log(`✅ [FCM] Token agregado para envío`);
        } else {
          console.log(`❌ [FCM] Usuario no está suscrito a la carrera`);
        }
      } else {
        console.log(`❌ [FCM] Usuario no encontrado o sin token FCM`);
      }
    } else if (userId) {
      // ✅ OPTIMIZADO: Enviar a un usuario específico (solo obtener su token)
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().fcmToken) {
        tokens.push(userDoc.data().fcmToken);
      }
    } else if (raceId) {
      // ✅ OPTIMIZADO: Enviar a todos los usuarios de una carrera específica
      const raceSubscriptionsSnapshot = await db.collection('race-fcm-tokens')
        .where('raceId', '==', raceId)
        .where('isActive', '==', true)
        .limit(100) // Limitar para pruebas
        .get();

      // Obtener tokens de los usuarios suscritos (sin duplicar datos)
      for (const doc of raceSubscriptionsSnapshot.docs) {
        const subscriptionData = doc.data();
        const userDoc = await db.collection('users').doc(subscriptionData.userId).get();

        if (userDoc.exists && userDoc.data().fcmToken) {
          tokens.push(userDoc.data().fcmToken);
        }
      }
    } else {
      // ✅ OPTIMIZADO: Enviar a todos los usuarios con tokens
      const allUsersWithTokensSnapshot = await db.collection('users')
        .where('fcmToken', '!=', null)
        .limit(100) // Limitar para pruebas
        .get();

      allUsersWithTokensSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        if (userData.fcmToken) {
          tokens.push(userData.fcmToken);
        }
      });
    }

    if (tokens.length === 0) {
      return res.status(400).json({
        error: "No se encontraron tokens FCM válidos"
      });
    }

    // 🔕 NOTIFICACIONES SILENCIOSAS: Solo datos, sin UI
    const isSilent = silent === true;

    let message;

    if (isSilent) {
      // 🔕 NOTIFICACIÓN SILENCIOSA (Data-only message)
      console.log(`🔕 [FCM] Preparando notificación SILENCIOSA`);
      message = {
        // ❌ NO incluir 'notification' = no aparece en bandeja
        data: {
          notificationType: 'silent_data_sync',
          silent: 'true',
          timestamp: new Date().toISOString(),
          ...(data || {}),
          // Convertir title/body a data si se proporcionan
          ...(title && { dataTitle: title }),
          ...(body && { dataBody: body })
        },
        android: {
          priority: 'high', // ✅ Mantener prioridad alta para despertar app
          // ❌ NO incluir 'notification' en android
        },
        apns: {
          payload: {
            aps: {
              'content-available': 1, // ✅ iOS: Despertar app en background
              // ❌ NO incluir 'alert', 'badge', 'sound'
            }
          }
        }
      };
    } else {
      // 🔔 NOTIFICACIÓN NORMAL (Con UI visible)
      console.log(`🔔 [FCM] Preparando notificación NORMAL`);
      message = {
        notification: {
          title: title || "🔔 Notificación Push",
          body: body || "Tienes una nueva notificación"
        },
        data: {
          notificationType: 'push',
          timestamp: new Date().toISOString(),
          ...(data || {})
        },
        android: {
          priority: 'high',
          notification: {
            icon: 'ic_notification',
            color: '#FF6B35',
            sound: 'default',
            channelId: 'push_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title || "🔔 Notificación Push",
                body: body || "Tienes una nueva notificación"
              },
              badge: 1,
              sound: 'default'
            }
          }
        }
      };
    }

    console.log(`📤 [FCM] Enviando a ${tokens.length} tokens:`, tokens.map(t => t.substring(0, 20) + '...'));
    console.log(`📋 [FCM] Tipo: ${isSilent ? '🔕 SILENCIOSA' : '🔔 NORMAL'}`);
    console.log(`📋 [FCM] Mensaje:`, JSON.stringify(message, null, 2));

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`✅ [FCM] Notificación push enviada: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

    // ✅ AGREGAR: Log detallado de errores
    if (response.failureCount > 0) {
      console.log(`❌ [FCM] Errores detallados:`);
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          console.log(`❌ [FCM] Token ${index} (${tokens[index].substring(0, 20)}...): ${resp.error?.code} - ${resp.error?.message}`);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Notificación push enviada exitosamente",
      results: {
        totalSent: tokens.length,
        successful: response.successCount,
        failed: response.failureCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error enviando notificación push:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @openapi
 * /api/fcm/stats:
 *   get:
 *     summary: Obtener estadísticas de notificaciones FCM
 *     description: Devuelve estadísticas detalladas sobre notificaciones FCM, incluyendo lista de tokens válidos
 *     responses:
 *       '200':
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     usersWithFcmTokens:
 *                       type: integer
 *                       description: Número total de usuarios con tokens FCM válidos
 *                     validTokens:
 *                       type: array
 *                       description: Lista detallada de tokens FCM válidos
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           fcmToken:
 *                             type: string
 *                           deviceInfo:
 *                             type: object
 *                           fcmTokenUpdatedAt:
 *                             type: string
 *                           lastActiveAt:
 *                             type: string
 *                           platform:
 *                             type: string
 *                     tokensByRace:
 *                       type: object
 *                       description: Tokens FCM agrupados por carrera
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             userId:
 *                               type: string
 *                             fcmToken:
 *                               type: string
 *                             registeredAt:
 *                               type: string
 *                     raceStats:
 *                       type: array
 *                       description: Estadísticas resumidas por carrera
 *                       items:
 *                         type: object
 *                         properties:
 *                           raceId:
 *                             type: string
 *                           tokenCount:
 *                             type: integer
 *                     recentNotifications:
 *                       type: array
 *                       description: Últimas 10 notificaciones enviadas
 *                 timestamp:
 *                   type: string
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/stats", async (req, res) => {
  try {
    const db = admin.firestore();

    // Obtener usuarios con tokens FCM (con detalles)
    const usersWithTokensQuery = await db.collection('users')
      .where('fcmToken', '!=', null)
      .get();

    // Procesar datos de usuarios con tokens
    const validTokens = [];
    usersWithTokensQuery.docs.forEach(doc => {
      const userData = doc.data();
      validTokens.push({
        userId: doc.id,
        fcmToken: userData.fcmToken,
        deviceInfo: userData.deviceInfo || null,
        fcmTokenUpdatedAt: userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString() || null,
        lastActiveAt: userData.lastActiveAt?.toDate?.()?.toISOString() || null,
        platform: userData.deviceInfo?.platform || 'unknown'
      });
    });

    // Obtener tokens activos por carrera (solo activos)
    const raceTokensQuery = await db.collection('race-fcm-tokens')
      .where('isActive', '==', true)
      .get();

    const tokensByRace = {};
    const activeTokensByUser = {};

    raceTokensQuery.docs.forEach(doc => {
      const tokenData = doc.data();

      // Agrupar por carrera
      if (!tokensByRace[tokenData.raceId]) {
        tokensByRace[tokenData.raceId] = [];
      }
      tokensByRace[tokenData.raceId].push({
        userId: tokenData.userId,
        fcmToken: tokenData.fcmToken,
        deviceInfo: tokenData.deviceInfo || null,
        registeredAt: tokenData.registeredAt?.toDate?.()?.toISOString() || null,
        lastActiveAt: tokenData.lastActiveAt?.toDate?.()?.toISOString() || null,
        isActive: tokenData.isActive
      });

      // Contar carreras activas por usuario
      if (!activeTokensByUser[tokenData.userId]) {
        activeTokensByUser[tokenData.userId] = [];
      }
      activeTokensByUser[tokenData.userId].push(tokenData.raceId);
    });

    // Obtener estadísticas recientes de notificaciones
    const recentStats = await db.collection('notification-stats')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const stats = {
      usersWithFcmTokens: validTokens.length,
      validTokens: validTokens,
      activeUsersInRaces: Object.keys(activeTokensByUser).length,
      userRaceParticipation: Object.keys(activeTokensByUser).map(userId => ({
        userId: userId,
        activeRaces: activeTokensByUser[userId],
        raceCount: activeTokensByUser[userId].length
      })),
      tokensByRace: tokensByRace,
      raceStats: Object.keys(tokensByRace).map(raceId => ({
        raceId: raceId,
        activeTokenCount: tokensByRace[raceId].filter(token => token.isActive !== false).length,
        totalTokenCount: tokensByRace[raceId].length
      })),
      recentNotifications: recentStats.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null
      }))
    };

    res.status(200).json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error obteniendo estadísticas FCM:", error);
    res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

export default router;
