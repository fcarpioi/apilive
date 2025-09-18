// apiGeneral.mjs
import express from "express";
//import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
// import monitor from "../monitoring/websocketMonitor.mjs"; // COMENTADO TEMPORALMENTE
//import dotenv from "dotenv";
//dotenv.config();

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}  
//router.use(cors({ origin: true }));
const router = express.Router();

router.use(express.json({ limit: "50mb" }));
router.use(express.urlencoded({ limit: "50mb", extended: true }));

/**
 * @openapi
 * /api/:
 *   get:
 *     summary: Endpoint raíz
 *     description: Devuelve un mensaje de bienvenida.
 *     responses:
 *       '200':
 *         description: Respuesta exitosa.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "¡Express en Firebase Functions!"
 */
router.get("/", (req, res) => {
  res.send("¡Express en Firebase Functions!");
});

/**
 * @openapi
 * /api/sendEmailVerificationCode:
 *   post:
 *     summary: Enviar código de verificación por email
 *     description: Genera un código de 6 dígitos, lo almacena en Firestore y simula el envío de email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *             required:
 *               - email
 *     responses:
 *       '200':
 *         description: Código de verificación enviado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Verification code sent to email."
 *       '400':
 *         description: Email inválido.
 *       '500':
 *         description: Error al enviar el código.
 */
router.post("/sendEmailVerificationCode", async (req, res) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ code: 4001, message: "Invalid email format." });
  }
  try {
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 300000);
    await admin.firestore()
      .collection("emailVerificationCodes")
      .doc(email)
      .set({ verificationCode, expiresAt });
    res.status(200).json({ message: "Verification code sent to email." });
  } catch (error) {
    console.error("Error sending code:", error);
    res.status(500).json({ message: "Error sending the code.", error: error.message });
  }
});

