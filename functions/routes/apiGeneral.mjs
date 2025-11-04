// apiGeneral.mjs
import express from "express";
//import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
// import monitor from "../monitoring/websocketMonitor.mjs"; // COMENTADO TEMPORALMENTE
//import dotenv from "dotenv";
//dotenv.config();

// Importar rutas FCM
import fcmTokensRouter from "./fcmTokens.mjs";

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
 *     summary: Obtener información de un participante (ESTRUCTURA ANTIGUA)
 *     description: Retorna los datos de un participante en un evento. DEPRECADO - usar /api/apps/participant.
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
    const { raceId, eventId, participantId, appId } = req.query;
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, eventId y participantId son obligatorios.",
      });
    }

    const db = admin.firestore();
    let participantDoc = null;
    let participantRef = null;

    // Si se proporciona appId, usar nueva estructura
    if (appId) {
      console.log(`🔍 Buscando participante en nueva estructura: races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`);
      participantRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId);
      participantDoc = await participantRef.get();
    }

    // Si no se encuentra en nueva estructura o no se proporcionó appId, buscar en estructura antigua
    if (!participantDoc || !participantDoc.exists) {
      console.log(`🔍 Buscando participante en estructura antigua: races/${raceId}/events/${eventId}/participants/${participantId}`);
      participantRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId);
      participantDoc = await participantRef.get();
    }

    if (!participantDoc.exists) {
      return res.status(404).json({
        message: "El participante no existe en este evento.",
        searchedStructures: appId ? ["nueva (races/apps/events)", "antigua (races/events)"] : ["antigua (races/events)"]
      });
    }

    const participantData = {
      id: participantDoc.id,
      ...participantDoc.data()
    };

    // Si se encontró en nueva estructura y se quieren splits, agregarlos
    if (appId && participantDoc.exists) {
      try {
        // Obtener splits del participante
        const storiesSnapshot = await participantRef.collection("stories")
          .where("type", "in", ["ATHELETE_STARTED", "ATHELETE_FINISHED", "ATHELETE_CROSSED_TIMING_SPLIT"])
          .orderBy("date", "asc")
          .get();

        const splits = storiesSnapshot.docs.map(doc => {
          const storyData = doc.data();
          return {
            storyId: doc.id,
            type: storyData.type,
            date: storyData.date,
            description: storyData.description || "",
            ...(storyData.split_time || storyData.splitTime || {}),
            fileUrl: storyData.fileUrl || "",
            moderationStatus: storyData.moderationStatus || ""
          };
        });

        participantData.splits = splits;
        participantData.totalSplits = splits.length;
        participantData.structure = "nueva (con splits)";
      } catch (splitError) {
        console.warn("⚠️ Error obteniendo splits:", splitError);
        participantData.structure = "nueva (sin splits)";
      }
    } else {
      participantData.structure = "antigua";
    }

    return res.status(200).json(participantData);
  } catch (error) {
    console.error("Error al obtener el participante:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/apps/participant:
 *   get:
 *     summary: Obtener información completa de un participante con splits
 *     description: Retorna los datos de un participante en un evento con información de splits/checkpoints incluida. NUEVA ESTRUCTURA RECOMENDADA.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera.
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la aplicación.
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
 *         description: Participante obtenido exitosamente con splits incluidos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 dorsal:
 *                   type: string
 *                 category:
 *                   type: string
 *                 splits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       storyId:
 *                         type: string
 *                       type:
 *                         type: string
 *                       time:
 *                         type: string
 *                       netTime:
 *                         type: string
 *                       split:
 *                         type: string
 *                       checkpoint:
 *                         type: string
 *       '400':
 *         description: Parámetros faltantes.
 *       '404':
 *         description: Participante no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/apps/participant", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId } = req.query;
    if (!raceId || !appId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, appId, eventId y participantId son obligatorios.",
      });
    }

    const db = admin.firestore();
    console.log(`🔍 Obteniendo participante: ${participantId} en Race: ${raceId}, App: ${appId}, Event: ${eventId}`);

    // Obtener datos del participante
    const participantRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId);

    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({
        message: "El participante no existe en este evento.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`
      });
    }

    const participantData = {
      id: participantDoc.id,
      ...participantDoc.data()
    };

    // Obtener splits/checkpoints del participante desde sus stories
    console.log(`📊 Obteniendo splits para participante: ${participantId}`);
    const storiesSnapshot = await participantRef.collection("stories")
      .where("type", "in", ["ATHELETE_STARTED", "ATHELETE_FINISHED", "ATHELETE_CROSSED_TIMING_SPLIT"])
      .orderBy("date", "asc")
      .get();

    const splits = storiesSnapshot.docs.map(doc => {
      const storyData = doc.data();
      return {
        storyId: doc.id,
        type: storyData.type,
        date: storyData.date,
        description: storyData.description,
        ...(storyData.split_time || storyData.splitTime || {}),
        fileUrl: storyData.fileUrl || "",
        moderationStatus: storyData.moderationStatus
      };
    });

    console.log(`✅ Participante encontrado con ${splits.length} splits`);

    return res.status(200).json({
      ...participantData,
      splits: splits,
      totalSplits: splits.length,
      raceId,
      appId,
      eventId
    });

  } catch (error) {
    console.error("❌ Error al obtener el participante:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
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
        // Buscar la historia iterando por participantes
        console.log(`[PERF] Buscando historia específica en /apps/${appId}/races/${raceId}/events/${eventId}`);

        // Obtener todos los participantes - ESTRUCTURA CORRECTA: races/apps/events
        const participantsSnapshot = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').get();

        if (participantsSnapshot.empty) {
          console.log(`❌ No hay participantes en el evento`);
          return res.status(404).json({
            error: "No hay participantes en el evento",
            appId,
            raceId,
            eventId
          });
        }

        // Buscar la historia en cada participante
        let foundStory = null;
        let foundParticipantId = null;
        let foundParticipantData = null;

        for (const participantDoc of participantsSnapshot.docs) {
          const participantId = participantDoc.id;

          const storyDoc = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(eventId)
            .collection('participants').doc(participantId)
            .collection('stories').doc(storyId).get();

          if (storyDoc.exists) {
            foundStory = storyDoc.data();
            foundParticipantId = participantId;
            foundParticipantData = participantDoc.data();
            console.log(`✅ Historia encontrada en participante: ${participantId}`);
            break;
          }
        }

        if (!foundStory) {
          console.log(`❌ Historia ${storyId} no encontrada en ningún participante`);
          return res.status(404).json({
            error: "Historia no encontrada",
            storyId,
            appId,
            raceId,
            eventId,
            participantsSearched: participantsSnapshot.size
          });
        }

        const enrichedStory = {
          storyId: storyId,
          appId,
          raceId,
          eventId,
          participantId: foundParticipantId,
          ...foundStory,
          participant: foundParticipantData,
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
            queriesExecuted: participantsSnapshot.size + 1,
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

    // 1. Obtener todos los participantes del evento en la app - ESTRUCTURA CORRECTA: races/apps/events
    const participantsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
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

      const storiesSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories')
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
 * /api/participants:
 *   post:
 *     summary: Crear participante con stories
 *     description: Crea un participante en un evento específico y opcionalmente agrega stories al participante
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raceId
 *               - appId
 *               - eventId
 *               - participant
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               appId:
 *                 type: string
 *                 description: ID de la aplicación
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *               participantId:
 *                 type: string
 *                 description: ID personalizado del participante (opcional, se genera automáticamente si no se proporciona)
 *               participant:
 *                 type: object
 *                 description: Datos del participante
 *                 properties:
 *                   name:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   dorsal:
 *                     type: string
 *                   category:
 *                     type: string
 *                   externalId:
 *                     type: string
 *                   country:
 *                     type: string
 *                   profilePicture:
 *                     type: string
 *                   description:
 *                     type: string
 *               stories:
 *                 type: array
 *                 description: Array de stories para el participante (opcional)
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [ATHELETE_CROSSED_TIMING_SPLIT, ATHELETE_STARTED, ATHELETE_FINISHED, SPONSOR]
 *                       description: Tipo de evento de la story
 *                     fileUrl:
 *                       type: string
 *                     description:
 *                       type: string
 *                     mediaType:
 *                       type: string
 *                     duration:
 *                       type: number
 *                     moderationStatus:
 *                       type: string
 *                     originType:
 *                       type: string
 *                     splitTime:
 *                       type: object
 *                       description: Datos de tiempo de split para esta story específica
 *                       properties:
 *                         time:
 *                           type: string
 *                         netTime:
 *                           type: string
 *                         split:
 *                           type: string
 *                         checkpoint:
 *                           type: string
 *     responses:
 *       '201':
 *         description: Participante creado exitosamente
 *       '400':
 *         description: Parámetros inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/participants", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId, participant, stories = [] } = req.body;

    if (!raceId || !appId || !eventId || !participant) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId", "participant"]
      });
    }

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    console.log(`📝 Creando participante en Race: ${raceId}, App: ${appId}, Event: ${eventId}`);

    // Preparar datos del participante
    const participantData = {
      ...participant,
      raceId,
      eventId,
      registerDate: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Usar participantId proporcionado o generar uno automático
    let finalParticipantId = participantId;
    let participantRef;

    if (finalParticipantId) {
      // Usar ID personalizado
      participantRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(finalParticipantId);

      await participantRef.set(participantData);
    } else {
      // Generar ID automático
      participantRef = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').add(participantData);

      finalParticipantId = participantRef.id;
    }

    console.log(`✅ Participante creado: ${finalParticipantId}`);

    // Crear stories si se proporcionaron
    const createdStories = [];
    if (stories && stories.length > 0) {
      console.log(`📸 Creando ${stories.length} stories para el participante`);

      for (let i = 0; i < stories.length; i++) {
        const story = stories[i];

        const storyData = {
          ...story,
          participantId: finalParticipantId,
          raceId,
          eventId,
          createdAt: timestamp,
          date: timestamp,
          // Campos por defecto si no se proporcionan
          fileName: story.fileName || `story_${Date.now()}_${i}.mp4`,
          filePath: story.filePath || `participants/${finalParticipantId}/stories/story_${Date.now()}_${i}.mp4`,
          fileSize: story.fileSize || 0,
          contentType: story.contentType || "video/mp4",
          mediaType: story.mediaType || "video",
          moderationStatus: story.moderationStatus || "approved",
          originType: story.originType || "manual",
          duration: story.duration || 0,
          testData: story.testData || false,
          // NUEVOS CAMPOS REQUERIDOS
          type: story.type || "ATHELETE_STARTED", // Tipo de evento por defecto
          splitTime: story.splitTime || {} // Datos de split time
        };

        const storyRef = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').doc(finalParticipantId)
          .collection('stories').add(storyData);

        createdStories.push({
          storyId: storyRef.id,
          ...storyData
        });

        console.log(`✅ Story creada: ${storyRef.id}`);
      }
    }

    return res.status(201).json({
      success: true,
      participantId: finalParticipantId,
      participant: participantData,
      stories: createdStories,
      summary: {
        participantCreated: true,
        storiesCreated: createdStories.length,
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${finalParticipantId}`
      }
    });

  } catch (error) {
    console.error("❌ Error creando participante:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/sponsors:
 *   post:
 *     summary: Crear sponsor
 *     description: Crea un sponsor para una carrera y aplicación específica
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raceId
 *               - appId
 *               - sponsor
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               appId:
 *                 type: string
 *                 description: ID de la aplicación
 *               sponsorId:
 *                 type: string
 *                 description: ID personalizado del sponsor (opcional)
 *               sponsor:
 *                 type: object
 *                 description: Datos del sponsor
 *                 properties:
 *                   name:
 *                     type: string
 *                   logoUrl:
 *                     type: string
 *                   posterUrl:
 *                     type: string
 *                   website:
 *                     type: string
 *                   description:
 *                     type: string
 *     responses:
 *       '201':
 *         description: Sponsor creado exitosamente
 *       '400':
 *         description: Parámetros inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/sponsors", async (req, res) => {
  try {
    const { raceId, appId, sponsorId, sponsor } = req.body;

    if (!raceId || !appId || !sponsor) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "sponsor"]
      });
    }

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    console.log(`🏢 Creando sponsor en Race: ${raceId}, App: ${appId}`);

    // Preparar datos del sponsor
    const sponsorData = {
      ...sponsor,
      raceId,
      appId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Usar sponsorId proporcionado o generar uno automático
    let finalSponsorId = sponsorId;
    let sponsorRef;

    if (finalSponsorId) {
      // Usar ID personalizado
      sponsorRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('sponsors').doc(finalSponsorId);

      await sponsorRef.set(sponsorData);
    } else {
      // Generar ID automático
      sponsorRef = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('sponsors').add(sponsorData);

      finalSponsorId = sponsorRef.id;
    }

    console.log(`✅ Sponsor creado: ${finalSponsorId}`);

    return res.status(201).json({
      success: true,
      sponsorId: finalSponsorId,
      sponsor: sponsorData,
      path: `/races/${raceId}/apps/${appId}/sponsors/${finalSponsorId}`
    });

  } catch (error) {
    console.error("❌ Error creando sponsor:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/sponsors:
 *   get:
 *     summary: Obtener lista de sponsors
 *     description: Retorna todos los sponsors de una carrera y aplicación específica
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación
 *     responses:
 *       '200':
 *         description: Lista de sponsors obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sponsors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sponsorId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       logoUrl:
 *                         type: string
 *                       posterUrl:
 *                         type: string
 *                       website:
 *                         type: string
 *                       description:
 *                         type: string
 *                 total:
 *                   type: integer
 *       '400':
 *         description: Parámetros faltantes
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/sponsors", async (req, res) => {
  try {
    const { raceId, appId } = req.query;

    if (!raceId || !appId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId"]
      });
    }

    const db = admin.firestore();
    console.log(`🔍 Obteniendo sponsors - Race: ${raceId}, App: ${appId}`);

    const sponsorsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('sponsors')
      .orderBy('createdAt', 'desc')
      .get();

    const sponsors = sponsorsSnapshot.docs.map(doc => ({
      sponsorId: doc.id,
      ...doc.data()
    }));

    console.log(`✅ Encontrados ${sponsors.length} sponsors`);

    return res.status(200).json({
      sponsors: sponsors,
      total: sponsors.length,
      raceId,
      appId
    });

  } catch (error) {
    console.error("❌ Error obteniendo sponsors:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/sponsors/{sponsorId}:
 *   get:
 *     summary: Obtener detalles de un sponsor específico
 *     description: Retorna información detallada de un sponsor específico
 *     parameters:
 *       - in: path
 *         name: sponsorId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del sponsor
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación
 *     responses:
 *       '200':
 *         description: Detalles del sponsor obtenidos exitosamente
 *       '400':
 *         description: Parámetros faltantes
 *       '404':
 *         description: Sponsor no encontrado
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/sponsors/:sponsorId", async (req, res) => {
  try {
    const { sponsorId } = req.params;
    const { raceId, appId } = req.query;

    if (!raceId || !appId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId"]
      });
    }

    const db = admin.firestore();
    console.log(`🔍 Obteniendo sponsor: ${sponsorId} - Race: ${raceId}, App: ${appId}`);

    const sponsorDoc = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('sponsors').doc(sponsorId)
      .get();

    if (!sponsorDoc.exists) {
      return res.status(404).json({
        error: "Sponsor no encontrado",
        sponsorId,
        path: `/races/${raceId}/apps/${appId}/sponsors/${sponsorId}`
      });
    }

    const sponsorData = {
      sponsorId: sponsorDoc.id,
      ...sponsorDoc.data()
    };

    console.log(`✅ Sponsor encontrado: ${sponsorData.name}`);

    return res.status(200).json(sponsorData);

  } catch (error) {
    console.error("❌ Error obteniendo sponsor:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/sponsors/{sponsorId}/stories:
 *   get:
 *     summary: Obtener stories relacionadas con un sponsor
 *     description: Retorna todas las stories que incluyen un sponsor específico en su información
 *     parameters:
 *       - in: path
 *         name: sponsorId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del sponsor
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del evento
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Número máximo de stories a retornar
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de stories a omitir para paginación
 *     responses:
 *       '200':
 *         description: Stories del sponsor obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sponsor:
 *                   type: object
 *                 pagination:
 *                   type: object
 *       '400':
 *         description: Parámetros faltantes
 *       '404':
 *         description: Sponsor no encontrado
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/sponsors/:sponsorId/stories", async (req, res) => {
  try {
    const { sponsorId } = req.params;
    const { raceId, appId, eventId, limit = 20, offset = 0 } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    console.log(`🔍 Obteniendo stories del sponsor: ${sponsorId} - Race: ${raceId}, App: ${appId}, Event: ${eventId}`);

    // Primero verificar que el sponsor existe
    const sponsorDoc = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('sponsors').doc(sponsorId)
      .get();

    if (!sponsorDoc.exists) {
      return res.status(404).json({
        error: "Sponsor no encontrado",
        sponsorId
      });
    }

    const sponsorData = {
      sponsorId: sponsorDoc.id,
      ...sponsorDoc.data()
    };

    // Obtener todos los participantes del evento
    const participantsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants').get();

    if (participantsSnapshot.empty) {
      return res.status(200).json({
        stories: [],
        sponsor: sponsorData,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: 0,
          hasMore: false
        }
      });
    }

    // Recopilar todas las stories que incluyan este sponsor
    const allStories = [];

    for (const participantDoc of participantsSnapshot.docs) {
      const participantData = participantDoc.data();
      const participantId = participantDoc.id;

      const storiesSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories')
        .orderBy('date', 'desc')
        .get();

      // Filtrar stories que incluyan este sponsor
      storiesSnapshot.docs.forEach(storyDoc => {
        const storyData = storyDoc.data();

        // Verificar si la story incluye este sponsor
        // (Asumiendo que las stories tienen un campo sponsors[] o similar)
        const includesSponsor = storyData.sponsors?.some(s =>
          s.sponsorId === sponsorId ||
          s.logo_url === sponsorData.logoUrl ||
          s.name === sponsorData.name
        ) || false;

        if (includesSponsor) {
          allStories.push({
            storyId: storyDoc.id,
            raceId,
            appId,
            eventId,
            participantId,
            participant: participantData,
            sponsor: sponsorData,
            ...storyData
          });
        }
      });
    }

    // Ordenar por fecha descendente
    allStories.sort((a, b) => {
      const dateA = a.date?._seconds || a.date?.seconds || 0;
      const dateB = b.date?._seconds || b.date?.seconds || 0;
      return dateB - dateA;
    });

    // Aplicar paginación
    const total = allStories.length;
    const paginatedStories = allStories.slice(offsetNum, offsetNum + limitNum);

    console.log(`✅ Encontradas ${total} stories para sponsor ${sponsorData.name}, mostrando ${paginatedStories.length}`);

    return res.status(200).json({
      stories: paginatedStories,
      sponsor: sponsorData,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: total,
        hasMore: offsetNum + limitNum < total,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("❌ Error obteniendo stories del sponsor:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/migrate-participants:
 *   post:
 *     summary: Migrar participantes de estructura antigua a nueva
 *     description: Lee participantes de /apps/{appId}/races/{raceId}/events/{eventId}/participants y los migra a /races/{raceId}/apps/{appId}/events/{eventId}/participants con 3 stories por participante
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raceId
 *               - appId
 *               - eventId
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               appId:
 *                 type: string
 *                 description: ID de la aplicación
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *               limit:
 *                 type: integer
 *                 description: Límite de participantes a migrar (opcional, default 10)
 *     responses:
 *       '200':
 *         description: Migración completada exitosamente
 *       '400':
 *         description: Parámetros inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/migrate-participants", async (req, res) => {
  try {
    const { raceId, appId, eventId, limit = 10 } = req.body;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const limitNum = Math.min(parseInt(limit) || 10, 50); // Máximo 50 para evitar timeouts

    console.log(`🔄 Iniciando migración - Race: ${raceId}, App: ${appId}, Event: ${eventId}, Limit: ${limitNum}`);

    // 1. Leer participantes de la estructura ANTIGUA (apps/races/events)
    const oldParticipantsSnapshot = await db.collection('apps').doc(appId)
      .collection('races').doc(raceId)
      .collection('events').doc(eventId)
      .collection('participants')
      .limit(limitNum)
      .get();

    if (oldParticipantsSnapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No hay participantes para migrar",
        migrated: 0,
        participants: []
      });
    }

    console.log(`📋 Encontrados ${oldParticipantsSnapshot.size} participantes en estructura antigua`);

    const migratedParticipants = [];
    const errors = [];

    // 2. Procesar cada participante
    for (const oldParticipantDoc of oldParticipantsSnapshot.docs) {
      try {
        const oldParticipantData = oldParticipantDoc.data();
        const oldParticipantId = oldParticipantDoc.id;

        console.log(`👤 Migrando participante: ${oldParticipantData.name || 'Sin nombre'} (${oldParticipantId})`);

        // 3. Obtener stories del participante en estructura antigua (apps/races/events)
        const oldStoriesSnapshot = await db.collection('apps').doc(appId)
          .collection('races').doc(raceId)
          .collection('events').doc(eventId)
          .collection('participants').doc(oldParticipantId)
          .collection('stories').get();

        // 4. Preparar datos del participante para estructura NUEVA
        const newParticipantData = {
          ...oldParticipantData,
          raceId,
          eventId,
          registerDate: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
          migratedFrom: "old_structure",
          originalId: oldParticipantId
        };

        // 5. Crear participante en estructura NUEVA
        const newParticipantRef = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').add(newParticipantData);

        const newParticipantId = newParticipantRef.id;

        // 6. Obtener una story existente para usar su fileUrl (si existe)
        let existingFileUrl = "https://stream.mux.com/default-video.m3u8";
        let existingDescription = "Video generado automáticamente";

        if (!oldStoriesSnapshot.empty) {
          const firstStory = oldStoriesSnapshot.docs[0].data();
          existingFileUrl = firstStory.fileUrl || existingFileUrl;
          existingDescription = firstStory.description || existingDescription;
        }

        // 7. Crear las 3 stories obligatorias con tipos y splits
        const storiesToCreate = [
          {
            type: "ATHELETE_STARTED",
            fileUrl: existingFileUrl,
            description: `${oldParticipantData.name || 'Participante'} inicia la carrera`,
            splitTime: {
              time: "00:00:00",
              netTime: "00:00:00",
              split: "START",
              checkpoint: "Línea de Salida"
            }
          },
          {
            type: "ATHELETE_CROSSED_TIMING_SPLIT",
            fileUrl: existingFileUrl,
            description: `${oldParticipantData.name || 'Participante'} pasa por checkpoint intermedio`,
            splitTime: {
              time: "00:15:00",
              netTime: "00:14:58",
              split: "INTERMEDIATE",
              checkpoint: "Checkpoint Intermedio"
            }
          },
          {
            type: "ATHELETE_FINISHED",
            fileUrl: existingFileUrl,
            description: `${oldParticipantData.name || 'Participante'} cruza la meta`,
            splitTime: {
              time: "01:00:00",
              netTime: "00:59:55",
              split: "FINISH",
              checkpoint: "Meta Final"
            }
          }
        ];

        const createdStories = [];

        for (let i = 0; i < storiesToCreate.length; i++) {
          const storyTemplate = storiesToCreate[i];

          const storyData = {
            ...storyTemplate,
            participantId: newParticipantId,
            raceId,
            eventId,
            createdAt: timestamp,
            date: timestamp,
            fileName: `migrated_story_${Date.now()}_${i}.mp4`,
            filePath: `participants/${newParticipantId}/stories/migrated_story_${Date.now()}_${i}.mp4`,
            fileSize: 0,
            contentType: "video/mp4",
            mediaType: "video",
            moderationStatus: "approved",
            originType: "migration_automatic",
            duration: 30,
            testData: false,
            migratedFrom: "old_structure"
          };

          const storyRef = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(eventId)
            .collection('participants').doc(newParticipantId)
            .collection('stories').add(storyData);

          createdStories.push({
            storyId: storyRef.id,
            type: storyTemplate.type,
            splitTime: storyTemplate.splitTime
          });
        }

        migratedParticipants.push({
          oldParticipantId,
          newParticipantId,
          name: oldParticipantData.name || 'Sin nombre',
          dorsal: oldParticipantData.dorsal || 'Sin dorsal',
          storiesCreated: createdStories.length,
          stories: createdStories
        });

        console.log(`✅ Participante migrado: ${newParticipantId} con ${createdStories.length} stories`);

      } catch (participantError) {
        console.error(`❌ Error migrando participante ${oldParticipantDoc.id}:`, participantError);
        errors.push({
          participantId: oldParticipantDoc.id,
          error: participantError.message
        });
      }
    }

    console.log(`🎉 Migración completada: ${migratedParticipants.length} participantes migrados`);

    return res.status(200).json({
      success: true,
      message: `Migración completada exitosamente`,
      migrated: migratedParticipants.length,
      participants: migratedParticipants,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        totalProcessed: oldParticipantsSnapshot.size,
        successful: migratedParticipants.length,
        failed: errors.length,
        storiesCreatedPerParticipant: 3
      }
    });

  } catch (error) {
    console.error("❌ Error en migración de participantes:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/checkpoint-participant:
 *   post:
 *     summary: Webhook para recibir datos de checkpoint de participantes
 *     description: Recibe información cuando un participante pasa por un punto de control y actualiza la base de datos
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participantData:
 *                 type: object
 *                 description: Información completa del participante
 *               checkpointData:
 *                 type: object
 *                 description: Información del checkpoint
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *               appId:
 *                 type: string
 *                 description: ID de la aplicación
 *     responses:
 *       '200':
 *         description: Datos procesados exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/checkpoint-participant", async (req, res) => {
  try {
    console.log("🎯 Webhook checkpoint recibido:", JSON.stringify(req.body, null, 2));

    const participantFull = req.body;

    // Validaciones básicas
    if (!participantFull || !participantFull.id) {
      return res.status(400).json({
        error: "Datos de participante inválidos - se requiere ID",
        received: req.body
      });
    }

    // Validar API Key para autenticación máquina-a-máquina
    const apiKey = participantFull.apiKey || req.headers['x-api-key'];
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }

    // Extraer eventId del payload AWS
    const eventId = participantFull.events?.[0]?.event;
    if (!eventId) {
      return res.status(400).json({
        error: "No se encontró eventId en los datos del participante",
        received: participantFull.events
      });
    }

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    console.log(`📋 Procesando participante: ${participantFull.name || participantFull.fullname} (ID: ${participantFull.id}) para eventId: ${eventId}`);

    // 1. Buscar todas las ubicaciones donde existe este eventId
    console.log("🔍 Buscando ubicaciones del eventId...");

    // Por ahora, usar ubicación conocida para testing - luego implementar búsqueda completa
    const locations = [];

    // Verificar ubicación conocida - verificar si existe el documento del evento
    const knownRaceId = "race-001-madrid-marathon";
    const knownAppId = "RtME2RACih6YxgrlmuQR";

    const eventRef = db.collection('races').doc(knownRaceId)
      .collection('apps').doc(knownAppId)
      .collection('events').doc(eventId);

    const eventDoc = await eventRef.get();

    if (eventDoc.exists) {
      locations.push({
        raceId: knownRaceId,
        appId: knownAppId,
        eventId: eventId
      });
      console.log(`📍 Encontrado eventId ${eventId} en ubicación conocida: races/${knownRaceId}/apps/${knownAppId}/events/${eventId}`);
      console.log(`📋 Datos del evento:`, eventDoc.data());
    } else {
      console.log(`⚠️ No existe el documento del evento: races/${knownRaceId}/apps/${knownAppId}/events/${eventId}`);
    }

    // TODO: Implementar búsqueda completa en todas las races/apps cuando sea necesario
    // const racesSnapshot = await db.collection('races').get();
    // for (const raceDoc of racesSnapshot.docs) { ... }

    if (locations.length === 0) {
      return res.status(404).json({
        error: `No se encontraron ubicaciones para eventId: ${eventId}`,
        eventId: eventId,
        suggestion: "Verificar que el eventId existe en la estructura /races/{raceId}/apps/{appId}/events/{eventId}"
      });
    }

    console.log(`📍 Encontradas ${locations.length} ubicaciones para eventId ${eventId}:`, locations);

    // 2. Preparar datos del participante (comunes para todas las ubicaciones)
    const participantData = {
      name: participantFull.name || "",
      lastName: participantFull.surname || "",
      fullName: participantFull.fullname || `${participantFull.name || ""} ${participantFull.surname || ""}`.trim(),
      dorsal: participantFull.events?.[0]?.dorsal || "",
      category: participantFull.events?.[0]?.category || "",
      externalId: participantFull.id,
      birthdate: participantFull.birthdate || "",
      gender: participantFull.gender || "",
      team: participantFull.events?.[0]?.team || "",
      club: participantFull.events?.[0]?.club || "",
      featured: participantFull.events?.[0]?.featured || false,
      status: participantFull.events?.[0]?.status || "notstarted",
      realStatus: participantFull.events?.[0]?.realStatus || "notstarted",
      event: participantFull.events?.[0]?.event || "",
      chip: participantFull.events?.[0]?.chip || [],
      wave: participantFull.events?.[0]?.wave || "",
      locations: participantFull.locations || [],
      extraFields: {
        extrafield1: participantFull.extrafield1 || "",
        extrafield2: participantFull.extrafield2 || "",
        extrafield3: participantFull.extrafield3 || "",
        extrafield4: participantFull.extrafield4 || "",
        extrafield5: participantFull.extrafield5 || ""
      },
      eventId,
      webhookProcessedAt: timestamp,
      updatedAt: timestamp
    };

    // 3. Procesar participante en cada ubicación encontrada
    const results = [];

    for (const location of locations) {
      const { raceId, appId, eventId: locationEventId } = location;

      try {
        console.log(`🔄 Procesando en ubicación: raceId=${raceId}, appId=${appId}, eventId=${locationEventId}`);

        // Agregar raceId específico a los datos del participante para esta ubicación
        const locationParticipantData = {
          ...participantData,
          raceId: raceId
        };

        // Buscar participante existente por externalId en esta ubicación
        const existingParticipantQuery = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(locationEventId)
          .collection('participants')
          .where('externalId', '==', participantFull.id)
          .limit(1)
          .get();

        let participantRef;
        let participantId;
        let isNewParticipant = false;

        if (!existingParticipantQuery.empty) {
          // Participante existe - actualizar
          participantRef = existingParticipantQuery.docs[0].ref;
          participantId = existingParticipantQuery.docs[0].id;
          await participantRef.update(locationParticipantData);
          console.log(`✅ Participante actualizado: ${participantId} en ${raceId}/${appId}`);
        } else {
          // Participante nuevo - crear
          locationParticipantData.createdAt = timestamp;
          locationParticipantData.registerDate = timestamp;
          participantRef = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(locationEventId)
            .collection('participants').add(locationParticipantData);
          participantId = participantRef.id;
          isNewParticipant = true;
          console.log(`🆕 Participante creado: ${participantId} en ${raceId}/${appId}`);
        }

        // 4. Procesar tiempos y crear stories para cada checkpoint en esta ubicación
        const storiesCreated = [];
        const times = participantFull.events?.[0]?.times || {};

        for (const [pointName, pointTime] of Object.entries(times)) {
          try {
            // Determinar tipo de story basado en el punto
            let storyType = "ATHELETE_CROSSED_TIMING_SPLIT";
            if (pointName.toLowerCase().includes('start') || pointName.toLowerCase().includes('salida')) {
              storyType = "ATHELETE_STARTED";
            } else if (pointName.toLowerCase().includes('finish') || pointName.toLowerCase().includes('meta')) {
              storyType = "ATHELETE_FINISHED";
            }

            // Crear datos de la story
            const storyData = {
              type: storyType,
              participantId: participantId,
              raceId: raceId,
              eventId: locationEventId,
              createdAt: timestamp,
              date: timestamp,
              fileName: `webhook_${pointName}_${Date.now()}.mp4`,
              filePath: `participants/${participantId}/stories/webhook_${pointName}_${Date.now()}.mp4`,
              fileSize: 0,
              contentType: "video/mp4",
              mediaType: "video",
              moderationStatus: "approved",
              originType: "webhook_automatic",
              duration: 30,
              testData: false,
              description: `${locationParticipantData.fullName} - ${pointName}`,
              fileUrl: "", // Se puede agregar URL de video si está disponible
              splitTime: {
                time: pointTime.time || "",
                netTime: pointTime.netTime || "",
                split: pointName,
                checkpoint: pointName,
                rawTime: pointTime.raw || null,
                position: pointTime.position || null
              },
              webhookData: {
                originalPointName: pointName,
                pointTimeData: pointTime,
                processedAt: new Date().toISOString()
              }
            };

            // Verificar si ya existe una story para este checkpoint en esta ubicación
            const existingStoryQuery = await db.collection('races').doc(raceId)
              .collection('apps').doc(appId)
              .collection('events').doc(locationEventId)
              .collection('participants').doc(participantId)
              .collection('stories')
              .where('splitTime.split', '==', pointName)
              .limit(1)
              .get();

            if (existingStoryQuery.empty) {
              // Crear nueva story
              const storyRef = await db.collection('races').doc(raceId)
                .collection('apps').doc(appId)
                .collection('events').doc(locationEventId)
                .collection('participants').doc(participantId)
                .collection('stories').add(storyData);

              storiesCreated.push({
                storyId: storyRef.id,
                type: storyType,
                checkpoint: pointName,
                time: pointTime.time || ""
              });

              console.log(`📖 Story creada: ${storyRef.id} para checkpoint ${pointName} en ${raceId}/${appId}`);
            } else {
              // Actualizar story existente
              const existingStoryRef = existingStoryQuery.docs[0].ref;
              await existingStoryRef.update({
                ...storyData,
                updatedAt: timestamp
              });

              storiesCreated.push({
                storyId: existingStoryQuery.docs[0].id,
                type: storyType,
                checkpoint: pointName,
                time: pointTime.time || "",
                updated: true
              });

              console.log(`🔄 Story actualizada: ${existingStoryQuery.docs[0].id} para checkpoint ${pointName} en ${raceId}/${appId}`);
            }

          } catch (storyError) {
            console.error(`❌ Error procesando checkpoint ${pointName} en ${raceId}/${appId}:`, storyError);
          }
        }

        // Agregar resultado de esta ubicación
        results.push({
          raceId: raceId,
          appId: appId,
          eventId: locationEventId,
          participant: {
            id: participantId,
            externalId: participantFull.id,
            name: locationParticipantData.fullName,
            dorsal: locationParticipantData.dorsal,
            status: locationParticipantData.status,
            isNew: isNewParticipant
          },
          stories: {
            created: storiesCreated.length,
            details: storiesCreated
          },
          checkpoints: Object.keys(times).length
        });

      } catch (locationError) {
        console.error(`❌ Error procesando ubicación ${raceId}/${appId}:`, locationError);
        results.push({
          raceId: raceId,
          appId: appId,
          eventId: locationEventId,
          error: locationError.message,
          success: false
        });
      }
    }

    // 5. Respuesta final con todos los resultados
    return res.status(200).json({
      success: true,
      message: "Webhook procesado exitosamente en todas las ubicaciones",
      eventId: eventId,
      locationsProcessed: locations.length,
      results: results,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error procesando webhook checkpoint:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @openapi
 * /api/race-events:
 *   get:
 *     summary: Obtener eventos de carrera
 *     description: Obtiene eventos de carrera filtrados por tipo, con información completa de participantes, sponsors, stories, etc.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del evento
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ATHELETE_CROSSED_TIMING_SPLIT, COMPLETE_AWARD, ATHELETE_STARTED, SPONSOR, ATHELETE_FINISHED]
 *         description: Filtrar por tipo de evento
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Límite de resultados
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset para paginación
 *     responses:
 *       '200':
 *         description: Stories de eventos obtenidas exitosamente
 *       '400':
 *         description: Parámetros faltantes
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/race-events", async (req, res) => {
  try {
    const { raceId, appId, eventId, type, limit = 20, offset = 0 } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    console.log(`🔍 Obteniendo eventos de carrera desde stories - Race: ${raceId}, App: ${appId}, Event: ${eventId}, Type: ${type || 'ALL'}`);

    // Obtener sponsors una vez - ESTRUCTURA CORRECTA: races/apps
    const sponsorsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('sponsors').get();

    const sponsors = sponsorsSnapshot.docs.map(doc => ({
      sponsorId: doc.id,
      ...doc.data()
    }));

    const sponsorsFormatted = sponsors.map(sponsor => ({
      logo_url: sponsor.logoUrl || "",
      poster_url: sponsor.posterUrl || ""
    }));

    // Obtener todos los participantes - ESTRUCTURA CORRECTA: races/apps/events
    const participantsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants').get();

    if (participantsSnapshot.empty) {
      return res.status(200).json({
        stories: [],
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: 0,
          hasMore: false
        }
      });
    }

    // Recopilar todas las stories de todos los participantes
    const allStories = [];

    for (const participantDoc of participantsSnapshot.docs) {
      const participantData = participantDoc.data();
      const participantId = participantDoc.id;

      // Obtener stories del participante - ESTRUCTURA CORRECTA: races/apps/events
      let storiesQuery = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories');

      // Filtrar por tipo si se especifica (usando índice de Firestore)
      if (type) {
        storiesQuery = storiesQuery.where('type', '==', type);
        console.log(`🔍 Aplicando filtro Firestore: type == '${type}'`);
      }

      // Agregar ordenamiento
      storiesQuery = storiesQuery.orderBy('date', 'desc');

      const storiesSnapshot = await storiesQuery.get();
      console.log(`📊 Participante ${participantId}: ${storiesSnapshot.size} stories encontradas`);

      // Procesar cada story como un evento
      storiesSnapshot.docs.forEach(storyDoc => {
        const storyData = storyDoc.data();

        // Crear story con formato de evento
        // Determinar si fileUrl es imagen o video basado en mediaType
        const isVideo = storyData.mediaType === "video";
        const isImage = storyData.mediaType === "image";

        const story = {
          storyId: storyDoc.id,
          type: storyData.type || "ATHELETE_STARTED",
          participant: participantData,
          split_time: storyData.splitTime || {},
          image_url: isImage ? (storyData.fileUrl || "") : "",
          video_url: isVideo ? (storyData.fileUrl || "") : "",
          sponsors: sponsorsFormatted,
          // Datos adicionales de la story
          description: storyData.description || "",
          duration: storyData.duration || 0,
          createdAt: storyData.createdAt,
          date: storyData.date,
          moderationStatus: storyData.moderationStatus || "",
          originType: storyData.originType || ""
        };

        // Agregar campos específicos según el tipo
        switch (storyData.type) {
          case 'SPONSOR':
            story.free_text = storyData.description || "";
            story.poster_url = storyData.fileUrl || "";
            break;
          case 'COMPLETE_AWARD':
            story.rankings = storyData.rankings || [];
            break;
        }

        allStories.push(story);
      });
    }

    // Ordenar todas las stories por fecha
    allStories.sort((a, b) => {
      const dateA = a.date?._seconds || a.date?.seconds || 0;
      const dateB = b.date?._seconds || b.date?.seconds || 0;
      return dateB - dateA; // Más reciente primero
    });

    // Aplicar paginación
    const paginatedStories = allStories.slice(offsetNum, offsetNum + limitNum);

    console.log(`✅ ${paginatedStories.length} stories procesadas de ${allStories.length} total`);

    return res.status(200).json({
      stories: paginatedStories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: allStories.length,
        hasMore: (offsetNum + limitNum) < allStories.length
      }
    });

  } catch (error) {
    console.error("❌ Error obteniendo eventos de carrera:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
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
 *     description: Realiza una búsqueda de participantes en Firestore con múltiples campos (nombre, dorsal, categoría, equipo).
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
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera.
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación.
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del evento.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Número máximo de resultados a retornar.
 *     responses:
 *       '200':
 *         description: Búsqueda realizada exitosamente.
 *       '400':
 *         description: Parámetros requeridos faltantes.
 *       '500':
 *         description: Error en la búsqueda.
 */

router.get("/search/participants", async (req, res) => {
  try {
    const { query, userId, raceId, appId, eventId, limit = 20 } = req.query;

    // Validar parámetros requeridos
    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Los parámetros raceId, appId y eventId son obligatorios."
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    console.log(`🔍 Búsqueda de participantes: query="${query}", raceId=${raceId}, appId=${appId}, eventId=${eventId}`);

    // Referencia a la colección de participantes
    const participantsRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants");

    let allParticipants = [];

    if (!query || query.trim() === "") {
      // Si no hay query, devolver todos los participantes
      console.log("📋 Obteniendo todos los participantes (sin filtro)");
      const snapshot = await participantsRef.limit(limitNum).get();
      allParticipants = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } else {
      // Realizar búsqueda con múltiples campos
      const searchTerm = query.trim();
      const searchTermLower = searchTerm.toLowerCase();

      console.log(`🔍 Buscando: "${searchTerm}"`);

      // Búsquedas paralelas en diferentes campos
      const searchPromises = [];

      // 1. Búsqueda por nombre (case-insensitive usando >= y <=)
      if (isNaN(searchTerm)) {
        // Solo buscar por nombre si no es un número
        const nameSearchUpper = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();
        searchPromises.push(
          participantsRef
            .where("name", ">=", nameSearchUpper)
            .where("name", "<=", nameSearchUpper + '\uf8ff')
            .limit(limitNum)
            .get()
        );

        // Búsqueda por fullName
        searchPromises.push(
          participantsRef
            .where("fullName", ">=", nameSearchUpper)
            .where("fullName", "<=", nameSearchUpper + '\uf8ff')
            .limit(limitNum)
            .get()
        );
      }

      // 2. Búsqueda por dorsal (exacta)
      searchPromises.push(
        participantsRef
          .where("dorsal", "==", searchTerm)
          .limit(limitNum)
          .get()
      );

      // 3. Búsqueda por categoría (exacta)
      searchPromises.push(
        participantsRef
          .where("category", "==", searchTerm)
          .limit(limitNum)
          .get()
      );

      // 4. Búsqueda por equipo
      if (isNaN(searchTerm)) {
        searchPromises.push(
          participantsRef
            .where("team", ">=", searchTerm)
            .where("team", "<=", searchTerm + '\uf8ff')
            .limit(limitNum)
            .get()
        );
      }

      // Ejecutar todas las búsquedas en paralelo
      const searchResults = await Promise.all(searchPromises);

      // Combinar resultados y eliminar duplicados
      const participantMap = new Map();

      searchResults.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          if (!participantMap.has(doc.id)) {
            participantMap.set(doc.id, {
              id: doc.id,
              ...doc.data()
            });
          }
        });
      });

      allParticipants = Array.from(participantMap.values());

      // Filtrado adicional en memoria para búsquedas más flexibles
      if (allParticipants.length < limitNum && searchTerm.length > 2) {
        allParticipants = allParticipants.filter(participant => {
          const name = (participant.name || "").toLowerCase();
          const lastName = (participant.lastName || "").toLowerCase();
          const fullName = (participant.fullName || "").toLowerCase();
          const dorsal = (participant.dorsal || "").toLowerCase();
          const category = (participant.category || "").toLowerCase();
          const team = (participant.team || "").toLowerCase();

          return name.includes(searchTermLower) ||
                 lastName.includes(searchTermLower) ||
                 fullName.includes(searchTermLower) ||
                 dorsal.includes(searchTermLower) ||
                 category.includes(searchTermLower) ||
                 team.includes(searchTermLower);
        });
      }

      // Limitar resultados finales
      allParticipants = allParticipants.slice(0, limitNum);
    }

    console.log(`📊 Encontrados ${allParticipants.length} participantes`);

    // Continuar con la lógica de seguimientos...

    // Crear un mapa de participantes seguidos para comparación eficiente
    const followedParticipantsMap = new Map();

    if (userId) {
      try {
        console.log(`👥 Obteniendo seguimientos para usuario: ${userId}`);

        // Obtener todos los seguimientos del usuario
        let followingsQuery = db.collection("users")
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
        console.log(`📋 Encontrados ${followingsSnapshot.size} seguimientos`);

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

    // Enriquecer los resultados agregando el campo "following"
    const participantsWithFollowing = allParticipants.map(participant => {
      let isFollowing = false;

      if (userId && followedParticipantsMap.size > 0) {
        const participantId = participant.id;

        if (raceId && eventId) {
          // Comparación específica por race/event
          const specificKey = `${participantId}_${raceId}_${eventId}`;
          isFollowing = followedParticipantsMap.has(specificKey);
        } else {
          // Comparación general (cualquier race/event)
          isFollowing = followedParticipantsMap.has(participantId);
        }
      }

      // Mapear a la estructura esperada por el frontend
      const enrichedParticipant = {
        id: participant.id,
        objectID: participant.id, // Para compatibilidad con frontend que espera objectID
        name: participant.name || participant.fullName || "",
        fullName: participant.fullName || `${participant.name || ""} ${participant.lastName || ""}`.trim(),
        bib: participant.dorsal || null,
        dorsal: participant.dorsal || null,
        category: participant.category || null,
        team: participant.team || null,
        club: participant.club || null,
        gender: participant.gender || null,
        featured: participant.featured || false,
        status: participant.status || "unknown",
        following: isFollowing,
        raceId: raceId,
        eventId: eventId,
        appId: appId,
        // Campos adicionales disponibles
        birthdate: participant.birthdate || null,
        country: participant.country || null,
        wave: participant.wave || null,
        chip: participant.chip || null
      };

      return enrichedParticipant;
    });

    console.log(`✅ Búsqueda completada: ${participantsWithFollowing.length} participantes encontrados`);

    return res.status(200).json({
      participants: participantsWithFollowing,
      total: participantsWithFollowing.length,
      query: query || "",
      searchMethod: "firestore_native",
      raceId,
      appId,
      eventId
    });
  } catch (error) {
    console.error("Error en la búsqueda de participantes:", error);
    return res.status(500).json({
      error: "Error en la búsqueda",
      message: error.message
    });
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

      // 5. Obtener races de esta app - ESTRUCTURA CORREGIDA: races/apps
      // Necesitamos buscar en todas las races donde esta app esté presente
      const racesSnapshot = await db.collection('races').get();

      const races = [];

      for (const raceDoc of racesSnapshot.docs) {
        const raceData = raceDoc.data();
        const raceId = raceDoc.id;

        // 6. Verificar si esta app existe en esta race
        const appInRaceDoc = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId).get();

        if (appInRaceDoc.exists) {
          // 7. Obtener events de esta race para esta app - ESTRUCTURA CORREGIDA: races/apps/events
          const eventsSnapshot = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
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

// 🔥 Configurar rutas FCM
router.use("/fcm", fcmTokensRouter);

/**
 * @openapi
 * /api/generate-test-data:
 *   post:
 *     summary: Generar datos de prueba variados
 *     description: Genera participantes, stories y sponsors de prueba con datos realistas y variados
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 default: "race-001-madrid-marathon"
 *               appId:
 *                 type: string
 *                 default: "RtME2RACih6YxgrlmuQR"
 *               eventId:
 *                 type: string
 *                 default: "event-0"
 *               participantsCount:
 *                 type: integer
 *                 default: 50
 *               storiesPerParticipant:
 *                 type: integer
 *                 default: 3
 *     responses:
 *       '200':
 *         description: Datos de prueba generados exitosamente
 *       '400':
 *         description: Parámetros inválidos
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/generate-test-data", async (req, res) => {
  try {
    const {
      raceId = "race-001-madrid-marathon",
      appId = "RtME2RACih6YxgrlmuQR",
      eventId = "event-0",
      participantsCount = 50,
      storiesPerParticipant = 3
    } = req.body;

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    console.log(`🎲 Generando datos de prueba: ${participantsCount} participantes, ${storiesPerParticipant} stories cada uno`);

    // Arrays de datos realistas
    const firstNames = [
      "Carlos", "María", "José", "Ana", "Luis", "Carmen", "Antonio", "Isabel", "Francisco", "Pilar",
      "Manuel", "Dolores", "David", "Teresa", "Jesús", "Rosario", "Javier", "Laura", "Rafael", "Antonia",
      "Miguel", "Francisca", "Ángel", "Cristina", "José María", "Mercedes", "Alejandro", "Concepción", "Daniel", "Lucía",
      "John", "Emma", "Michael", "Olivia", "William", "Ava", "James", "Isabella", "Alexander", "Sophia",
      "Hiroshi", "Yuki", "Takeshi", "Sakura", "Kenji", "Akiko", "Ryo", "Mei", "Daisuke", "Hana"
    ];

    const lastNames = [
      "García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín",
      "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Alonso", "Gutiérrez",
      "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
      "Tanaka", "Suzuki", "Takahashi", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida"
    ];

    const categories = ["Seniors", "Masters", "Elite", "Sub-23", "Veteranos", "Juvenil"];
    const teams = ["Team Nike", "Adidas Running", "Club Atlético", "Runners Madrid", "Team Elite", "Marathon Club"];
    const clubs = ["Club Deportivo Central", "Atlético Madrileño", "Running Club Elite", "Deportivo Municipal"];

    const checkpoints = [
      { name: "START", time: "00:00:00", distance: 0 },
      { name: "5K", time: "00:25:00", distance: 5 },
      { name: "10K", time: "00:50:00", distance: 10 },
      { name: "HALF", time: "01:52:00", distance: 21.1 },
      { name: "30K", time: "02:30:00", distance: 30 },
      { name: "FINISH", time: "03:30:00", distance: 42.195 }
    ];

    const videoUrls = [
      "https://stream.mux.com/8fqCWmerI00DOAlwTc00foVx6UvmvTG1EKDuxicStvKLg.m3u8",
      "https://stream.mux.com/LNhJJdYUakWgrg2ef029x4g8wWwfquH61zry2fuF99Rs.m3u8",
      "https://stream.mux.com/QDTlIze8Lp8DHbV0001n501JHiFUEcJkYQ7tdITNUdepek.m3u8"
    ];

    let participantsCreated = 0;
    let storiesCreated = 0;

    // Generar participantes
    for (let i = 0; i < participantsCount; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const dorsal = String(2000 + i).padStart(4, '0');
      const category = categories[Math.floor(Math.random() * categories.length)];
      const team = teams[Math.floor(Math.random() * teams.length)];
      const club = clubs[Math.floor(Math.random() * clubs.length)];
      const featured = Math.random() < 0.15; // 15% destacados

      const participantId = `GEN_PARTICIPANT_${Date.now()}_${i}`;

      const participantData = {
        name: firstName,
        lastName: lastName,
        fullName: `${firstName} ${lastName}`,
        dorsal: dorsal,
        category: category,
        externalId: participantId,
        birthdate: `19${70 + Math.floor(Math.random() * 30)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
        gender: Math.random() < 0.5 ? "male" : "female",
        team: team,
        club: club,
        featured: featured,
        status: "running",
        realStatus: "running",
        event: eventId,
        chip: [parseInt(dorsal)],
        wave: String(Math.floor(Math.random() * 5) + 1),
        eventId: eventId,
        raceId: raceId,
        createdAt: timestamp,
        registerDate: timestamp,
        updatedAt: timestamp,
        country: Math.random() < 0.8 ? "España" : ["USA", "Japan", "France", "Germany"][Math.floor(Math.random() * 4)],
        profilePicture: "",
        description: `Corredor ${category.toLowerCase()} del ${team}`,
        additionalData: {
          importedFrom: "test-data-generator",
          featured: featured,
          apiVersion: "2.0",
          importedAt: timestamp,
          color: ["905cb7", "00a8df", "ff6b6b", "4ecdc4", "45b7d1"][Math.floor(Math.random() * 5)],
          event: Math.random() < 0.6 ? "Maratón" : "21K"
        }
      };

      // Crear participante
      await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .set(participantData);

      participantsCreated++;

      // Generar stories para este participante
      const numStories = Math.min(storiesPerParticipant, checkpoints.length);
      const selectedCheckpoints = checkpoints.slice(0, numStories);

      for (let j = 0; j < selectedCheckpoints.length; j++) {
        const checkpoint = selectedCheckpoints[j];
        const storyId = `story_gen_${Date.now()}_${i}_${j}`;

        // Calcular tiempo realista
        const baseTime = checkpoint.time;
        const variation = (Math.random() - 0.5) * 0.3; // ±30% variación
        const [hours, minutes, seconds] = baseTime.split(':').map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const adjustedSeconds = Math.max(0, totalSeconds * (1 + variation));

        const finalHours = Math.floor(adjustedSeconds / 3600);
        const finalMinutes = Math.floor((adjustedSeconds % 3600) / 60);
        const finalSecs = Math.floor(adjustedSeconds % 60);
        const finalTime = `${String(finalHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}:${String(finalSecs).padStart(2, '0')}`;

        // Determinar tipo de historia
        let storyType;
        if (checkpoint.name === "START") {
          storyType = "ATHELETE_STARTED";
        } else if (checkpoint.name === "FINISH") {
          storyType = "ATHELETE_FINISHED";
        } else {
          storyType = "ATHELETE_CROSSED_TIMING_SPLIT";
        }

        const storyData = {
          type: storyType,
          participantId: participantId,
          raceId: raceId,
          eventId: eventId,
          fileName: `${storyId}.mp4`,
          filePath: `participants/${participantId}/stories/${storyId}.mp4`,
          fileSize: Math.floor(Math.random() * 50000000) + 10000000,
          contentType: "video/mp4",
          mediaType: "video",
          moderationStatus: "approved",
          originType: "automatic_global",
          duration: 20 + Math.floor(Math.random() * 40),
          testData: true,
          description: `${firstName} ${lastName} - ${checkpoint.name}`,
          fileUrl: videoUrls[Math.floor(Math.random() * videoUrls.length)],
          sourceUrl: videoUrls[Math.floor(Math.random() * videoUrls.length)],
          split_time: {
            time: finalTime,
            netTime: finalTime,
            split: checkpoint.name,
            checkpoint: checkpoint.name,
            rawTime: Date.now() - (Math.random() * 86400000),
            position: Math.floor(Math.random() * participantsCount) + 1,
            distance: checkpoint.distance
          },
          date: timestamp,
          createdAt: timestamp
        };

        // Crear story
        await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').doc(participantId)
          .collection('stories').doc(storyId)
          .set(storyData);

        storiesCreated++;
      }

      // Log progreso cada 10 participantes
      if ((i + 1) % 10 === 0) {
        console.log(`📊 Progreso: ${i + 1}/${participantsCount} participantes creados`);
      }
    }

    console.log(`✅ Generación completada: ${participantsCreated} participantes, ${storiesCreated} stories`);

    return res.status(200).json({
      success: true,
      message: "Datos de prueba generados exitosamente",
      data: {
        participantsCreated: participantsCreated,
        storiesCreated: storiesCreated,
        raceId: raceId,
        appId: appId,
        eventId: eventId
      }
    });

  } catch (error) {
    console.error("❌ Error generando datos de prueba:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

export default router;