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
 *     summary: Registrar token FCM para un usuario
 *     description: Guarda o actualiza el token FCM de un usuario para recibir push notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - fcmToken
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID único del usuario
 *               fcmToken:
 *                 type: string
 *                 description: Token FCM del dispositivo
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
    const { userId, fcmToken, deviceInfo } = req.body;

    // Validaciones
    if (!userId || !fcmToken) {
      return res.status(400).json({
        error: "userId y fcmToken son requeridos"
      });
    }

    const db = admin.firestore();
    
    // Actualizar o crear el documento del usuario con el token FCM
    const userRef = db.collection('users').doc(userId);
    const updateData = {
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Agregar información del dispositivo si se proporciona
    if (deviceInfo) {
      updateData.deviceInfo = {
        platform: deviceInfo.platform || 'unknown',
        deviceId: deviceInfo.deviceId || null,
        appVersion: deviceInfo.appVersion || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
    }

    await userRef.set(updateData, { merge: true });

    console.log(`✅ Token FCM registrado para usuario: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Token FCM registrado exitosamente",
      userId: userId,
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
 *     summary: Desregistrar token FCM de un usuario
 *     description: Elimina el token FCM de un usuario (útil al cerrar sesión)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID único del usuario
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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: "userId es requerido"
      });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    await userRef.update({
      fcmToken: admin.firestore.FieldValue.delete(),
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Token FCM desregistrado para usuario: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Token FCM desregistrado exitosamente",
      userId: userId,
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
 * /api/fcm/test-notification:
 *   post:
 *     summary: Enviar notificación de prueba
 *     description: Envía una notificación de prueba a un usuario específico o a todos
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
router.post("/test-notification", async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    const db = admin.firestore();
    let tokens = [];

    if (userId) {
      // Enviar a un usuario específico
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().fcmToken) {
        tokens.push(userDoc.data().fcmToken);
      }
    } else {
      // Enviar a todos los usuarios
      const usersSnapshot = await db.collection('users')
        .where('fcmToken', '!=', null)
        .limit(100) // Limitar para pruebas
        .get();

      usersSnapshot.docs.forEach(doc => {
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

    const message = {
      notification: {
        title: title || "🧪 Notificación de Prueba",
        body: body || "Esta es una notificación de prueba del sistema"
      },
      data: {
        notificationType: 'test',
        timestamp: new Date().toISOString(),
        ...(data || {})
      },
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_notification',
          color: '#FF6B35',
          sound: 'default',
          channelId: 'test_notifications'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: title || "🧪 Notificación de Prueba",
              body: body || "Esta es una notificación de prueba del sistema"
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

    console.log(`✅ Notificación de prueba enviada: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

    res.status(200).json({
      success: true,
      message: "Notificación de prueba enviada",
      results: {
        totalSent: tokens.length,
        successful: response.successCount,
        failed: response.failureCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error enviando notificación de prueba:", error);
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
 *     summary: Obtener estadísticas de notificaciones
 *     description: Devuelve estadísticas sobre notificaciones enviadas
 *     responses:
 *       '200':
 *         description: Estadísticas obtenidas exitosamente
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/stats", async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Contar usuarios con tokens FCM
    const usersWithTokens = await db.collection('users')
      .where('fcmToken', '!=', null)
      .count()
      .get();

    // Obtener estadísticas recientes de notificaciones
    const recentStats = await db.collection('notification-stats')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const stats = {
      usersWithFcmTokens: usersWithTokens.data().count,
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