/**
 * @openapi
 * /api/feed:
 *   get:
 *     summary: Obtener el feed de stories
 *     description: Retorna el feed de stories basado en el userId y los participantes seguidos.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario.
 *     responses:
 *       '200':
 *         description: Feed obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *       '400':
 *         description: Falta el parámetro userId.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/feed", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: "Falta el parámetro userId" });
    }
    const db = admin.firestore();
    const followedParticipants = [];
    const followingsSnapshot = await db.collection("users").doc(userId)
      .collection("followings")
      .where("profileType", "==", "participant")
      .get();
    followingsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.profileId) {
        followedParticipants.push(data.profileId);
      }
    });
    const storiesGroup = db.collectionGroup("stories");
    const globalStoriesQuery = storiesGroup
      .where("originType", "==", "automatic_global")
      .where("moderationStatus", "==", "approved");
    const globalStoriesSnapshot = await globalStoriesQuery.get();
    const globalStories = [];
    globalStoriesSnapshot.forEach((doc) => {
      const story = doc.data();
      story.storyId = doc.id;
      globalStories.push(story);
    });
    const followedStories = [];
    if (followedParticipants.length > 0) {
      const batchSize = 10;
      let batchedStories = [];
      for (let i = 0; i < followedParticipants.length; i += batchSize) {
        const batch = followedParticipants.slice(i, i + batchSize);
        const followedStoriesQuery = storiesGroup
          .where("participantId", "in", batch)
          .where("moderationStatus", "==", "approved")
          .where("originType", "in", ["manual", "automatic_follow"]);
        const followedStoriesSnapshot = await followedStoriesQuery.get();
        followedStoriesSnapshot.forEach((doc) => {
          batchedStories.push({
            storyId: doc.id,
            eventId: doc.ref.parent.parent.parent.parent.id,
            participantId: doc.data().participantId,
            ...doc.data(),
          });
        });
      }
      followedStories.push(...batchedStories);
    }
    const allStories = globalStories.concat(followedStories);
    allStories.sort((a, b) => b.date.toMillis() - a.date.toMillis());
    return res.status(200).json({ stories: allStories });
  } catch (error) {
    console.error("Error al obtener el feed:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * @openapi
 * /api/events:
 *   get:
 *     summary: Obtener un evento
 *     description: Retorna la información de un evento basado en raceId y eventId. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *     responses:
 *       '200':
 *         description: Evento obtenido exitosamente.
 *       '400':
 *         description: Falta el parámetro eventId.
 *       '404':
 *         description: Evento no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/events", async (req, res) => {
  try {
    const { raceId, eventId } = req.query;
    if (!raceId || !eventId) {
      return res.status(400).json({ message: "Los parámetros raceId y eventId son obligatorios." });
    }
    const raceIdStr = String(raceId).trim();
    const eventIdStr = String(eventId).trim();

    // Obtener el documento del evento
    const eventDoc = await admin.firestore()
      .collection("races")
      .doc(raceIdStr)
      .collection("events")
      .doc(eventIdStr)
      .get();
    
    if (!eventDoc.exists) {
      return res.status(404).json({ message: "Evento no encontrado." });
    }
    
    const eventData = eventDoc.data();
    
    // Extraer la información del evento según la nueva estructura
    const responseData = {
      id: eventDoc.id,
      ...eventData.event_info,
      config: eventData.config || {}
    };
    
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error al obtener el evento:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/follow:
 *   post:
 *     summary: Registrar seguimiento de un participante
 *     description: Permite que un usuario siga a un participante en un evento. MIGRADO para nueva estructura.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               followerId:
 *                 type: string
 *               followingId:
 *                 type: string
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido)
 *               eventId:
 *                 type: string
 *             required:
 *               - followerId
 *               - followingId
 *               - raceId
 *               - eventId
 *     responses:
 *       '200':
 *         description: Seguimiento registrado correctamente.
 *       '400':
 *         description: Parámetros faltantes o seguimiento ya existente.
 *       '404':
 *         description: Participante no existe en el evento.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/follow", async (req, res) => {
  try {
    const { followerId, followingId, raceId, eventId } = req.body;
    if (!followerId || !followingId || !raceId || !eventId) {
      return res.status(400).json({
        message: "followerId, followingId, raceId y eventId son obligatorios.",
      });
    }
    const db = admin.firestore();
    const participantRef = db.collection("races").doc(raceId).collection("events").doc(eventId).collection("participants").doc(followingId);
    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({ message: "El participante no existe en este evento." });
    }
    const followingsRef = db.collection("users").doc(followerId).collection("followings").doc(followingId);
    const followersRef = participantRef.collection("followers").doc(followerId);
    const alreadyFollowing = await followingsRef.get();
    if (alreadyFollowing.exists) {
      return res.status(400).json({ message: "Ya sigues a este participante." });
    }
    await followingsRef.set({
      profileType: "participant",
      profileId: followingId,
      raceId: raceId,
      eventId: eventId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    await followersRef.set({
      profileType: "user",
      profileId: followerId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({
      message: "Seguimiento registrado correctamente.",
      followerId,
      followingId,
      raceId,
      eventId,
    });
  } catch (error) {
    console.error("Error al seguir participante:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/unfollow:
 *   post:
 *     summary: Dejar de seguir a un participante
 *     description: Permite que un usuario deje de seguir a un participante en un evento. MIGRADO para nueva estructura.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               followerId:
 *                 type: string
 *               followingId:
 *                 type: string
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido)
 *               eventId:
 *                 type: string
 *             required:
 *               - followerId
 *               - followingId
 *               - raceId
 *               - eventId
 *     responses:
 *       '200':
 *         description: Seguimiento eliminado correctamente.
 *       '400':
 *         description: Parámetros faltantes o no se está siguiendo al participante.
 *       '404':
 *         description: Participante no existe en el evento.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/unfollow", async (req, res) => {
  try {
    const { followerId, followingId, raceId, eventId } = req.body;
    if (!followerId || !followingId || !raceId || !eventId) {
      return res.status(400).json({
        message: "followerId, followingId, raceId y eventId son obligatorios.",
      });
    }

    const db = admin.firestore();

    // Verificar que el participante existe en el evento
    const participantRef = db.collection("races").doc(raceId).collection("events").doc(eventId).collection("participants").doc(followingId);
    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({ message: "El participante no existe en este evento." });
    }

    // Referencias a los documentos de seguimiento
    const followingsRef = db.collection("users").doc(followerId).collection("followings").doc(followingId);
    const followersRef = participantRef.collection("followers").doc(followerId);

    // Verificar que se está siguiendo al participante
    const currentlyFollowing = await followingsRef.get();
    if (!currentlyFollowing.exists) {
      return res.status(400).json({ message: "No estás siguiendo a este participante." });
    }

    // Eliminar el seguimiento de ambas colecciones
    await followingsRef.delete();
    await followersRef.delete();

    return res.status(200).json({
      message: "Seguimiento eliminado correctamente.",
      followerId,
      followingId,
      raceId,
      eventId,
    });
  } catch (error) {
    console.error("Error al dejar de seguir participante:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/like:
 *   post:
 *     summary: Dar like a una historia
 *     description: Agrega un like a una historia de un participante en un evento. MIGRADO para nueva estructura.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido)
 *               eventId:
 *                 type: string
 *               participantId:
 *                 type: string
 *               storyId:
 *                 type: string
 *               userId:
 *                 type: string
 *             required:
 *               - raceId
 *               - eventId
 *               - participantId
 *               - storyId
 *               - userId
 *     responses:
 *       '200':
 *         description: Like agregado correctamente.
 *       '400':
 *         description: Parámetros faltantes.
 *       '404':
 *         description: La historia no existe.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/like", async (req, res) => {
  try {
    const { raceId, eventId, participantId, storyId, userId } = req.body;
    if (!raceId || !eventId || !participantId || !storyId || !userId) {
      return res.status(400).json({
        message: "raceId, eventId, participantId, storyId y userId son obligatorios.",
      });
    }
    const db = admin.firestore();
    const storyRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      return res.status(404).json({ message: "La historia no existe." });
    }
    const likeRef = storyRef.collection("likes").doc();
    await likeRef.set({
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({
      message: "Like agregado correctamente.",
      likeId: likeRef.id,
      userId,
      raceId,
      eventId,
      participantId,
      storyId,
    });
  } catch (error) {
    console.error("Error al agregar like:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/likes/count:
 *   get:
 *     summary: Contar likes de un participante
 *     description: Retorna el total de likes de un participante en un evento. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *       - in: query
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del participante.
 *     responses:
 *       '200':
 *         description: Total de likes obtenido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 participantId:
 *                   type: string
 *                 eventId:
 *                   type: string
 *                 totalLikes:
 *                   type: integer
 *                   example: 10
 *       '400':
 *         description: Parámetros faltantes.
 *       '404':
 *         description: Participante no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/likes/count", async (req, res) => {
  try {
    const { raceId, eventId, participantId } = req.query;
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, eventId y participantId son obligatorios.",
      });
    }
    const db = admin.firestore();
    const participantRef = db.collection("races").doc(raceId).collection("events").doc(eventId).collection("participants").doc(participantId);
    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({ message: "El participante no existe en este evento." });
    }
    let totalLikes = 0;
    const storiesSnapshot = await participantRef.collection("stories").get();
    if (storiesSnapshot.empty) {
      return res.status(200).json({ raceId, participantId, eventId, totalLikes: 0 });
    }
    const likeCounts = await Promise.all(
      storiesSnapshot.docs.map(async (storyDoc) => {
        const likesSnapshot = await storyDoc.ref.collection("likes").get();
        return likesSnapshot.size;
      })
    );
    totalLikes = likeCounts.reduce((sum, count) => sum + count, 0);
    return res.status(200).json({ raceId, participantId, eventId, totalLikes });
  } catch (error) {
    console.error("Error al contar los likes:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/participant:
 *   get:
 *     summary: Obtener información de un participante
 *     description: Retorna los datos de un participante en un evento. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *       - in: query
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del participante.
 *     responses:
 *       '200':
 *         description: Participante obtenido exitosamente.
 *       '400':
 *         description: Parámetros faltantes.
 *       '404':
 *         description: Participante no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/participant", async (req, res) => {
  try {
    const { raceId, eventId, participantId } = req.query;
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, eventId y participantId son obligatorios.",
      });
    }
    const db = admin.firestore();
    const participantRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId);
    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({ message: "El participante no existe en este evento." });
    }
    return res.status(200).json({
      id: participantDoc.id,
      ...participantDoc.data(),
    });
  } catch (error) {
    console.error("Error al obtener el participante:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/user/profile:
 *   get:
 *     summary: Obtener el perfil del usuario
 *     description: Retorna el perfil del usuario identificado por userId.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario.
 *     responses:
 *       '200':
 *         description: Perfil obtenido exitosamente.
 *       '400':
 *         description: Falta el parámetro userId.
 *       '404':
 *         description: Usuario no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/user/profile", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({
        message: "userId es obligatorio.",
      });
    }
    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: "El usuario no existe." });
    }
    return res.status(200).json({
      id: userDoc.id,
      ...userDoc.data(),
    });
  } catch (error) {
    console.error("Error al obtener el perfil del usuario:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/feed/extended:
 *   get:
 *     summary: Obtener el feed extendido (ULTRA-OPTIMIZADO)
 *     description: Retorna el feed con historias, participantes y likes. Soporta userId para seguidos y storyId para historia específica. MIGRADO con Collection Group Queries ultra-rápidas.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento (NUEVO - requerido).
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Identificador del usuario para incluir historias de participantes seguidos.
 *       - in: query
 *         name: storyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Identificador de una historia específica. Si se proporciona, retorna solo esa historia.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Número máximo de historias a retornar. Optimizado para móvil (default 20, máximo 100).
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Número de historias a omitir para paginación (0 = primera página).
 *     responses:
 *       '200':
 *         description: Feed extendido obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       '400':
 *         description: Parámetros faltantes o inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/feed/extended", async (req, res) => {
  try {
    const { userId, storyId, raceId, eventId, limit = 20, offset = 0 } = req.query;
    if (!raceId || !eventId) {
      return res.status(400).json({ error: "Faltan los parámetros raceId y eventId" });
    }

    const db = admin.firestore();
    const startTime = Date.now();

    // CASO ESPECIAL: Si viene storyId, retornar solo esa historia
    if (storyId) {
      console.log(`[PERF] Obteniendo historia específica: ${storyId}`);

      try {
        // Buscar la historia específica usando Collection Group con índice correcto
        console.log(`[PERF] Buscando historia específica con índice ACTUALIZADO: raceId + eventId + moderationStatus`);

        // Usar EXACTAMENTE la misma consulta que el feed completo (que sabemos que funciona)
        const storyQuery = db.collectionGroup('stories')
          .where('raceId', '==', raceId)
          .where('eventId', '==', eventId)
          .where('originType', '==', 'automatic_global')
          .where('moderationStatus', '==', 'approved')
          .orderBy('date', 'desc')
          .limit(1000); // Límite alto para asegurar que encontramos la historia

        const storySnapshot = await storyQuery.get();
        let targetStory = null;

        console.log(`[PERF] Buscando storyId ${storyId} en ${storySnapshot.size} historias aprobadas`);

        // Log de las primeras historias para debug
        let foundStoryIds = [];
        let foundTargetStory = false;
        storySnapshot.forEach((doc, index) => {
          if (index < 10) { // Solo las primeras 10 para debug
            foundStoryIds.push(doc.id);
          }
          if (doc.id === storyId) {
            foundTargetStory = true;
          }
        });
        console.log(`[DEBUG] Primeras 10 historias: ${foundStoryIds.join(', ')}`);
        console.log(`[DEBUG] ¿Historia ${storyId} encontrada en los resultados? ${foundTargetStory}`);

        // Encontrar la historia específica (ya filtrada por la consulta)
        storySnapshot.forEach(doc => {
          if (doc.id === storyId) {
            const data = doc.data();
            const pathParts = doc.ref.path.split('/');
            const participantId = pathParts[5];

            targetStory = {
              storyId: doc.id,
              raceId,
              eventId,
              participantId,
              ...data
            };
            console.log(`[PERF] Historia encontrada: ${storyId}`);
          }
        });

        if (!targetStory) {
          return res.status(404).json({
            error: "Historia no encontrada",
            storyId,
            raceId,
            eventId
          });
        }

        // Enriquecer la historia con datos del participante y likes
        const { participantId } = targetStory;
        const participantRef = db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId);

        const [participantDoc, likesSnapshot] = await Promise.all([
          participantRef.get(),
          participantRef.collection("stories").doc(storyId).collection("likes").get()
        ]);

        const participantData = participantDoc.exists ? participantDoc.data() : null;
        const totalLikes = likesSnapshot.size;

        const enrichedStory = {
          ...targetStory,
          participant: participantData,
          totalLikes
        };

        console.log(`[PERF] Historia específica obtenida en ${Date.now() - startTime}ms`);

        return res.status(200).json({
          stories: [enrichedStory],
          pagination: {
            limit: 1,
            offset: 0,
            total: 1,
            hasMore: false,
            currentPage: 1,
            totalPages: 1
          },
          performance: {
            totalTime: Date.now() - startTime,
            queriesExecuted: 1,
            storiesProcessed: 1,
            mode: "single_story"
          }
        });

      } catch (error) {
        console.error("Error obteniendo historia específica:", error);
        return res.status(500).json({
          error: "Error al obtener la historia específica",
          details: error.message
        });
      }
    }

    // CASO NORMAL: Feed completo con paginación
    console.log(`[PERF] Iniciando feed extended - limit:${limit}, offset:${offset}`);

    // Validar parámetros de paginación (ULTRA-OPTIMIZADO)
    const limitNum = Math.min(parseInt(limit) || 20, 50); // Máximo reducido a 50
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    // ESTRATEGIA ULTRA-OPTIMIZADA: Collection Group Queries con seguidos opcionales
    // Ahora que agregamos el campo raceId, esto funcionará perfectamente

    let step1Time = Date.now();

    // 1. Obtener participantes seguidos (si hay userId)
    let followedParticipants = [];
    if (userId) {
      try {
        const followingsSnapshot = await db.collection("users").doc(userId)
          .collection("followings")
          .where("profileType", "==", "participant")
          .limit(50) // Límite razonable
          .get();
        followingsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.profileId) {
            followedParticipants.push(data.profileId);
          }
        });
      } catch (error) {
        console.error("Error getting followings:", error);
      }
    }

    console.log(`[PERF] Step 1 (followings): ${Date.now() - step1Time}ms - ${followedParticipants.length} found`);
    let step2Time = Date.now();

    // 2. Collection Group Queries (MUY RÁPIDO)
    const queries = [];

    // ✅ CORREGIDO: Query separada para contar el total real
    const totalCountQuery = db.collectionGroup('stories')
      .where('raceId', '==', raceId)
      .where('eventId', '==', eventId)
      .where('originType', '==', 'automatic_global')
      .where('moderationStatus', '==', 'approved')
      .count();

    // Query 1: Historias globales (solo las necesarias para paginación)
    const globalQuery = db.collectionGroup('stories')
      .where('raceId', '==', raceId)
      .where('eventId', '==', eventId)
      .where('originType', '==', 'automatic_global')
      .where('moderationStatus', '==', 'approved')
      .orderBy('date', 'desc')
      .limit(limitNum + offsetNum + 50); // Buffer para paginación

    queries.push(globalQuery.get());
    queries.push(totalCountQuery.get()); // Agregar query de conteo

    // Query 2: Historias de seguidos (solo si hay seguidos)
    if (followedParticipants.length > 0) {
      // Dividir en lotes de 10 para el operador 'in'
      const batchSize = 10;
      for (let i = 0; i < followedParticipants.length; i += batchSize) {
        const batch = followedParticipants.slice(i, i + batchSize);
        const followedQuery = db.collectionGroup('stories')
          .where('raceId', '==', raceId)
          .where('eventId', '==', eventId)
          .where('participantId', 'in', batch)
          .where('originType', 'in', ['manual', 'automatic_follow'])
          .where('moderationStatus', '==', 'approved')
          .orderBy('date', 'desc')
          .limit(limitNum);

        queries.push(followedQuery.get());
      }
    }

    // 3. Ejecutar todas las consultas en paralelo (SÚPER RÁPIDO)
    const queryResults = await Promise.all(queries);

    console.log(`[PERF] Step 2 (queries): ${Date.now() - step2Time}ms - ${queries.length} queries executed`);
    let step3Time = Date.now();

    // ✅ CORREGIDO: Extraer el conteo real del total (último resultado)
    const totalCountResult = queryResults.pop(); // El último resultado es el conteo
    const realTotalStories = totalCountResult.data().count;

    // 2. Procesar resultados y deduplicar (solo los snapshots de historias)
    const storyMap = new Map();

    queryResults.forEach(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const storyId = doc.id;

        // Extraer IDs del path del documento
        const pathParts = doc.ref.path.split('/');
        const participantId = pathParts[5];

        storyMap.set(storyId, {
          storyId,
          raceId,
          eventId,
          participantId,
          ...data
        });
      });
    });

    // 3. Convertir a array, ordenar y paginar
    let allStories = Array.from(storyMap.values());
    allStories.sort((a, b) => b.date.toMillis() - a.date.toMillis());

    // ✅ CORREGIDO: Usar el conteo real en lugar del tamaño limitado
    const paginatedStories = allStories.slice(offsetNum, offsetNum + limitNum);

    console.log(`[PERF] Step 3 (processing): ${Date.now() - step3Time}ms`);
    let step4Time = Date.now();

    // 6. Enriquecimiento ULTRA-OPTIMIZADO (solo para historias paginadas)
    const enrichedStories = await Promise.all(
      paginatedStories.map(async (story) => {
        try {
          const { participantId } = story;

          const participantRef = db.collection("races").doc(raceId)
            .collection("events").doc(eventId)
            .collection("participants").doc(participantId);

          // OPTIMIZACIÓN: Solo obtener participante, omitir likes si es muy lento
          const participantDoc = await participantRef.get();
          const participantData = participantDoc.exists ? participantDoc.data() : null;

          // TEMPORAL: Omitir conteo de likes para máxima velocidad
          // TODO: Pre-computar likes en un campo del documento
          const totalLikes = 0;

          return { ...story, participant: participantData, totalLikes };
        } catch (err) {
          console.error(`Error enriching story ${story.storyId}:`, err);
          return { ...story, participant: null, totalLikes: 0 };
        }
      })
    );

    console.log(`[PERF] Step 4 (enrichment): ${Date.now() - step4Time}ms`);
    console.log(`[PERF] TOTAL TIME: ${Date.now() - startTime}ms`);

    // 7. Respuesta optimizada con conteo real
    return res.status(200).json({
      stories: enrichedStories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: realTotalStories, // ✅ CORREGIDO: Usar conteo real
        hasMore: offsetNum + limitNum < realTotalStories,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(realTotalStories / limitNum)
      },
      performance: {
        totalTime: Date.now() - startTime,
        queriesExecuted: queries.length,
        storiesProcessed: allStories.length // Historias realmente procesadas
      }
    });

  } catch (error) {
    console.error("Error al obtener el feed extendido:", error);
    return res.status(500).json({ error: "Error interno del servidor", details: error.message });
  }
});

/**
 * @openapi
 * /api/apps/feed/extended:
 *   get:
 *     summary: Feed extendido de historias para estructura con Apps
 *     description: Retorna historias de participantes con información completa, adaptado para la nueva estructura /apps/{appId}/races/{raceId}/events/{eventId}/participants/{participantId}/stories. Incluye paginación optimizada y búsqueda por historia específica.
 *     parameters:
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la aplicación (NUEVO - requerido).
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera.
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID del usuario para personalización.
 *       - in: query
 *         name: storyId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID específico de historia para retornar solo esa historia.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Número máximo de historias por página.
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de historias a omitir para paginación.
 *     responses:
 *       '200':
 *         description: Feed de historias obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       storyId:
 *                         type: string
 *                       appId:
 *                         type: string
 *                       raceId:
 *                         type: string
 *                       eventId:
 *                         type: string
 *                       participantId:
 *                         type: string
 *                       participant:
 *                         type: object
 *                       totalLikes:
 *                         type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 performance:
 *                   type: object
 *       '400':
 *         description: Parámetros faltantes o inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/apps/feed/extended", async (req, res) => {
  try {
    const { userId: _userId, storyId, appId, raceId, eventId, limit = 20, offset = 0 } = req.query;
    if (!appId || !raceId || !eventId) {
      return res.status(400).json({ error: "Faltan los parámetros appId, raceId y eventId" });
    }

    const db = admin.firestore();
    const startTime = Date.now();

    // CASO ESPECIAL: Si viene storyId, retornar solo esa historia
    if (storyId) {
      console.log(`[PERF] Obteniendo historia específica: ${storyId} en app: ${appId}`);

      try {
        // Buscar la historia específica en la estructura de apps
        console.log(`[PERF] Buscando historia específica en estructura /apps/${appId}/races/${raceId}/events/${eventId}`);

        const storyQuery = db.collection('apps').doc(appId)
          .collection('races').doc(raceId)
          .collection('events').doc(eventId)
          .collection('participants')
          .where('stories', 'array-contains', storyId)
          .limit(1);

        const participantsSnapshot = await storyQuery.get();

        if (participantsSnapshot.empty) {
          console.log(`❌ Historia ${storyId} no encontrada en app ${appId}`);
          return res.status(404).json({
            error: "Historia no encontrada",
            storyId,
            appId,
            raceId,
            eventId
          });
        }

        // Obtener la historia específica
        const participantDoc = participantsSnapshot.docs[0];
        const participantId = participantDoc.id;

        const storyDoc = await db.collection('apps').doc(appId)
          .collection('races').doc(raceId)
          .collection('events').doc(eventId)
          .collection('participants').doc(participantId)
          .collection('stories').doc(storyId).get();

        if (!storyDoc.exists) {
          return res.status(404).json({
            error: "Historia no encontrada",
            storyId,
            appId,
            raceId,
            eventId,
            participantId
          });
        }

        const storyData = storyDoc.data();
        const participantData = participantDoc.data();

        const enrichedStory = {
          storyId: storyDoc.id,
          appId,
          raceId,
          eventId,
          participantId,
          ...storyData,
          participant: participantData,
          totalLikes: 0 // TODO: Implementar conteo de likes
        };

        console.log(`✅ Historia específica encontrada en ${Date.now() - startTime}ms`);

        return res.status(200).json({
          stories: [enrichedStory],
          pagination: {
            limit: 1,
            offset: 0,
            total: 1,
            hasMore: false,
            currentPage: 1,
            totalPages: 1
          },
          performance: {
            totalTime: Date.now() - startTime,
            queriesExecuted: 2,
            storiesProcessed: 1
          }
        });

      } catch (error) {
        console.error(`❌ Error buscando historia específica ${storyId}:`, error);
        return res.status(500).json({
          error: "Error buscando historia específica",
          details: error.message
        });
      }
    }

    // FLUJO NORMAL: Feed completo con paginación
    console.log(`[PERF] Iniciando feed extendido para app: ${appId}, race: ${raceId}, event: ${eventId}`);

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    let step2Time = Date.now();

    // 1. Obtener todos los participantes del evento en la app
    const participantsSnapshot = await db.collection('apps').doc(appId)
      .collection('races').doc(raceId)
      .collection('events').doc(eventId)
      .collection('participants').get();

    if (participantsSnapshot.empty) {
      console.log("📭 No se encontraron participantes en la app");
      return res.status(200).json({
        stories: [],
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: 0,
          hasMore: false,
          currentPage: 1,
          totalPages: 0
        },
        performance: {
          totalTime: Date.now() - startTime,
          queriesExecuted: 1,
          storiesProcessed: 0
        }
      });
    }

    console.log(`📱 Encontrados ${participantsSnapshot.size} participantes en app ${appId}`);

    // 2. Obtener todas las stories de todos los participantes
    const allStoriesPromises = participantsSnapshot.docs.map(async (participantDoc) => {
      const participantId = participantDoc.id;
      const participantData = participantDoc.data();

      const storiesSnapshot = await db.collection('apps').doc(appId)
        .collection('races').doc(raceId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories')
        .where('moderationStatus', '==', 'approved')
        .where('originType', '==', 'automatic_global')
        .orderBy('date', 'desc')
        .get();

      return storiesSnapshot.docs.map(storyDoc => ({
        storyId: storyDoc.id,
        appId,
        raceId,
        eventId,
        participantId,
        participant: participantData,
        ...storyDoc.data()
      }));
    });

    const allStoriesArrays = await Promise.all(allStoriesPromises);
    const allStories = allStoriesArrays.flat();

    console.log(`[PERF] Step 2 (queries): ${Date.now() - step2Time}ms - ${participantsSnapshot.size} participantes procesados`);
    let step3Time = Date.now();

    // 3. Ordenar todas las stories por fecha
    allStories.sort((a, b) => b.date.toMillis() - a.date.toMillis());

    // 4. Aplicar paginación
    const totalStories = allStories.length;
    const paginatedStories = allStories.slice(offsetNum, offsetNum + limitNum);

    console.log(`[PERF] Step 3 (processing): ${Date.now() - step3Time}ms`);
    let step4Time = Date.now();

    // 5. Enriquecer con likes (temporal: 0)
    const enrichedStories = paginatedStories.map(story => ({
      ...story,
      totalLikes: 0 // TODO: Implementar conteo real de likes
    }));

    console.log(`[PERF] Step 4 (enrichment): ${Date.now() - step4Time}ms`);
    console.log(`[PERF] TOTAL TIME: ${Date.now() - startTime}ms`);

    // 6. Respuesta optimizada
    return res.status(200).json({
      stories: enrichedStories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalStories,
        hasMore: offsetNum + limitNum < totalStories,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(totalStories / limitNum)
      },
      performance: {
        totalTime: Date.now() - startTime,
        queriesExecuted: participantsSnapshot.size + 1,
        storiesProcessed: totalStories
      }
    });

  } catch (error) {
    console.error("Error al obtener el feed extendido de apps:", error);
    return res.status(500).json({ error: "Error interno del servidor", details: error.message });
  }
});

/**
 * @openapi
 * /api/participants/followers/count:
 *   get:
 *     summary: Contar seguidores de un participante
 *     description: Retorna el número de seguidores de un participante en un evento. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *       - in: query
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del participante.
 *     responses:
 *       '200':
 *         description: Número de seguidores obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eventId:
 *                   type: string
 *                 participantId:
 *                   type: string
 *                 followersCount:
 *                   type: integer
 *       '400':
 *         description: Parámetros faltantes.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/participants/followers/count", async (req, res) => {
  try {
    const { raceId, eventId, participantId } = req.query;
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        error: "Los parámetros raceId, eventId y participantId son obligatorios.",
      });
    }
    const db = admin.firestore();
    const followersRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("followers");
    const followersSnapshot = await followersRef.get();
    const followersCount = followersSnapshot.size;
    return res.status(200).json({ raceId, eventId, participantId, followersCount });
  } catch (error) {
    console.error("Error al contar seguidores:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * @openapi
 * /api/users/following/count:
 *   get:
 *     summary: Contar participantes seguidos por un usuario
 *     description: Retorna el número de participantes que un usuario sigue.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario.
 *     responses:
 *       '200':
 *         description: Número de participantes seguidos obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 followingCount:
 *                   type: integer
 *       '400':
 *         description: Falta el parámetro userId.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/users/following/count", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({
        error: "El parámetro userId es obligatorio.",
      });
    }
    const db = admin.firestore();
    const followingsRef = db.collection("users").doc(userId)
      .collection("followings")
      .where("profileType", "==", "participant");
    const followingsSnapshot = await followingsRef.get();
    const followingCount = followingsSnapshot.size;
    return res.status(200).json({ userId, followingCount });
  } catch (error) {
    console.error("Error al contar los participantes seguidos:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * @openapi
 * /api/users/following:
 *   get:
 *     summary: Listar participantes seguidos por un usuario
 *     description: Retorna la lista completa de participantes que sigue un usuario con información detallada.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario.
 *     responses:
 *       '200':
 *         description: Lista de participantes seguidos obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 followingCount:
 *                   type: integer
 *                 participants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       participantId:
 *                         type: string
 *                       raceId:
 *                         type: string
 *                         description: Identificador de la carrera
 *                       eventId:
 *                         type: string
 *                       followedAt:
 *                         type: string
 *                         format: date-time
 *                       participant:
 *                         type: object
 *       '400':
 *         description: Falta el parámetro userId.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/users/following", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({
        error: "El parámetro userId es obligatorio.",
      });
    }

    const db = admin.firestore();

    // Obtener la lista de participantes seguidos
    const followingsSnapshot = await db.collection("users").doc(userId)
      .collection("followings")
      .where("profileType", "==", "participant")
      .orderBy("timestamp", "desc")
      .get();

    if (followingsSnapshot.empty) {
      return res.status(200).json({
        userId,
        followingCount: 0,
        participants: []
      });
    }

    // Obtener información detallada de cada participante seguido
    const participantsWithDetails = await Promise.all(
      followingsSnapshot.docs.map(async (followingDoc) => {
        try {
          const followingData = followingDoc.data();
          const { profileId: participantId, raceId, eventId, timestamp } = followingData;

          // Obtener datos del participante desde el evento
          const participantRef = db.collection("races").doc(raceId)
            .collection("events").doc(eventId)
            .collection("participants").doc(participantId);
          const participantDoc = await participantRef.get();

          const participantData = participantDoc.exists ? {
            id: participantDoc.id,
            ...participantDoc.data()
          } : null;

          return {
            participantId,
            raceId,
            eventId,
            followedAt: timestamp,
            participant: participantData
          };
        } catch (error) {
          console.error(`Error al obtener datos del participante ${followingDoc.id}:`, error);
          return {
            participantId: followingDoc.id,
            raceId: followingDoc.data().raceId || null,
            eventId: followingDoc.data().eventId || null,
            followedAt: followingDoc.data().timestamp || null,
            participant: null
          };
        }
      })
    );

    return res.status(200).json({
      userId,
      followingCount: participantsWithDetails.length,
      participants: participantsWithDetails
    });
  } catch (error) {
    console.error("Error al obtener participantes seguidos:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * @openapi
 * /api/search/participants:
 *   get:
 *     summary: Buscar participantes
 *     description: Realiza una búsqueda de participantes utilizando Algolia.
 *     parameters:
 *       - in: query
 *         name: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Término de búsqueda. Si no se proporciona, retorna todos los participantes.
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID del usuario para verificar seguimientos.
 *       - in: query
 *         name: raceId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID de la carrera para filtrar seguimientos específicos.
 *       - in: query
 *         name: eventId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID del evento para filtrar seguimientos específicos.
 *     responses:
 *       '200':
 *         description: Búsqueda realizada exitosamente.
 *       '500':
 *         description: Error en la búsqueda.
 */
