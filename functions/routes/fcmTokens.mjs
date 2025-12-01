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
    
    // Actualizar o crear el documento del usuario con el token FCM
    // 1. Actualizar información general del usuario (sin raceId específico)
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

    // 2. Crear/actualizar registro específico por carrera en subcollection
    const userRaceTokenRef = db.collection('users').doc(userId)
      .collection('race-tokens').doc(raceId);

    await userRaceTokenRef.set({
      raceId: raceId,
      fcmToken: fcmToken,
      deviceInfo: userUpdateData.deviceInfo || null,
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true
    }, { merge: true });

    // 3. Crear índice global para consultas por carrera (Collection Group)
    const globalRaceTokenRef = db.collection('race-fcm-tokens').doc(`${raceId}_${userId}`);
    await globalRaceTokenRef.set({
      userId: userId,
      raceId: raceId,
      fcmToken: fcmToken,
      deviceInfo: userUpdateData.deviceInfo || null,
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
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

    // 1. Marcar como inactivo en la subcollection del usuario
    const userRaceTokenRef = db.collection('users').doc(userId)
      .collection('race-tokens').doc(raceId);

    await userRaceTokenRef.update({
      isActive: false,
      unregisteredAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Eliminar del índice global
    const globalRaceTokenRef = db.collection('race-fcm-tokens').doc(`${raceId}_${userId}`);
    await globalRaceTokenRef.delete();

    // 3. Verificar si el usuario tiene otras carreras activas
    const userActiveRaces = await db.collection('users').doc(userId)
      .collection('race-tokens')
      .where('isActive', '==', true)
      .get();

    // 4. Si no tiene carreras activas, limpiar token general del usuario
    if (userActiveRaces.empty) {
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
    const { userId, raceId, title, body, data } = req.body;

    const db = admin.firestore();
    let tokens = [];

    if (userId && raceId) {
      // Enviar a un usuario específico en una carrera específica
      const userRaceTokenDoc = await db.collection('users').doc(userId)
        .collection('race-tokens').doc(raceId).get();

      if (userRaceTokenDoc.exists && userRaceTokenDoc.data().isActive && userRaceTokenDoc.data().fcmToken) {
        tokens.push(userRaceTokenDoc.data().fcmToken);
      }
    } else if (userId) {
      // Enviar a un usuario específico (todas sus carreras activas)
      const userRaceTokensSnapshot = await db.collection('users').doc(userId)
        .collection('race-tokens')
        .where('isActive', '==', true)
        .get();

      userRaceTokensSnapshot.docs.forEach(doc => {
        const tokenData = doc.data();
        if (tokenData.fcmToken) {
          tokens.push(tokenData.fcmToken);
        }
      });

      // Si no tiene carreras activas, usar token general
      if (tokens.length === 0) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists && userDoc.data().fcmToken) {
          tokens.push(userDoc.data().fcmToken);
        }
      }
    } else if (raceId) {
      // Enviar a todos los usuarios de una carrera específica (usando índice global)
      const raceTokensSnapshot = await db.collection('race-fcm-tokens')
        .where('raceId', '==', raceId)
        .where('isActive', '==', true)
        .limit(100) // Limitar para pruebas
        .get();

      raceTokensSnapshot.docs.forEach(doc => {
        const tokenData = doc.data();
        if (tokenData.fcmToken) {
          tokens.push(tokenData.fcmToken);
        }
      });
    } else {
      // Enviar a todos los usuarios (usando índice global para mejor performance)
      const allActiveTokensSnapshot = await db.collection('race-fcm-tokens')
        .where('isActive', '==', true)
        .limit(100) // Limitar para pruebas
        .get();

      // Usar Set para evitar duplicados
      const uniqueTokens = new Set();
      allActiveTokensSnapshot.docs.forEach(doc => {
        const tokenData = doc.data();
        if (tokenData.fcmToken) {
          uniqueTokens.add(tokenData.fcmToken);
        }
      });
      tokens = Array.from(uniqueTokens);
    }

    if (tokens.length === 0) {
      return res.status(400).json({
        error: "No se encontraron tokens FCM válidos"
      });
    }

    const message = {
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

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`✅ Notificación push enviada: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

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