const ALGOLIA_SEARCH_API_URL = "https://HJFHEZN5GF-dsn.algolia.net/1/indexes/participants/query";
const ALGOLIA_API_KEY = "6bd7310e673b3bc59be6ae0c4c6614a2";

router.get("/search/participants", async (req, res) => {
  try {
    const { query, userId, raceId, eventId } = req.query;

    // Si no hay query o está vacío, usar comillas vacías para obtener todos los datos
    const searchQuery = (!query || query.trim() === "") ? "" : query;

    // Realizar la búsqueda en Algolia
    const response = await fetch(ALGOLIA_SEARCH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": "HJFHEZN5GF",
        "X-Algolia-API-Key": ALGOLIA_API_KEY,
      },
      body: JSON.stringify({ query: searchQuery }),
    });

    if (!response.ok) {
      throw new Error(`Error en la búsqueda: ${response.statusText}`);
    }

    const result = await response.json();

    // Crear un mapa de participantes seguidos para comparación eficiente
    const followedParticipantsMap = new Map();

    if (userId) {
      try {
        // Obtener todos los seguimientos del usuario
        let followingsQuery = admin.firestore()
          .collection("users")
          .doc(userId)
          .collection("followings")
          .where("profileType", "==", "participant");

        // Si se especifica raceId y eventId, filtrar por ellos
        if (raceId && eventId) {
          followingsQuery = followingsQuery
            .where("raceId", "==", raceId)
            .where("eventId", "==", eventId);
        }

        const followingsSnapshot = await followingsQuery.get();

        followingsSnapshot.forEach(doc => {
          const data = doc.data();
          const { profileId, raceId: followedRaceId, eventId: followedEventId } = data;

          if (profileId) {
            // Crear clave única para participante en contexto específico
            const key = raceId && eventId
              ? `${profileId}_${followedRaceId}_${followedEventId}`
              : profileId;
            followedParticipantsMap.set(key, true);
          }
        });
      } catch (error) {
        console.error("Error al obtener seguimientos:", error);
      }
    }

    // Enriquecer los resultados de Algolia agregando el campo "following"
    const hitsWithFollowing = result.hits.map(participant => {
      let isFollowing = false;

      if (userId && followedParticipantsMap.size > 0) {
        // TEMPORAL: Adaptarse a la estructura actual de Algolia
        // El objectID en Algolia actual parece ser el participantId
        const participantId = participant.objectID || participant.participantId || participant.id;

        if (raceId && eventId) {
          // Comparación específica por race/event
          const specificKey = `${participantId}_${raceId}_${eventId}`;
          isFollowing = followedParticipantsMap.has(specificKey);
        } else {
          // Comparación general (cualquier race/event)
          isFollowing = followedParticipantsMap.has(participantId);
        }
      }

      // TEMPORAL: Agregar campos faltantes hasta que se reindexe Algolia
      const enrichedParticipant = {
        ...participant,
        following: isFollowing,
        // Mapear campos de la estructura actual a la esperada
        bib: participant.bib || participant.dorsal || null,
        category: participant.category || participant.Category || null,
        // Agregar raceId/eventId si se proporcionaron en la consulta
        raceId: participant.raceId || raceId || null,
        eventId: participant.eventId || eventId || null
      };

      return enrichedParticipant;
    });

    return res.status(200).json(hitsWithFollowing);
  } catch (error) {
    console.error("Error en la búsqueda de Algolia:", error);
    return res.status(500).json({ error: "Error en la búsqueda" });
  }
});

/**
 * @openapi
 * /api/athlete-card/config/{raceId}:
 *   get:
 *     summary: Obtener configuración del widget de atleta
 *     description: Retorna la configuración completa del widget de atleta para una carrera específica. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera.
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento (NUEVO - requerido).
 *     responses:
 *       '200':
 *         description: Configuración obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 components:
 *                   type: object
 *                   description: Configuración de componentes del widget.
 *                 metadata:
 *                   type: object
 *                   description: Metadatos de la configuración.
 *       '400':
 *         description: Falta el parámetro raceId.
 *       '404':
 *         description: Configuración no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
/**
 * @openapi
 * /api/apps:
 *   get:
 *     summary: Obtener información completa de apps
 *     description: Retorna apps con sus races y events. Permite filtrado opcional por company ID.
 *     parameters:
 *       - in: query
 *         name: idcompany
 *         required: false
 *         schema:
 *           type: string
 *         description: ID de la company para filtrar apps. Tiene prioridad sobre bundleId.
 *       - in: query
 *         name: bundleId
 *         required: false
 *         schema:
 *           type: string
 *         description: Bundle ID para filtrar apps. Se usa si no se proporciona idcompany.
 *     responses:
 *       '200':
 *         description: Información de apps obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       appId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       company:
 *                         type: array
 *                         items:
 *                           type: string
 *                       races:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             raceId:
 *                               type: string
 *                             events:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   eventId:
 *                                     type: string
 *                       racesCount:
 *                         type: integer
 *                       totalEvents:
 *                         type: integer
 *                 total:
 *                   type: integer
 *                 filter:
 *                   type: object
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalApps:
 *                       type: integer
 *                     totalRaces:
 *                       type: integer
 *                     totalEvents:
 *                       type: integer
 *       '500':
 *         description: Error interno del servidor.
 */
// ✅ NUEVA API: Obtener apps con races y events, filtrado opcional por company
router.get("/apps", async (req, res) => {
  try {
    console.log("📱 GET /api/apps - Obteniendo información de apps");

    const { idcompany, bundleId } = req.query;
    const db = admin.firestore();

    // ✅ LÓGICA DE PRIORIDAD: idcompany tiene prioridad sobre bundleId
    let filterField = null;
    let filterValue = null;

    if (idcompany) {
      filterField = 'company.id';
      filterValue = idcompany;
      console.log(`🎯 Filtrando por idcompany (prioridad): ${idcompany}`);
    } else if (bundleId) {
      filterField = 'bundleId';
      filterValue = bundleId;
      console.log(`🎯 Filtrando por bundleId: ${bundleId}`);
    } else {
      console.log(`🔍 Sin filtro - obteniendo todas las apps`);
    }

    // 1. Query base para apps
    let appsQuery = db.collection('apps');

    // 2. Aplicar filtro según el parámetro proporcionado
    if (filterField && filterValue) {
      if (filterField === 'company.id') {
        // Para company.id usamos igualdad exacta
        appsQuery = appsQuery.where(filterField, '==', filterValue);
        console.log(`📋 Query: apps.where('${filterField}', '==', '${filterValue}')`);
      } else {
        // Para bundleId usamos igualdad exacta
        appsQuery = appsQuery.where(filterField, '==', filterValue);
        console.log(`📋 Query: apps.where('${filterField}', '==', '${filterValue}')`);
      }
    }

    // 3. Obtener apps
    const appsSnapshot = await appsQuery.get();

    if (appsSnapshot.empty) {
      console.log("📭 No se encontraron apps");
      let message = "No hay apps disponibles";

      if (filterField && filterValue) {
        const displayField = filterField === 'company.id' ? 'idcompany' : filterField;
        message = `No se encontraron apps para ${displayField}: ${filterValue}`;
      }

      return res.status(200).json({
        apps: [],
        total: 0,
        message: message,
        filter: filterField ? { [filterField === 'company.id' ? 'idcompany' : filterField]: filterValue } : null
      });
    }

    console.log(`📱 Encontradas ${appsSnapshot.size} apps`);

    // 4. Procesar cada app y obtener sus races y events
    const appsWithData = [];

    for (const appDoc of appsSnapshot.docs) {
      const appData = appDoc.data();
      const appId = appDoc.id;

      console.log(`🔄 Procesando app: ${appId}`);

      // 5. Obtener races de esta app
      const racesSnapshot = await db.collection('apps').doc(appId)
        .collection('races').get();

      const races = [];

      for (const raceDoc of racesSnapshot.docs) {
        const raceData = raceDoc.data();
        const raceId = raceDoc.id;

        // 6. Obtener events de esta race
        const eventsSnapshot = await db.collection('apps').doc(appId)
          .collection('races').doc(raceId)
          .collection('events').get();

        const events = eventsSnapshot.docs.map(eventDoc => ({
          eventId: eventDoc.id,
          ...eventDoc.data()
        }));

        races.push({
          raceId,
          ...raceData,
          events: events,
          eventsCount: events.length
        });
      }

      appsWithData.push({
        appId,
        ...appData,
        races: races,
        racesCount: races.length,
        totalEvents: races.reduce((sum, race) => sum + race.eventsCount, 0)
      });
    }

    console.log(`✅ Procesamiento completado. Apps: ${appsWithData.length}`);

    // 7. Respuesta
    return res.status(200).json({
      apps: appsWithData,
      total: appsWithData.length,
      filter: filterField ? { [filterField === 'company.id' ? 'idcompany' : filterField]: filterValue } : null,
      summary: {
        totalApps: appsWithData.length,
        totalRaces: appsWithData.reduce((sum, app) => sum + app.racesCount, 0),
        totalEvents: appsWithData.reduce((sum, app) => sum + app.totalEvents, 0)
      }
    });

  } catch (error) {
    console.error("❌ Error en GET /api/apps:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @openapi
 * /api/companies:
 *   get:
 *     summary: Listar companies de los últimos 15 días
 *     description: Retorna todas las companies que tienen apps creadas en los últimos 15 días (desde hace 15 días hasta hoy inclusive).
 *     responses:
 *       '200':
 *         description: Lista de companies obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       idcompany:
 *                         type: string
 *                         description: ID único de la company
 *                       apps:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             appId:
 *                               type: string
 *                             name:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                       appsCount:
 *                         type: integer
 *                         description: Número total de apps de esta company
 *                       firstSeen:
 *                         type: string
 *                         format: date-time
 *                         description: Fecha de la primera app creada
 *                       lastSeen:
 *                         type: string
 *                         format: date-time
 *                         description: Fecha de la última app creada
 *                 total:
 *                   type: integer
 *                 dateRange:
 *                   type: object
 *                   properties:
 *                     from:
 *                       type: string
 *                       format: date-time
 *                     to:
 *                       type: string
 *                       format: date-time
 *                     days:
 *                       type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalCompanies:
 *                       type: integer
 *                     totalApps:
 *                       type: integer
 *                     avgAppsPerCompany:
 *                       type: string
 *       '500':
 *         description: Error interno del servidor.
 */
// ✅ NUEVA API: Listar companies de los últimos 15 días
router.get("/companies", async (_req, res) => {
  try {
    console.log("🏢 GET /api/companies - Obteniendo companies de últimos 15 días");

    const db = admin.firestore();

    // 1. Calcular fecha de hace 15 días
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));

    console.log(`📅 Rango de fechas: ${fifteenDaysAgo.toISOString()} → ${now.toISOString()}`);

    // 2. Query para apps creadas en los últimos 15 días
    const appsSnapshot = await db.collection('apps')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(fifteenDaysAgo))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(now))
      .get();

    console.log(`📱 Apps encontradas en rango: ${appsSnapshot.size}`);

    // 3. Extraer y deduplicar companies
    const companiesMap = new Map();

    appsSnapshot.docs.forEach(doc => {
      const appData = doc.data();
      const appId = doc.id;

      if (appData.company && Array.isArray(appData.company)) {
        appData.company.forEach(companyId => {
          if (!companiesMap.has(companyId)) {
            companiesMap.set(companyId, {
              idcompany: companyId,
              apps: [],
              appsCount: 0,
              firstSeen: appData.createdAt,
              lastSeen: appData.createdAt
            });
          }

          const company = companiesMap.get(companyId);
          company.apps.push({
            appId,
            name: appData.name || 'Sin nombre',
            createdAt: appData.createdAt
          });
          company.appsCount++;

          // Actualizar fechas
          if (appData.createdAt < company.firstSeen) {
            company.firstSeen = appData.createdAt;
          }
          if (appData.createdAt > company.lastSeen) {
            company.lastSeen = appData.createdAt;
          }
        });
      }
    });

    // 4. Convertir a array y ordenar por fecha más reciente
    const companies = Array.from(companiesMap.values())
      .sort((a, b) => b.lastSeen.toMillis() - a.lastSeen.toMillis());

    console.log(`🏢 Companies únicas encontradas: ${companies.length}`);

    // 5. Respuesta
    return res.status(200).json({
      companies: companies,
      total: companies.length,
      dateRange: {
        from: fifteenDaysAgo.toISOString(),
        to: now.toISOString(),
        days: 15
      },
      summary: {
        totalCompanies: companies.length,
        totalApps: appsSnapshot.size,
        avgAppsPerCompany: companies.length > 0 ? (appsSnapshot.size / companies.length).toFixed(2) : 0
      }
    });

  } catch (error) {
    console.error("❌ Error en GET /api/companies:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

router.get("/athlete-card/config/:raceId", async (req, res) => {
  try {
    const { raceId } = req.params;
    const { eventId } = req.query;
    if (!raceId || !eventId) {
      return res.status(400).json({
        message: "Los parámetros raceId y eventId son obligatorios.",
      });
    }

    const raceIdStr = String(raceId).trim();
    const eventIdStr = String(eventId).trim();
    const db = admin.firestore();

    // Obtener la configuración del widget de atleta
    const configRef = db.collection("races").doc(raceIdStr)
      .collection("events").doc(eventIdStr)
      .collection("athlete-card").doc("config");
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      return res.status(404).json({
        message: "Configuración del widget de atleta no encontrada."
      });
    }

    const configData = configDoc.data();

    return res.status(200).json(configData);
  } catch (error) {
    console.error("Error al obtener la configuración del widget de atleta:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/webhook/runner-checkpoint:
 *   post:
 *     summary: Webhook para eventos de checkpoint de corredores
 *     description: Recibe notificaciones de AWS cuando un corredor pasa por un punto de control.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               runnerId:
 *                 type: string
 *                 description: ID del corredor
 *               runnerBib:
 *                 type: string
 *                 description: Número de dorsal del corredor
 *               checkpointId:
 *                 type: string
 *                 description: ID del punto de control
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Momento en que pasó por el checkpoint
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *               streamId:
 *                 type: string
 *                 description: ID del stream para generar clip de video
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *             required:
 *               - runnerId
 *               - checkpointId
 *               - timestamp
 *               - raceId
 *               - eventId
 *               - streamId
 *               - apiKey
 *     responses:
 *       '200':
 *         description: Evento procesado correctamente.
 *       '401':
 *         description: API key inválida.
 *       '400':
 *         description: Parámetros faltantes.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/webhook/runner-checkpoint", async (req, res) => {
  try {
    console.log("🔔 Webhook recibido:", JSON.stringify(req.body, null, 2));

    const { runnerId, runnerBib, checkpointId, timestamp, raceId, eventId, streamId, apiKey } = req.body;

    // 1. Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";
    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }

    // 2. Validar parámetros requeridos
    if (!runnerId || !checkpointId || !timestamp || !raceId || !eventId || !streamId) {
      console.error("❌ Parámetros faltantes");
      return res.status(400).json({
        error: "Parámetros faltantes",
        required: ["runnerId", "checkpointId", "timestamp", "raceId", "eventId", "streamId"],
        received: { runnerId: !!runnerId, checkpointId: !!checkpointId, timestamp: !!timestamp, raceId: !!raceId, eventId: !!eventId, streamId: !!streamId }
      });
    }

    // 3. Validar formato de streamId (UUID) - OBLIGATORIO
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(streamId)) {
      console.error("❌ streamId no tiene formato UUID válido:", streamId);
      return res.status(400).json({
        error: "streamId debe ser un UUID válido (requerido para cada checkpoint)",
        received: streamId,
        expected: "formato: ca7a9dec-b50b-510c-bf86-058664b46422",
        note: "Cada checkpoint debe tener un streamId único"
      });
    }

    console.log("✅ Validación exitosa");
    console.log(`📊 Datos recibidos: runnerId=${runnerId}, checkpoint=${checkpointId}, streamId=${streamId}`);

    const db = admin.firestore();

    // 3. Buscar el participante por runnerId o runnerBib
    let participantId = null;
    const participantsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants");

    // Intentar buscar por runnerId primero
    const participantByIdQuery = await participantsRef.where("runnerId", "==", runnerId).get();
    if (!participantByIdQuery.empty) {
      participantId = participantByIdQuery.docs[0].id;
    } else if (runnerBib) {
      // Si no se encuentra por runnerId, buscar por dorsal
      // ✅ CORREGIDO: Buscar por 'dorsal' en lugar de 'bib'
      const participantByBibQuery = await participantsRef.where("dorsal", "==", runnerBib).get();
      if (!participantByBibQuery.empty) {
        participantId = participantByBibQuery.docs[0].id;
      }
    }

    if (!participantId) {
      console.error(`❌ Participante no encontrado: runnerId=${runnerId}, bib=${runnerBib}`);
      return res.status(404).json({
        error: "Participante no encontrado",
        runnerId,
        runnerBib
      });
    }

    console.log(`✅ Participante encontrado: ${participantId}`);

    // 4. Registrar el evento de checkpoint
    const checkpointData = {
      runnerId,
      runnerBib: runnerBib || null,
      checkpointId,
      timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: true
    };

    // Guardar en la subcolección de checkpoints del participante
    const checkpointRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("checkpoints").doc();

    await checkpointRef.set(checkpointData);

    console.log(`✅ Checkpoint registrado: ${checkpointRef.id}`);

    // 5. Generar clip de video (streamId siempre disponible)
    let clipUrl = null;
    try {
      clipUrl = await generateVideoClip({
        streamId,
        timestamp,
        raceId,
        eventId,
        participantId,
        checkpointId
      });
      console.log(`✅ Clip de video generado: ${clipUrl}`);
    } catch (clipError) {
      console.error("⚠️ Error generando clip de video:", clipError);
      // No fallar el webhook por esto, pero registrar el error
      // await monitor.createAlert('warning', 'Error generando clip de video', {
      //   error: clipError.message,
      //   streamId,
      //   checkpointId,
      //   participantId
      // }); // COMENTADO TEMPORALMENTE
    }

    // 6. Generar historia automática para participantes seguidos
    try {
      await generateAutomaticStoryForCheckpoint({
        raceId,
        eventId,
        participantId,
        checkpointId,
        timestamp,
        runnerId,
        runnerBib,
        clipUrl // Incluir URL del clip generado
      });
    } catch (storyError) {
      console.error("⚠️ Error generando historia automática:", storyError);
      // No fallar el webhook por esto
    }

    // 7. TODO: Lógica adicional
    // - Enviar notificaciones push a seguidores
    // - Actualizar leaderboard en tiempo real
    // - Calcular tiempos parciales

    return res.status(200).json({
      success: true,
      message: "Evento de checkpoint procesado correctamente",
      data: {
        participantId,
        checkpointId,
        timestamp,
        checkpointDocId: checkpointRef.id
      }
    });

  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * Función para generar clip de video usando el API de Copernico
 */
async function generateVideoClip({ streamId, timestamp, raceId, eventId, participantId, checkpointId }) {
  try {
    console.log(`🎬 Generando clip de video para checkpoint: ${checkpointId}`);
    console.log(`📹 StreamId: ${streamId}`);
    console.log(`⏰ Timestamp original: ${timestamp}`);

    // Calcular startTime y endTime (±10 segundos)
    const checkpointTime = new Date(timestamp);
    const startTime = new Date(checkpointTime.getTime() - 10 * 1000).toISOString(); // -10 segundos
    const endTime = new Date(checkpointTime.getTime() + 10 * 1000).toISOString();   // +10 segundos

    console.log(`⏰ Rango de clip: ${startTime} → ${endTime} (20 segundos total)`);

    const clipPayload = {
      streamId,
      startTime,
      endTime
      // frameOverlayUrl es opcional por ahora
    };

    console.log(`📤 Enviando request para generar clip:`, clipPayload);

    // Llamar al API de generación de clips
    const response = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateClipUrlFromAsset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clipPayload),
      timeout: 30000 // 30 segundos timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API de clips respondió con ${response.status}: ${errorText}`);
    }

    // ✅ CORREGIDO: La respuesta es directamente la URL del clip
    const clipUrl = await response.text(); // La respuesta es directamente la URL
    console.log(`✅ Clip generado exitosamente: ${clipUrl}`);

    // Guardar información del clip en Firestore para referencia
    const db = admin.firestore();
    await db.collection("video-clips").add({
      raceId,
      eventId,
      participantId,
      checkpointId,
      streamId,
      startTime,
      endTime,
      clipUrl: clipUrl,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      originalTimestamp: timestamp
    });

    return clipUrl;

  } catch (error) {
    console.error(`❌ Error generando clip de video:`, error);
    throw error;
  }
}

/**
 * Función auxiliar para generar historias automáticas cuando un corredor pasa por checkpoint
 */
async function generateAutomaticStoryForCheckpoint(checkpointData) {
  try {
    const { raceId, eventId, participantId, checkpointId, timestamp, runnerId, runnerBib, clipUrl } = checkpointData;

    console.log(`🎬 Generando historia automática para checkpoint: ${checkpointId}`);

    const db = admin.firestore();

    // Verificar si el participante tiene seguidores
    const followersRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("followers");

    const followersSnapshot = await followersRef.get();
    const hasFollowers = !followersSnapshot.empty;

    // También verificar si es un "atleta destacado" (opcional)
    const participantRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId);

    const participantDoc = await participantRef.get();
    const participantData = participantDoc.exists ? participantDoc.data() : {};
    const isFeaturedAthlete = participantData.featured === true || participantData.autoGenerateStories === true;

    // Generar historia si tiene seguidores O es atleta destacado
    if (hasFollowers || isFeaturedAthlete) {
      const storyData = {
        participantId,
        raceId,
        eventId,
        description: `Corredor pasó por ${checkpointId} - Historia generada automáticamente`,
        moderationStatus: "approved",
        originType: "automatic_checkpoint",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        date: admin.firestore.FieldValue.serverTimestamp(),
        // Incluir URL del clip de video si está disponible
        fileUrl: clipUrl || null,
        fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
        // ✅ AGREGADO: Campos faltantes para completar estructura
        contentType: clipUrl ? "video/mp4" : null,
        mediaType: clipUrl ? "video" : null,
        sourceUrl: clipUrl || null,
        fileSize: 0, // Se actualizará cuando se conozca el tamaño real
        duration: clipUrl ? 20 : null, // Clips de 20 segundos por defecto
        filePath: clipUrl ? `races/${raceId}/events/${eventId}/participants/${participantId}/stories/clip_${checkpointId}_${Date.now()}.mp4` : null,
        checkpointInfo: {
          checkpointId,
          timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
          runnerId,
          runnerBib
        },
        generationInfo: {
          source: "aws_webhook",
          reason: hasFollowers ? "has_followers" : "featured_athlete",
          followersCount: followersSnapshot.size,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          hasVideoClip: !!clipUrl,
          clipUrl: clipUrl || null,
          startTime: clipUrl ? new Date(new Date(timestamp).getTime() - 10000).toISOString() : null,
          endTime: clipUrl ? new Date(new Date(timestamp).getTime() + 10000).toISOString() : null
        }
      };

      // Crear la historia
      const storyRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId)
        .collection("stories").doc();

      await storyRef.set(storyData);

      console.log(`✅ Historia automática creada: ${storyRef.id} (${followersSnapshot.size} seguidores)`);

      return storyRef.id;
    } else {
      console.log(`⚠️ No se generó historia: participante sin seguidores y no es destacado`);
      return null;
    }

  } catch (error) {
    console.error("❌ Error generando historia automática:", error);
    throw error;
  }
}

/**
 * @openapi
 * /api/participant-checkpoint:
 *   post:
 *     summary: Endpoint simplificado para cambios de participantes (NUEVO FLUJO)
 *     description: Recibe datos completos del participante de AWS y procesa todos los checkpoints.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               runnerId:
 *                 type: string
 *                 description: ID del corredor
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *               data:
 *                 type: object
 *                 description: Datos completos del participante desde AWS
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   fullname:
 *                     type: string
 *                   events:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         dorsal:
 *                           type: string
 *                         times:
 *                           type: object
 *                           description: Checkpoints con formato POINT-NAME
 *             required:
 *               - runnerId
 *               - raceId
 *               - eventId
 *               - apiKey
 *               - data
 *     responses:
 *       '200':
 *         description: Checkpoint procesado correctamente.
 *       '409':
 *         description: Historia ya existe para este checkpoint.
 *       '401':
 *         description: API key inválida.
 *       '400':
 *         description: Parámetros faltantes.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/participant-checkpoint", async (req, res) => {
  try {
    console.log("🔔 Cambio de participante recibido:", JSON.stringify(req.body, null, 2));

    let { runnerId, raceId, eventId, apiKey, data } = req.body;

    // 🧪 TEMPORAL: Mapeo de IDs para pruebas (BORRAR DESPUÉS)
    const originalRaceId = raceId;
    const originalEventId = eventId;

    if (raceId === "ponle-freno-valencia-2025" || eventId === "ponle-freno-valencia-2025") {
      raceId = "683ea9b3-4878-4ec9-912e-4419ac1f1da3";
      eventId = "683ea9b3-4878-4ec9-912e-4419ac1f1da3";

      // Log del mapeo
      const mappingLog = {
        timestamp: new Date().toISOString(),
        action: "ID_MAPPING",
        original: { raceId: originalRaceId, eventId: originalEventId },
        mapped: { raceId, eventId },
        runnerId: runnerId
      };

      console.log("🔄 MAPEO TEMPORAL DE IDs:", JSON.stringify(mappingLog, null, 2));

      // Guardar en archivo de log
      try {
        const fs = require('fs');
        const logEntry = JSON.stringify(mappingLog) + '\n';
        fs.appendFileSync('/tmp/id-mapping.log', logEntry);
      } catch (logError) {
        console.error("⚠️ Error guardando log de mapeo:", logError);
      }
    }

    if (raceId === "683ea9b3-4878-4ec9-912e-4419ac1f1da3") {
      eventId = "683ea9b3-4878-4ec9-912e-4419ac1f1da3";

      if (originalEventId !== eventId) {
        const mappingLog = {
          timestamp: new Date().toISOString(),
          action: "EVENTID_SYNC",
          original: { raceId: originalRaceId, eventId: originalEventId },
          synced: { raceId, eventId },
          runnerId: runnerId
        };

        console.log("🔄 SINCRONIZACIÓN DE EVENTID:", JSON.stringify(mappingLog, null, 2));

        try {
          const fs = require('fs');
          const logEntry = JSON.stringify(mappingLog) + '\n';
          fs.appendFileSync('/tmp/id-mapping.log', logEntry);
        } catch (logError) {
          console.error("⚠️ Error guardando log de sincronización:", logError);
        }
      }
    }

    // 1. Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";
    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }

    // 2. Validar parámetros requeridos
    if (!runnerId || !raceId || !eventId || !data) {
      console.error("❌ Parámetros faltantes");
      return res.status(400).json({
        error: "Parámetros faltantes",
        required: ["runnerId", "raceId", "eventId", "data"],
        received: { runnerId: !!runnerId, raceId: !!raceId, eventId: !!eventId, data: !!data }
      });
    }

    // 3. Validar estructura de datos
    if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
      console.error("❌ Estructura de datos inválida: falta events");
      return res.status(400).json({
        error: "Estructura de datos inválida",
        expected: "data.events debe ser un array con al menos un evento"
      });
    }

    console.log("✅ Validación exitosa");
    console.log(`📊 Procesando participante: runnerId=${runnerId}`);

    const db = admin.firestore();

    // 4. Extraer información del participante
    const runnerBib = data.events[0]?.dorsal || null;
    const runnerName = data.name || data.fullname || "Participante";

    console.log(`👤 Datos del participante: ${runnerName}, dorsal: ${runnerBib}`);

    // 5. Buscar el participante por runnerId o runnerBib
    let participantId = null;
    const participantsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants");

    console.log(`🔍 Buscando participante: runnerId=${runnerId}, bib=${runnerBib}`);

    // Intentar buscar por runnerId primero
    const participantByIdQuery = await participantsRef
      .where("runnerId", "==", runnerId)
      .get();

    if (!participantByIdQuery.empty) {
      participantId = participantByIdQuery.docs[0].id;
      console.log(`✅ Participante encontrado por runnerId: ${participantId}`);
    } else if (runnerBib) {
      // Si no se encuentra por runnerId, buscar por número de dorsal
      // ✅ CORREGIDO: Buscar por 'dorsal' en lugar de 'bib'
      const participantByBibQuery = await participantsRef
        .where("dorsal", "==", runnerBib)
        .get();

      if (!participantByBibQuery.empty) {
        participantId = participantByBibQuery.docs[0].id;
        console.log(`✅ Participante encontrado por bib: ${participantId}`);
      }
    }

    if (!participantId) {
      console.error(`❌ Participante no encontrado: runnerId=${runnerId}, bib=${runnerBib}`);
      return res.status(404).json({
        error: "Participante no encontrado",
        runnerId,
        runnerBib
      });
    }

    // 6. Procesar checkpoints del evento
    const eventData = data.events[0]; // Tomar el primer evento
    const times = eventData.times || {};

    console.log(`📍 Procesando ${Object.keys(times).length} checkpoints...`);

    let newCheckpointsProcessed = 0;
    let storiesCreated = 0;
    const processedCheckpoints = [];

    // Procesar cada checkpoint en times
    for (const [pointName, timeData] of Object.entries(times)) {
      try {
        console.log(`\n🔍 Procesando checkpoint: ${pointName}`);

        // Extraer datos del checkpoint
        const checkpointId = pointName;
        const timestamp = new Date(timeData.raw?.originalTime || timeData.raw?.rawTime || Date.now());
        const streamId = timeData.raw?.device || `stream-${pointName}-${runnerId}`; // Usar device como streamId o generar uno

        console.log(`⏰ Timestamp: ${timestamp.toISOString()}`);
        console.log(`📹 StreamId: ${streamId}`);

        // Verificar si el checkpoint ya existe
        const checkpointRef = db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId)
          .collection("checkpoints").doc(checkpointId);

        const existingCheckpoint = await checkpointRef.get();

        if (!existingCheckpoint.exists) {
          // Guardar checkpoint nuevo
          const checkpointData = {
            runnerId,
            runnerBib: runnerBib || null,
            checkpointId,
            timestamp: admin.firestore.Timestamp.fromDate(timestamp),
            streamId,
            timeData: timeData, // Guardar todos los datos del tiempo
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            processed: true,
            source: "aws_endpoint"
          };

          await checkpointRef.set(checkpointData);
          console.log(`✅ Checkpoint guardado: ${checkpointId}`);
          newCheckpointsProcessed++;
        } else {
          console.log(`⚠️ Checkpoint ya existe: ${checkpointId}`);
        }

        // Verificar si ya existe historia para este checkpoint
        const storiesRef = db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId)
          .collection("stories");

        const existingStoryQuery = await storiesRef
          .where("checkpointInfo.checkpointId", "==", checkpointId)
          .limit(1)
          .get();

        if (!existingStoryQuery.empty) {
          console.log(`⚠️ Historia ya existe para checkpoint: ${checkpointId}`);
          processedCheckpoints.push({
            checkpointId,
            action: "skipped",
            reason: "story_exists",
            storyId: existingStoryQuery.docs[0].id
          });
          continue; // Pasar al siguiente checkpoint
        }

        // Generar clip de video si streamId es válido
        let clipUrl = null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(streamId)) {
          try {
            clipUrl = await generateVideoClip({
              streamId,
              timestamp: timestamp.toISOString(),
              raceId,
              eventId,
              participantId,
              checkpointId
            });
            console.log(`✅ Clip de video generado: ${clipUrl}`);
          } catch (clipError) {
            console.error("⚠️ Error generando clip de video:", clipError);
          }
        } else {
          console.log(`⚠️ StreamId no es UUID válido, no se puede generar clip: ${streamId}`);
        }

        // Crear historia automática con estructura completa
        const storyData = {
          participantId,
          raceId,
          eventId,
          description: `${runnerName} pasó por ${checkpointId} - Historia generada automáticamente`,
          moderationStatus: "approved",
          originType: "automatic_checkpoint",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          date: admin.firestore.FieldValue.serverTimestamp(),
          // ✅ Campos del archivo/video
          fileUrl: clipUrl || null,
          fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
          filePath: clipUrl ? `races/${raceId}/events/${eventId}/participants/${participantId}/stories/clip_${checkpointId}_${Date.now()}.mp4` : null,
          contentType: clipUrl ? "video/mp4" : null,
          mediaType: clipUrl ? "video" : null,
          sourceUrl: clipUrl || null,
          fileSize: 0, // Se actualizará cuando se conozca el tamaño real
          duration: clipUrl ? 20 : null, // Clips de 20 segundos
          // ✅ Información del checkpoint
          checkpointInfo: {
            checkpointId,
            timestamp: admin.firestore.Timestamp.fromDate(timestamp),
            runnerId,
            runnerBib,
            streamId,
            timeData: timeData
          },
          // ✅ Información de generación completa
          generationInfo: {
            source: "aws_endpoint_simple",
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            hasVideoClip: !!clipUrl,
            clipUrl: clipUrl || null,
            startTime: clipUrl ? new Date(timestamp.getTime() - 10000).toISOString() : null,
            endTime: clipUrl ? new Date(timestamp.getTime() + 10000).toISOString() : null,
            streamId: streamId
          }
        };

        const storyRef = await storiesRef.add(storyData);
        console.log(`✅ Historia creada: ${storyRef.id}`);
        storiesCreated++;

        processedCheckpoints.push({
          checkpointId,
          action: "created",
          storyId: storyRef.id,
          clipGenerated: !!clipUrl
        });

      } catch (checkpointError) {
        console.error(`❌ Error procesando checkpoint ${pointName}:`, checkpointError);
        processedCheckpoints.push({
          checkpointId: pointName,
          action: "error",
          error: checkpointError.message
        });
      }
    }

    // Respuesta final con resumen del procesamiento
    console.log(`\n📊 Resumen del procesamiento:`);
    console.log(`   - Checkpoints nuevos: ${newCheckpointsProcessed}`);
    console.log(`   - Historias creadas: ${storiesCreated}`);
    console.log(`   - Total procesados: ${processedCheckpoints.length}`);

    return res.status(200).json({
      success: true,
      message: `Participante procesado correctamente`,
      data: {
        participantId,
        participantName: runnerName,
        runnerId,
        runnerBib,
        checkpointsProcessed: processedCheckpoints.length,
        newCheckpoints: newCheckpointsProcessed,
        storiesCreated: storiesCreated,
        checkpoints: processedCheckpoints
      }
    });

  } catch (error) {
    console.error("❌ Error procesando cambio de participante:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

// ========================================
// CÓDIGO ANTERIOR (COMENTADO - NO ELIMINAR)
// ========================================

/*
 * NOTA: El código del webhook anterior se mantiene comentado
 * por si necesitamos volver al flujo de WebSocket en el futuro.
 *
 * Endpoints anteriores:
 * - /api/webhook/runner-checkpoint (WebSocket flow)
 * - WebSocket manager
 * - Triggers de seguimiento
 *
 * El nuevo flujo simplificado usa:
 * - /api/participant-checkpoint (HTTP simple)
 */

export default router;