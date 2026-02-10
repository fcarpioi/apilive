// apiGeneral.mjs
import express from "express";
//import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import axios from 'axios';

/**
 * Función para normalizar encoding UTF-8 en objetos
 */
function normalizeUTF8InObject(obj) {
  if (typeof obj === 'string') {
    // Detectar y corregir doble encoding UTF-8
    try {
      let normalized = obj;

      // Corregir secuencias comunes de doble encoding
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

      for (const [corrupted, correct] of Object.entries(replacements)) {
        normalized = normalized.replace(new RegExp(corrupted, 'g'), correct);
      }

      console.log(`🔤 UTF-8 normalizado: "${obj}" → "${normalized}"`);
      return normalized;
    } catch (error) {
      console.warn('Error normalizando UTF-8:', error);
      return obj;
    }
  } else if (Array.isArray(obj)) {
    return obj.map(item => normalizeUTF8InObject(item));
  } else if (obj && typeof obj === 'object') {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[normalizeUTF8InObject(key)] = normalizeUTF8InObject(value);
    }
    return normalized;
  }
  return obj;
}
// import monitor from "../monitoring/websocketMonitor.mjs"; // COMENTADO TEMPORALMENTE
//import dotenv from "dotenv";
//dotenv.config();

// Importar rutas FCM
import fcmTokensRouter from "./fcmTokens.mjs";

// Importar rutas de upload (MIGRADAS)
import uploadStoryRouter from "./uploadStory.mjs";
import uploadMediaRouter from "./uploadMedia.mjs";
import uploadRouter from "./upload.mjs";

// Importar servicios
import copernicoService from "../services/copernicoService.mjs";

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}  
//router.use(cors({ origin: true }));
const router = express.Router();

const eventResolutionCache = new Map();
const EVENT_CACHE_TTL_MS = 5 * 60 * 1000;

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
 * /api/config-v4:
 *   get:
 *     summary: Obtener configuración con eventos priorizando Copernico (v4)
 */
router.get("/config-v4", async (req, res) => {
  try {
    const { raceId, appId } = req.query;

    if (!raceId || !appId) {
      return res.status(400).json({
        error: "raceId y appId son obligatorios",
        required: ["raceId", "appId"]
      });
    }

    console.log(`⚙️ [getConfigV4] Buscando app - raceId: ${raceId}, appId: ${appId}`);

    const db = admin.firestore();
    const appDoc = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId).get();

    if (!appDoc.exists) {
      return res.status(404).json({
        error: "App no encontrada",
        filters: { raceId, appId }
      });
    }

    const targetApp = { id: appDoc.id, ...appDoc.data() };
    const targetRaceId = raceId;

    const raceDoc = await db.collection('races').doc(targetRaceId).get();
    const raceData = raceDoc.exists ? raceDoc.data() : {};

    const eventsSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('events').get();

    const mediaSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('media').get();

    const media = mediaSnapshot.docs.map(mediaDoc => ({
      mediaId: mediaDoc.id,
      ...mediaDoc.data()
    }));

    const mediaByType = {
      sponsors: media.filter(m => m.type === 'sponsors'),
      logos: media.filter(m => m.type === 'logos'),
      videos: media.filter(m => m.type === 'videos'),
      images: media.filter(m => m.type === 'images'),
      posters: media.filter(m => m.type === 'posters')
    };

    let copernicoEvents = [];
    let copernicoEnv = raceData?.copernicoEnv || null;
    let raceSlug = raceData?.race_info?.id || targetRaceId;

    try {
      const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
      const baseUrl = envConfig.baseUrl;
      const headers = copernicoService.config.getRequestHeaders(copernicoEnv);
      const raceUrl = `${baseUrl}/${raceSlug}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

      const response = await fetch(raceUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      copernicoEvents = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    } catch (copernicoError) {
      console.warn("⚠️ [getConfigV4] No se pudo obtener eventos de Copernico:", copernicoError.message);
    }

    const normalizeKey = (value) => String(value || '').trim().toLowerCase();
    const buildRanking = (payload) => ({ ...payload });
    const buildPublishedRankings = (raceEvent) => {
      const categoryRankings = (raceEvent?.categories || []).map(category => buildRanking({
        name: category.name,
        family: "General",
        event: raceEvent.name,
        type: 'category',
        "type-value": category.name
      }));
      const genderRankings = ['male', 'female'].map(gender => buildRanking({
        name: gender,
        family: "General",
        event: raceEvent.name,
        type: 'gender',
        "type-value": gender
      }));
      const attrRankings = (raceEvent?.attributes || []).map(attr =>
        (attr.options || []).map(({ value }) => buildRanking({
          name: `${attr.name} ${value}`,
          family: "General",
          event: raceEvent.name,
          type: `attribute:${attr.name}`,
          "type-value": value
        }))
      ).flat();

      return [
        buildRanking({ name: "overall", "family": "General", event: raceEvent.name, type: "overall", "type-value": "" }),
        ...categoryRankings,
        ...genderRankings,
        ...attrRankings
      ];
    };

    const events = eventsSnapshot.docs.map(eventDoc => {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;
      const eventName = eventData?.name || eventId;

      const matchingEvent = copernicoEvents.find(evt =>
        normalizeKey(evt?.name) === normalizeKey(eventName) ||
        normalizeKey(evt?.name) === normalizeKey(eventId)
      );

      if (!matchingEvent) {
        return null;
      }

      const publishedRankings = buildPublishedRankings(matchingEvent || {});
      const eventMaps = matchingEvent?.maps ?? matchingEvent?.map ?? [];
      return {
        eventId: eventId,
        ...eventData,
        media: mediaByType,
        publishedRankings,
        maps: eventMaps,
        splits: matchingEvent?.splits || null,
        locations: matchingEvent?.locations || null
      };
    }).filter(Boolean);

    const { sponsors, images, videos, logos, ...cleanAppData } = targetApp;
    const response = {
      app: {
        appId: targetApp.id,
        name: targetApp.name,
        raceId: targetRaceId,
        raceName: raceData.name || targetApp.raceName,
        bundleId: targetApp.bundleId,
        ...cleanAppData,
        events: events,
        eventsCount: events.length,
        mediaCount: media.length
      },
      summary: {
        totalEvents: events.length,
        totalMedia: media.length,
        mediaByType: {
          sponsors: mediaByType.sponsors.length,
          logos: mediaByType.logos.length,
          videos: mediaByType.videos.length,
          images: mediaByType.images.length,
          posters: mediaByType.posters.length
        }
      }
    };

    console.log(`✅ [getConfigV4] Configuración obtenida exitosamente`);
    return res.status(200).json(response);
  } catch (error) {
    console.error("❌ Error en GET /api/config-v4:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
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
 *     description: Permite que un usuario siga a un participante en un evento. MIGRADO para nueva estructura con appId opcional.
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
 *                 description: Identificador de la carrera (requerido)
 *               appId:
 *                 type: string
 *                 description: Identificador de la aplicación (requerido)
 *               eventId:
 *                 type: string
 *             required:
 *               - followerId
 *               - followingId
 *               - raceId
 *               - appId
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
    let { followerId, followingId, raceId, appId, eventId } = req.body;
    if (!followerId || !followingId || !raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "followerId, followingId, raceId, appId y eventId son obligatorios.",
      });
    }

    // Normalizar eventId para evitar problemas de encoding
    eventId = normalizeUTF8InObject(eventId);

    const db = admin.firestore();

    // 🆕 NUEVA ESTRUCTURA: Solo buscar en estructura con appId
    console.log(`🔍 [FOLLOW] Buscando participante: races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`);
    const participantRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(followingId);

    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({
        message: "El participante no existe en este evento.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`
      });
    }
    const followingsRef = db.collection("users").doc(followerId).collection("followings").doc(followingId);
    const followersRef = participantRef.collection("followers").doc(followerId);
    const alreadyFollowing = await followingsRef.get();
    if (alreadyFollowing.exists) {
      return res.status(400).json({ message: "Ya sigues a este participante." });
    }

    // 💾 Guardar seguimiento con appId si está disponible
    const followingData = {
      profileType: "participant",
      profileId: followingId,
      raceId: raceId,
      eventId: eventId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // ✅ Agregar appId si está disponible (nueva estructura)
    if (appId) {
      followingData.appId = appId;
    }

    await followingsRef.set(followingData);
    await followersRef.set({
      profileType: "user",
      profileId: followerId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const response = {
      message: "Seguimiento registrado correctamente.",
      followerId,
      followingId,
      raceId,
      eventId,
    };

    // ✅ Incluir appId en respuesta si está disponible
    if (appId) {
      response.appId = appId;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error al seguir participante:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

// Nueva version con carga de participante basica y creacion de historias en background
router.post("/follow-v3", async (req, res) => {
  try {
    let { followerId, followingId, raceId, appId, eventId } = req.body;
    if (!followerId || !followingId || !raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "followerId, followingId, raceId, appId y eventId son obligatorios."
      });
    }

    eventId = normalizeUTF8InObject(eventId);
    const db = admin.firestore();

    const participantRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(followingId);

    let participantDoc = await participantRef.get();
    let resolvedExternalId = followingId;
    let participantData = null;
    let transformedData = null;

    if (participantDoc.exists) {
      const existingData = participantDoc.data() || {};
      resolvedExternalId = existingData.externalId || followingId;
      participantData = existingData;
    } else {
      let raceSlug = raceId;
      let copernicoEnv = null;
      try {
        const raceDoc = await db.collection("races").doc(raceId).get();
        if (raceDoc.exists) {
          const raceData = raceDoc.data();
          if (raceData?.copernicoEnv) {
            copernicoEnv = raceData.copernicoEnv;
          }
          if (raceData?.race_info?.id) {
            raceSlug = raceData.race_info.id;
          }
        }
      } catch (raceError) {
        console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
      }

      try {
        const copernicoData = await copernicoService.getParticipantData(raceSlug, resolvedExternalId, copernicoEnv);
        transformedData = copernicoService.transformCopernicoData(copernicoData);
        participantData = transformedData.participant;
        resolvedExternalId = transformedData.participant.externalId || resolvedExternalId;
      } catch (copernicoError) {
        console.warn("No se pudo obtener participante desde Copernico:", copernicoError.message);
        participantData = {
          externalId: resolvedExternalId,
          fullName: `Participante ${resolvedExternalId}`
        };
      }

      const basicParticipantData = {
        externalId: resolvedExternalId,
        name: participantData.name || null,
        lastName: participantData.lastName || null,
        fullName: participantData.fullName || `${participantData.name || ""} ${participantData.lastName || ""}`.trim(),
        gender: participantData.gender || null,
        birthdate: participantData.birthdate || null,
        country: participantData.country || participantData.nationality || null,
        nationality: participantData.nationality || null,
        dorsal: participantData.dorsal || null,
        category: participantData.category || null,
        team: participantData.team || null,
        club: participantData.club || null,
        featured: participantData.featured || false,
        raceId,
        eventId,
        competitionId: raceId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        registerDate: admin.firestore.FieldValue.serverTimestamp()
      };

      await participantRef.set(basicParticipantData);
      participantDoc = await participantRef.get();
      participantData = basicParticipantData;
    }

    const followingsRef = db.collection("users").doc(followerId).collection("followings").doc(followingId);
    const followersRef = participantRef.collection("followers").doc(followerId);
    const alreadyFollowing = await followingsRef.get();
    if (alreadyFollowing.exists) {
      return res.status(400).json({ message: "Ya sigues a este participante." });
    }

    const existingFollowersSnap = await participantRef.collection("followers").limit(1).get();
    const isFirstFollower = existingFollowersSnap.empty;

    const followingData = {
      profileType: "participant",
      profileId: followingId,
      raceId: raceId,
      eventId: eventId,
      appId: appId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    await followingsRef.set(followingData);
    await followersRef.set({
      profileType: "user",
      profileId: followerId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    try {
      await participantRef.set({
        followsCount: admin.firestore.FieldValue.increment(1)
      }, { merge: true });
    } catch (countError) {
      console.warn("⚠️ No se pudo actualizar followsCount:", countError.message);
    }

    const response = {
      message: "Seguimiento registrado correctamente.",
      followerId,
      followingId,
      raceId,
      eventId,
      appId
    };

    res.status(200).json(response);

    if (!isFirstFollower) {
      return;
    }

    setImmediate(async () => {
      try {
        const storiesSnap = await participantRef.collection("stories").limit(1).get();
        if (!storiesSnap.empty) {
          return;
        }

        let effectiveTransformed = transformedData;
        if (!effectiveTransformed) {
          let raceSlug = raceId;
          let copernicoEnv = null;
          try {
            const raceDoc = await db.collection("races").doc(raceId).get();
            if (raceDoc.exists) {
              const raceData = raceDoc.data();
              if (raceData?.copernicoEnv) {
                copernicoEnv = raceData.copernicoEnv;
              }
              if (raceData?.race_info?.id) {
                raceSlug = raceData.race_info.id;
              }
            }
          } catch (raceError) {
            console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
          }

          try {
            const copernicoData = await copernicoService.getParticipantData(raceSlug, resolvedExternalId, copernicoEnv);
            effectiveTransformed = copernicoService.transformCopernicoData(copernicoData);
          } catch (copernicoError) {
            console.warn("No se pudo obtener tiempos desde Copernico:", copernicoError.message);
            return;
          }
        }

        const times = effectiveTransformed.times || {};
        const location = { raceId, appId, eventId };
        let streamsResult = { success: false, streamMap: null };
        let videoSplits = null;
        let splitKeys = [];
        try {
          const eventDoc = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(eventId)
            .get();
          videoSplits = eventDoc.exists ? eventDoc.data()?.videoSplits : null;
          splitKeys = videoSplits ? Object.keys(videoSplits) : [];
          if (splitKeys.length > 0) {
            console.log(`🎬 [FOLLOW v3] videoSplits keys (sample):`, splitKeys.slice(0, 10));
          }
          const hasEnabledSplit = splitKeys.some(key => videoSplits?.[key]?.status === true);
          if (hasEnabledSplit) {
            streamsResult = await getCompetitionStreams(raceId);
            const streamKeys = streamsResult?.streamMap ? Object.keys(streamsResult.streamMap) : [];
            console.log(`🎬 [FOLLOW v3] Streams fetch: success=${streamsResult?.success} keys=${streamKeys.length}`);
            if (streamKeys.length > 0) {
              console.log(`🎬 [FOLLOW v3] StreamMap keys (sample):`, streamKeys.slice(0, 10));
            }
          } else {
            console.log(`🎬 [FOLLOW v3] Skip streams: videoSplits sin splits habilitados`);
          }
        } catch (streamError) {
          console.error("❌ [FOLLOW v3] Error obteniendo streams:", streamError.message);
        }

        for (const [pointName, timeData] of Object.entries(times)) {
          const pointNorm = String(pointName || "").toLowerCase();
          const isPreMeta = /pre[-\s]?meta/.test(pointNorm) ||
              (pointNorm.includes("pre") && pointNorm.includes("meta"));
          let checkpointType = "ATHLETE_CROSSED_TIMING_SPLIT";
          if (pointNorm.includes("start") || pointNorm.includes("salida")) {
            checkpointType = "ATHLETE_STARTED";
          } else if (
            pointNorm.includes("finish") ||
            (pointNorm.includes("meta") && !isPreMeta)
          ) {
            checkpointType = "ATHLETE_FINISHED";
          }

          const rankingLocation = effectiveTransformed.rankings?.[pointName]?.location;
          const timeLocation = timeData?.raw?.location || timeData?.location;
          const resolvedLocation = rankingLocation || timeLocation || pointName;
          const extraData = {
            point: pointName,
            location: resolvedLocation,
            checkpointType
          };
          const rawTimeValue = timeData.raw?.rawTime || timeData.rawTime || null;

          const pointKey = pointName || null;
          const locationKey = resolvedLocation || null;
          const pointMatch = pointKey ? splitKeys.find(key => key.toLowerCase() === pointKey.toLowerCase()) : null;
          const matchedKey = pointMatch || null;
          const splitStatus = matchedKey ? videoSplits?.[matchedKey]?.status : undefined;
          const allowClipGeneration = Boolean(videoSplits && splitKeys.length > 0 && splitStatus === true);
          console.log(`🎬 [FOLLOW v3] videoSplits check: point="${pointKey}" location="${locationKey}" matched="${matchedKey}" status=${splitStatus}`);
          if (!allowClipGeneration) {
            console.log(`🎬 [FOLLOW v3] Clip skipped: videoSplits no habilitado para point="${pointKey}" location="${locationKey}"`);
          }

          await createAutomaticStory(
            db,
            location,
            effectiveTransformed.participant,
            extraData,
            streamsResult.success && allowClipGeneration ? streamsResult.streamMap : null,
            effectiveTransformed,
            rawTimeValue
          );
        }
      } catch (error) {
        console.error("Error creando historias por primer follower:", error);
      }
    });
  } catch (error) {
    console.error("Error al seguir participante (v3):", error);
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
 *                 description: Identificador de la carrera (requerido)
 *               appId:
 *                 type: string
 *                 description: Identificador de la aplicación (requerido)
 *               eventId:
 *                 type: string
 *             required:
 *               - followerId
 *               - followingId
 *               - raceId
 *               - appId
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
    let { followerId, followingId, raceId, appId, eventId } = req.body;
    if (!followerId || !followingId || !raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "followerId, followingId, raceId, appId y eventId son obligatorios.",
      });
    }

    // Normalizar eventId para evitar problemas de encoding
    eventId = normalizeUTF8InObject(eventId);

    const db = admin.firestore();

    // 🆕 NUEVA ESTRUCTURA: Solo buscar en estructura con appId
    console.log(`🔍 [UNFOLLOW] Buscando participante: races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`);
    const participantRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(followingId);

    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) {
      return res.status(404).json({
        message: "El participante no existe en este evento.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`
      });
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
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(participantRef);
        const current = snap.exists ? (snap.data().followsCount || 0) : 0;
        const next = Math.max(0, current - 1);
        tx.set(participantRef, { followsCount: next }, { merge: true });
      });
    } catch (countError) {
      console.warn("⚠️ No se pudo actualizar followsCount:", countError.message);
    }

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
 *     description: Agrega un like a una historia de un participante en un evento. MIGRADO para nueva estructura races/apps/events.
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
 *               appId:
 *                 type: string
 *                 description: Identificador de la aplicación (NUEVO - requerido)
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
 *               - appId
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
    const { raceId, appId, eventId, participantId, storyId, userId } = req.body;
    if (!raceId || !appId || !eventId || !participantId || !storyId || !userId) {
      return res.status(400).json({
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios.",
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants/stories
    const storyRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc(storyId);

    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      return res.status(404).json({
        message: "La historia no existe.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
      });
    }

    // Verificar si el usuario ya dio like a esta historia
    const existingLike = await storyRef.collection("likes")
      .where("userId", "==", userId)
      .get();

    if (!existingLike.empty) {
      return res.status(400).json({
        message: "El usuario ya dio like a esta historia.",
        likeId: existingLike.docs[0].id
      });
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
      appId,
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
 * /api/shares/count:
 *   get:
 *     summary: Obtener contador de comparticiones de un participante
 *     description: Obtiene el número total de veces que se han compartido todas las historias de un participante.
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
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del participante
 *       - in: query
 *         name: storyId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID de una historia específica (opcional). Si se proporciona, devuelve solo las comparticiones de esa historia.
 *     responses:
 *       '200':
 *         description: Contador obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 raceId:
 *                   type: string
 *                 appId:
 *                   type: string
 *                 eventId:
 *                   type: string
 *                 participantId:
 *                   type: string
 *                 storyId:
 *                   type: string
 *                   nullable: true
 *                 totalShares:
 *                   type: integer
 *                   description: Número total de comparticiones
 *                 sharesByType:
 *                   type: object
 *                   description: Desglose por tipo de compartición
 *                   properties:
 *                     social_media:
 *                       type: integer
 *                     direct_message:
 *                       type: integer
 *                     copy_link:
 *                       type: integer
 *                     other:
 *                       type: integer
 *                 sharesByPlatform:
 *                   type: object
 *                   description: Desglose por plataforma (si se especificó)
 *       '400':
 *         description: Parámetros faltantes
 *       '404':
 *         description: Participante no encontrado
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/shares/count", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId, storyId } = req.query;

    if (!raceId || !appId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, appId, eventId y participantId son obligatorios.",
      });
    }

    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants
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

    let totalShares = 0;
    let sharesByType = { social_media: 0, direct_message: 0, copy_link: 0, other: 0 };
    let sharesByPlatform = {};

    if (storyId) {
      // Contar comparticiones de una historia específica
      const storyRef = participantRef.collection("stories").doc(storyId);
      const storyDoc = await storyRef.get();

      if (!storyDoc.exists) {
        return res.status(404).json({
          message: "La historia no existe.",
          path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
        });
      }

      const sharesSnapshot = await storyRef.collection("shares").get();
      totalShares = sharesSnapshot.size;

      // Analizar tipos y plataformas
      sharesSnapshot.docs.forEach(shareDoc => {
        const shareData = shareDoc.data();
        const type = shareData.shareType || 'other';
        const platform = shareData.platform;

        sharesByType[type] = (sharesByType[type] || 0) + 1;

        if (platform) {
          sharesByPlatform[platform] = (sharesByPlatform[platform] || 0) + 1;
        }
      });

    } else {
      // Contar comparticiones de todas las historias del participante
      const storiesSnapshot = await participantRef.collection("stories").get();

      if (storiesSnapshot.empty) {
        return res.status(200).json({
          raceId, appId, participantId, eventId, storyId: null,
          totalShares: 0, sharesByType, sharesByPlatform
        });
      }

      const shareCounts = await Promise.all(
        storiesSnapshot.docs.map(async (storyDoc) => {
          const sharesSnapshot = await storyDoc.ref.collection("shares").get();

          // Analizar cada compartición
          const storyShares = { total: sharesSnapshot.size, byType: {}, byPlatform: {} };

          sharesSnapshot.docs.forEach(shareDoc => {
            const shareData = shareDoc.data();
            const type = shareData.shareType || 'other';
            const platform = shareData.platform;

            storyShares.byType[type] = (storyShares.byType[type] || 0) + 1;

            if (platform) {
              storyShares.byPlatform[platform] = (storyShares.byPlatform[platform] || 0) + 1;
            }
          });

          return storyShares;
        })
      );

      // Sumar todos los contadores
      shareCounts.forEach(storyShares => {
        totalShares += storyShares.total;

        // Sumar por tipo
        Object.keys(storyShares.byType).forEach(type => {
          sharesByType[type] = (sharesByType[type] || 0) + storyShares.byType[type];
        });

        // Sumar por plataforma
        Object.keys(storyShares.byPlatform).forEach(platform => {
          sharesByPlatform[platform] = (sharesByPlatform[platform] || 0) + storyShares.byPlatform[platform];
        });
      });
    }

    console.log(`✅ [SHARES] Contador obtenido: ${totalShares} comparticiones para participante ${participantId}`);

    return res.status(200).json({
      raceId,
      appId,
      eventId,
      participantId,
      storyId: storyId || null,
      totalShares,
      sharesByType,
      sharesByPlatform
    });

  } catch (error) {
    console.error("❌ [SHARES] Error al obtener contador:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/likes/count:
 *   get:
 *     summary: Contar likes de un participante
 *     description: Retorna el total de likes de un participante en un evento. MIGRADO para nueva estructura races/apps/events.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la aplicación (NUEVO - requerido).
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
 *                 raceId:
 *                   type: string
 *                 appId:
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
    const { raceId, appId, eventId, participantId } = req.query;
    if (!raceId || !appId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, appId, eventId y participantId son obligatorios.",
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants
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

    let totalLikes = 0;
    const storiesSnapshot = await participantRef.collection("stories").get();
    if (storiesSnapshot.empty) {
      return res.status(200).json({ raceId, appId, participantId, eventId, totalLikes: 0 });
    }

    const likeCounts = await Promise.all(
      storiesSnapshot.docs.map(async (storyDoc) => {
        const likesSnapshot = await storyDoc.ref.collection("likes").get();
        return likesSnapshot.size;
      })
    );
    totalLikes = likeCounts.reduce((sum, count) => sum + count, 0);

    return res.status(200).json({
      raceId,
      appId,
      participantId,
      eventId,
      totalLikes
    });
  } catch (error) {
    console.error("Error al contar los likes:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/unlike:
 *   post:
 *     summary: Quitar like de una historia
 *     description: Elimina un like de una historia de un participante en un evento. Usa la nueva estructura races/apps/events.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (requerido)
 *               appId:
 *                 type: string
 *                 description: Identificador de la aplicación (requerido)
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
 *               - appId
 *               - eventId
 *               - participantId
 *               - storyId
 *               - userId
 *     responses:
 *       '200':
 *         description: Like eliminado correctamente.
 *       '400':
 *         description: Parámetros faltantes o el usuario no había dado like.
 *       '404':
 *         description: La historia no existe.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/unlike", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId, storyId, userId } = req.body;
    if (!raceId || !appId || !eventId || !participantId || !storyId || !userId) {
      return res.status(400).json({
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios.",
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants/stories
    const storyRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc(storyId);

    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      return res.status(404).json({
        message: "La historia no existe.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
      });
    }

    // Buscar el like del usuario
    const existingLike = await storyRef.collection("likes")
      .where("userId", "==", userId)
      .get();

    if (existingLike.empty) {
      return res.status(400).json({
        message: "El usuario no había dado like a esta historia."
      });
    }

    // Eliminar el like
    await existingLike.docs[0].ref.delete();

    return res.status(200).json({
      message: "Like eliminado correctamente.",
      likeId: existingLike.docs[0].id,
      userId,
      raceId,
      appId,
      eventId,
      participantId,
      storyId,
    });
  } catch (error) {
    console.error("Error al eliminar like:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/share:
 *   post:
 *     summary: Compartir una historia (incrementar contador)
 *     description: Incrementa el contador de veces que se ha compartido una historia. Solo permite sumar, no restar.
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
 *               - participantId
 *               - storyId
 *               - userId
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
 *                 description: ID del participante
 *               storyId:
 *                 type: string
 *                 description: ID de la historia
 *               userId:
 *                 type: string
 *                 description: ID del usuario que comparte
 *               shareType:
 *                 type: string
 *                 enum: [social_media, direct_message, copy_link, other]
 *                 description: Tipo de compartición (opcional)
 *                 default: other
 *               platform:
 *                 type: string
 *                 description: Plataforma donde se compartió (opcional, ej. "whatsapp", "instagram", "facebook")
 *     responses:
 *       '200':
 *         description: Compartición registrada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 shareId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                 raceId:
 *                   type: string
 *                 appId:
 *                   type: string
 *                 eventId:
 *                   type: string
 *                 participantId:
 *                   type: string
 *                 storyId:
 *                   type: string
 *                 shareType:
 *                   type: string
 *                 platform:
 *                   type: string
 *                 sharedAt:
 *                   type: string
 *                   format: date-time
 *       '400':
 *         description: Parámetros faltantes
 *       '404':
 *         description: Historia no encontrada
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/share", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId, storyId, userId, shareType = "other", platform } = req.body;

    // Validar parámetros requeridos
    if (!raceId || !appId || !eventId || !participantId || !storyId || !userId) {
      return res.status(400).json({
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios."
      });
    }

    const db = admin.firestore();

    // Verificar que la historia existe
    const storyRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc(storyId);

    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      return res.status(404).json({
        message: "La historia no existe.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
      });
    }

    // Crear registro de compartición (siempre se permite, no hay restricciones como en likes)
    const shareRef = storyRef.collection("shares").doc();
    const shareData = {
      userId,
      shareType,
      platform: platform || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // Metadatos adicionales para analytics
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    };

    await shareRef.set(shareData);

    console.log(`✅ [SHARE] Historia compartida: ${storyId} por usuario ${userId} (tipo: ${shareType})`);

    return res.status(200).json({
      message: "Compartición registrada correctamente.",
      shareId: shareRef.id,
      userId,
      raceId,
      appId,
      eventId,
      participantId,
      storyId,
      shareType,
      platform: platform || null,
      sharedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [SHARE] Error al registrar compartición:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

// DELETE a story and its common subcollections (likes, shares, media, comments, tags)
router.delete("/apps/story", async (req, res) => {
  try {
    const { raceId, appId, eventId, participantId, storyId } = req.query;
    if (!raceId || !appId || !eventId || !participantId || !storyId) {
      return res.status(400).json({ message: "raceId, appId, eventId, participantId y storyId son obligatorios." });
    }

    const db = admin.firestore();
    const storyRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc(storyId);

    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) {
      return res.status(404).json({
        message: "La historia no existe.",
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
      });
    }

    // Eliminar subcolecciones conocidas (por lotes)
    const subcollections = ["likes", "shares", "media", "comments", "tags"];
    for (const sub of subcollections) {
      const colSnap = await storyRef.collection(sub).get();
      if (!colSnap.empty) {
        // Usar batch para eliminar documentos de la subcolección
        let batch = db.batch();
        let ops = 0;
        colSnap.forEach(doc => {
          batch.delete(doc.ref);
          ops++;
        });
        if (ops > 0) await batch.commit();
      }
    }

    // Eliminar el documento principal
    await storyRef.delete();

    // Eliminar story espejo en la colección por evento (si existe)
    try {
      const eventStoryRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("stories").doc(storyId);
      await eventStoryRef.delete();
    } catch (e) {
      console.warn("No se pudo eliminar story espejo en events/stories:", e.message || e);
    }

    // También eliminar referencias asociadas en split-clips y timing-clips (por storyId + participantId)
    try {
      const eventRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId);

      const clipCollections = ["split-clips", "timing-clips"];
      for (const colName of clipCollections) {
        const colRef = eventRef.collection(colName);
        const clipsSnap = await colRef
          .where("participantId", "==", participantId)
          .where("storyId", "==", storyId)
          .get();
        if (!clipsSnap.empty) {
          let batch = db.batch();
          let deleted = 0;
          clipsSnap.forEach(doc => {
            batch.delete(doc.ref);
            deleted++;
          });
          await batch.commit();
          console.log(`✅ Eliminados ${deleted} docs en ${colName} relacionados con story ${storyId}`);
        }
      }
    } catch (e) {
      console.warn("No se pudieron eliminar todas las referencias en split/timing clips:", e.message || e);
    }

    return res.status(200).json({ message: "Historia eliminada correctamente.", storyId, participantId, raceId, appId, eventId });
  } catch (error) {
    console.error("Error al eliminar historia:", error);
    return res.status(500).json({ message: "Error interno al eliminar la historia", error: error.message });
  }
});

// DELETE all stories for a specific event (includes mirror collection)
router.delete("/apps/stories", async (req, res) => {
  try {
    const { raceId, appId, eventId } = req.query;
    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "raceId, appId y eventId son obligatorios."
      });
    }

    const db = admin.firestore();
    const eventRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId);

    const participantsSnap = await eventRef.collection("participants").get();
    let deletedStories = 0;
    let deletedSubcollections = 0;
    let deletedEventStories = 0;

    const deleteSubcollections = async (storyRef) => {
      const subcollections = ["likes", "shares", "media", "comments", "tags"];
      for (const sub of subcollections) {
        const colSnap = await storyRef.collection(sub).get();
        if (colSnap.empty) continue;
        let batch = db.batch();
        let ops = 0;
        colSnap.forEach(doc => {
          batch.delete(doc.ref);
          ops++;
        });
        if (ops > 0) {
          await batch.commit();
          deletedSubcollections += ops;
        }
      }
    };

    for (const participantDoc of participantsSnap.docs) {
      const participantId = participantDoc.id;
      const storiesRef = eventRef.collection("participants").doc(participantId).collection("stories");
      const storiesSnap = await storiesRef.get();
      for (const storyDoc of storiesSnap.docs) {
        const storyRef = storyDoc.ref;
        await deleteSubcollections(storyRef);
        await storyRef.delete();
        deletedStories += 1;

        // Delete mirror story in event collection
        try {
          const eventStoryRef = eventRef.collection("stories").doc(storyDoc.id);
          await eventStoryRef.delete();
          deletedEventStories += 1;
        } catch (e) {
          console.warn("No se pudo eliminar story espejo:", e.message || e);
        }
      }
    }

    return res.status(200).json({
      message: "Historias del evento eliminadas correctamente.",
      raceId,
      appId,
      eventId,
      deletedStories,
      deletedEventStories,
      deletedSubcollections
    });
  } catch (error) {
    console.error("Error al eliminar historias del evento:", error);
    return res.status(500).json({
      message: "Error interno al eliminar historias del evento",
      error: error.message
    });
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
          .where("type", "in", ["ATHLETE_STARTED", "ATHLETE_FINISHED", "ATHLETE_CROSSED_TIMING_SPLIT"])
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
 * /api/participant-v3:
 *   get:
 *     summary: (BETA) Obtener participante desde Copernico
 *     description: Retorna datos del participante consultando Copernico (no Firestore).
 */
router.get("/participant-v3", async (req, res) => {
  try {
    const { raceId, eventId, participantId, appId } = req.query;
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        message: "raceId, eventId y participantId son obligatorios."
      });
    }

    const db = admin.firestore();
    let raceSlug = raceId;
    let copernicoEnv = null;

    try {
      const raceDoc = await db.collection("races").doc(raceId).get();
      if (raceDoc.exists) {
        const raceData = raceDoc.data();
        if (raceData?.copernicoEnv) {
          copernicoEnv = raceData.copernicoEnv;
        }
        if (raceData?.race_info?.id) {
          raceSlug = raceData.race_info.id;
        }
      }
    } catch (raceError) {
      console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
    }

    let resolvedParticipantId = participantId;
    let followsCount = null;
    try {
      let participantDoc = null;
      if (appId) {
        participantDoc = await db.collection("races").doc(raceId)
          .collection("apps").doc(appId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId).get();
      }

      if (!participantDoc || !participantDoc.exists) {
        participantDoc = await db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId).get();
      }

      if (participantDoc && participantDoc.exists) {
        const data = participantDoc.data() || {};
        if (data.externalId) {
          resolvedParticipantId = data.externalId;
        }
        if (typeof data.followsCount === "number") {
          followsCount = data.followsCount;
        }
      }
    } catch (mapError) {
      console.warn("No se pudo resolver externalId desde Firestore:", mapError.message);
    }

    const copernicoData = await copernicoService.getParticipantData(raceSlug, resolvedParticipantId, copernicoEnv);
    const transformed = copernicoService.transformCopernicoData(copernicoData);

    const rawEvents = Array.isArray(copernicoData?.events) ? copernicoData.events : (transformed.rawData?.events || []);
    const primaryEvent = rawEvents[0] || {};
    const copernicoDataPayload = {
      times: transformed.times || {},
      rankings: transformed.rankings || {},
      rawData: transformed.rawData || copernicoData,
      predictive: primaryEvent.predictive || null,
      backups: primaryEvent.backups || null,
      mst: primaryEvent.mst || null,
      leader: primaryEvent.leader || null,
      leader_weight: primaryEvent.leader_weight ?? null,
      penalties: primaryEvent.penalties || null,
      commentator: primaryEvent.commentator || null,
      customRankings: primaryEvent["custom-rankings"] || primaryEvent.customRankings || null,
      issuesCount: primaryEvent.issuesCount || null,
      splitsSeen: primaryEvent.splitsSeen ?? null,
      splitsMissing: primaryEvent.splitsMissing ?? null,
      maxConsecutiveSplitsMissing: primaryEvent.maxConsecutiveSplitsMissing ?? null,
      lastSplitSeen: primaryEvent.last_split_seen || primaryEvent.lastSplitSeen || null
    };

    const participantData = {
      id: participantId,
      ...transformed.participant,
      externalId: resolvedParticipantId,
      copernicoData: copernicoDataPayload,
      ...(followsCount !== null ? { followsCount } : {})
    };

    if (appId) {
      const splits = [];
      const times = transformed.times || {};
      for (const [pointName, timeData] of Object.entries(times)) {
        const pointNorm = String(pointName || "").toLowerCase();
        let splitType = "ATHLETE_CROSSED_TIMING_SPLIT";
        if (pointNorm.includes("start") || pointNorm.includes("salida")) {
          splitType = "ATHLETE_STARTED";
        } else if (pointNorm.includes("finish") || pointNorm.includes("meta")) {
          splitType = "ATHLETE_FINISHED";
        }

        splits.push({
          storyId: null,
          type: splitType,
          date: timeData.raw?.rawTime ? new Date(timeData.raw.rawTime).toISOString() : null,
          description: pointName,
          split: timeData.split ?? null,
          checkpoint: pointName,
          time: timeData.time ?? null,
          netTime: timeData.netTime ?? null,
          distance: timeData.distance ?? null
        });
      }

      participantData.splits = splits;
      participantData.totalSplits = splits.length;
      participantData.structure = splits.length > 0 ? "copernico (con splits)" : "copernico (sin splits)";
    } else {
      participantData.structure = "copernico";
    }

    return res.status(200).json(participantData);
  } catch (error) {
    console.error("Error al obtener participante (v3):", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
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
      .where("type", "in", ["ATHLETE_STARTED", "ATHLETE_FINISHED", "ATHLETE_CROSSED_TIMING_SPLIT"])
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
 * Selecciona el ranking más avanzado para un participante.
 * Prioriza el split solicitado; si no se envía, usa el split con mayor order/distance.
 */
function pickParticipantRanking(copernicoData = {}, requestedSplit) {
  const primaryRankings = copernicoData.rankings && Object.keys(copernicoData.rankings).length > 0
    ? copernicoData.rankings
    : null;
  const primaryTimes = copernicoData.times || {};

  const eventRankings = copernicoData.events?.[0]?.rankings && Object.keys(copernicoData.events[0].rankings).length > 0
    ? copernicoData.events[0].rankings
    : null;
  const eventTimes = copernicoData.events?.[0]?.times || {};

  const rankings = primaryRankings || eventRankings || {};
  const times = primaryRankings ? primaryTimes : eventTimes;

  const rankingKeys = Object.keys(rankings);
  if (rankingKeys.length === 0) return null;

  // Si el split solicitado existe, devolverlo directamente
  if (requestedSplit && rankings[requestedSplit]) {
    return {
      key: requestedSplit,
      data: rankings[requestedSplit],
      order: times?.[requestedSplit]?.order ?? rankings[requestedSplit]?.order ?? 0,
      distance: times?.[requestedSplit]?.distance ?? rankings[requestedSplit]?.distance ?? 0
    };
  }

  // Si no, elegir el split con mayor orden/distancia (usualmente el final)
  let selectedKey = rankingKeys[0];
  let bestOrder = times?.[selectedKey]?.order ?? rankings[selectedKey]?.order ?? 0;
  let bestDistance = times?.[selectedKey]?.distance ?? rankings[selectedKey]?.distance ?? 0;
  let bestTime = rankings[selectedKey]?.net ?? rankings[selectedKey]?.time ?? Number.MAX_SAFE_INTEGER;

  for (const key of rankingKeys) {
    const ranking = rankings[key];
    const order = times?.[key]?.order ?? ranking?.order ?? 0;
    const distance = times?.[key]?.distance ?? ranking?.distance ?? 0;
    const time = ranking?.net ?? ranking?.time ?? Number.MAX_SAFE_INTEGER;

    if (
      order > bestOrder ||
      (order === bestOrder && distance > bestDistance) ||
      (order === bestOrder && distance === bestDistance && time < bestTime)
    ) {
      selectedKey = key;
      bestOrder = order;
      bestDistance = distance;
      bestTime = time;
    }
  }

  return {
    key: selectedKey,
    data: rankings[selectedKey],
    order: bestOrder,
    distance: bestDistance
  };
}

function normalizePositionsFromRanking(ranking = {}) {
  const positions = ranking.positions || {};
  return {
    overall: positions.overall ?? ranking.pos ?? ranking.posGen ?? null,
    gender: positions.gender ?? ranking.posGen ?? null,
    category: positions.category ?? ranking.posCat ?? null,
    overallNet: positions.overallNet ?? ranking.posNet ?? ranking.posGenNet ?? null,
    genderNet: positions.genderNet ?? ranking.posGenNet ?? null,
    categoryNet: positions.categoryNet ?? ranking.posCatNet ?? null,
    raw: positions
  };
}

function getPositionByType(ranking = {}, type = "overall") {
  const normalizedPositions = normalizePositionsFromRanking(ranking);
  switch (type) {
    case "gender":
      return normalizedPositions.gender
        ?? normalizedPositions.genderNet
        ?? ranking.posGen
        ?? ranking.posGenNet
        ?? ranking.pos
        ?? ranking.posNet
        ?? null;
    case "category":
      return normalizedPositions.category
        ?? normalizedPositions.categoryNet
        ?? ranking.posCat
        ?? ranking.posCatNet
        ?? null;
    default:
      return normalizedPositions.overall
        ?? normalizedPositions.overallNet
        ?? ranking.posGen
        ?? ranking.pos
        ?? ranking.posGenNet
        ?? ranking.posNet
        ?? null;
  }
}

function buildParticipantName(data = {}) {
  if (data.fullName) return data.fullName;
  const name = data.name || "";
  const lastName = data.lastName || "";
  return `${name} ${lastName}`.trim();
}

function normalizeGender(value) {
  if (!value) return null;
  const val = value.toString().trim().toLowerCase();
  if (["m", "male", "h", "masculino", "man"].includes(val)) return "male";
  if (["f", "female", "fem", "femenino", "woman"].includes(val)) return "female";
  return val; // devolver tal cual si ya viene como male/female u otra variante
}

/**
 * @openapi
 * /api/apps/leaderboard:
 *   get:
 *     summary: Obtener líderes de una carrera por tipo (general, género o categoría)
 *     description: Devuelve el leaderboard calculado a partir de los rankings de Copernico almacenados en los participantes.
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
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [overall, gender, category]
 *           default: overall
 *         description: Tipo de leaderboard a retornar.
 *       - in: query
 *         name: gender
 *         required: false
 *         schema:
 *           type: string
 *         description: Género a filtrar cuando type=gender (por ejemplo, male o female).
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *         description: Categoría a filtrar cuando type=category (por ejemplo, Sub 23 M).
 *       - in: query
 *         name: split
 *         required: false
 *         schema:
 *           type: string
 *         description: Split/ubicación a usar para el ranking (por defecto se usa el split más avanzado disponible).
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Número máximo de líderes a retornar.
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Desplazamiento para paginar resultados.
 *     responses:
 *       '200':
 *         description: Leaderboard obtenido exitosamente.
 *       '400':
 *         description: Parámetros faltantes o inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/apps/leaderboard", async (req, res) => {
  try {
    const {
      raceId,
      appId,
      eventId,
      type = "overall",
      gender,
      category,
      split,
      removeEmpty,
      limit = 50,
      offset = 0,
      page
    } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "raceId, appId y eventId son obligatorios."
      });
    }

    const normalizedType = (type || "overall").toString().toLowerCase();
    if (!["overall", "gender", "category"].includes(normalizedType)) {
      return res.status(400).json({ message: "type debe ser overall, gender o category." });
    }
    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const pageNum = Math.max(1, parseInt(page, 10) || 0);

    const db = admin.firestore();
    const participantsSnapshot = await db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants")
      .get();

    const leaders = [];
    const groupMap = new Map(); // Para agrupar por gender/category cuando aplique

    participantsSnapshot.forEach((doc) => {
      const participantData = doc.data() || {};
      const copernicoData = participantData.copernicoData || participantData.copernico || {};

      const selectedRanking = pickParticipantRanking(copernicoData, split);
      if (!selectedRanking || !selectedRanking.data) return;

      const participantGenderRaw = participantData.gender || copernicoData.rawData?.gender || "";
      const participantGender = normalizeGender(participantGenderRaw) || null;
      const participantCategory = (participantData.category || copernicoData.rawData?.events?.[0]?.category || "").toString() || null;

      const position = getPositionByType(selectedRanking.data, normalizedType);
      if (position === null || position === undefined) return;

      const normalizedPositions = normalizePositionsFromRanking(selectedRanking.data);
      const timeValue = selectedRanking.data.net ?? selectedRanking.data.time ?? null;

      const leaderEntry = {
        participantId: doc.id,
        externalId: participantData.externalId || participantData.id || doc.id,
        fullName: buildParticipantName(participantData),
        dorsal: participantData.dorsal || null,
        gender: participantGender,
        category: participantCategory,
        status: participantData.status || participantData.realStatus || participantData.copernicoStatus || null,
        split: selectedRanking.key,
        splitOrder: selectedRanking.order,
        distance: selectedRanking.distance || null,
        time: timeValue,
        average: selectedRanking.data.averageNet ?? selectedRanking.data.average ?? null,
        position,
        positions: normalizedPositions
      };

      if (normalizedType === "gender") {
        // Si se envió gender, filtramos; de lo contrario, agrupamos todas
        if (gender && participantGender !== normalizeGender(gender)) return;
        const groupKey = participantGender || "unknown";
        leaderEntry.group = groupKey;
        if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
        groupMap.get(groupKey).push(leaderEntry);
      } else if (normalizedType === "category") {
        if (category && participantCategory?.toLowerCase() !== category.toString().toLowerCase()) return;
        const groupKey = participantCategory || "uncategorized";
        leaderEntry.group = groupKey;
        if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
        groupMap.get(groupKey).push(leaderEntry);
      } else {
        leaders.push(leaderEntry);
      }
    });

    // Función común de ordenamiento
    const sortFn = (a, b) => {
      if (a.position !== b.position) return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
      if (a.time !== b.time) return (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER);
      return (a.splitOrder ?? 0) - (b.splitOrder ?? 0);
    };

    if (normalizedType === "overall") {
      leaders.sort(sortFn);

      const paginatedLeaders = leaders.slice(offsetNum, offsetNum + limitNum);
      const nextOffset = offsetNum + paginatedLeaders.length;
      const hasMore = nextOffset < leaders.length;

      return res.status(200).json({
        raceId,
        appId,
        eventId,
        type: normalizedType,
        gender: null,
        category: null,
        split: split || (paginatedLeaders[0]?.split ?? null),
        limit: limitNum,
        offset: offsetNum,
        returned: paginatedLeaders.length,
        totalCandidates: leaders.length,
        totalParticipants: participantsSnapshot.size,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
        leaders: paginatedLeaders
      });
    }

    // Agrupado (gender/category)
    const groups = [];
    for (const [groupKey, list] of groupMap.entries()) {
      list.sort(sortFn);
      const paginated = list.slice(offsetNum, offsetNum + limitNum);
      const nextOffsetGroup = offsetNum + paginated.length;
      const hasMoreGroup = nextOffsetGroup < list.length;
      groups.push({
        group: groupKey,
        totalCandidates: list.length,
        returned: paginated.length,
        hasMore: hasMoreGroup,
        nextOffset: hasMoreGroup ? nextOffsetGroup : null,
        leaders: paginated
      });
    }

    // Ordenar grupos por nombre para una salida determinística
    groups.sort((a, b) => (a.group || "").localeCompare(b.group || ""));

    const firstLeader = groups[0]?.leaders?.[0];
    const selectedSplit = split || (firstLeader?.split ?? null);

    return res.status(200).json({
      raceId,
      appId,
      eventId,
      type: normalizedType,
      gender: normalizedType === "gender" ? (gender || null) : null,
      category: normalizedType === "category" ? (category || null) : null,
      split: selectedSplit,
      limit: limitNum,
      offset: offsetNum,
      groupCount: groups.length,
      totalParticipants: participantsSnapshot.size,
      groups
    });
  } catch (error) {
    console.error("❌ Error al obtener el leaderboard:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/apps/leaderboard-v3:
 *   get:
 *     summary: (BETA) Leaderboard desde Copernico
 *     description: Consulta leaders directamente en Copernico segun el entorno.
 */
router.get("/apps/leaderboard-v3", async (req, res) => {
  try {
    const {
      raceId,
      appId,
      eventId,
      type = "overall",
      gender,
      category,
      split,
      removeEmpty,
      limit = 50,
      offset = 0,
      page
    } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        message: "raceId, appId y eventId son obligatorios."
      });
    }

    const normalizedType = (type || "overall").toString().toLowerCase();
    if (!["overall", "gender", "category"].includes(normalizedType)) {
      return res.status(400).json({ message: "type debe ser overall, gender o category." });
    }
    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    const pageNum = Math.max(1, parseInt(page, 10) || 0);

    const db = admin.firestore();
    let raceSlug = raceId;
    let copernicoEnv = null;

    try {
      const raceDoc = await db.collection("races").doc(raceId).get();
      if (raceDoc.exists) {
        const raceData = raceDoc.data();
        if (raceData?.copernicoEnv) {
          copernicoEnv = raceData.copernicoEnv;
        }
        if (raceData?.race_info?.id) {
          raceSlug = raceData.race_info.id;
        }
      }
    } catch (raceError) {
      console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
    }

    let leaderGroup = "all";
    if (normalizedType === "gender" && gender) {
      leaderGroup = `gender:${gender.toString()}`;
    } else if (normalizedType === "category" && category) {
      leaderGroup = `category:${category.toString()}`;
    }

    const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
    const baseUrl = envConfig.baseUrl;
    const headers = copernicoService.config.getRequestHeaders(copernicoEnv);
    const pageValue = pageNum || Math.floor(offsetNum / limitNum) + 1;
    const removeEmptyParam = removeEmpty === undefined || removeEmpty === null || removeEmpty === ""
      ? "1"
      : String(removeEmpty);

    const mapLeaders = (rawLeaders, genderOverride = null, positionKey = "overall") => {
      const raw = Array.isArray(rawLeaders) ? rawLeaders : [];
      return raw.map((item) => {
        const positions = item.pos ? { [positionKey]: item.pos } : {};
        const leader = {
          participantId: item.id || null,
          externalId: item.id || null,
          fullName: [item.name, item.surname].filter(Boolean).join(" ").trim() || null,
          dorsal: item.dorsal || null,
          gender: item.gender || item.gen || item.sex || genderOverride || null,
          category: item.category || null,
          nationality: item.nationality || item.country || item.nationalityCode || null,
          split: item.split || item.location || null,
          time: item.time ?? null,
          average: item.average ?? null,
          position: item.pos || null,
          positions,
          copernicoData: {
            predictive: item.predictive ?? null
          }
        };
        if (item.status || item.realStatus) {
          leader.status = item.status || item.realStatus || null;
        }
        if (item.order != null || item.splitOrder != null) {
          leader.splitOrder = item.order ?? item.splitOrder ?? null;
        }
        if (item.distance != null) {
          leader.distance = item.distance ?? null;
        }
        return leader;
      });
    };

    const fetchLeadersForGroup = async (groupValue, genderOverride = null, positionKey = "overall") => {
      const leadersUrl = `${baseUrl}/${raceSlug}/leaders/${encodeURIComponent(eventId)}/${encodeURIComponent(groupValue)}?fields=nationality,predictive&limit=${limitNum}&page=${pageValue}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

      const response = await fetch(leadersUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      const leadersSource = payload.data || payload.leaders || payload.items || payload.participants || payload.ranking || [];
      return mapLeaders(leadersSource, genderOverride, positionKey);
    };

    const fetchLeadersWithOptions = async (optionName, positionKey) => {
      const leadersUrl = `${baseUrl}/${raceSlug}/leaders/${encodeURIComponent(eventId)}?fields=nationality,predictive&options=${encodeURIComponent(optionName)}&removeEmpty=${encodeURIComponent(removeEmptyParam)}&limit=${limitNum}&page=${pageValue}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

      const response = await fetch(leadersUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      const data = payload.data || payload.groups || payload;
      const groups = [];

      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (!item || typeof item !== "object") {
            return;
          }
          const groupName = item.group || item.key || item.name || item.type || null;
          const groupLeaders = item.leaders || item.data || item.items || item.participants || item.ranking || [];
          if (!groupName || !Array.isArray(groupLeaders)) {
            return;
          }
          const genderOverride = positionKey === "gender" ? String(groupName).replace(/^gender:/i, "") : null;
          groups.push({
            group: String(groupName),
            leaders: mapLeaders(groupLeaders, genderOverride, positionKey)
          });
        });
      } else if (data && typeof data === "object") {
        const container = Array.isArray(data.groups) ? data.groups : data;
        if (Array.isArray(container)) {
          container.forEach((item) => {
            if (!item || typeof item !== "object") {
              return;
            }
            const groupName = item.group || item.key || item.name || item.type || null;
            const groupLeaders = item.leaders || item.data || item.items || item.participants || item.ranking || [];
            if (!groupName || !Array.isArray(groupLeaders)) {
              return;
            }
            const genderOverride = positionKey === "gender" ? String(groupName).replace(/^gender:/i, "") : null;
            groups.push({
              group: String(groupName),
              leaders: mapLeaders(groupLeaders, genderOverride, positionKey)
            });
          });
        } else {
          Object.entries(container).forEach(([groupName, groupLeaders]) => {
            if (!Array.isArray(groupLeaders)) {
              return;
            }
            const genderOverride = positionKey === "gender" ? String(groupName).replace(/^gender:/i, "") : null;
            groups.push({
              group: String(groupName),
              leaders: mapLeaders(groupLeaders, genderOverride, positionKey)
            });
          });
        }
      }

      return groups;
    };

    if (normalizedType === "gender" && !gender) {
      const optionGroups = await fetchLeadersWithOptions("gender", "gender");
      const selectedSplit = split || (optionGroups[0]?.leaders?.[0]?.split ?? null);

      return res.status(200).json({
        raceId,
        appId,
        eventId,
        type: normalizedType,
        gender: null,
        category: null,
        split: selectedSplit,
        limit: limitNum,
        page: pageValue,
        offset: offsetNum,
        groupCount: optionGroups.length,
        totalParticipants: optionGroups.reduce((sum, group) => sum + (group.leaders?.length || 0), 0),
        groups: optionGroups.map(group => ({
          group: group.group,
          totalCandidates: group.leaders.length,
          returned: group.leaders.length,
          hasMore: group.leaders.length === limitNum,
          nextOffset: group.leaders.length === limitNum ? offsetNum + limitNum : null,
          leaders: group.leaders
        }))
      });
    }

    if (normalizedType === "category" && !category) {
      const optionGroups = await fetchLeadersWithOptions("category", "category");
      const selectedSplit = split || (optionGroups[0]?.leaders?.[0]?.split ?? null);

      return res.status(200).json({
        raceId,
        appId,
        eventId,
        type: normalizedType,
        gender: null,
        category: null,
        split: selectedSplit,
        limit: limitNum,
        page: pageValue,
        offset: offsetNum,
        groupCount: optionGroups.length,
        totalParticipants: optionGroups.reduce((sum, group) => sum + (group.leaders?.length || 0), 0),
        groups: optionGroups.map(group => ({
          group: group.group,
          totalCandidates: group.leaders.length,
          returned: group.leaders.length,
          hasMore: group.leaders.length === limitNum,
          nextOffset: group.leaders.length === limitNum ? offsetNum + limitNum : null,
          leaders: group.leaders
        }))
      });
    }

    const defaultPositionKey = normalizedType === "gender"
      ? "gender"
      : (normalizedType === "category" ? "category" : "overall");
    const leaders = await fetchLeadersForGroup(
      leaderGroup,
      normalizedType === "gender" ? (gender || null) : null,
      defaultPositionKey
    );

    const paginated = leaders;
    const nextOffset = offsetNum + paginated.length;
    const hasMore = paginated.length === limitNum;
    const selectedSplit = split || (paginated[0]?.split ?? null);

    const groupKey = leaderGroup || "all";
    return res.status(200).json({
      raceId,
      appId,
      eventId,
      type: normalizedType,
      gender: normalizedType === "gender" ? (gender || null) : null,
      category: normalizedType === "category" ? (category || null) : null,
      split: selectedSplit,
      limit: limitNum,
      page: pageValue,
      offset: offsetNum,
      groupCount: 1,
      totalParticipants: leaders.length,
      groups: [{
        group: groupKey,
        totalCandidates: leaders.length,
        returned: paginated.length,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
        leaders: paginated
      }]
    });
  } catch (error) {
    console.error("❌ Error al obtener el leaderboard (v3):", error);
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
 * /api/users:
 *   post:
 *     summary: Crear usuario
 *     description: Crea un nuevo usuario en el sistema con un ID específico. Solo requiere el userId como parámetro inicial.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Identificador único del usuario (requerido)
 *                 example: "user-123-abc"
 *             required:
 *               - userId
 *     responses:
 *       '201':
 *         description: Usuario creado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Usuario creado exitosamente."
 *                 userId:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                     status:
 *                       type: string
 *       '400':
 *         description: Parámetros faltantes o usuario ya existe.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/users", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "userId es obligatorio.",
      });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);

    // Verificar si el usuario ya existe
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      return res.status(400).json({
        message: "El usuario ya existe.",
        userId: userId
      });
    }

    // Crear usuario básico
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const userData = {
      id: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      // Campos opcionales que se pueden agregar después
      fcmToken: null,
      fcmTokenUpdatedAt: null,
      lastActiveAt: null,
      deviceInfo: null,
      profile: {
        name: null,
        lastName: null,
        email: null,
        phone: null,
        avatar: null,
        birthdate: null,
        gender: null,
        preferences: {}
      }
    };

    await userRef.set(userData);

    return res.status(201).json({
      message: "Usuario creado exitosamente.",
      userId: userId,
      user: {
        id: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active"
      }
    });
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/users/{userId}:
 *   put:
 *     summary: Actualizar usuario
 *     description: Actualiza la información completa de un usuario existente.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario a actualizar.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profile:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "Juan"
 *                   lastName:
 *                     type: string
 *                     example: "Pérez"
 *                   email:
 *                     type: string
 *                     format: email
 *                     example: "juan.perez@email.com"
 *                   phone:
 *                     type: string
 *                     example: "+34612345678"
 *                   avatar:
 *                     type: string
 *                     example: "https://example.com/avatar.jpg"
 *                   birthdate:
 *                     type: string
 *                     format: date
 *                     example: "1990-05-15"
 *                   gender:
 *                     type: string
 *                     enum: [male, female, other]
 *                     example: "male"
 *                   preferences:
 *                     type: object
 *                     example: {"notifications": true, "language": "es"}
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *                 example: "active"
 *     responses:
 *       '200':
 *         description: Usuario actualizado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Usuario actualizado exitosamente."
 *                 userId:
 *                   type: string
 *                 user:
 *                   type: object
 *       '400':
 *         description: Parámetros inválidos.
 *       '404':
 *         description: Usuario no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.put("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "userId es obligatorio.",
      });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(userId);

    // Verificar si el usuario existe
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({
        message: "El usuario no existe.",
        userId: userId
      });
    }

    // Preparar datos de actualización
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const userUpdateData = {
      ...updateData,
      updatedAt: timestamp
    };

    // Si se actualiza el perfil, hacer merge con el perfil existente
    if (updateData.profile) {
      const currentData = userDoc.data();
      userUpdateData.profile = {
        ...currentData.profile,
        ...updateData.profile
      };
    }

    await userRef.update(userUpdateData);

    // Obtener datos actualizados
    const updatedDoc = await userRef.get();
    const updatedData = updatedDoc.data();

    return res.status(200).json({
      message: "Usuario actualizado exitosamente.",
      userId: userId,
      user: {
        id: userId,
        ...updatedData,
        createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: updatedData.updatedAt?.toDate?.()?.toISOString() || null,
        fcmTokenUpdatedAt: updatedData.fcmTokenUpdatedAt?.toDate?.()?.toISOString() || null,
        lastActiveAt: updatedData.lastActiveAt?.toDate?.()?.toISOString() || null
      }
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/users/{userId}:
 *   delete:
 *     summary: Eliminar usuario
 *     description: Elimina un usuario del sistema. Realiza soft delete marcando el usuario como inactivo y limpia datos relacionados.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del usuario a eliminar.
 *     responses:
 *       '200':
 *         description: Usuario eliminado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Usuario eliminado exitosamente."
 *                 userId:
 *                   type: string
 *                 deletedAt:
 *                   type: string
 *                 cleanupSummary:
 *                   type: object
 *                   properties:
 *                     raceTokensRemoved:
 *                       type: integer
 *                     globalTokensRemoved:
 *                       type: integer
 *                     followingsRemoved:
 *                       type: integer
 *       '404':
 *         description: Usuario no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */

router.delete("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "userId es obligatorio en la ruta." });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);

    // Verificar existencia
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ message: "El usuario no existe.", userId });
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const deletedAt = new Date().toISOString();

    // Marcar como eliminado y limpiar campos sensibles
    await userRef.update({
      status: "deleted",
      updatedAt: timestamp,
      deletedAt: timestamp,
      fcmToken: null,
      fcmTokenUpdatedAt: null,
      deviceInfo: null,
      profile: {
        name: "[DELETED]",
        lastName: "[DELETED]",
        email: null,
        phone: null,
        avatar: null,
        birthdate: null,
        gender: null,
        preferences: {}
      }
    });

    let cleanupSummary = {
      raceTokensRemoved: 0,
      globalTokensRemoved: 0,
      followingsRemoved: 0
    };

    // 2. Limpiar tokens FCM por carrera (subcollection)
    const raceTokensSnapshot = await db.collection('users').doc(userId)
      .collection('race-tokens').get();

    const raceTokensBatch = db.batch();
    raceTokensSnapshot.docs.forEach(doc => {
      raceTokensBatch.update(doc.ref, {
        isActive: false,
        deletedAt: timestamp
      });
      cleanupSummary.raceTokensRemoved++;
    });

    if (raceTokensSnapshot.docs.length > 0) {
      await raceTokensBatch.commit();
    }

    // 3. Limpiar índices globales de tokens FCM
    const globalTokensSnapshot = await db.collection('race-fcm-tokens')
      .where('userId', '==', userId).get();

    const globalTokensBatch = db.batch();
    globalTokensSnapshot.docs.forEach(doc => {
      globalTokensBatch.update(doc.ref, {
        isActive: false,
        deletedAt: timestamp
      });
      cleanupSummary.globalTokensRemoved++;
    });

    if (globalTokensSnapshot.docs.length > 0) {
      await globalTokensBatch.commit();
    }

    // 4. Limpiar seguimientos del usuario
    const followingsSnapshot = await db.collection('users').doc(userId)
      .collection('followings').get();

    const followingsBatch = db.batch();
    followingsSnapshot.docs.forEach(doc => {
      followingsBatch.delete(doc.ref);
      cleanupSummary.followingsRemoved++;
    });

    if (followingsSnapshot.docs.length > 0) {
      await followingsBatch.commit();
    }

    console.log(`🗑️ Usuario ${userId} eliminado. Cleanup:`, cleanupSummary);

    return res.status(200).json({
      message: "Usuario eliminado exitosamente.",
      userId: userId,
      deletedAt: deletedAt,
      cleanupSummary: cleanupSummary
    });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Listar usuarios
 *     description: Obtiene una lista paginada de usuarios del sistema con filtros opcionales.
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Número máximo de usuarios a retornar.
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de usuarios a omitir (para paginación).
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, inactive, deleted, suspended]
 *         description: Filtrar por estado del usuario.
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Buscar por nombre, email o ID de usuario.
 *     responses:
 *       '200':
 *         description: Lista de usuarios obtenida exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       profile:
 *                         type: object
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *                       lastActiveAt:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       '400':
 *         description: Parámetros inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get("/users", async (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
      status = null,
      search = null
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    const db = admin.firestore();
    let query = db.collection("users");

    // Filtrar por estado si se proporciona
    if (status) {
      query = query.where("status", "==", status);
    }

    // Ordenar por fecha de creación (más recientes primero)
    query = query.orderBy("createdAt", "desc");

    // Aplicar paginación
    if (offsetNum > 0) {
      // Para offset, necesitamos obtener todos los documentos hasta el offset
      // En producción, sería mejor usar cursor-based pagination
      query = query.limit(limitNum + offsetNum);
    } else {
      query = query.limit(limitNum);
    }

    const snapshot = await query.get();

    // Procesar resultados
    let users = [];
    snapshot.docs.forEach(doc => {
      const userData = doc.data();

      // Aplicar filtro de búsqueda si se proporciona
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesId = doc.id.toLowerCase().includes(searchLower);
        const matchesName = userData.profile?.name?.toLowerCase().includes(searchLower);
        const matchesLastName = userData.profile?.lastName?.toLowerCase().includes(searchLower);
        const matchesEmail = userData.profile?.email?.toLowerCase().includes(searchLower);

        if (!matchesId && !matchesName && !matchesLastName && !matchesEmail) {
          return; // Skip this user
        }
      }

      users.push({
        id: doc.id,
        profile: userData.profile || {},
        status: userData.status || "unknown",
        createdAt: userData.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: userData.updatedAt?.toDate?.()?.toISOString() || null,
        lastActiveAt: userData.lastActiveAt?.toDate?.()?.toISOString() || null,
        fcmTokenUpdatedAt: userData.fcmTokenUpdatedAt?.toDate?.()?.toISOString() || null,
        hasToken: !!userData.fcmToken,
        platform: userData.deviceInfo?.platform || null
      });
    });

    // Aplicar offset manualmente si hay búsqueda
    if (offsetNum > 0) {
      users = users.slice(offsetNum, offsetNum + limitNum);
    }

    // Obtener total de usuarios para paginación
    let totalQuery = db.collection("users");
    if (status) {
      totalQuery = totalQuery.where("status", "==", status);
    }
    const totalSnapshot = await totalQuery.count().get();
    const total = totalSnapshot.data().count;

    return res.status(200).json({
      users: users,
      pagination: {
        total: total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < total,
        returned: users.length
      }
    });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/apps/feed/extended:
 *   get:
 *     summary: Feed extendido de historias para estructura con Apps
 *     description: Retorna historias de participantes con información completa, adaptado para la nueva estructura /apps/{appId}/races/{raceId}/events/{eventId}/participants/{participantId}/stories. Incluye paginación optimizada, búsqueda por historia específica y filtrado por participante específico.
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
 *         description: ID del usuario para filtrar por participantes seguidos. Si se proporciona, solo retorna historias de participantes que sigue el usuario.
 *       - in: query
 *         name: storyId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID específico de historia para retornar solo esa historia.
       - in: query
         name: participantId
         required: false
         schema:
           type: string
         description: ID específico de participante para retornar solo sus historias.
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
 *                       type:
 *                         type: string
 *                         enum: [ATHLETE_STARTED, ATHLETE_CROSSED_TIMING_SPLIT, ATHLETE_FINISHED, SPONSOR, COMPLETE_AWARD]
 *                         description: Tipo de evento de la historia
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
    const { userId, storyId, appId, raceId, eventId, participantId, limit = 20, offset = 0 } = req.query;
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
          type: foundStory.type || "ATHLETE_STARTED", // ✅ Agregar campo type con valor por defecto
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

    // CASO ESPECIAL: Si viene participantId, retornar solo las stories de ese participante
    if (participantId) {
      console.log(`[PERF] Obteniendo stories del participante específico: ${participantId} en app: ${appId}`);

      try {
        // Obtener todas las stories del participante específico (sin orderBy para evitar errores de tipo)
        const storiesSnapshot = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').doc(participantId)
          .collection('stories')
          .get();

        if (storiesSnapshot.empty) {
          console.log(`📭 No se encontraron stories para el participante ${participantId}`);
          return res.status(200).json({
            stories: [],
            pagination: {
              limit: parseInt(limit) || 20,
              offset: parseInt(offset) || 0,
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

        // Obtener datos del participante
        const participantDoc = await db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants').doc(participantId)
          .get();

        const participantData = participantDoc.exists ? participantDoc.data() : {};

        // Procesar stories del participante
        const stories = storiesSnapshot.docs.map(storyDoc => {
          const storyData = storyDoc.data();
          return {
            storyId: storyDoc.id,
            appId,
            raceId,
            eventId,
            participantId,
            ...storyData,
            type: storyData.type || "ATHLETE_STARTED", // ✅ Agregar campo type con valor por defecto
            participant: {
              id: participantId,
              name: participantData.name || 'Participante',
              lastName: participantData.lastName || '',
              dorsal: participantData.dorsal || '',
              category: participantData.category || '',
              team: participantData.team || '',
              ...participantData
            }
          };
        });

        // Ordenar stories por fecha (manejar tanto Timestamp como string)
        stories.sort((a, b) => {
          const getTimestamp = (dateField) => {
            if (!dateField) return 0;

            // Si es un Timestamp de Firestore
            if (dateField && typeof dateField.toMillis === 'function') {
              return dateField.toMillis();
            }

            // Si es un string de fecha ISO
            if (typeof dateField === 'string') {
              return new Date(dateField).getTime();
            }

            // Si es un número (timestamp en milliseconds)
            if (typeof dateField === 'number') {
              return dateField;
            }

            // Fallback: intentar convertir a Date
            try {
              return new Date(dateField).getTime();
            } catch (error) {
              console.warn('Error parsing date field:', dateField);
              return 0;
            }
          };

          return getTimestamp(b.date) - getTimestamp(a.date);
        });

        console.log(`✅ [PERF] Participante específico completado en ${Date.now() - startTime}ms - ${stories.length} stories`);

        return res.status(200).json({
          stories,
          pagination: {
            limit: parseInt(limit) || 20,
            offset: parseInt(offset) || 0,
            total: stories.length,
            hasMore: false,
            currentPage: 1,
            totalPages: 1
          },
          performance: {
            totalTime: Date.now() - startTime,
            queriesExecuted: 2,
            storiesProcessed: stories.length
          }
        });

      } catch (error) {
        console.error(`❌ Error obteniendo stories del participante ${participantId}:`, error);
        return res.status(500).json({
          error: "Error obteniendo stories del participante",
          details: error.message
        });
      }
    }

    // FLUJO NORMAL: Feed completo con paginación
    console.log(`[PERF] Iniciando feed extendido para app: ${appId}, race: ${raceId}, event: ${eventId}`);

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    let step1Time = Date.now();

    // 1. Obtener participantes seguidos (si hay userId)
    let followedParticipants = [];
    if (userId) {
      try {
        console.log(`[PERF] Obteniendo participantes seguidos para usuario: ${userId}`);
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
        console.log(`[PERF] Encontrados ${followedParticipants.length} participantes seguidos`);
      } catch (error) {
        console.error("Error obteniendo participantes seguidos:", error);
      }
    }

    console.log(`[PERF] Step 1 (followings): ${Date.now() - step1Time}ms - ${followedParticipants.length} found`);
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

    // 2. Filtrar participantes por seguidos (si hay userId)
    let participantsToProcess = participantsSnapshot.docs;
    if (userId && followedParticipants.length > 0) {
      participantsToProcess = participantsSnapshot.docs.filter(participantDoc =>
        followedParticipants.includes(participantDoc.id)
      );
      console.log(`🎯 Filtrando por ${followedParticipants.length} participantes seguidos: ${participantsToProcess.length} encontrados`);
    }

    if (participantsToProcess.length === 0) {
      console.log("📭 No se encontraron participantes después del filtrado");
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

    // 3. Obtener stories de los participantes (filtrados o todos)
    const allStoriesPromises = participantsToProcess.map(async (participantDoc) => {
      const participantId = participantDoc.id;
      const participantData = participantDoc.data();

      const storiesSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories')
        .get();

      return storiesSnapshot.docs.map(storyDoc => {
        const storyData = storyDoc.data();
        return {
          storyId: storyDoc.id,
          appId,
          raceId,
          eventId,
          participantId,
          participant: participantData,
          ...storyData,
          type: storyData.type || "ATHLETE_STARTED" // ✅ Agregar campo type con valor por defecto
        };
      });
    });

    const allStoriesArrays = await Promise.all(allStoriesPromises);
    const allStories = allStoriesArrays.flat();

    console.log(`[PERF] Step 2 (queries): ${Date.now() - step2Time}ms - ${participantsToProcess.length} participantes procesados`);
    let step3Time = Date.now();

    // 3. Ordenar todas las stories por fecha (manejar tanto Timestamp como string)
    allStories.sort((a, b) => {
      const getTimestamp = (dateField) => {
        if (!dateField) return 0;

        // Si es un Timestamp de Firestore
        if (dateField && typeof dateField.toMillis === 'function') {
          return dateField.toMillis();
        }

        // Si es un string de fecha ISO
        if (typeof dateField === 'string') {
          return new Date(dateField).getTime();
        }

        // Si es un número (timestamp en milliseconds)
        if (typeof dateField === 'number') {
          return dateField;
        }

        // Fallback: intentar convertir a Date
        try {
          return new Date(dateField).getTime();
        } catch (error) {
          console.warn('Error parsing date field:', dateField);
          return 0;
        }
      };

      return getTimestamp(b.date) - getTimestamp(a.date);
    });

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
 *                       enum: [ATHLETE_CROSSED_TIMING_SPLIT, ATHLETE_STARTED, ATHLETE_FINISHED, SPONSOR]
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
          type: story.type || "ATHLETE_STARTED", // Tipo de evento por defecto
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
            type: "ATHLETE_STARTED",
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
            type: "ATHLETE_CROSSED_TIMING_SPLIT",
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
            type: "ATHLETE_FINISHED",
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
 *     summary: Webhook para recibir datos de checkpoint de participantes (Integración Copernico)
 *     description: Recibe información cuando un participante pasa por un punto de control, obtiene datos de Copernico API y actualiza la base de datos
 *     parameters:
 *       - in: header
 *         name: apiKey
 *         schema:
 *           type: string
 *         description: API key para autenticación (alternativa al body)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               competitionId:
 *                 type: string
 *                 description: ID de la competición (raceId)
 *               type:
 *                 type: string
 *                 enum: [detection, modification]
 *                 description: Tipo de evento
 *               participantId:
 *                 type: string
 *                 description: ID del participante en Copernico
 *               rawTime:
 *                 type: number
 *                 description: Timestamp UNIX en milliseconds del momento exacto del checkpoint
 *               extraData:
 *                 type: object
 *                 properties:
 *                   point:
 *                     type: string
 *                     description: Punto de control
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación (alternativa al header)
 *             required:
 *               - competitionId
 *               - type
 *               - participantId
 *     responses:
 *       '200':
 *         description: Datos procesados exitosamente
 *       '400':
 *         description: Datos inválidos
 *       '401':
 *         description: API key inválida
 *       '404':
 *         description: Participante no encontrado en Copernico
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/checkpoint-participant", async (req, res) => {
  try {
    console.log("🎯 Webhook checkpoint Copernico recibido:", JSON.stringify(req.body, null, 2));

    // Normalizar encoding UTF-8 en extraData si existe
    if (req.body.extraData && typeof req.body.extraData === 'object') {
      req.body.extraData = normalizeUTF8InObject(req.body.extraData);
      console.log("🔤 ExtraData normalizado:", JSON.stringify(req.body.extraData, null, 2));
    }

    const { competitionId, copernicoId, type, participantId, extraData, rawTime, apiKey: bodyApiKey } = req.body;

    // Validaciones básicas
    if (!competitionId || !participantId || !type) {
      console.error("❌ Parámetros requeridos faltantes");
      return res.status(400).json({
        error: "Parámetros requeridos faltantes",
        required: ["competitionId", "participantId", "type"],
        received: { competitionId, participantId, type }
      });
    }

    // Validar tipo de evento
    if (!['detection', 'modification'].includes(type)) {
      console.error("❌ Tipo de evento inválido");
      return res.status(400).json({
        error: "Tipo de evento inválido",
        validTypes: ["detection", "modification"],
        received: type
      });
    }

    // Validar API Key para autenticación máquina-a-máquina
    // Aceptar API key tanto en header como en body para flexibilidad
    const headerApiKey = req.headers.apikey || req.headers.apiKey || req.headers['api-key'];
    const apiKey = bodyApiKey || headerApiKey;
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY";

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida. Recibida:", apiKey ? "***" + apiKey.slice(-4) : "null");
      return res.status(401).json({
        error: "API key inválida",
        hint: "Envía la API key en el header 'apiKey' o en el body como 'apiKey'"
      });
    }

    console.log(`📋 Procesando evento ${type} para participante: ${participantId} en competición: ${competitionId}`);

    console.log(`📋 Procesando evento ${type} para participante: ${participantId} en competición: ${competitionId}`);

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Helper para normalizar componentes del queueKey
    const sanitize = (value, fallback = "none") =>
      String(value || fallback)
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .toUpperCase();

    const point = extraData?.point || extraData?.location || "no_point";
    const location = extraData?.location || extraData?.point || "no_location";

    // 1. CREAR IDENTIFICADOR ÚNICO PARA EVITAR DUPLICADOS (incluye punto/ubicación)
    const requestId = `${competitionId}_${participantId}_${type}_${Date.now()}`;
    const queueKey = `${sanitize(competitionId)}_${sanitize(participantId)}_${sanitize(type)}_${sanitize(point)}_${sanitize(location)}`;

    console.log(`🔑 Request ID: ${requestId}`);
    console.log(`🔑 Queue Key: ${queueKey}`);

    // 2. VERIFICAR SI YA ESTÁ EN COLA O PROCESÁNDOSE
    const existingQueueRef = db.collection('processing_queue').doc(queueKey);
    const existingQueue = await existingQueueRef.get();

    if (existingQueue.exists) {
      const queueData = existingQueue.data();
      const timeDiff = Date.now() - queueData.createdAt.toMillis();

      // Si está en cola hace menos de 1 minuto, no duplicar
      if (timeDiff < 1 * 60 * 1000) { // 1 minuto
        console.log(`⚠️ Request ya está en cola desde hace ${Math.round(timeDiff/1000)}s`);

        return res.status(200).json({
          success: true,
          message: "Request ya está en cola de procesamiento",
          data: {
            requestId: queueData.requestId,
            queueKey,
            status: "already_queued",
            queuedAt: queueData.createdAt.toDate().toISOString(),
            estimatedProcessingTime: "1-2 minutos"
          }
        });
      } else {
        // Si lleva más de 5 minutos, asumir que falló y reemplazar
        console.log(`🔄 Request anterior expirado (${Math.round(timeDiff/1000)}s), reemplazando...`);
      }
    }

    // 3. ENCOLAR NUEVA REQUEST
    const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000); // TTL de 15 minutos
    const queueData = {
      requestId,
      queueKey,
      competitionId,
      copernicoId,
      participantId,
      type,
      extraData: extraData || {},
      rawTime: rawTime || null, // Timestamp exacto del checkpoint
      status: 'queued',
      createdAt: timestamp,
      expireAt,
      attempts: 0,
      source: 'copernico-webhook'
    };

    await existingQueueRef.set(queueData);
    console.log(`✅ Request encolada: ${requestId}`);

    // 4. RESPUESTA INMEDIATA 200 - NO ESPERAR PROCESAMIENTO
    const response = {
      success: true,
      message: "Request encolada exitosamente para procesamiento",
      data: {
        requestId,
        queueKey,
        competitionId,
        participantId,
        type,
        status: "queued",
        queuedAt: new Date().toISOString(),
        estimatedProcessingTime: "1-2 minutos"
      }
    };

    // 5. ENVIAR RESPUESTA INMEDIATA
    res.status(200).json(response);

    // 6. PROCESAMIENTO ASÍNCRONO EN BACKGROUND (NO BLOQUEA LA RESPUESTA)
    setImmediate(async () => {
      try {
        console.log(`🔄 Iniciando procesamiento en background para: ${requestId}`);

        // Actualizar estado a "processing"
        await existingQueueRef.update({
          status: 'processing',
          processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // AQUÍ VA LA LÓGICA COMPLEJA DE PROCESAMIENTO
        await processCheckpointInBackground(competitionId, copernicoId, participantId, type, extraData, rawTime, requestId, queueKey);

      } catch (backgroundError) {
        console.error(`❌ Error en procesamiento background para ${requestId}:`, backgroundError);

        // Marcar como fallido en la cola
        await existingQueueRef.update({
          status: 'failed',
          error: backgroundError.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          attempts: admin.firestore.FieldValue.increment(1)
        });
      }
    });

    // La función ya envió la respuesta, no hacer return aquí



  } catch (error) {
    console.error("❌ Error procesando webhook checkpoint:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

// Nueva version con logica simplificada
router.post("/checkpoint-participant-v3", async (req, res) => {
  try {
    console.log("🎯 Webhook checkpoint Copernico (v3) recibido:", JSON.stringify(req.body, null, 2));

    if (req.body.extraData && typeof req.body.extraData === 'object') {
      req.body.extraData = normalizeUTF8InObject(req.body.extraData);
      console.log("🔤 ExtraData normalizado:", JSON.stringify(req.body.extraData, null, 2));
    }

    const {
      competitionId,
      copernicoId,
      type,
      participantId,
      participantsIds,
      event,
      extraData,
      rawTime,
      apiKey: bodyApiKey
    } = req.body;

    if (!competitionId || !type) {
      console.error("❌ Parámetros requeridos faltantes");
      return res.status(400).json({
        error: "Parámetros requeridos faltantes",
        required: ["competitionId", "type"],
        received: { competitionId, type }
      });
    }

    if (!['detection', 'modification', 'creation', 'deletion'].includes(type)) {
      console.error("❌ Tipo de evento inválido");
      return res.status(400).json({
        error: "Tipo de evento inválido",
        validTypes: ["detection", "modification", "creation", "deletion"],
        received: type
      });
    }

    const headerApiKey = req.headers.apikey || req.headers.apiKey || req.headers['api-key'];
    const apiKey = bodyApiKey || headerApiKey;
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY";

    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida. Recibida:", apiKey ? "***" + apiKey.slice(-4) : "null");
      return res.status(401).json({
        error: "API key inválida",
        hint: "Envía la API key en el header 'apiKey' o en el body como 'apiKey'"
      });
    }

    const normalizedExtraData = (extraData && typeof extraData === 'object') ? extraData : {};
    if (event && !normalizedExtraData.event) {
      normalizedExtraData.event = event;
    }

    if ((type === 'detection' || type === 'modification') && !participantId) {
      return res.status(400).json({
        error: "participantId es obligatorio para detection/modification",
        required: ["participantId"]
      });
    }

    if ((type === 'creation' || type === 'deletion') &&
        (!Array.isArray(participantsIds) || participantsIds.length === 0)) {
      return res.status(400).json({
        error: "participantsIds es obligatorio para creation/deletion",
        required: ["participantsIds"]
      });
    }

    const participantIdKey = participantId || (Array.isArray(participantsIds) ? `batch_${participantsIds.length}` : "batch");
    console.log(`📋 Procesando evento v3 ${type} para participante: ${participantIdKey} en competición: ${competitionId}`);

    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const sanitize = (value, fallback = "none") =>
      String(value || fallback)
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .toUpperCase();

    const point = normalizedExtraData?.point || normalizedExtraData?.location || "no_point";
    const location = normalizedExtraData?.location || normalizedExtraData?.point || "no_location";

    const requestId = `${competitionId}_${participantIdKey}_${type}_${Date.now()}`;
    const queueKey = `${sanitize(competitionId)}_${sanitize(participantIdKey)}_${sanitize(type)}_${sanitize(point)}_${sanitize(location)}_V3`;

    const existingQueueRef = db.collection('processing_queue').doc(queueKey);
    const existingQueue = await existingQueueRef.get();

    if (existingQueue.exists) {
      const queueData = existingQueue.data();
      const timeDiff = Date.now() - queueData.createdAt.toMillis();
      if (timeDiff < 1 * 60 * 1000) {
        return res.status(200).json({
          success: true,
          message: "Request ya está en cola de procesamiento",
          data: {
            requestId: queueData.requestId,
            queueKey,
            status: "already_queued",
            queuedAt: queueData.createdAt.toDate().toISOString(),
            estimatedProcessingTime: "1-2 minutos"
          }
        });
      }
    }

    const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    const queueData = {
      requestId,
      queueKey,
      competitionId,
      copernicoId,
      participantsIds: Array.isArray(participantsIds) ? participantsIds : null,
      type,
      extraData: normalizedExtraData,
      rawTime: rawTime || null,
      status: 'queued',
      createdAt: timestamp,
      expireAt,
      attempts: 0,
      source: 'copernico-webhook-v3'
    };

    await existingQueueRef.set(queueData);

    const responseData = {
      requestId,
      queueKey,
      competitionId,
      participantsIds: Array.isArray(participantsIds) ? participantsIds : null,
      type,
      status: "queued",
      queuedAt: new Date().toISOString(),
      estimatedProcessingTime: "1-2 minutos"
    };
    if (participantId) {
      responseData.participantId = participantId;
    }

    res.status(200).json({
      success: true,
      message: "Request encolada exitosamente para procesamiento",
      data: responseData
    });

    setImmediate(async () => {
      try {
        await existingQueueRef.update({
          status: 'processing',
          processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await processCheckpointInBackgroundV3(
          competitionId,
          copernicoId,
          participantId,
          participantsIds,
          type,
          normalizedExtraData,
          rawTime,
          requestId,
          queueKey
        );
      } catch (backgroundError) {
        console.error(`❌ Error en procesamiento background v3 para ${requestId}:`, backgroundError);
        await existingQueueRef.update({
          status: 'failed',
          error: backgroundError.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          attempts: admin.firestore.FieldValue.increment(1)
        });
      }
    });
  } catch (error) {
    console.error("❌ Error procesando webhook checkpoint v3:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/checkpoint-participant/status/{queueKey}:
 *   get:
 *     summary: Consultar estado de procesamiento de checkpoint
 *     tags: [Checkpoint]
 *     parameters:
 *       - in: path
 *         name: queueKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Clave de la cola de procesamiento
 *     responses:
 *       200:
 *         description: Estado del procesamiento
 *       404:
 *         description: Request no encontrada
 */
router.get("/checkpoint-participant/status/:queueKey", async (req, res) => {
  try {
    const { queueKey } = req.params;

    console.log(`🔍 Consultando estado de: ${queueKey}`);

    const db = admin.firestore();
    const queueDoc = await db.collection('processing_queue').doc(queueKey).get();

    if (!queueDoc.exists) {
      return res.status(404).json({
        error: "Request no encontrada",
        queueKey
      });
    }

    const queueData = queueDoc.data();

    // También buscar checkpoints relacionados
    const checkpointsQuery = await db.collection('checkpoints')
      .where('requestId', '==', queueData.requestId)
      .limit(1)
      .get();

    let checkpointData = null;
    if (!checkpointsQuery.empty) {
      checkpointData = checkpointsQuery.docs[0].data();
    }

    return res.status(200).json({
      success: true,
      queueKey,
      queue: {
        ...queueData,
        createdAt: queueData.createdAt?.toDate()?.toISOString(),
        processingStartedAt: queueData.processingStartedAt?.toDate()?.toISOString(),
        completedAt: queueData.completedAt?.toDate()?.toISOString(),
        failedAt: queueData.failedAt?.toDate()?.toISOString()
      },
      checkpoint: checkpointData ? {
        ...checkpointData,
        createdAt: checkpointData.createdAt?.toDate()?.toISOString()
      } : null
    });

  } catch (error) {
    console.error("❌ Error consultando estado:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/debug/events:
 *   get:
 *     summary: Explorar estructura de eventos en la base de datos
 *     tags: [Debug]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Límite de eventos a mostrar
 *     responses:
 *       200:
 *         description: Lista de eventos encontrados
 */
router.get("/debug/events", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    console.log(`🔍 Explorando estructura de eventos (límite: ${limit})`);

    const db = admin.firestore();
    const events = [];
    let totalRaces = 0;
    let totalApps = 0;
    let totalEvents = 0;

    const racesSnapshot = await db.collection('races').limit(5).get(); // Limitar races para no sobrecargar

    for (const raceDoc of racesSnapshot.docs) {
      const currentRaceId = raceDoc.id;
      totalRaces++;

      try {
        const appsSnapshot = await db.collection('races').doc(currentRaceId)
          .collection('apps').limit(3).get(); // Limitar apps

        for (const appDoc of appsSnapshot.docs) {
          const currentAppId = appDoc.id;
          totalApps++;

          const eventsSnapshot = await db.collection('races').doc(currentRaceId)
            .collection('apps').doc(currentAppId)
            .collection('events').limit(limit).get();

          for (const eventDoc of eventsSnapshot.docs) {
            const eventData = eventDoc.data();
            const eventId = eventDoc.id;
            totalEvents++;

            events.push({
              raceId: currentRaceId,
              appId: currentAppId,
              eventId: eventId,
              eventData: {
                name: eventData.name || 'Sin nombre',
                competitionId: eventData.competitionId || null,
                raceId: eventData.raceId || null,
                externalId: eventData.externalId || null,
                createdAt: eventData.createdAt?.toDate?.()?.toISOString() || null,
                // Solo campos relevantes para debugging
                hasParticipants: eventData.participants ? Object.keys(eventData.participants).length : 'unknown'
              }
            });

            if (events.length >= limit) break;
          }
          if (events.length >= limit) break;
        }
        if (events.length >= limit) break;
      } catch (error) {
        console.error(`⚠️ Error revisando race ${currentRaceId}:`, error.message);
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalRacesScanned: totalRaces,
        totalAppsScanned: totalApps,
        totalEventsFound: totalEvents,
        eventsReturned: events.length
      },
      events: events,
      searchCriteria: {
        structure: "/races/{raceId}/apps/{appId}/events/{eventId}",
        lookingFor: "competitionId, raceId, externalId fields",
        testCompetitionId: "52ec7d4a-40c1-4f74-bfa0-cf4cc76edd49"
      }
    });

  } catch (error) {
    console.error("❌ Error explorando eventos:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

/**
 * Función para procesar checkpoint en background (no bloquea la respuesta HTTP)
 */
async function processCheckpointInBackground(competitionId, copernicoId, participantId, type, extraData, rawTime, requestId, queueKey) {
  console.log(`🔄 [BACKGROUND] Procesando checkpoint: ${requestId}`);
  console.log(`📊 [BACKGROUND] Datos recibidos:`, { competitionId, copernicoId, participantId, type, extraData, rawTime });

  const db = admin.firestore();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  try {
    // 1. CREAR REGISTRO DE CHECKPOINT INMEDIATAMENTE
    console.log(`📝 [BACKGROUND] Creando registro de checkpoint: ${requestId}`);

    const checkpointData = {
      requestId,
      competitionId,
      participantId,
      type,
      extraData: extraData || {},
      rawTime: rawTime || null, // Timestamp exacto del checkpoint
      status: 'processing',
      createdAt: timestamp,
      source: 'copernico-webhook'
    };

    const checkpointRef = await db.collection('checkpoints').add(checkpointData);
    console.log(`✅ [BACKGROUND] Checkpoint registrado: ${checkpointRef.id}`);

    // 2. INTENTAR OBTENER DATOS DE COPERNICO (CON FALLBACK)
    let participantData;
    let copernicoSuccess = false;
    let transformedData = null;

    console.log(`🌐 [BACKGROUND] Intentando obtener datos de Copernico...`);

    try {
      // Verificar si hay API keys configuradas
      const envConfig = copernicoService.getCurrentEnvironmentConfig();
      if (!envConfig.apiKey) {
        throw new Error('No hay API key de Copernico configurada');
      }

      // Obtener el race slug - usar copernicoId si está disponible, sino buscar en race_info
      let raceSlug = competitionId; // Fallback al competitionId original
      let copernicoEnv = null;
      let raceData = null;

      // Leer configuración de la carrera (para env y race_info)
      try {
        const raceDoc = await db.collection('races').doc(competitionId).get();
        if (raceDoc.exists) {
          raceData = raceDoc.data();
          if (raceData.copernicoEnv) {
            copernicoEnv = raceData.copernicoEnv;
            console.log(`🌐 [BACKGROUND] Ambiente Copernico desde Firestore: ${copernicoEnv}`);
          }
        }
      } catch (raceError) {
        console.error(`❌ [BACKGROUND] Error obteniendo config de carrera:`, raceError.message);
      }

      if (copernicoId) {
        // Si tenemos copernicoId directamente, usarlo
        raceSlug = copernicoId;
        console.log(`🎯 [BACKGROUND] Usando copernicoId proporcionado: ${raceSlug}`);
      } else if (raceData && raceData.race_info && raceData.race_info.id) {
        raceSlug = raceData.race_info.id;
        console.log(`🔍 [BACKGROUND] Race slug obtenido desde race_info: ${raceSlug}`);
      } else if (raceData) {
        console.log(`⚠️ [BACKGROUND] No se encontró race_info.id, usando competitionId: ${competitionId}`);
      } else {
        console.log(`⚠️ [BACKGROUND] Race no encontrada, usando competitionId: ${competitionId}`);
      }

      const copernicoData = await copernicoService.getParticipantData(
        raceSlug,
        participantId,
        copernicoEnv,
        { forceRefresh: type === 'modification' }
      );
      transformedData = copernicoService.transformCopernicoData(copernicoData);
      participantData = {
        ...transformedData.participant,
        competitionId,
        dataSource: 'copernico'
      };
      copernicoSuccess = true;

      console.log(`✅ [BACKGROUND] Datos obtenidos de Copernico exitosamente`);

    } catch (copernicoError) {
      console.error(`❌ [BACKGROUND] Error con Copernico:`, copernicoError.message);

      // FALLBACK: Crear datos básicos del participante
      participantData = {
        externalId: participantId,
        fullName: `Participante ${participantId}`,
        dorsal: participantId.slice(-4), // Usar últimos 4 caracteres como dorsal
        competitionId: competitionId, // Usar competitionId, no eventId
        status: 'active',
        category: 'Unknown',
        featured: false,
        dataSource: 'webhook_fallback'
      };

      console.log(`🔄 [BACKGROUND] Usando datos básicos de fallback`);
    }

    console.log(`📋 [BACKGROUND] Datos del participante:`, {
      name: participantData.fullName,
      dorsal: participantData.dorsal,
      competitionId: participantData.competitionId || competitionId,
      dataSource: participantData.dataSource || 'copernico'
    });

    // 3. BUSCAR EVENTO ESPECÍFICO USANDO extraData.event
    console.log(`🔍 [BACKGROUND] Buscando evento específico: ${extraData?.event || 'NO_EVENT'} en competitionId: ${competitionId}`);

    let locations = [];

    if (extraData?.event) {
      // Buscar el evento específico mencionado en extraData
      console.log(`🔍 [BACKGROUND] Llamando a findSpecificEvent...`);
      locations = await findSpecificEvent(db, competitionId, extraData.event);
      console.log(`📊 [BACKGROUND] findSpecificEvent retornó ${locations.length} ubicaciones`);
    }

    // Si no se encuentra el evento específico, buscar todos los eventos (fallback)
    if (locations.length === 0) {
      console.log(`⚠️ [BACKGROUND] Evento específico '${extraData?.event}' no encontrado, buscando todos los eventos...`);
      locations = await findEventsByCompetition(db, competitionId);
    }

    if (locations.length === 0) {
      console.log(`⚠️ [BACKGROUND] No se encontraron eventos para competitionId: ${competitionId}`);

      // Actualizar checkpoint como completado pero sin ubicaciones
      await checkpointRef.update({
        status: 'completed_no_events',
        completedAt: timestamp,
        message: `No se encontraron eventos para competitionId: ${competitionId}`,
        participantData: participantData,
        searchedEvent: extraData?.event || null,
        checkpointInfo: {
          point: extraData?.point ?? null,
          event: extraData?.event ?? null,
          location: extraData?.location ?? null
        }
      });

      // No es un error crítico, solo no hay donde procesar
      console.log(`✅ [BACKGROUND] Checkpoint registrado sin eventos: ${checkpointRef.id}`);
      return;
    }

    console.log(`📍 [BACKGROUND] Encontrados ${locations.length} eventos para competitionId ${competitionId}`);

    if (locations.length > 0) {
      console.log(`📋 [BACKGROUND] Ubicaciones encontradas:`);
      locations.forEach((loc, index) => {
        console.log(`   ${index + 1}. ${loc.raceId}/${loc.appId}/${loc.eventId}`);
      });
    }

    // 4. OBTENER STREAMS DE AWS PARA GENERACIÓN DE STORIES
    console.log(`🎬 [BACKGROUND] Obteniendo streams de AWS para competitionId: ${competitionId}`);
    const streamsResult = await getCompetitionStreams(competitionId);
    console.log(`🎬 [BACKGROUND] Streams obtenidos:`, streamsResult ? 'Sí' : 'No');

    // 5. PROCESAR EN CADA UBICACIÓN
    const results = [];
    console.log(`🔄 [BACKGROUND] Iniciando procesamiento en ${locations.length} ubicaciones...`);

    for (const location of locations) {
      try {
        const result = await processParticipantInLocation(db, location, participantData, timestamp, extraData, rawTime, transformedData);
        results.push(result);
        console.log(`✅ [BACKGROUND] Procesado en ${location.raceId}/${location.appId}/${location.eventId}`);

        // 6. CREAR STORY AUTOMÁTICA SOLO PARA DETECCIONES (NO MODIFICACIONES)
        if (result.success && type === 'detection') {
          console.log(`📖 [BACKGROUND] Creando story automática para detección de checkpoint`);

          try {
            const storyResult = await createAutomaticStory(
              db,
              location,
              participantData,
              extraData,
              streamsResult.success ? streamsResult.streamMap : null,
              copernicoSuccess ? transformedData : null, // Pasar datos completos de Copernico
              rawTime // Pasar rawTime del webhook
            );

            if (storyResult.success) {
              result.storyCreated = storyResult;
              console.log(`✅ [BACKGROUND] Story creada: ${storyResult.storyId}`);
            } else {
              result.storyError = storyResult.error;
              console.log(`⚠️ [BACKGROUND] Error creando story: ${storyResult.error}`);
            }
          } catch (storyError) {
            console.error(`❌ [BACKGROUND] Error en creación de story:`, storyError);
            result.storyError = storyError.message;
          }
        } else {
          console.log(`⏭️ [BACKGROUND] Tipo '${type}' no requiere creación de story (solo 'detection')`);
        }

      } catch (locationError) {
        console.error(`❌ [BACKGROUND] Error en ubicación ${location.raceId}/${location.appId}/${location.eventId}:`, locationError.message);
        results.push({
          ...location,
          error: locationError.message,
          success: false
        });
      }
    }

    // 7. MARCAR COMO COMPLETADO EN LA COLA
    await db.collection('processing_queue').doc(queueKey).update({
      status: 'completed',
      completedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000), // TTL de 15 minutos post-proceso
      results: results,
      locationsProcessed: locations.length,
      checkpointInfo: {
        point: extraData?.point ?? null,
        event: extraData?.event ?? null,
        location: extraData?.location ?? null
      },
      streamsInfo: {
        success: streamsResult.success,
        streamsFound: streamsResult.success ? streamsResult.streams?.length : 0,
        error: streamsResult.success ? null : streamsResult.error
      }
    });

    console.log(`✅ [BACKGROUND] Procesamiento completado para: ${requestId}`);

  } catch (error) {
    console.error(`❌ [BACKGROUND] Error procesando ${requestId}:`, error.message);

    // Marcar como fallido
    await db.collection('processing_queue').doc(queueKey).update({
      status: 'failed',
      error: error.message,
      failedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000), // TTL de 15 minutos post-fallo
      attempts: admin.firestore.FieldValue.increment(1)
    });

    throw error;
  }
}

async function processCheckpointInBackgroundV3(competitionId, copernicoId, participantId, participantsIds, type, extraData, rawTime, requestId, queueKey) {
  console.log(`🔄 [BACKGROUND v3] Procesando checkpoint: ${requestId}`);
  const db = admin.firestore();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  try {
    const checkpointData = {
      requestId,
      competitionId,
      participantsIds: Array.isArray(participantsIds) ? participantsIds : null,
      type,
      extraData: extraData || {},
      rawTime: rawTime || null,
      status: 'processing',
      createdAt: timestamp,
      source: 'copernico-webhook-v3'
    };
    const checkpointRef = await db.collection('checkpoints').add(checkpointData);
    console.log(`✅ [BACKGROUND v3] Checkpoint registrado: ${checkpointRef.id}`);

    let participantData;
    let copernicoSuccess = false;
    let transformedData = null;
    let raceData = null;
    let copernicoEnv = null;

    try {
      const raceDoc = await db.collection('races').doc(competitionId).get();
      if (raceDoc.exists) {
        raceData = raceDoc.data();
        if (raceData.copernicoEnv) {
          copernicoEnv = raceData.copernicoEnv;
        }
      }
    } catch (raceError) {
      console.error(`❌ [BACKGROUND v3] Error obteniendo config de carrera:`, raceError.message);
    }

    const normalizedEventKey = extraData?.event
      ? normalizeUTF8InObject(extraData.event).toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : null;

    let locations = [];
    const cacheKey = normalizedEventKey ? `${competitionId}:${normalizedEventKey}` : null;
    if (normalizedEventKey) {
      const cached = eventResolutionCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < EVENT_CACHE_TTL_MS) {
        locations = [{
          raceId: competitionId,
          appId: cached.appId,
          eventId: cached.eventId
        }];
        console.log(`✅ [BACKGROUND v3] Evento encontrado via cache: ${cached.appId}/${cached.eventId}`);
      }
    }
    if (locations.length === 0 && normalizedEventKey) {
      try {
        const indexRef = db.collection('races').doc(competitionId)
          .collection('eventIndex').doc(normalizedEventKey);
        const indexDoc = await indexRef.get();
        if (indexDoc.exists) {
          const indexData = indexDoc.data() || {};
          if (indexData.appId) {
            let resolvedEventId = null;
            if (extraData?.event) {
              const directEventRef = db.collection('races').doc(competitionId)
                .collection('apps').doc(indexData.appId)
                .collection('events').doc(extraData.event);
              const directEventSnap = await directEventRef.get();
              if (directEventSnap.exists) {
                resolvedEventId = extraData.event;
                console.log(`✅ [BACKGROUND v3] Evento encontrado via direct eventId: ${indexData.appId}/${resolvedEventId}`);
              }
            }

            if (!resolvedEventId && indexData.eventId) {
              const indexedEventRef = db.collection('races').doc(competitionId)
                .collection('apps').doc(indexData.appId)
                .collection('events').doc(indexData.eventId);
              const indexedEventSnap = await indexedEventRef.get();
              if (indexedEventSnap.exists) {
                resolvedEventId = indexData.eventId;
                console.log(`✅ [BACKGROUND v3] Evento encontrado via eventIndex: ${indexData.appId}/${resolvedEventId}`);
              }
            }

            if (!resolvedEventId) {
              const eventsSnap = await db.collection('races').doc(competitionId)
                .collection('apps').doc(indexData.appId)
                .collection('events').get();
              for (const eventDoc of eventsSnap.docs) {
                const eventData = eventDoc.data() || {};
                const baseName = eventData.event_info?.name || eventData.name || eventData.eventName || eventDoc.id;
                const normalizedFromDoc = String(baseName || "")
                  .trim()
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '');
                if (normalizedFromDoc === normalizedEventKey) {
                  resolvedEventId = eventDoc.id;
                  console.log(`✅ [BACKGROUND v3] Evento encontrado via scan app: ${indexData.appId}/${resolvedEventId}`);
                  break;
                }
              }
            }

              if (resolvedEventId) {
                locations = [{
                  raceId: competitionId,
                  appId: indexData.appId,
                  eventId: resolvedEventId
                }];
              eventResolutionCache.set(cacheKey, {
                appId: indexData.appId,
                eventId: resolvedEventId,
                ts: Date.now()
              });
              if (indexData.eventId !== resolvedEventId) {
                await indexRef.set({
                  eventId: resolvedEventId,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
              }
            }
          }
        }
      } catch (indexError) {
        console.error(`❌ [BACKGROUND v3] Error leyendo eventIndex:`, indexError.message);
      }
    }
    if (locations.length === 0 && normalizedEventKey) {
      try {
        console.log(`🔎 [BACKGROUND v3] Buscando eventNameNormalized="${normalizedEventKey}" en collectionGroup events`);
        const eventsQuery = await db.collectionGroup('events')
          .where('eventNameNormalized', '==', normalizedEventKey)
          .get();

        locations = eventsQuery.docs
          .filter(eventDoc => eventDoc.ref.parent.parent.parent.parent.id === competitionId)
          .map(eventDoc => ({
            raceId: eventDoc.ref.parent.parent.parent.parent.id,
            appId: eventDoc.ref.parent.parent.id,
            eventId: eventDoc.id,
            eventData: eventDoc.data()
          }));
        console.log(`🔎 [BACKGROUND v3] Resultados por eventNameNormalized: ${locations.length}`);
      } catch (queryError) {
        console.error(`❌ [BACKGROUND v3] Error consultando events por eventNameNormalized:`, queryError.message);
      }
    }

    if (locations.length === 0 && extraData?.event) {
      locations = await findSpecificEvent(db, competitionId, extraData.event);
    }
    if (locations.length === 0) {
      locations = await findEventsByCompetition(db, competitionId);
    }

    if (locations.length === 0) {
      await checkpointRef.update({
        status: 'completed_no_events',
        completedAt: timestamp,
        message: `No se encontraron eventos para competitionId: ${competitionId}`,
        participantData: participantData,
        searchedEvent: extraData?.event || null
      });
      return;
    }

    if (locations.length === 1 && normalizedEventKey) {
      const primary = locations[0];
      const cacheKey = `${competitionId}:${normalizedEventKey}`;
      eventResolutionCache.set(cacheKey, {
        appId: primary.appId,
        eventId: primary.eventId,
        ts: Date.now()
      });
      checkpointRef.update({
        resolvedEvent: {
          raceId: primary.raceId,
          appId: primary.appId,
          eventId: primary.eventId,
          eventNameNormalized: normalizedEventKey
        },
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      }).catch((error) => {
        console.warn(`⚠️ [BACKGROUND v3] No se pudo guardar resolvedEvent en checkpoint:`, error.message);
      });
    }

    if (type === 'creation' || type === 'deletion') {
      const ids = Array.isArray(participantsIds) ? participantsIds : [];
      const results = [];

      let raceSlug = competitionId;
      if (copernicoId) {
        raceSlug = copernicoId;
      } else if (raceData && raceData.race_info && raceData.race_info.id) {
        raceSlug = raceData.race_info.id;
      }

      const copernicoEventsByParticipant = new Map();
      await Promise.all(ids.map(async (pid) => {
        try {
          const copernicoData = await copernicoService.getParticipantData(raceSlug, pid, copernicoEnv);
          const rawEvents = Array.isArray(copernicoData?.events) ? copernicoData.events : [];
          const eventIds = rawEvents
            .map(evt => String(evt?.event || evt?.name || evt?.eventName || "").trim())
            .filter(Boolean);
          copernicoEventsByParticipant.set(pid, new Set(eventIds));
        } catch (error) {
          console.warn(`⚠️ [BACKGROUND v3] No se pudo obtener eventos de Copernico para ${pid}:`, error.message);
          copernicoEventsByParticipant.set(pid, new Set());
        }
      }));

      const processParticipant = async (pid) => {
        const participantResults = [];
        const participantEvents = copernicoEventsByParticipant.get(pid) || new Set();

        await Promise.all(locations.map(async (loc) => {
          const { raceId, appId, eventId } = loc;
          const eventRef = db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(eventId);

          if (!participantEvents.has(eventId)) {
            return;
          }

          const participantRef = eventRef.collection('participants').doc(pid);

          if (type === 'creation') {
            const basicParticipant = {
              externalId: pid,
              fullName: `Participante ${pid}`,
              raceId,
              eventId,
              competitionId,
              featured: false,
              dataSource: 'webhook_creation',
              createdAt: timestamp,
              registerDate: timestamp,
              updatedAt: timestamp
            };
            await participantRef.set(basicParticipant, { merge: true });
            participantResults.push({ raceId, appId, eventId, participantId: pid, action: 'created' });
            return;
          }

          if (type === 'deletion') {
            let storyIds = [];
            try {
              const storiesSnap = await participantRef.collection('stories').get();
              storyIds = storiesSnap.docs.map(doc => doc.id);
            } catch (storyError) {
              console.warn(`⚠️ [BACKGROUND v3] No se pudieron leer stories de ${pid}:`, storyError.message);
            }

            await Promise.all(storyIds.map(async (storyId) => {
              try {
                await eventRef.collection('stories').doc(storyId).delete();
              } catch (deleteError) {
                console.warn(`⚠️ [BACKGROUND v3] No se pudo borrar story espejo ${storyId}:`, deleteError.message);
              }
            }));

            try {
              await db.recursiveDelete(participantRef);
            } catch (deleteParticipantError) {
              console.warn(`⚠️ [BACKGROUND v3] Error borrando participante ${pid}:`, deleteParticipantError.message);
              throw deleteParticipantError;
            }

            participantResults.push({
              raceId,
              appId,
              eventId,
              participantId: pid,
              action: 'deleted',
              deletedEventStories: storyIds.length
            });
          }
        }));
        results.push(...participantResults);
      };

      await Promise.all(ids.map(processParticipant));

      await db.collection('processing_queue').doc(queueKey).update({
        status: 'completed',
        completedAt: timestamp,
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
        results: results,
        locationsProcessed: locations.length
      });

      return;
    }

    const firstLocation = locations[0];
    let existingParticipant = null;
    if (firstLocation) {
      const existingRef = db.collection('races').doc(firstLocation.raceId)
        .collection('apps').doc(firstLocation.appId)
        .collection('events').doc(firstLocation.eventId)
        .collection('participants')
        .doc(participantId);
      const existingDoc = await existingRef.get();
      if (existingDoc.exists) {
        existingParticipant = existingDoc.data();
      }
    }

    try {
      const envConfig = copernicoService.getCurrentEnvironmentConfig();
      if (!envConfig.apiKey) {
        throw new Error('No hay API key de Copernico configurada');
      }

      let raceSlug = competitionId;
      if (copernicoId) {
        raceSlug = copernicoId;
      } else if (raceData && raceData.race_info && raceData.race_info.id) {
        raceSlug = raceData.race_info.id;
      }

      const copernicoData = await copernicoService.getParticipantData(raceSlug, participantId, copernicoEnv);
      transformedData = copernicoService.transformCopernicoData(copernicoData);
      participantData = {
        ...transformedData.participant,
        competitionId,
        dataSource: 'copernico'
      };
      copernicoSuccess = true;
    } catch (copernicoError) {
      console.error(`❌ [BACKGROUND v3] Error con Copernico:`, copernicoError.message);
      if (existingParticipant) {
        participantData = existingParticipant;
      } else {
        participantData = {
          externalId: participantId,
          fullName: `Participante ${participantId}`,
          dorsal: participantId.slice(-4),
          competitionId: competitionId,
          dataSource: 'webhook_fallback'
        };
      }
    }

    const results = [];
    let streamsResult = { success: false, streamMap: null };
    const splitLookupName = extraData?.point || extraData?.location || null;
    if ((type === 'detection' || type === 'modification') && splitLookupName) {
      let shouldFetchStreams = true;
      try {
        const location = locations[0];
        if (location) {
          const eventDoc = await db.collection('races').doc(location.raceId)
            .collection('apps').doc(location.appId)
            .collection('events').doc(location.eventId)
            .get();
          const videoSplits = eventDoc.exists ? eventDoc.data()?.videoSplits : null;
          const splitKeys = videoSplits ? Object.keys(videoSplits) : [];

          const pointKey = extraData?.point || null;
          const locationKey = extraData?.location || null;
          const pointMatch = pointKey ? splitKeys.find(key => key.toLowerCase() === pointKey.toLowerCase()) : null;
          const locationMatch = locationKey ? splitKeys.find(key => key.toLowerCase() === locationKey.toLowerCase()) : null;
          const matchedKey = pointMatch || locationMatch || null;
          const splitStatus = matchedKey ? videoSplits?.[matchedKey]?.status : undefined;

          console.log(`🎬 [BACKGROUND v3] videoSplits check: point="${pointKey}" location="${locationKey}" matched="${matchedKey}" status=${splitStatus}`);
          if (splitKeys.length > 0) {
            console.log(`🎬 [BACKGROUND v3] videoSplits keys (sample):`, splitKeys.slice(0, 10));
          }

          if (!videoSplits || splitKeys.length === 0 || splitStatus !== true) {
            shouldFetchStreams = false;
            console.log(`ℹ️ [BACKGROUND v3] Skip streams: videoSplits no habilitado para "${matchedKey || splitLookupName}"`);
          }
        }
      } catch (videoSplitError) {
        console.error(`❌ [BACKGROUND v3] Error validando videoSplits antes de streams:`, videoSplitError.message);
      }
      if (shouldFetchStreams) {
        streamsResult = await getCompetitionStreams(competitionId);
        const streamKeys = streamsResult?.streamMap ? Object.keys(streamsResult.streamMap) : [];
        console.log(`🎬 [BACKGROUND v3] Streams fetch: success=${streamsResult?.success} splitLookup="${splitLookupName}" keys=${streamKeys.length}`);
        if (streamKeys.length > 0) {
          console.log(`🎬 [BACKGROUND v3] StreamMap keys (sample):`, streamKeys.slice(0, 10));
        }
      } else {
        console.log(`🎬 [BACKGROUND v3] Streams fetch skipped: shouldFetchStreams=false splitLookup="${splitLookupName}"`);
      }
    }

    for (const location of locations) {
      try {
        const { raceId, appId, eventId } = location;
        const locationStart = Date.now();
        const logStep = (label) => {
          const deltaMs = Date.now() - locationStart;
          console.log(`⏱️ [BACKGROUND v3] ${label} (+${deltaMs}ms)`);
        };

        const participantDocId = participantData.externalId || participantId;
        const participantRef = db.collection('races').doc(raceId)
          .collection('apps').doc(appId)
          .collection('events').doc(eventId)
          .collection('participants')
          .doc(participantDocId);
        logStep('participantRef ready');

        const existingParticipant = await participantRef.get();
        logStep('participantRef.get done');
        let isFeatured = false;
        let hasFollowers = false;

        const basicParticipantData = {
          externalId: participantData.externalId || participantId,
          name: participantData.name || null,
          lastName: participantData.lastName || null,
          fullName: participantData.fullName || `${participantData.name || ""} ${participantData.lastName || ""}`.trim(),
          gender: participantData.gender || null,
          birthdate: participantData.birthdate || null,
          country: participantData.country || participantData.nationality || null,
          nationality: participantData.nationality || null,
          dorsal: participantData.dorsal || null,
          category: participantData.category || null,
          team: participantData.team || null,
          club: participantData.club || null,
          featured: participantData.featured || false,
          raceId,
          eventId,
          competitionId,
          updatedAt: timestamp
        };

        if (existingParticipant.exists) {
          const existingData = existingParticipant.data() || {};
          isFeatured = existingData.featured === true;
          await participantRef.set(basicParticipantData, { merge: true });
          logStep('participant updated');
          const followersSnap = await participantRef.collection('followers').limit(1).get();
          hasFollowers = !followersSnap.empty;
          console.log(`👥 [BACKGROUND v3] followers count peek: ${followersSnap.size} for ${raceId}/${appId}/${eventId}/${participantDocId}`);
          logStep('followers check done');
        } else {
          isFeatured = participantData.featured === true;
          await participantRef.set({
            ...basicParticipantData,
            createdAt: timestamp,
            registerDate: timestamp
          });
          logStep('participant created');
        }

        if (type === 'modification') {
          if (hasFollowers) {
            await sendSilentCheckpointNotificationToFollowers({
              db,
              raceId,
              appId,
              eventId,
              participantId: participantDocId,
              checkpointInfo: {
                point: extraData?.point ?? null,
                location: extraData?.location ?? null
              }
            });
          }

          let storyResult = null;
          const shouldCreateStory = (isFeatured || hasFollowers) && (extraData?.point || extraData?.location);
          console.log(`🧭 [BACKGROUND v3] story gate (mod) for ${raceId}/${appId}/${eventId}/${participantDocId}: featured=${isFeatured} followers=${hasFollowers}`);
          if (shouldCreateStory) {
            storyResult = await createAutomaticStory(
              db,
              location,
              participantData,
              extraData,
              streamsResult.success ? streamsResult.streamMap : null,
              copernicoSuccess ? transformedData : null,
              rawTime,
              { updateOnly: false, skipClipGeneration: false }
            );
          }

          results.push({
            raceId,
            appId,
            eventId,
            participant: {
              id: participantDocId,
              externalId: participantDocId
            },
            success: true,
            storyCreated: storyResult?.success || false,
            storyId: storyResult?.storyId || null
          });
          continue;
        }

        let storyResult = null;
        console.log(`🧭 [BACKGROUND v3] story gate for ${raceId}/${appId}/${eventId}/${participantDocId}: featured=${isFeatured} followers=${hasFollowers} type=${type}`);
        if (isFeatured || hasFollowers) {
          logStep('before createAutomaticStory');
          storyResult = await createAutomaticStory(
            db,
            location,
            participantData,
            extraData,
            streamsResult.success ? streamsResult.streamMap : null,
            copernicoSuccess ? transformedData : null,
            rawTime
          );
          logStep('after createAutomaticStory');
        }

        results.push({
          raceId,
          appId,
          eventId,
          participant: {
            id: participantData.externalId,
            externalId: participantData.externalId
          },
          success: true,
          storyCreated: storyResult?.success || false,
          storyId: storyResult?.storyId || null
        });
      } catch (locationError) {
        console.error(`❌ [BACKGROUND v3] Error en ubicación ${location.raceId}/${location.appId}/${location.eventId}:`, locationError.message);
        results.push({
          ...location,
          error: locationError.message,
          success: false
        });
      }
    }

    await db.collection('processing_queue').doc(queueKey).update({
      status: 'completed',
      completedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      results: results,
      locationsProcessed: locations.length,
      checkpointInfo: {
        point: extraData?.point ?? null,
        event: extraData?.event ?? null,
        location: extraData?.location ?? null
      }
    });

    console.log(`✅ [BACKGROUND v3] Procesamiento completado para: ${requestId}`);
  } catch (error) {
    console.error(`❌ [BACKGROUND v3] Error procesando ${requestId}:`, error.message);
    await db.collection('processing_queue').doc(queueKey).update({
      status: 'failed',
      error: error.message,
      failedAt: timestamp,
      expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      attempts: admin.firestore.FieldValue.increment(1)
    });
    throw error;
  }
}

/**
 * Buscar todos los eventos dentro de una competición
 */
async function findEventsByCompetition(db, competitionId) {
  console.log(`🔍 [BACKGROUND] Buscando eventos para competitionId: ${competitionId}`);

  const locations = [];
  const racesSnapshot = await db.collection('races').get();

  for (const raceDoc of racesSnapshot.docs) {
    const currentRaceId = raceDoc.id;

    try {
      const appsSnapshot = await db.collection('races').doc(currentRaceId)
        .collection('apps').get();

      for (const appDoc of appsSnapshot.docs) {
        const currentAppId = appDoc.id;

        // Obtener todos los eventos en esta ubicación
        const eventsSnapshot = await db.collection('races').doc(currentRaceId)
          .collection('apps').doc(currentAppId)
          .collection('events').get();

        for (const eventDoc of eventsSnapshot.docs) {
          const eventData = eventDoc.data();
          const eventId = eventDoc.id;

          // Verificar si este evento pertenece a la competición
          // Puede ser por ID directo, por campo en el documento, o por raceId de la estructura
          const belongsToCompetition =
            eventId === competitionId ||
            eventData.competitionId === competitionId ||
            eventData.raceId === competitionId ||
            eventData.externalId === competitionId ||
            currentRaceId === competitionId; // ← NUEVA LÓGICA: usar raceId de la estructura

          if (belongsToCompetition) {
            locations.push({
              raceId: currentRaceId,
              appId: currentAppId,
              eventId: eventId,
              eventData: eventData
            });
            console.log(`📍 [BACKGROUND] Evento encontrado: ${currentRaceId}/${currentAppId}/${eventId}`);
          }
        }
      }
    } catch (error) {
      console.error(`⚠️ [BACKGROUND] Error revisando race ${currentRaceId}:`, error.message);
    }
  }

  console.log(`📊 [BACKGROUND] Total eventos encontrados: ${locations.length}`);
  return locations;
}

/**
 * Buscar un evento específico por nombre en una competición
 */
async function findSpecificEvent(db, competitionId, eventName) {
  console.log(`🔍 [BACKGROUND] Buscando evento específico: "${eventName}" en competitionId: ${competitionId}`);

  try {
    // Normalizar eventName para evitar problemas de encoding
    const originalEventName = eventName;
    eventName = normalizeUTF8InObject(eventName);

    if (originalEventName !== eventName) {
      console.log(`🔤 [BACKGROUND] EventName normalizado: "${originalEventName}" → "${eventName}"`);
    }

    console.log(`📋 [BACKGROUND] Iniciando búsqueda de evento específico...`);

  const locations = [];
  const raceDoc = await db.collection('races').doc(competitionId).get();

  if (raceDoc.exists) {
    const currentRaceId = raceDoc.id;

    try {
      // Obtener todas las apps de esta race
      const appsSnapshot = await db.collection('races').doc(currentRaceId).collection('apps').get();

      for (const appDoc of appsSnapshot.docs) {
        const currentAppId = appDoc.id;

        // Obtener todos los eventos de esta app
        const eventsSnapshot = await db.collection('races').doc(currentRaceId)
          .collection('apps').doc(currentAppId)
          .collection('events').get();

        for (const eventDoc of eventsSnapshot.docs) {
          const eventData = eventDoc.data();
          const eventId = eventDoc.id;

          // Verificar si este evento pertenece a la competición Y coincide con el nombre
          const belongsToCompetition =
            eventId === competitionId ||
            eventData.competitionId === competitionId ||
            eventData.raceId === competitionId ||
            eventData.externalId === competitionId ||
            currentRaceId === competitionId;

          // Verificar si el nombre del evento coincide (incluyendo versión corrupta)
          const eventNameMatches =
            eventId === eventName ||
            eventData.name === eventName ||
            eventData.eventName === eventName ||
            // También buscar por la versión corrupta del eventName
            eventId === originalEventName ||
            eventData.name === originalEventName ||
            eventData.eventName === originalEventName;

          const normalizedFromDoc = normalizeUTF8InObject(
            eventData.event_info?.name ||
            eventData.name ||
            eventData.eventName ||
            eventId
          ).toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

          if (!eventData.eventNameNormalized || eventData.eventNameNormalized !== normalizedFromDoc) {
            await eventDoc.ref.update({ eventNameNormalized: normalizedFromDoc });
          }

          if (belongsToCompetition && eventNameMatches) {
            // Usar el eventName normalizado en lugar del eventId corrupto
            const finalEventId = eventName; // eventName ya está normalizado

            locations.push({
              raceId: currentRaceId,
              appId: currentAppId,
              eventId: finalEventId, // Usar el normalizado
              eventData: eventData
            });
            console.log(`✅ [BACKGROUND] Evento específico encontrado: ${currentRaceId}/${currentAppId}/${eventId} → usando eventId normalizado: "${finalEventId}"`);
            console.log(`📊 [BACKGROUND] Eventos específicos encontrados: ${locations.length}`);
            return locations;
          }
        }
      }
    } catch (error) {
      console.error(`⚠️ [BACKGROUND] Error revisando race ${currentRaceId} para evento específico:`, error.message);
    }
  } else {
    console.warn(`⚠️ [BACKGROUND] Race ${competitionId} no existe, fallback a búsqueda global`);
    const racesSnapshot = await db.collection('races').get();

    for (const raceDoc of racesSnapshot.docs) {
      const currentRaceId = raceDoc.id;

      try {
        const appsSnapshot = await db.collection('races').doc(currentRaceId).collection('apps').get();

        for (const appDoc of appsSnapshot.docs) {
          const currentAppId = appDoc.id;

          const eventsSnapshot = await db.collection('races').doc(currentRaceId)
            .collection('apps').doc(currentAppId)
            .collection('events').get();

          for (const eventDoc of eventsSnapshot.docs) {
            const eventData = eventDoc.data();
            const eventId = eventDoc.id;

            const belongsToCompetition =
              eventId === competitionId ||
              eventData.competitionId === competitionId ||
              eventData.raceId === competitionId ||
              eventData.externalId === competitionId ||
              currentRaceId === competitionId;

            const eventNameMatches =
              eventId === eventName ||
              eventData.name === eventName ||
              eventData.eventName === eventName ||
              eventId === originalEventName ||
              eventData.name === originalEventName ||
              eventData.eventName === originalEventName;

            if (belongsToCompetition && eventNameMatches) {
              const finalEventId = eventName;

              locations.push({
                raceId: currentRaceId,
                appId: currentAppId,
                eventId: finalEventId,
                eventData: eventData
              });
              console.log(`✅ [BACKGROUND] Evento específico encontrado: ${currentRaceId}/${currentAppId}/${eventId} → usando eventId normalizado: "${finalEventId}"`);
              console.log(`📊 [BACKGROUND] Eventos específicos encontrados: ${locations.length}`);
              return locations;
            }
          }
        }
      } catch (error) {
        console.error(`⚠️ [BACKGROUND] Error revisando race ${currentRaceId} para evento específico:`, error.message);
      }
    }
  }

    console.log(`📊 [BACKGROUND] Eventos específicos encontrados: ${locations.length}`);
    return locations;

  } catch (error) {
    console.error(`❌ [BACKGROUND] Error en findSpecificEvent:`, error.message);
    console.error(`❌ [BACKGROUND] Stack trace:`, error.stack);
    return [];
  }
}

/**
 * Obtener streams de AWS para una competición
 */
async function getCompetitionStreams(competitionId) {
  console.log(`🎬 [STREAMS] Obteniendo streams para competitionId: ${competitionId}`);

  try {
    const awsBaseUrl = 'https://streams.timingsense.cloud';
    const url = `${awsBaseUrl}/competitions/${competitionId}`;

    console.log(`🌐 [STREAMS] Llamando a: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000, // 10 segundos timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Firebase-Functions/1.0'
      }
    });

    if (response.data && response.data.data && response.data.data.streams) {
      const streams = response.data.data.streams;
      console.log(`✅ [STREAMS] Streams obtenidos:`, streams);

      // Crear mapa de location -> streamId
      const streamMap = {};
      streams.forEach(stream => {
        // Normalizar nombres para matching
        const normalizedName = stream.name.toLowerCase();
        streamMap[normalizedName] = stream.streamId;

        // Agregar variaciones comunes
        if (normalizedName === 'meta') {
          streamMap['finish'] = stream.streamId;
          streamMap['meta'] = stream.streamId;
        }
        if (normalizedName === 'salida') {
          streamMap['start'] = stream.streamId;
          streamMap['salida'] = stream.streamId;
        }
      });

      return {
        success: true,
        streams: streams,
        streamMap: streamMap
      };
    } else {
      console.log(`⚠️ [AWS] Respuesta sin streams:`, response.data);
      return {
        success: false,
        error: 'No streams found in response'
      };
    }

  } catch (error) {
    console.error(`❌ [STREAMS] Error obteniendo streams:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generar clip de video automáticamente para stories
 */
async function generateStoryVideoClip(streamId, checkpointRawTime, extraData) {
  console.log(`🎬 [CLIP] Generando clip para streamId: ${streamId}`);
  console.log(`🎬 [CLIP] CheckpointRawTime: ${checkpointRawTime}`);

  const retryDelaysMs = [0, 60000, 120000, 180000];

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    const delayMs = retryDelaysMs[attempt];
    if (delayMs > 0) {
      console.log(`⏳ [CLIP] Reintento ${attempt} en ${delayMs / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      // Calcular ventana de tiempo para el clip (15 segundos antes y después del checkpoint)
      // checkpointRawTime ya viene en milliseconds (UNIX timestamp)
      const startTime = new Date(checkpointRawTime - 15000); // 15 segundos antes
      const endTime = new Date(checkpointRawTime + 15000);   // 15 segundos después

      console.log(`⏰ [CLIP] Ventana de tiempo:`, {
        checkpoint: new Date(checkpointRawTime).toISOString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        rawTime: checkpointRawTime
      });

      // Preparar datos para generateStoriesFromChunks
      const clipData = {
        streamId: streamId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      };

      console.log(`📡 [CLIP] Llamando a generateStoriesFromChunks (intento ${attempt + 1}):`, clipData);

      // Llamar al API generateStoriesFromChunks
      const response = await axios.post(
        'https://us-central1-copernico-jv5v73.cloudfunctions.net/generateStoriesFromChunks',
        clipData,
        {
          timeout: 60000, // 60 segundos timeout
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      if (response.data && response.data.clipUrl) {
        console.log(`✅ [CLIP] Clip generado exitosamente: ${response.data.clipUrl}`);

        return {
          success: true,
          clipUrl: response.data.clipUrl,
          fileName: response.data.fileName || `clip_${streamId}_${Date.now()}.mp4`,
          generationInfo: {
            streamId: streamId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            generatedAt: new Date().toISOString(),
            apiResponse: response.data
          }
        };
      } else {
        console.log(`⚠️ [CLIP] Respuesta sin clipUrl:`, response.data);
      }
    } catch (error) {
      console.error(`❌ [CLIP] Error generando clip (intento ${attempt + 1}):`, error.message);
      if (attempt === retryDelaysMs.length - 1) {
        return {
          success: false,
          error: error.message,
          details: error.response?.data || null
        };
      }
    }
  }

  return {
    success: false,
    error: 'No clipUrl in response'
  };
}

/**
 * Crear split-clips cuando se genera un clip desde una story
 */
async function createSplitClipsFromStory({ db, raceId, appId, eventId, participantId, checkpointId, clipUrl, streamId, timestamp }) {
  if (!checkpointId || !clipUrl) {
    console.log(`⚠️ [SPLIT-CLIPS] No se puede crear split-clip: checkpointId=${checkpointId}, clipUrl=${!!clipUrl}`);
    return;
  }

  console.log(`🎯 [SPLIT-CLIPS] Intentando crear split-clip para checkpoint: ${checkpointId}`);
  console.log(`📊 [SPLIT-CLIPS] Parámetros: raceId=${raceId}, appId=${appId}, eventId=${eventId}, participantId=${participantId}`);

  try {
    // Obtener datos del evento para verificar splits
    const eventRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId);

    console.log(`🔍 [SPLIT-CLIPS] Consultando evento en: races/${raceId}/apps/${appId}/events/${eventId}`);

    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      console.log(`⚠️ [SPLIT-CLIPS] Evento no encontrado: ${eventId}`);
      return;
    }

    const eventData = eventDoc.data();
    console.log(`✅ [SPLIT-CLIPS] Evento encontrado. Splits disponibles:`, eventData.splits?.length || 0);
    console.log(`🔍 [SPLIT-CLIPS] Estructura del evento:`, {
      hasEventData: !!eventData,
      hasSplits: !!eventData.splits,
      splitsType: typeof eventData.splits,
      splitsLength: eventData.splits?.length,
      eventKeys: Object.keys(eventData || {}),
      hasCopernicoData: !!eventData.copernico_data,
      hasEventInfo: !!eventData.event_info
    });

    // Buscar splits en diferentes ubicaciones posibles
    let splits = null;
    let splitsSource = '';

    if (eventData.splits && Array.isArray(eventData.splits)) {
      splits = eventData.splits;
      splitsSource = 'eventData.splits';
    } else if (eventData.copernico_data?.splits && Array.isArray(eventData.copernico_data.splits)) {
      splits = eventData.copernico_data.splits;
      splitsSource = 'eventData.copernico_data.splits';
    } else if (eventData.event_info?.splits && Array.isArray(eventData.event_info.splits)) {
      splits = eventData.event_info.splits;
      splitsSource = 'eventData.event_info.splits';
    }

    console.log(`🔍 [SPLIT-CLIPS] Splits encontrados en: ${splitsSource || 'ningún lugar'}`);
    console.log(`📊 [SPLIT-CLIPS] Total splits: ${splits?.length || 0}`);

    // Buscar en splits si existe
    if (splits && Array.isArray(splits)) {
      console.log(`🔍 [SPLIT-CLIPS] Buscando checkpoint "${checkpointId}" en ${splits.length} splits`);

      // Log de todos los splits para debug
      splits.forEach((split, index) => {
        const splitName = typeof split === 'string' ? split : (split?.name || split?.id || 'unknown');
        console.log(`  ${index}: "${splitName}" (type: ${typeof split})`);
      });

      const splitIndex = splits.findIndex(split => {
        if (typeof split === 'string') {
          return split === checkpointId;
        } else if (typeof split === 'object' && split !== null) {
          return split.name === checkpointId || split.id === checkpointId;
        }
        return false;
      });

      if (splitIndex !== -1) {
        console.log(`✅ [SPLIT-CLIPS] Split encontrado en índice ${splitIndex}: ${checkpointId}`);

        // Guardar en la misma estructura donde se encontró el evento
        const splitClipsCol = eventRef.collection("split-clips");

        // Buscar si ya existe un registro para el mismo splitName + participantId
        const existingSplitQuery = await splitClipsCol
          .where("splitName", "==", checkpointId)
          .where("participantId", "==", participantId)
          .limit(1)
          .get();

        const splitPayload = {
          splitName: checkpointId,
          splitIndex: splitIndex,
          clipUrl: clipUrl,
          participantId: participantId,
          raceId: raceId,
          eventId: eventId,
          streamId: streamId,
          timestamp: timestamp ? new Date(timestamp).toISOString() : null,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'checkpoint-participant-endpoint'
        };

        if (!existingSplitQuery.empty) {
          const docRef = existingSplitQuery.docs[0].ref;
          await docRef.update(splitPayload);
          console.log(`✅ [SPLIT-CLIPS] Split-clip actualizado (mismo split+participant): ${docRef.id}`);
        } else {
          const newDocRef = await splitClipsCol.add({ ...splitPayload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
          console.log(`✅ [SPLIT-CLIPS] Split-clip creado: ${newDocRef.id} (split: ${checkpointId}, participant: ${participantId})`);
        }
      } else {
        console.log(`ℹ️ [SPLIT-CLIPS] Checkpoint ${checkpointId} no está en la lista de splits del evento`);
      }
    } else {
      console.log(`ℹ️ [SPLIT-CLIPS] Evento ${eventId} no tiene splits configurados`);
    }

    // También buscar en timingPoints si existe
    if (eventData.timingPoints && Array.isArray(eventData.timingPoints)) {
      const timingIndex = eventData.timingPoints.findIndex(timing => {
        if (typeof timing === 'string') {
          return timing === checkpointId;
        } else if (typeof timing === 'object' && timing !== null) {
          return timing.name === checkpointId || timing.id === checkpointId;
        }
        return false;
      });

      if (timingIndex !== -1) {
        console.log(`📍 [SPLIT-CLIPS] Timing point encontrado en índice ${timingIndex}: ${checkpointId}`);

        // Guardar en timing-clips también (misma lógica: update si existe registro para mismo timingName+participantId, sino crear)
        const timingClipsCol = eventRef.collection("timing-clips");

        const existingTimingQuery = await timingClipsCol
          .where("timingName", "==", checkpointId)
          .where("participantId", "==", participantId)
          .limit(1)
          .get();

        const timingPayload = {
          timingName: checkpointId,
          timingIndex: timingIndex,
          clipUrl: clipUrl,
          participantId: participantId,
          raceId: raceId,
          eventId: eventId,
          streamId: streamId,
          timestamp: timestamp ? new Date(timestamp).toISOString() : null,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'checkpoint-participant-endpoint'
        };

        if (!existingTimingQuery.empty) {
          const docRef = existingTimingQuery.docs[0].ref;
          await docRef.update(timingPayload);
          console.log(`✅ [SPLIT-CLIPS] Timing-clip actualizado (mismo timing+participant): ${docRef.id}`);
        } else {
          const newDocRef = await timingClipsCol.add({ ...timingPayload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
          console.log(`✅ [SPLIT-CLIPS] Timing-clip creado: ${newDocRef.id} (timing: ${checkpointId}, participant: ${participantId})`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ [SPLIT-CLIPS] Error creando split-clips:`, error);
    throw error;
  }
}

/**
 * Crear story automática para un checkpoint
 */
async function createAutomaticStory(db, location, participantData, extraData, streamMap, copernicoData = null, rawTime = null, options = {}) {
  console.log(`📖 [STORY] Creando story automática para checkpoint: ${extraData?.point}`);
  console.log(`⏰ [STORY] RawTime recibido en createAutomaticStory:`, rawTime);

  try {
    const { updateOnly = false, skipClipGeneration = false } = options;
    let { raceId, appId, eventId } = location;

    // Normalizar eventId para evitar problemas de encoding
    const originalEventId = eventId;
    eventId = normalizeUTF8InObject(eventId);

    if (originalEventId !== eventId) {
      console.log(`🔤 [STORY] EventID normalizado: "${originalEventId}" → "${eventId}"`);
    }

    console.log(`📍 [STORY] Ubicación: races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantData.externalId}/stories`);
    const participantId = participantData.externalId;

    // 1. Determinar tipo de story basado en checkpointType (si viene) o heurísticas de punto/ubicación
    const pointText = extraData?.point || '';
    const locationText = extraData?.location || '';
    const pointNorm = pointText.toLowerCase();
    const locationNorm = locationText.toLowerCase();

    const normalizeKey = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const resolveTimesEntry = (times, key) => {
      if (!times || !key) return null;
      if (times[key]) return times[key];
      const target = normalizeKey(key);
      const matchedKey = Object.keys(times).find(k => normalizeKey(k) === target);
      return matchedKey ? times[matchedKey] : null;
    };

    const formatDuration = (ms) => {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        return null;
      }
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const timeInfo = (copernicoData?.times && (copernicoData.times[pointText] || copernicoData.times[locationText])) || null;
    const checkpointMs = typeof timeInfo?.netTime === 'number'
      ? timeInfo.netTime
      : (typeof timeInfo?.time === 'number' ? timeInfo.time : null);
    const formattedCheckpointTime = formatDuration(checkpointMs);

    let storyType = extraData?.checkpointType || 'ATHLETE_CROSSED_TIMING_SPLIT';
    let description = `${participantData.fullName || participantData.name} passed ${pointText || locationText || 'the checkpoint'}`;
    if (formattedCheckpointTime) {
      description = `${description} in ${formattedCheckpointTime}`;
    }

    // Si no viene checkpointType, usar heurísticas; si viene, respetarlo pero ajustar descripción
    const isPreMeta = /pre[-\s]?meta/.test(pointNorm) ||
      /pre[-\s]?meta/.test(locationNorm) ||
      ((pointNorm.includes('pre') && pointNorm.includes('meta')) ||
        (locationNorm.includes('pre') && locationNorm.includes('meta')));
    const isFinish =
      (pointNorm.includes('meta') || pointNorm.includes('finish') ||
        locationNorm.includes('meta') || locationNorm.includes('finish')) &&
      !isPreMeta;
    const isStart = pointNorm.includes('salida') || pointNorm.includes('start') || locationNorm.includes('salida') || locationNorm.includes('start');

    if (!extraData?.checkpointType) {
      if (isFinish) {
        storyType = 'ATHLETE_FINISHED';
        description = `🏁 ${participantData.fullName || participantData.name} finished the race!`;
      } else if (isStart) {
        storyType = 'ATHLETE_STARTED';
        description = `🏃 ${participantData.fullName || participantData.name} started the race!`;
      } else {
        description = `⏱️ ${participantData.fullName || participantData.name} passed ${pointText || locationText || 'the checkpoint'}`;
        if (formattedCheckpointTime) {
          description = `${description} in ${formattedCheckpointTime}`;
        }
      }
    } else {
      if (storyType === 'ATHLETE_FINISHED') {
        description = `🏁 ${participantData.fullName || participantData.name} finished the race!`;
      } else if (storyType === 'ATHLETE_STARTED') {
        description = `🏃 ${participantData.fullName || participantData.name} started the race!`;
      }
      // Si checkpointType vino como split, dejamos la descripción por defecto
    }

    // 2. Obtener streamId para el location
    let streamId = null;
    if (extraData?.location && streamMap) {
      const locationKey = extraData.location.toLowerCase();
      const streamKeys = Object.keys(streamMap);
      streamId = streamMap[locationKey];

      console.log(`🎬 [STORY] Buscando streamId para location: '${locationKey}'`);
      console.log(`🎬 [STORY] StreamMap keys (${streamKeys.length}) sample:`, streamKeys.slice(0, 10));
      console.log(`🎬 [STORY] StreamId encontrado: ${streamId}`);
    } else if (extraData?.location && !streamMap) {
      console.log(`🎬 [STORY] No streamMap disponible para location: "${extraData.location}"`);
    } else if (!extraData?.location && streamMap) {
      console.log(`🎬 [STORY] No location en extraData; streamMap keys (${Object.keys(streamMap).length}) sample:`, Object.keys(streamMap).slice(0, 10));

      // Si no se encuentra, intentar con variaciones comunes
      if (!streamId) {
        // Intentar con variaciones para checkpoints intermedios
        if (locationKey.includes('k') || locationKey.includes('km')) {
          // Para checkpoints como "5k", "10k", etc., usar el primer stream disponible
          const availableStreams = Object.keys(streamMap);
          if (availableStreams.length > 0) {
            streamId = streamMap[availableStreams[0]];
            console.log(`🎬 [STORY] Usando primer stream disponible para checkpoint '${locationKey}': ${streamId}`);
          }
        }
      }
    }

    const splitNameValue = extraData?.point || extraData?.location || null;
    const participantStoriesRef = db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants').doc(participantId)
      .collection('stories');
    let existingStoryDoc = null;
    if (splitNameValue) {
      const existingSnap = await participantStoriesRef.where('splitName', '==', splitNameValue).limit(1).get();
      if (!existingSnap.empty) {
        existingStoryDoc = existingSnap.docs[0];
      }
    }

    // 3. Crear datos básicos de la story
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const storyData = {
      // Datos básicos
      contentType: 'video',
      createdAt: timestamp,
      updatedAt: timestamp,
      date: nowIso,
      description: description,
      eventId: eventId,
      raceId: raceId,
      participantId: participantId,
      type: storyType,
      splitName: splitNameValue,
      participant: {
        id: participantId,
        externalId: participantData.externalId || null,
        ...participantData
      },

      // Metadatos
      moderationStatus: 'approved',
      originType: 'automatic_checkpoint',

      // Datos del checkpoint
      checkpointInfo: {
        point: extraData?.point ?? null,
        location: extraData?.location ?? null,
        type: storyType,
        processedAt: timestamp
      },
      extraData: extraData ? { ...extraData } : {},

      // Datos de generación (se actualizarán cuando se genere el clip)
      generationInfo: {
        ...(streamId && { streamId: streamId }), // Solo incluir streamId si no es undefined
        status: streamId ? 'pending_generation' : 'no_stream_available',
        requestedAt: timestamp
      }
    };

    let storyRef = null;
    let eventStoryRef = null;
    if (existingStoryDoc) {
      const existingData = existingStoryDoc.data() || {};
      const resolvedDate = existingData.date || nowIso;
      const resolvedCreatedAt = existingData.createdAt || timestamp;
      const resolvedContentType = existingData.contentType || storyData.contentType;
      const updateData = {
        description: storyData.description,
        splitName: storyData.splitName,
        type: storyData.type,
        participant: storyData.participant,
        checkpointInfo: storyData.checkpointInfo,
        extraData: storyData.extraData,
        updatedAt: timestamp,
        createdAt: resolvedCreatedAt,
        date: resolvedDate,
        contentType: resolvedContentType,
        eventId: eventId,
        raceId: raceId,
        participantId: participantId,
        moderationStatus: existingData.moderationStatus || storyData.moderationStatus,
        originType: existingData.originType || storyData.originType
      };
      eventStoryRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('stories').doc(existingStoryDoc.id);
      await Promise.all([
        existingStoryDoc.ref.set(updateData, { merge: true }),
        eventStoryRef.set(updateData, { merge: true })
      ]);
      console.log(`✅ [STORY] Story actualizada: ${existingStoryDoc.id}`);
      const hasMedia = Boolean(existingData.fileUrl || existingData.clipUrl || existingData.filePath);
      if (hasMedia || updateOnly) {
        return { success: true, storyId: existingStoryDoc.id, updated: true };
      }
      console.log(`🧪 [STORY] Story sin media; intentando generar clip: ${existingStoryDoc.id}`);
      storyRef = existingStoryDoc.ref;
    }

    if (updateOnly) {
      console.log(`ℹ️ [STORY] UpdateOnly activo y no existe story para "${splitNameValue}"`);
      return { success: false, storyId: null, updated: false, skipped: true };
    }

    // 4. Guardar story en Firestore
    const storyPath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories`;
    console.log(`📍 [STORY] Ruta final del documento: ${storyPath}`);
    console.log(`🔤 [STORY] EventID en ruta: "${eventId}" [${Array.from(eventId).map(c => c.charCodeAt(0)).join(', ')}]`);
    if (!storyRef) {
      storyRef = await db.collection(storyPath).add(storyData);
      eventStoryRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('stories').doc(storyRef.id);

      await eventStoryRef.set(storyData, { merge: true });
      console.log(`✅ [STORY] Story creada: ${storyRef.id}`);
    } else if (!eventStoryRef) {
      eventStoryRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('stories').doc(storyRef.id);
    }

    const updateStoryRefs = async (updateData) => {
      await Promise.all([
        storyRef.update(updateData),
        eventStoryRef.set(updateData, { merge: true })
      ]);
    };

    // 5. Si tenemos streamId, validar videoSplits antes de generar clip automáticamente
    let clipResult = null;
    // Validar videoSplits usando point primero y location como fallback
    let allowClipGeneration = true;
    const splitLookupName = extraData?.point || extraData?.location || null;
    if (streamId && splitLookupName) {
      try {
        const eventRef = db.collection("races").doc(raceId)
          .collection("apps").doc(appId)
          .collection("events").doc(eventId);
        const eventDoc = await eventRef.get();
        const videoSplits = eventDoc.exists ? eventDoc.data()?.videoSplits : null;
        const splitKeys = videoSplits ? Object.keys(videoSplits) : [];
        const pointKey = extraData?.point || null;
        const locationKey = extraData?.location || null;
        const pointMatch = pointKey ? splitKeys.find(key => key.toLowerCase() === pointKey.toLowerCase()) : null;
        const locationMatch = locationKey ? splitKeys.find(key => key.toLowerCase() === locationKey.toLowerCase()) : null;
        const matchedKey = pointMatch || locationMatch || null;
        const splitStatus = matchedKey ? videoSplits?.[matchedKey]?.status : undefined;

        if (!videoSplits || splitKeys.length === 0) {
          allowClipGeneration = false;
          await updateStoryRefs({
            'generationInfo.status': 'no_video_splits_config',
            'generationInfo.reason': 'video_splits_not_configured'
          });
          console.log(`ℹ️ [STORY] Clip no generado: no existe videoSplits configurado`);
        } else if (splitStatus !== true) {
          allowClipGeneration = false;
          await updateStoryRefs({
            'generationInfo.status': 'video_split_disabled',
            'generationInfo.reason': 'video_split_status_not_true'
          });
          console.log(`ℹ️ [STORY] Clip no generado: videoSplits["${matchedKey || splitLookupName}"].status != true`);
        }
      } catch (videoSplitError) {
        console.error(`❌ [STORY] Error validando videoSplits:`, videoSplitError.message);
        allowClipGeneration = false;
        await updateStoryRefs({
          'generationInfo.status': 'video_split_check_failed',
          'generationInfo.error': videoSplitError.message
        });
      }
    }

    if (!skipClipGeneration && streamId && allowClipGeneration) {
      console.log(`🎬 [STORY] Generando clip automáticamente con streamId: ${streamId}`);

      try {
        // Determinar timestamp del checkpoint - PRIORIDAD: rawTime del webhook
        let checkpointRawTime = null;
        let checkpointTimestamp = new Date().toISOString(); // Default: ahora

        // 1. PRIORIDAD: Usar rawTime del webhook si está disponible
        if (rawTime) {
          checkpointRawTime = rawTime; // UNIX timestamp en milliseconds
          checkpointTimestamp = new Date(checkpointRawTime).toISOString();
          console.log(`⏰ [STORY] Usando rawTime del webhook: ${checkpointRawTime} (${checkpointTimestamp})`);
        }
        // 2. FALLBACK: Buscar rawTime en datos transformados de Copernico
        else if (copernicoData && copernicoData.times) {
          const times = copernicoData.times;
          const pointName = extraData?.point;
          const locationName = extraData?.location;
          const timeEntry = resolveTimesEntry(times, pointName) || resolveTimesEntry(times, locationName);
          if (timeEntry && (timeEntry.raw?.rawTime || timeEntry.rawTime)) {
            checkpointRawTime = timeEntry.raw?.rawTime || timeEntry.rawTime;
            checkpointTimestamp = new Date(checkpointRawTime).toISOString();
            console.log(`⏰ [STORY] Usando rawTime de Copernico Data: ${checkpointRawTime} (${checkpointTimestamp})`);
          } else {
            console.log(`⚠️ [STORY] No se encontró rawTime para punto/location: ${pointName || 'null'} / ${locationName || 'null'}. Puntos disponibles:`, Object.keys(times));
          }
        }
        // 3. FALLBACK LEGACY: Buscar rawTime en datos de Copernico API (ESTRUCTURA ANTIGUA)
        else if (copernicoData && copernicoData.rawData && copernicoData.rawData.events) {
          const events = copernicoData.rawData.events;
          if (events.length > 0 && events[0].times) {
            const times = events[0].times;

            const pointName = extraData?.point;
            const locationName = extraData?.location;
            const timeEntry = resolveTimesEntry(times, pointName) || resolveTimesEntry(times, locationName);
            if (timeEntry && (timeEntry.raw?.rawTime || timeEntry.rawTime)) {
              checkpointRawTime = timeEntry.raw?.rawTime || timeEntry.rawTime; // UNIX timestamp en milliseconds
              checkpointTimestamp = new Date(checkpointRawTime).toISOString();
              console.log(`⏰ [STORY] Usando rawTime de Copernico API (legacy): ${checkpointRawTime} (${checkpointTimestamp})`);
            } else {
              console.log(`⚠️ [STORY] No se encontró rawTime para punto/location: ${pointName || 'null'} / ${locationName || 'null'}. Puntos disponibles:`, Object.keys(times));
            }
          }
        }

        if (!checkpointRawTime) {
          console.log(`⚠️ [STORY] No hay rawTime disponible, usando timestamp actual`);
        }

        console.log(`🎬 [STORY] Generando clip con timestamp: ${checkpointTimestamp}`);
        clipResult = await generateStoryVideoClip(streamId, checkpointRawTime || Date.now(), extraData);

        if (clipResult.success) {
          // Actualizar story con datos del clip generado
          await updateStoryRefs({
            fileUrl: clipResult.clipUrl,
            fileName: clipResult.fileName,
            filePath: clipResult.clipUrl, // Por compatibilidad
            generationInfo: {
              ...storyData.generationInfo,
              status: 'completed',
              clipUrl: clipResult.clipUrl,
              generatedAt: clipResult.generationInfo.generatedAt,
              startTime: clipResult.generationInfo.startTime,
              endTime: clipResult.generationInfo.endTime,
              apiResponse: clipResult.generationInfo.apiResponse
            }
          });

          console.log(`✅ [STORY] Clip generado y story actualizada: ${clipResult.clipUrl}`);

          try {
            const notificationStoryData = {
              ...storyData,
              fileUrl: clipResult.clipUrl,
              description: 'New clip available'
            };
            await sendStoryNotificationToFollowers({
              db,
              raceId,
              appId,
              eventId,
              participantId: participantData.externalId,
              storyId: storyRef.id,
              storyData: notificationStoryData,
              participantData
            });
          } catch (notifyError) {
            console.error(`❌ [STORY] Error enviando push de clip completado:`, notifyError.message);
          }

          // 🆕 CREAR SPLIT-CLIPS SI EL CHECKPOINT COINCIDE CON UN SPLIT
          try {
            await createSplitClipsFromStory({
              db,
              raceId,
              appId,
              eventId,
              participantId: participantData.externalId,
              checkpointId: extraData?.point,
              clipUrl: clipResult.clipUrl,
              streamId: streamId,
              timestamp: checkpointRawTime || Date.now()
            });
          } catch (splitClipError) {
            console.error(`⚠️ [STORY] Error creando split-clips:`, splitClipError);
            // No fallar por esto, solo registrar el error
          }

        } else {
          // Actualizar story con error de generación
          await updateStoryRefs({
            'generationInfo.status': 'failed',
            'generationInfo.error': clipResult.error,
            'generationInfo.failedAt': admin.firestore.FieldValue.serverTimestamp()
          });

          console.log(`❌ [STORY] Error generando clip: ${clipResult.error}`);
        }
      } catch (clipError) {
        console.error(`❌ [STORY] Error en generación de clip:`, clipError);

        // Actualizar story con error
        await updateStoryRefs({
          'generationInfo.status': 'failed',
          'generationInfo.error': clipError.message,
          'generationInfo.failedAt': admin.firestore.FieldValue.serverTimestamp()
        });

        clipResult = { success: false, error: clipError.message };
      }
    }

    return {
      success: true,
      storyId: storyRef.id,
      storyType: storyType,
      streamId: streamId,
      description: description,
      clipGeneration: clipResult
    };

  } catch (error) {
    console.error(`❌ [STORY] Error creando story:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Procesar participante en una ubicación específica
 */
async function processParticipantInLocation(db, location, participantData, timestamp, extraData = {}, rawTime = null, transformedData = null) {
  const { raceId, appId, eventId } = location;

  console.log(`🔄 [BACKGROUND] Procesando en: ${raceId}/${appId}/${eventId}`);
  console.log(`📊 [BACKGROUND] Datos del checkpoint:`, extraData);
  console.log(`⏰ [BACKGROUND] RawTime del webhook:`, rawTime);
  console.log(`🗂️ [BACKGROUND] Datos de Copernico disponibles:`, !!transformedData);

  // Agregar raceId y eventId específicos + datos del checkpoint + DATOS COMPLETOS DE COPERNICO
  const locationParticipantData = {
    ...participantData,
    raceId: raceId,
    eventId: eventId, // Agregar el eventId específico de esta ubicación
    webhookProcessedAt: timestamp,
    updatedAt: timestamp,
    // ✅ NUEVO: Agregar datos completos de Copernico (FILTRADOS)
    copernicoData: transformedData ? {
      times: transformedData.times || {},      // ← Times completos con raw
      rankings: transformedData.rankings || {}, // ← Rankings completos
      rawData: transformedData.rawData || {}   // ← Respuesta original completa
    } : null,
    // Información del checkpoint actual
    lastCheckpoint: {
      point: extraData?.point ?? null,
      location: extraData?.location ?? null,
      processedAt: timestamp,
      rawTime: rawTime || null // Timestamp exacto del checkpoint desde AWS
    }
  };

  // Buscar participante existente (usando externalId como document ID)
  const externalId = participantData.externalId;
  const participantRef = db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('events').doc(eventId)
    .collection('participants')
    .doc(externalId);

  const existingParticipant = await participantRef.get();
  let participantId = externalId; // Siempre usar externalId como ID
  let isNewParticipant = false;

  if (existingParticipant.exists) {
    // Actualizar existente
    await participantRef.update(locationParticipantData);
    console.log(`🔄 [BACKGROUND] Participante existente actualizado: ${participantId}`);
  } else {
    // Crear nuevo usando externalId como document ID
    locationParticipantData.createdAt = timestamp;
    locationParticipantData.registerDate = timestamp;

    // Usar externalId como document ID para consistencia (participantRef ya está definido arriba)
    await participantRef.set(locationParticipantData);
    participantId = externalId; // El ID del documento es el externalId
    isNewParticipant = true;

    console.log(`🎯 [BACKGROUND] Participante creado con externalId como document ID: ${participantId}`);
  }

  console.log(`✅ [BACKGROUND] Participante ${isNewParticipant ? 'creado' : 'actualizado'}: ${participantId}`);

  try {
    await sendSilentCheckpointNotificationToFollowers({
      db,
      raceId,
      appId,
      eventId,
      participantId,
      checkpointInfo: {
        point: extraData?.point ?? null,
        location: extraData?.location ?? null
      }
    });
  } catch (notifyError) {
    console.error(`❌ [BACKGROUND] Error enviando notificación silenciosa a seguidores:`, notifyError.message);
  }

  return {
    raceId,
    appId,
    eventId,
    participant: {
      id: participantId,
      externalId: participantData.externalId,
      name: participantData.fullName ?? null,
      dorsal: participantData.dorsal ?? null,
      isNew: isNewParticipant
    },
    success: true
  };
}

async function sendSilentCheckpointNotificationToFollowers({ db, raceId, appId, eventId, participantId, checkpointInfo }) {
  const participantRef = db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('events').doc(eventId)
    .collection('participants')
    .doc(participantId);

  const followersSnapshot = await participantRef.collection('followers').get();

  if (followersSnapshot.empty) {
    return;
  }

  const followerUserIds = followersSnapshot.docs.map(doc => doc.id);
  const tokens = [];

  for (const userId of followerUserIds) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data().fcmToken) {
      tokens.push(userDoc.data().fcmToken);
    }
  }

  if (tokens.length === 0) {
    return;
  }

  const dataPayload = {
    notificationType: 'silent_data_sync',
    silent: 'true',
    timestamp: new Date().toISOString(),
    raceId: raceId || '',
    appId: appId || '',
    eventId: eventId || '',
    participantId: participantId || ''
  };

  const message = {
    data: dataPayload,
    android: {
      priority: 'high'
    },
    apns: {
      payload: {
        aps: {
          'content-available': 1
        }
      }
    }
  };

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      ...message
    });
  }
}

function createStoryNotificationPayload(storyData, participantData, storyInfo) {
  const participantName = participantData.fullName || participantData.name || 'Atleta';
  const dorsal = participantData.dorsal || 'Sin dorsal';
  const storyType = storyData.type || storyData.checkpointInfo?.type || 'unknown';

  let eventType = 'passed through a checkpoint';
  let emoji = '🏃';

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
    const checkpointPoint = storyData.checkpointInfo?.point || storyData.split_time?.checkpoint || 'checkpoint';
    eventType = `passed through ${checkpointPoint}`;
    emoji = '🏃';
  }

  const title = `${emoji} ${participantName} (#${dorsal})`;
  const body = `${eventType}${storyData.split_time?.time ? ` - Tiempo: ${storyData.split_time.time}` : ''}`;

  let imageUrl = null;
  const potentialImageUrl = storyData.image_url || storyData.video_url || storyData.fileUrl;
  if (potentialImageUrl && typeof potentialImageUrl === 'string' && potentialImageUrl.startsWith('http')) {
    imageUrl = potentialImageUrl;
  }

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
      notificationType: "NEW_STORY",
      storyId: storyInfo.storyId,
      participantId: storyInfo.participantId,
      timestamp: new Date().toISOString(),
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
      }
    }
  };
}

async function sendStoryNotificationToFollowers({ db, raceId, appId, eventId, participantId, storyId, storyData, participantData }) {
  const participantRef = db.collection('races').doc(raceId)
    .collection('apps').doc(appId)
    .collection('events').doc(eventId)
    .collection('participants')
    .doc(participantId);

  const followersSnapshot = await participantRef.collection('followers').get();
  if (followersSnapshot.empty) {
    return;
  }

  const followerUserIds = followersSnapshot.docs.map(doc => doc.id);
  const tokens = [];

  for (const userId of followerUserIds) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists && userDoc.data().fcmToken) {
      tokens.push(userDoc.data().fcmToken);
    }
  }

  if (tokens.length === 0) {
    return;
  }

  const payload = createStoryNotificationPayload(storyData, participantData, {
    raceId,
    appId,
    eventId,
    participantId,
    storyId
  });

  const chunkSize = 500;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: payload.notification,
      data: payload.data,
      android: payload.android,
      apns: payload.apns
    });
  }
}

/**
 * @openapi
 * /api/race-events:
 *   get:
 *     summary: Obtener eventos de carrera con filtros avanzados
 *     description: Obtiene eventos de carrera filtrados por tipo y participante, con información completa de participantes, sponsors, stories, etc. Incluye paginación mejorada.
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
 *           enum: [ATHLETE_CROSSED_TIMING_SPLIT, COMPLETE_AWARD, ATHLETE_STARTED, SPONSOR, ATHLETE_FINISHED]
 *         description: Filtrar por tipo de evento
 *       - in: query
 *         name: participantId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filtrar por ID específico de participante
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Límite de resultados por página
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Número de resultados a omitir para paginación
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
    const { raceId, appId, eventId, type, participantId, limit = 20, offset = 0 } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    console.log(`🔍 Obteniendo eventos de carrera - Race: ${raceId}, App: ${appId}, Event: ${eventId}, Type: ${type || 'ALL'}, Participant: ${participantId || 'ALL'}`);

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

    // ✅ OPTIMIZACIÓN: Obtener participantes según filtro
    let participantsSnapshot;
    if (participantId) {
      // Obtener participante específico
      const participantDoc = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId).get();

      if (!participantDoc.exists) {
        return res.status(404).json({
          error: "Participante no encontrado",
          participantId,
          raceId,
          appId,
          eventId
        });
      }

      // Simular snapshot con un solo documento
      participantsSnapshot = {
        docs: [participantDoc],
        empty: false,
        size: 1
      };
      console.log(`👤 Participante específico: ${participantId}`);
    } else {
      // Obtener todos los participantes - ESTRUCTURA CORRECTA: races/apps/events
      participantsSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').get();
    // console.log(`👥 Participantes: ${participantsSnapshot.size}`);
    }

    if (participantsSnapshot.empty) {
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
        filters: {
          type: type || null,
          participantId: participantId || null
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

      // NO aplicar filtro en Firestore para evitar problemas de índice
      // En su lugar, filtraremos en memoria después de obtener los datos

      // Agregar ordenamiento
      storiesQuery = storiesQuery.orderBy('date', 'desc');

      const storiesSnapshot = await storiesQuery.get();
      // console.log(`📊 Participante ${participantId}: ${storiesSnapshot.size} stories`);

      // Procesar cada story como un evento
      storiesSnapshot.docs.forEach(storyDoc => {
        const storyData = storyDoc.data();

        const storyType = storyData.type || storyData.checkpointInfo?.type;

        // Aplicar filtro por tipo en memoria si se especifica
        if (type && storyType !== type) {
          return; // Skip esta story
        }

        // Crear story con formato de evento
        // Determinar si fileUrl es imagen o video basado en mediaType
        const isVideo = storyData.mediaType === "video";
        const isImage = storyData.mediaType === "image";

        const story = {
          storyId: storyDoc.id,
          type: storyData.type || storyData.checkpointInfo?.type || "ATHLETE_STARTED",
          participant: {
            id: participantId,
            externalId: participantData.externalId || null,
            ...participantData
          },
          split_time: storyData.splitTime || {},
          fileUrl: storyData.fileUrl || "",
          clipUrl: storyData.generationInfo?.clipUrl || "",
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

    // Ordenar todas las stories por fecha (manejar múltiples formatos)
    allStories.sort((a, b) => {
      const getTimestamp = (dateField) => {
        if (!dateField) return 0;

        // Si es un Timestamp de Firestore
        if (dateField && typeof dateField.toMillis === 'function') {
          return dateField.toMillis();
        }

        // Si es un objeto con _seconds o seconds
        if (dateField._seconds) {
          return dateField._seconds * 1000;
        }
        if (dateField.seconds) {
          return dateField.seconds * 1000;
        }

        // Si es un string de fecha ISO
        if (typeof dateField === 'string') {
          return new Date(dateField).getTime();
        }

        // Si es un número (timestamp en milliseconds)
        if (typeof dateField === 'number') {
          return dateField;
        }

        // Fallback: intentar convertir a Date
        try {
          return new Date(dateField).getTime();
        } catch (error) {
          console.warn('Error parsing date field:', dateField);
          return 0;
        }
      };

      return getTimestamp(b.date) - getTimestamp(a.date); // Más reciente primero
    });

    // DEBUG: Resumen de tipos encontrados
    const typeCounts = {};
    allStories.forEach(story => {
      const storyType = story.type || 'SIN_TIPO';
      typeCounts[storyType] = (typeCounts[storyType] || 0) + 1;
    });
    // console.log(`📊 Total stories: ${allStories.length}, Tipos:`, typeCounts);

    // ✅ PAGINACIÓN MEJORADA
    const totalStories = allStories.length;
    const paginatedStories = allStories.slice(offsetNum, offsetNum + limitNum);

    console.log(`✅ ${paginatedStories.length} stories de ${totalStories} (type=${type || 'ALL'}, participant=${participantId || 'ALL'})`);

    return res.status(200).json({
      stories: paginatedStories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalStories,
        hasMore: (offsetNum + limitNum) < totalStories,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(totalStories / limitNum),
        nextOffset: (offsetNum + limitNum) < totalStories ? offsetNum + limitNum : null,
        prevOffset: offsetNum > 0 ? Math.max(0, offsetNum - limitNum) : null
      },
      filters: {
        type: type || null,
        participantId: participantId || null,
        raceId,
        appId,
        eventId
      },
      summary: {
        totalParticipants: participantsSnapshot.size,
        storiesPerParticipant: participantsSnapshot.size > 0 ? Math.round(totalStories / participantsSnapshot.size * 100) / 100 : 0
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
 * /api/race-events-v2:
 *   get:
 *     summary: (BETA) Obtener eventos de carrera con filtros avanzados
 *     description: Copia del endpoint /api/race-events para pruebas de cambios sin afectar prod.
 */
router.get("/race-events-v2", async (req, res) => {
  try {
    const { raceId, appId, eventId, type, participantId, limit = 20, offset = 0 } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    console.log(`🔍 Obteniendo eventos de carrera - Race: ${raceId}, App: ${appId}, Event: ${eventId}, Type: ${type || 'ALL'}, Participant: ${participantId || 'ALL'}`);

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

    // Validar participante si se especifica
    if (participantId) {
      const participantDoc = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId).get();

      if (!participantDoc.exists) {
        return res.status(404).json({
          error: "Participante no encontrado",
          participantId,
          raceId,
          appId,
          eventId
        });
      }
    }

    const eventRef = db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId);

    // Leer desde la colección de stories por evento (desnormalizada)
    let storiesQuery = eventRef.collection('stories');

    if (participantId) {
      storiesQuery = storiesQuery.where('participantId', '==', participantId);
    }
    if (type) {
      storiesQuery = storiesQuery.where('type', '==', type);
    }

    storiesQuery = storiesQuery.orderBy('date', 'desc');

    let totalStories = null;
    try {
      const countSnapshot = await storiesQuery.count().get();
      totalStories = countSnapshot.data().count || 0;
    } catch (error) {
      totalStories = null;
    }

    const storiesSnapshot = await storiesQuery.offset(offsetNum).limit(limitNum).get();

    const stories = storiesSnapshot.docs.map(storyDoc => {
      const storyData = storyDoc.data();
      const storyType = storyData.type || storyData.checkpointInfo?.type || "ATHLETE_STARTED";
      const participantData = storyData.participant || {};

      const story = {
        storyId: storyDoc.id,
        type: storyType,
        participant: {
          ...participantData,
          id: participantData.id || storyData.participantId || participantId || null,
          externalId: participantData.externalId || null
        },
        fileUrl: storyData.fileUrl || "",
        clipUrl: storyData.clipUrl || storyData.generationInfo?.clipUrl || "",
        sponsors: sponsorsFormatted,
        // Datos adicionales de la story
        description: storyData.description || "",
        duration: storyData.duration || 0,
        createdAt: storyData.createdAt,
        date: storyData.date || storyData.createdAt || null,
        moderationStatus: storyData.moderationStatus || "",
        originType: storyData.originType || ""
      };

      // Agregar campos específicos según el tipo
      switch (storyType) {
        case 'SPONSOR':
          story.free_text = storyData.description || "";
          story.poster_url = storyData.fileUrl || "";
          break;
        case 'COMPLETE_AWARD':
          story.rankings = storyData.rankings || [];
          break;
      }

      return story;
    });

    const totalSafe = totalStories !== null ? totalStories : offsetNum + stories.length;
    const hasMore = totalStories !== null ? (offsetNum + limitNum) < totalStories : stories.length === limitNum;

    console.log(`✅ ${stories.length} stories de ${totalSafe} (type=${type || 'ALL'}, participant=${participantId || 'ALL'})`);

    return res.status(200).json({
      stories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalSafe,
        hasMore,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(totalSafe / limitNum),
        nextOffset: hasMore ? offsetNum + limitNum : null,
        prevOffset: offsetNum > 0 ? Math.max(0, offsetNum - limitNum) : null
      },
      filters: {
        type: type || null,
        participantId: participantId || null,
        raceId,
        appId,
        eventId
      },
      summary: {
        totalParticipants: participantId ? 1 : null,
        storiesPerParticipant: participantId ? totalSafe : null
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
 * /api/race-events-v3:
 *   get:
 *     summary: (BETA) Obtener eventos con datos de participante desde Copernico
 *     description: Lee stories por evento y enriquece participante con datos de Copernico.
 */
router.get("/race-events-v3", async (req, res) => {
  try {
    const {
      raceId,
      appId,
      eventId,
      type,
      participantId,
      audience = "all",
      userId,
      limit = 20,
      offset = 0,
      debugStoryId
    } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos",
        required: ["raceId", "appId", "eventId"]
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    const normalizedAudience = String(audience || "all").toLowerCase();
    if (!["all", "featured"].includes(normalizedAudience)) {
      return res.status(400).json({
        error: "audience debe ser 'all' o 'featured'."
      });
    }

    console.log(`🔍 Obteniendo eventos (v3) - Race: ${raceId}, App: ${appId}, Event: ${eventId}, Type: ${type || 'ALL'}, Participant: ${participantId || 'ALL'}, Audience: ${normalizedAudience}, User: ${userId || 'NONE'}`);
    console.log(`🔤 [race-events-v3] eventId codepoints:`, Array.from(String(eventId || '')).map(c => c.charCodeAt(0)));

    try {
      const eventsSnap = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').get();
      const eventIds = eventsSnap.docs.map(doc => doc.id);
      console.log(`🔤 [race-events-v3] eventIds disponibles (${eventIds.length}):`, eventIds);
      eventIds.forEach(id => {
        console.log(`🔤 [race-events-v3] eventId "${id}" codepoints:`, Array.from(String(id)).map(c => c.charCodeAt(0)));
      });
    } catch (eventListError) {
      console.warn(`⚠️ [race-events-v3] No se pudieron listar events:`, eventListError.message);
    }

    // Obtener sponsors una vez
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

    // Validar participante si se especifica
    if (participantId) {
      const participantDoc = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId).get();

      if (!participantDoc.exists) {
        return res.status(404).json({
          error: "Participante no encontrado",
          participantId,
          raceId,
          appId,
          eventId
        });
      }
    }

    const eventRef = db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId);

    if (debugStoryId) {
      try {
        const debugDoc = await eventRef.collection('stories').doc(String(debugStoryId)).get();
        console.log(`🧪 [race-events-v3] debugStoryId="${debugStoryId}" exists=${debugDoc.exists}`);
        if (debugDoc.exists) {
          console.log(`🧪 [race-events-v3] debugStoryId data keys:`, Object.keys(debugDoc.data() || {}));
        }
      } catch (debugError) {
        console.warn(`⚠️ [race-events-v3] debugStoryId error:`, debugError.message);
      }
    }

    // Leer desde la colección de stories por evento (desnormalizada)
    let storiesQuery = eventRef.collection('stories');

    if (participantId) {
      storiesQuery = storiesQuery.where('participantId', '==', participantId);
    }
    if (type) {
      storiesQuery = storiesQuery.where('type', '==', type);
    }

    storiesQuery = storiesQuery.orderBy('updatedAt', 'desc');

    let totalStories = null;
    try {
      const countSnapshot = await storiesQuery.count().get();
      totalStories = countSnapshot.data().count || 0;
    } catch (error) {
      totalStories = null;
    }

    const storiesSnapshot = await storiesQuery.offset(offsetNum).limit(limitNum).get();

    let followedIds = new Set();
    if (userId) {
      try {
        let followingsQuery = db.collection("users")
          .doc(userId)
          .collection("followings")
          .where("profileType", "==", "participant")
          .where("raceId", "==", raceId)
          .where("eventId", "==", eventId);
        if (appId) {
          followingsQuery = followingsQuery.where("appId", "==", appId);
        }

        const followingsSnapshot = await followingsQuery.get();
        followingsSnapshot.forEach(doc => {
          const data = doc.data() || {};
          if (data.profileId) {
            followedIds.add(String(data.profileId));
          }
        });
      } catch (followError) {
        console.warn("No se pudieron obtener followings para filtrar:", followError.message);
      }
    }

    // Resolver race slug y env para Copernico
    let raceSlug = raceId;
    let copernicoEnv = null;
    try {
      const raceDoc = await db.collection('races').doc(raceId).get();
      if (raceDoc.exists) {
        const raceData = raceDoc.data();
        if (raceData?.copernicoEnv) {
          copernicoEnv = raceData.copernicoEnv;
        }
        if (raceData?.race_info?.id) {
          raceSlug = raceData.race_info.id;
        }
      }
    } catch (raceError) {
      console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
    }

    // Cache por participante en este request
    const participantCache = new Map();
    const buildParticipantPayload = (pid, transformed, copernicoDataPayload, appIdValue) => {
      const participantData = {
        id: pid,
        ...transformed.participant,
        externalId: transformed.participant.externalId || pid,
        copernicoData: copernicoDataPayload
      };

      if (appIdValue) {
        const splits = [];
        const times = transformed.times || {};
        for (const [pointName, timeData] of Object.entries(times)) {
          const pointNorm = String(pointName || "").toLowerCase();
          let splitType = "ATHLETE_CROSSED_TIMING_SPLIT";
          if (pointNorm.includes("start") || pointNorm.includes("salida")) {
            splitType = "ATHLETE_STARTED";
          } else if (pointNorm.includes("finish") || pointNorm.includes("meta")) {
            splitType = "ATHLETE_FINISHED";
          }

          splits.push({
            storyId: null,
            type: splitType,
            date: timeData.raw?.rawTime ? new Date(timeData.raw.rawTime).toISOString() : null,
            description: pointName,
            split: timeData.split ?? null,
            checkpoint: pointName,
            time: timeData.time ?? null,
            netTime: timeData.netTime ?? null,
            distance: timeData.distance ?? null
          });
        }

        participantData.splits = splits;
        participantData.totalSplits = splits.length;
        participantData.structure = splits.length > 0 ? "copernico (con splits)" : "copernico (sin splits)";
      } else {
        participantData.structure = "copernico";
      }

      return participantData;
    };
    const allStoryDocs = storiesSnapshot.docs;
    const participantIds = [...new Set(
      allStoryDocs
        .map(doc => doc.data()?.participantId || doc.data()?.participant?.externalId)
        .filter(Boolean)
    )];

    await Promise.all(participantIds.map(async (pid) => {
      try {
        const copernicoData = await copernicoService.getParticipantData(raceSlug, pid, copernicoEnv);
        const transformed = copernicoService.transformCopernicoData(copernicoData);
        const rawEvents = Array.isArray(copernicoData?.events) ? copernicoData.events : (transformed.rawData?.events || []);
        const primaryEvent = rawEvents[0] || {};
        const copernicoDataPayload = {
          times: transformed.times || {},
          rankings: transformed.rankings || {},
          rawData: transformed.rawData || copernicoData,
          predictive: primaryEvent.predictive || null,
          backups: primaryEvent.backups || null,
          mst: primaryEvent.mst || null,
          leader: primaryEvent.leader || null,
          leader_weight: primaryEvent.leader_weight ?? null,
          penalties: primaryEvent.penalties || null,
          commentator: primaryEvent.commentator || null,
          customRankings: primaryEvent["custom-rankings"] || primaryEvent.customRankings || null,
          issuesCount: primaryEvent.issuesCount || null,
          splitsSeen: primaryEvent.splitsSeen ?? null,
          splitsMissing: primaryEvent.splitsMissing ?? null,
          maxConsecutiveSplitsMissing: primaryEvent.maxConsecutiveSplitsMissing ?? null,
          lastSplitSeen: primaryEvent.last_split_seen || primaryEvent.lastSplitSeen || null
        };

        const participant = buildParticipantPayload(pid, transformed, copernicoDataPayload, appId);
        participantCache.set(pid, participant);
      } catch (error) {
        participantCache.set(pid, null);
      }
    }));

    const filteredStoryDocs = allStoryDocs.filter((doc) => {
      const storyData = doc.data() || {};
      const storyParticipantId = String(storyData.participantId || storyData.participant?.externalId || "");
      const copernicoParticipant = storyParticipantId ? participantCache.get(storyParticipantId) : null;
      const isFeatured = copernicoParticipant?.featured === true || storyData.participant?.featured === true || storyData.featured === true;

      if (userId) {
        if (normalizedAudience === "featured") {
          return isFeatured || followedIds.has(storyParticipantId);
        }
        return followedIds.has(storyParticipantId);
      }

      if (normalizedAudience === "featured") {
        return isFeatured;
      }
      return true;
    });

    const toHHMMSS = (value, limit24 = false) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '';
      }
      let secNum = Math.abs(value) / 1000;
      let hours = Math.floor(secNum / 3600);
      let minutes = Math.floor((secNum - (hours * 3600)) / 60);
      let seconds = Math.floor(secNum - (hours * 3600) - (minutes * 60));

      if (limit24 && hours > 23) {
        hours = hours - (Math.trunc(hours / 24) * 24);
      }

      const h = hours < 10 ? `0${hours}` : `${hours}`;
      const m = minutes < 10 ? `0${minutes}` : `${minutes}`;
      const s = seconds < 10 ? `0${seconds}` : `${seconds}`;

      return `${value < 0 ? '-' : ''}${h}:${m}:${s}`;
    };

    const averageToHuman = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '';
      }
      // Copernico average is seconds per meter; convert to seconds per km.
      const secondsPerKm = value * 1000;
      return `${toHHMMSS(secondsPerKm * 1000).replace(/^00:/, '')} m/km`;
    };

    const resolveTimeEntry = (times, pointKey) => {
      if (!times || !pointKey) {
        return null;
      }
      if (times[pointKey]) {
        return times[pointKey];
      }
      const normalizedKey = String(pointKey).toLowerCase();
      const matchKey = Object.keys(times).find(key => String(key).toLowerCase() == normalizedKey);
      return matchKey ? times[matchKey] : null;
    };

    const generateStoryData = (story, participant) => {
      const pointKey = story?.extraData?.point || story?.extraData?.location || story?.splitName;
      const timeEntry = resolveTimeEntry(participant?.copernicoData?.times, pointKey);
      return [
        {
          id: "text1",
          type: "text-info",
          title: "Official time",
          text: timeEntry ? toHHMMSS(timeEntry.time) : ""
        },
        {
          id: "text2",
          type: "text-info",
          title: "Average",
          text: timeEntry ? averageToHuman(timeEntry.average) : ""
        }
      ];
    };

    const stories = filteredStoryDocs.map(storyDoc => {
      const storyData = storyDoc.data();
      const storyType = storyData.type || storyData.checkpointInfo?.type || "ATHLETE_STARTED";
      const resolvedParticipantId = storyData.participantId || storyData.participant?.externalId || participantId || null;
      const copernicoParticipant = resolvedParticipantId ? participantCache.get(resolvedParticipantId) : null;
      const participantData = copernicoParticipant || storyData.participant || {};

      const story = {
        storyId: storyDoc.id,
        type: storyType,
        participant: {
          ...participantData,
          id: participantData.id || resolvedParticipantId,
          externalId: participantData.externalId || resolvedParticipantId || null
        },
        fileUrl: storyData.fileUrl || "",
        sponsors: sponsorsFormatted,
        description: storyData.description || "",
        duration: storyData.duration || 0,
        extraData: storyData.extraData || {},
        createdAt: storyData.createdAt,
        date: storyData.date,
        moderationStatus: storyData.moderationStatus || "",
        originType: storyData.originType || "",
        data: generateStoryData(storyData, participantData)
      };

      const resolvedClipUrl = storyData.clipUrl || storyData.generationInfo?.clipUrl;
      if (resolvedClipUrl) {
        story.clipUrl = resolvedClipUrl;
      }

      switch (storyType) {
        case 'SPONSOR':
          story.free_text = storyData.description || "";
          story.poster_url = storyData.fileUrl || "";
          break;
        case 'COMPLETE_AWARD':
          story.rankings = storyData.rankings || [];
          break;
      }

      return story;
    });

    const filterApplied = normalizedAudience === "featured" || Boolean(userId);
    const totalSafe = filterApplied ? stories.length : (totalStories !== null ? totalStories : offsetNum + stories.length);
    const hasMore = filterApplied ? false : (totalStories !== null ? (offsetNum + limitNum) < totalStories : stories.length === limitNum);

    console.log(`✅ ${stories.length} stories de ${totalSafe} (type=${type || 'ALL'}, participant=${participantId || 'ALL'})`);

    return res.status(200).json({
      stories,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalSafe,
        hasMore,
        currentPage: Math.floor(offsetNum / limitNum) + 1,
        totalPages: Math.ceil(totalSafe / limitNum),
        nextOffset: hasMore ? offsetNum + limitNum : null,
        prevOffset: offsetNum > 0 ? Math.max(0, offsetNum - limitNum) : null
      },
      filters: {
        type: type || null,
        participantId: participantId || null,
        raceId,
        appId,
        eventId,
        audience: normalizedAudience,
        userId: userId || null
      },
      summary: {
        totalParticipants: participantId ? 1 : null,
        storiesPerParticipant: participantId ? totalSafe : null
      }
    });

  } catch (error) {
    console.error("❌ Error obteniendo eventos (v3):", error);
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
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la aplicación (NUEVO - requerido).
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
    let { raceId, appId, eventId, participantId } = req.query;
    if (!raceId || !appId || !eventId || !participantId) {
      return res.status(400).json({
        error: "Los parámetros raceId, appId, eventId y participantId son obligatorios.",
      });
    }

    // Normalizar eventId para evitar problemas de encoding
    eventId = normalizeUTF8InObject(eventId);

    const db = admin.firestore();
    const followersRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("followers");
    const followersSnapshot = await followersRef.get();
    const followersCount = followersSnapshot.size;
    return res.status(200).json({ raceId, appId, eventId, participantId, followersCount });
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
          const { profileId: participantId, raceId, appId, eventId, timestamp } = followingData;

          // Normalizar eventId para evitar problemas de encoding
          const normalizedEventId = normalizeUTF8InObject(eventId);

          // Obtener datos del participante desde el evento (nueva estructura con appId)
          let participantRef;
          if (appId) {
            // Nueva estructura con appId
            participantRef = db.collection("races").doc(raceId)
              .collection("apps").doc(appId)
              .collection("events").doc(normalizedEventId)
              .collection("participants").doc(participantId);
          } else {
            // Estructura antigua (fallback)
            participantRef = db.collection("races").doc(raceId)
              .collection("events").doc(normalizedEventId)
              .collection("participants").doc(participantId);
          }
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
      // Si no hay query, devolver participantes destacados (featured: true)
      console.log("📋 Obteniendo participantes destacados (featured: true)");
      const snapshot = await participantsRef
        .where("featured", "==", true)
        .limit(limitNum)
        .get();

      if (!snapshot.empty) {
        allParticipants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } else {
        // Si no hay featured, devolver hasta `limitNum` participantes como fallback
        console.log(`⚠️ No se encontraron participantes featured; devolviendo hasta ${limitNum} participantes como fallback`);
        const fallbackSnapshot = await participantsRef.limit(limitNum).get();
        allParticipants = fallbackSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
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

      // Filtrado adicional en memoria para búsquedas más flexibles y CASE-INSENSITIVE
      const filterCaseInsensitive = (participantsArray) => {
        return participantsArray.filter(participant => {
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
      };

      // Aplicar filtro case-insensitive sobre los resultados recopilados
      allParticipants = filterCaseInsensitive(allParticipants);

      // Si no alcanzamos el límite, hacer un escaneo acotado (fallback) y filtrar
      if (allParticipants.length < limitNum && searchTerm.length > 0) {
        try {
          const scanLimit = 500; // límite razonable para evitar lecturas masivas
          console.log(`🔎 Broad scan fallback: buscando hasta ${scanLimit} participantes para coincidencias case-insensitive`);
          const scanSnapshot = await participantsRef.limit(scanLimit).get();
          const scanned = scanSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const scannedFiltered = filterCaseInsensitive(scanned);

          // Añadir al mapa original evitando duplicados
          scannedFiltered.forEach(p => {
            if (!participantMap.has(p.id)) participantMap.set(p.id, p);
          });

          // Reconstruir lista final a partir del mapa y aplicar filtro
          allParticipants = Array.from(participantMap.values()).filter(p => {
            const name = (p.name || "").toLowerCase();
            const lastName = (p.lastName || "").toLowerCase();
            const fullName = (p.fullName || "").toLowerCase();
            const dorsal = (p.dorsal || "").toLowerCase();
            const category = (p.category || "").toLowerCase();
            const team = (p.team || "").toLowerCase();
            return name.includes(searchTermLower) ||
                   lastName.includes(searchTermLower) ||
                   fullName.includes(searchTermLower) ||
                   dorsal.includes(searchTermLower) ||
                   category.includes(searchTermLower) ||
                   team.includes(searchTermLower);
          });
        } catch (e) {
          console.warn("⚠️ Broad scan fallback failed:", e.message || e);
        }
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
        externalId: participant.externalId || null,
        name: participant.name || participant.fullName || "",
        lastName: participant.lastName || null, // ✅ Campo lastName agregado
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
 * /api/search/participants-v3:
 *   get:
 *     summary: Buscar participantes (Copernico)
 *     description: Realiza una búsqueda de participantes directamente en Copernico.
 *     parameters:
 *       - in: query
 *         name: query
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 */
router.get("/search/participants-v3", async (req, res) => {
  try {
    const { query, userId, raceId, appId, eventId, limit = 20 } = req.query;

    if (!raceId || !appId || !eventId) {
      return res.status(400).json({
        error: "Los parámetros raceId, appId y eventId son obligatorios."
      });
    }

    const db = admin.firestore();
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    console.log(`🔍 [Copernico] Búsqueda de participantes: query="${query}", raceId=${raceId}, appId=${appId}, eventId=${eventId}`);

    let raceSlug = raceId;
    let copernicoEnv = null;
    try {
      const raceDoc = await db.collection("races").doc(raceId).get();
      if (raceDoc.exists) {
        const raceData = raceDoc.data();
        if (raceData?.copernicoEnv) {
          copernicoEnv = raceData.copernicoEnv;
        }
        if (raceData?.race_info?.id) {
          raceSlug = raceData.race_info.id;
        }
      }
    } catch (raceError) {
      console.warn("No se pudo obtener config de carrera para Copernico:", raceError.message);
    }

    const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
    const baseUrl = envConfig.baseUrl;
    const athletesUrl = `${baseUrl}/${raceSlug}/athletes/list`;
    const headers = copernicoService.config.getRequestHeaders(copernicoEnv);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

    const response = await fetch(athletesUrl, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
      throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
    }

    let athletes = Array.isArray(payload.data) ? payload.data : [];
    const totalFromCopernico = athletes.length;

    // Filtrar por eventId si viene en la estructura de Copernico
    athletes = athletes.filter((athlete) => {
      const events = athlete.events || athlete.event || [];
      if (!events || events.length === 0) return true;
      const eventList = Array.isArray(events) ? events : [events];
      return eventList.some((evt) => {
        if (typeof evt === "string") {
          return evt.toLowerCase() === String(eventId).toLowerCase();
        }
        const evtName = evt.event || evt.name || evt.id || "";
        return String(evtName).toLowerCase() === String(eventId).toLowerCase();
      });
    });

    const searchTerm = query ? query.trim() : "";
    const searchLower = searchTerm.toLowerCase();

    if (searchTerm) {
      athletes = athletes.filter((athlete) => {
        const name = (athlete.name || "").toLowerCase();
        const lastName = (athlete.surname || athlete.lastName || "").toLowerCase();
        const fullName = `${athlete.name || ""} ${athlete.surname || ""}`.toLowerCase();
        const dorsal = String(athlete.dorsal || "").toLowerCase();
        const category = String(athlete.category || "").toLowerCase();
        const team = String(athlete.team || "").toLowerCase();
        const club = String(athlete.club || "").toLowerCase();
        const id = String(athlete.id || "").toLowerCase();

        return name.includes(searchLower) ||
          lastName.includes(searchLower) ||
          fullName.includes(searchLower) ||
          dorsal.includes(searchLower) ||
          category.includes(searchLower) ||
          team.includes(searchLower) ||
          club.includes(searchLower) ||
          id.includes(searchLower);
      });
    }

    athletes = athletes.slice(0, limitNum);

    // Mapa de participantes seguidos (misma lógica que v1)
    const followedParticipantsMap = new Map();
    if (userId) {
      try {
        let followingsQuery = db.collection("users")
          .doc(userId)
          .collection("followings")
          .where("profileType", "==", "participant");

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

    const participantsWithFollowing = athletes.map(athlete => {
      const participantId = athlete.id || athlete.externalId || "";
      let isFollowing = false;

      if (userId && followedParticipantsMap.size > 0) {
        const specificKey = `${participantId}_${raceId}_${eventId}`;
        isFollowing = followedParticipantsMap.has(specificKey) || followedParticipantsMap.has(participantId);
      }

      const name = athlete.name || "";
      const lastName = athlete.surname || athlete.lastName || "";
      const fullName = `${name} ${lastName}`.trim();

      return {
        id: participantId,
        objectID: participantId,
        externalId: athlete.id || null,
        name,
        lastName: lastName || null,
        fullName: fullName || null,
        bib: athlete.dorsal || null,
        dorsal: athlete.dorsal || null,
        category: athlete.category || null,
        team: athlete.team || null,
        club: athlete.club || null,
        gender: athlete.gender || null,
        featured: athlete.featured || false,
        status: athlete.status || athlete.realStatus || "unknown",
        following: isFollowing,
        raceId,
        eventId,
        appId,
        birthdate: athlete.birthdate || null,
        country: athlete.nationality || athlete.country || null,
        wave: athlete.wave || null,
        chip: athlete.chip || null
      };
    });

    const scoreParticipant = (p) => {
      if (p.following) return 2;
      if (p.featured) return 1;
      return 0;
    };

    const participantsSorted = participantsWithFollowing
      .map((p, idx) => ({ p, idx, score: scoreParticipant(p) }))
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
      .map(({ p }) => p);

    return res.status(200).json({
      participants: participantsSorted,
      total: participantsSorted.length,
      totalCopernico: totalFromCopernico,
      query: query || "",
      searchMethod: "copernico_api",
      raceId,
      appId,
      eventId
    });
  } catch (error) {
    console.error("❌ Error en búsqueda Copernico:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
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

      // 5. Obtener races de esta app - USAR raceId del documento de la app
      const races = [];

      // Si la app tiene un raceId, buscar directamente en esa race
      console.log(`🔍 [getApps] App ${appId} - raceId: ${appData.raceId}, keys: ${Object.keys(appData).join(', ')}`);

      if (appData.raceId || appData.linkedRaceId) {
        const raceId = appData.raceId || appData.linkedRaceId;
        console.log(`🔍 [getApps] App ${appId} tiene raceId: ${raceId}`);

        try {
          // Obtener datos de la race
          console.log(`🔍 [getApps] Buscando race: ${raceId}`);
          const raceDoc = await db.collection('races').doc(raceId).get();
          console.log(`🔍 [getApps] Race doc exists: ${raceDoc.exists}`);

          if (raceDoc.exists) {
            const raceData = raceDoc.data();
            console.log(`✅ [getApps] Race ${raceId} encontrada: ${raceData.name || 'Sin nombre'}`);

            // 6. Obtener events y media de esta app en esta race
            const eventsSnapshot = await db.collection('races').doc(raceId)
              .collection('apps').doc(appId)
              .collection('events').get();

            const mediaSnapshot = await db.collection('races').doc(raceId)
              .collection('apps').doc(appId)
              .collection('media').get();

            console.log(`📊 [getApps] Events: ${eventsSnapshot.size}, Media: ${mediaSnapshot.size}`);

            if (!eventsSnapshot.empty || !mediaSnapshot.empty) {
              // 7. Procesar events (ya obtenidos arriba)
              const events = eventsSnapshot.docs.map(eventDoc => ({
                eventId: eventDoc.id,
                ...eventDoc.data()
              }));

              // 8. Procesar media (ya obtenida arriba)
              const media = mediaSnapshot.docs.map(mediaDoc => ({
                mediaId: mediaDoc.id,
                ...mediaDoc.data()
              }));

              // Organizar media por tipo para fácil acceso (usando campo 'type' existente)
              const mediaByType = {
                sponsors: media.filter(m => m.type === 'sponsors'),
                logos: media.filter(m => m.type === 'logos'),
                videos: media.filter(m => m.type === 'videos'),
                images: media.filter(m => m.type === 'images'),
                posters: media.filter(m => m.type === 'posters'),
                all: media
              };

              races.push({
                raceId,
                ...raceData,
                events: events,
                eventsCount: events.length,
                media: mediaByType,
                mediaCount: media.length
              });
            }
          }
        } catch (raceError) {
          console.error(`❌ [getApps] Error procesando race ${raceId} para app ${appId}:`, raceError);
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
 * /api/apps/gpx-maps:
 *   get:
 *     summary: Listar mapas GPX asociados a una app (opcional por evento)
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: eventId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       '200':
 *         description: Lista de mapas GPX
 */
router.get("/apps/gpx-maps", async (req, res) => {
  try {
    const { raceId, appId, eventId, limit = 100 } = req.query;
    if (!raceId || !appId) {
      return res.status(400).json({ message: "raceId y appId son obligatorios." });
    }

    const db = admin.firestore();

    let mapsRef;
    if (eventId) {
      mapsRef = db.collection("races").doc(String(raceId)).
        collection("apps").doc(String(appId)).
        collection("events").doc(String(eventId)).
        collection("gpxMaps");
    } else {
      mapsRef = db.collection("races").doc(String(raceId)).
        collection("apps").doc(String(appId)).
        collection("gpxMaps");
    }

    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 100, 500));
    const snapshot = await mapsRef.limit(limitNum).get();

    // Helpers para ordenar puntos de forma segura
    const ensureArray = (v) => Array.isArray(v) ? v : [];

    const sortByDetectedKey = (points, keysPriority = []) => {
      points = ensureArray(points);
      if (points.length === 0) return points;

      // Detectar una clave útil para ordenar (order, index, seq, time, timestamp)
      const detectedKey = keysPriority.find(k => points.some(p => p && Object.prototype.hasOwnProperty.call(p, k)));
      if (!detectedKey) return points; // devolver tal cual si no hay clave detectable

      return points.slice().sort((a, b) => {
        const va = a && a[detectedKey] !== undefined ? a[detectedKey] : null;
        const vb = b && b[detectedKey] !== undefined ? b[detectedKey] : null;
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        // fallback lexicográfico
        return String(va).localeCompare(String(vb));
      });
    };

    // Construir lista de mapas formateada y con puntos ordenados
    const maps = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      const gpx = data.gpxData || {};

      const routePoints = sortByDetectedKey(gpx.routePoints, ['order', 'index', 'seq', 'time', 'timestamp']);
      const waypoints = sortByDetectedKey(gpx.waypoints, ['order', 'index', 'name']);

      const formatted = {
        id: doc.id,
        widgetId: data.widgetId || null,
        title: data.title || null,
        updatedAt: data.updatedAt || null,
        gpxData: {
          bounds: gpx.bounds || null,
          routePoints,
          waypoints
        }
      };

      return formatted;
    });

    // Ordenar mapas por `updatedAt` (descendente) si existe, else mantener el orden
    maps.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });

    return res.status(200).json({ total: maps.length, maps });
  } catch (error) {
    console.error("❌ Error en GET /api/apps/gpx-maps:", error);
    return res.status(500).json({ message: "Error interno del servidor", error: error.message });
  }
});

/**
 * @openapi
 * /api/config:
 *   get:
 *     summary: Obtener configuración de app específica con eventos y media
 *     description: |
 *       Obtiene la configuración completa de una app específica incluyendo:
 *       - Datos de la app
 *       - Eventos de la race/app
 *       - Media organizada por tipo (misma para todos los eventos)

       **Requiere al menos uno de los parámetros:** raceId, bundleId, o raceName
 *     tags:
 *       - Config
 *     parameters:
 *       - in: query
 *         name: raceId
 *         schema:
 *           type: string
 *         description: ID de la race
 *         example: "26dc137a-34e2-44a0-918b-a5af620cf281"
 *       - in: query
 *         name: bundleId
 *         schema:
 *           type: string
 *         description: Bundle ID de la app
 *         example: "com.live2.app"
 *       - in: query
 *         name: raceName
 *         schema:
 *           type: string
 *         description: Nombre de la race
 *         example: "Carrera de la Mujer Gijón 2023 Copia"
 *     responses:
 *       200:
 *         description: Configuración de la app obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 app:
 *                   type: object
 *                   properties:
 *                     appId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     raceId:
 *                       type: string
 *                     raceName:
 *                       type: string
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           eventId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           media:
 *                             type: object
 *                             properties:
 *                               sponsors:
 *                                 type: array
 *                               logos:
 *                                 type: array
 *                               videos:
 *                                 type: array
 *                               images:
 *                                 type: array
 *                               posters:
 *                                 type: array
 *       400:
 *         description: Parámetros faltantes o inválidos
 *       404:
 *         description: App no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.get("/config", async (req, res) => {
  try {
    const { raceId, bundleId, raceName } = req.query;

    // Validar que al menos un filtro esté presente
    if (!raceId && !bundleId && !raceName) {
      return res.status(400).json({
        error: "Se requiere al menos uno de los siguientes parámetros: raceId, bundleId, raceName",
        required: ["raceId", "bundleId", "raceName"]
      });
    }

    console.log(`⚙️ [getConfig] Buscando app - raceId: ${raceId}, bundleId: ${bundleId}, raceName: ${raceName}`);

    const db = admin.firestore();
    let targetApp = null;
    let targetRaceId = null;

    // 1. Buscar la app según los filtros proporcionados - ESTRUCTURA CORRECTA: races/apps
    if (raceId) {
      // Buscar por raceId - buscar apps en esa race específica
      const appsSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').get();

      if (!appsSnapshot.empty) {
        // Tomar la primera app encontrada en esa race
        targetApp = { id: appsSnapshot.docs[0].id, ...appsSnapshot.docs[0].data() };
        targetRaceId = raceId;
      }
    } else {
      // Buscar por bundleId o raceName - OPTIMIZADO: solo buscar en race conocida primero
      console.log(`🔍 [getConfig] Búsqueda optimizada por bundleId/raceName`);

      // Primero intentar en la race que sabemos que tiene datos
      const knownRaceId = "26dc137a-34e2-44a0-918b-a5af620cf281";
      console.log(`🔍 [getConfig] Buscando primero en race conocida: ${knownRaceId}`);

      const knownAppsSnapshot = await db.collection('races').doc(knownRaceId)
        .collection('apps').get();

      console.log(`🔍 [getConfig] Encontradas ${knownAppsSnapshot.size} apps en race conocida`);

      for (const appDoc of knownAppsSnapshot.docs) {
        const appData = appDoc.data();
        console.log(`🔍 [getConfig] Revisando app ${appDoc.id} - bundleId: "${appData.bundleId}", raceName: "${appData.raceName}"`);

        if ((bundleId && appData.bundleId === bundleId) ||
            (raceName && appData.raceName === raceName)) {
          targetApp = { id: appDoc.id, ...appData };
          targetRaceId = knownRaceId;
          console.log(`✅ [getConfig] App encontrada en race conocida: ${appDoc.id}`);
          break;
        }
      }

      // Si no se encontró en la race conocida, buscar en todas las demás
      if (!targetApp) {
        console.log(`🔍 [getConfig] No encontrada en race conocida, buscando en todas las races`);
        const racesSnapshot = await db.collection('races').get();

        for (const raceDoc of racesSnapshot.docs) {
          const currentRaceId = raceDoc.id;

          // Saltar la race que ya revisamos
          if (currentRaceId === knownRaceId) continue;

          const appsSnapshot = await db.collection('races').doc(currentRaceId)
            .collection('apps').get();

          if (appsSnapshot.size > 0) {
            console.log(`🔍 [getConfig] Revisando ${appsSnapshot.size} apps en race ${currentRaceId}`);

            for (const appDoc of appsSnapshot.docs) {
              const appData = appDoc.data();

              if ((bundleId && appData.bundleId === bundleId) ||
                  (raceName && appData.raceName === raceName)) {
                targetApp = { id: appDoc.id, ...appData };
                targetRaceId = currentRaceId;
                console.log(`✅ [getConfig] App encontrada: ${appDoc.id}`);
                break;
              }
            }
          }

          if (targetApp) break;
        }
      }
    }

    if (!targetApp || !targetRaceId) {
      return res.status(404).json({
        error: "App no encontrada",
        filters: { raceId, bundleId, raceName }
      });
    }

    console.log(`✅ [getConfig] App encontrada: ${targetApp.name} (${targetApp.id}) en race: ${targetRaceId}`);

    // 2. Obtener datos de la race
    const raceDoc = await db.collection('races').doc(targetRaceId).get();
    const raceData = raceDoc.exists ? raceDoc.data() : {};

    // 3. Obtener eventos de esta app en esta race
    const eventsSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('events').get();

    // 4. Obtener media de esta app en esta race
    const mediaSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('media').get();

    const media = mediaSnapshot.docs.map(mediaDoc => ({
      mediaId: mediaDoc.id,
      ...mediaDoc.data()
    }));

    // 5. Organizar media por tipo (sin array 'all' redundante)
    const mediaByType = {
      sponsors: media.filter(m => m.type === 'sponsors'),
      logos: media.filter(m => m.type === 'logos'),
      videos: media.filter(m => m.type === 'videos'),
      images: media.filter(m => m.type === 'images'),
      posters: media.filter(m => m.type === 'posters')
    };

    console.log(`📊 [getConfig] Eventos: ${eventsSnapshot.size}, Media: ${media.length}`);

    // 6. Procesar eventos e incluir la misma media en cada uno
    const events = eventsSnapshot.docs.map(eventDoc => ({
      eventId: eventDoc.id,
      ...eventDoc.data(),
      media: mediaByType // La misma media para todos los eventos
    }));

    // 7. Respuesta
    const { sponsors, images, videos, logos, ...cleanAppData } = targetApp; // Excluir media antigua
    const response = {
      app: {
        appId: targetApp.id,
        name: targetApp.name,
        raceId: targetRaceId,
        raceName: raceData.name || targetApp.raceName,
        bundleId: targetApp.bundleId,
        ...cleanAppData, // Incluir datos de la app SIN media antigua
        events: events,
        eventsCount: events.length,
        mediaCount: media.length
      },
      summary: {
        totalEvents: events.length,
        totalMedia: media.length,
        mediaByType: {
          sponsors: mediaByType.sponsors.length,
          logos: mediaByType.logos.length,
          videos: mediaByType.videos.length,
          images: mediaByType.images.length,
          posters: mediaByType.posters.length
        }
      }
    };

    console.log(`✅ [getConfig] Configuración obtenida exitosamente`);

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error en GET /api/config:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * /api/config-v3:
 *   get:
 *     summary: Obtener configuración con publishedRankings desde Copernico
 */
router.get("/config-v3", async (req, res) => {
  try {
    const { raceId, bundleId, raceName } = req.query;

    if (!raceId && !bundleId && !raceName) {
      return res.status(400).json({
        error: "Se requiere al menos uno de los siguientes parámetros: raceId, bundleId, raceName",
        required: ["raceId", "bundleId", "raceName"]
      });
    }

    console.log(`⚙️ [getConfigV3] Buscando app - raceId: ${raceId}, bundleId: ${bundleId}, raceName: ${raceName}`);

    const db = admin.firestore();
    let targetApp = null;
    let targetRaceId = null;

    if (raceId) {
      const appsSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').get();

      if (!appsSnapshot.empty) {
        targetApp = { id: appsSnapshot.docs[0].id, ...appsSnapshot.docs[0].data() };
        targetRaceId = raceId;
      }
    } else {
      console.log(`🔍 [getConfigV3] Búsqueda optimizada por bundleId/raceName`);

      const knownRaceId = "26dc137a-34e2-44a0-918b-a5af620cf281";
      console.log(`🔍 [getConfigV3] Buscando primero en race conocida: ${knownRaceId}`);

      const knownAppsSnapshot = await db.collection('races').doc(knownRaceId)
        .collection('apps').get();

      for (const appDoc of knownAppsSnapshot.docs) {
        const appData = appDoc.data();
        if ((bundleId && appData.bundleId === bundleId) ||
            (raceName && appData.raceName === raceName)) {
          targetApp = { id: appDoc.id, ...appData };
          targetRaceId = knownRaceId;
          console.log(`✅ [getConfigV3] App encontrada en race conocida: ${appDoc.id}`);
          break;
        }
      }

      if (!targetApp) {
        console.log(`🔍 [getConfigV3] No encontrada en race conocida, buscando en todas las races`);
        const racesSnapshot = await db.collection('races').get();

        for (const raceDoc of racesSnapshot.docs) {
          const currentRaceId = raceDoc.id;
          if (currentRaceId === knownRaceId) continue;

          const appsSnapshot = await db.collection('races').doc(currentRaceId)
            .collection('apps').get();

          if (appsSnapshot.size > 0) {
            for (const appDoc of appsSnapshot.docs) {
              const appData = appDoc.data();

              if ((bundleId && appData.bundleId === bundleId) ||
                  (raceName && appData.raceName === raceName)) {
                targetApp = { id: appDoc.id, ...appData };
                targetRaceId = currentRaceId;
                console.log(`✅ [getConfigV3] App encontrada: ${appDoc.id}`);
                break;
              }
            }
          }

          if (targetApp) break;
        }
      }
    }

    if (!targetApp || !targetRaceId) {
      return res.status(404).json({
        error: "App no encontrada",
        filters: { raceId, bundleId, raceName }
      });
    }

    console.log(`✅ [getConfigV3] App encontrada: ${targetApp.name} (${targetApp.id}) en race: ${targetRaceId}`);

    const raceDoc = await db.collection('races').doc(targetRaceId).get();
    const raceData = raceDoc.exists ? raceDoc.data() : {};

    const eventsSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('events').get();

    const mediaSnapshot = await db.collection('races').doc(targetRaceId)
      .collection('apps').doc(targetApp.id)
      .collection('media').get();

    const media = mediaSnapshot.docs.map(mediaDoc => ({
      mediaId: mediaDoc.id,
      ...mediaDoc.data()
    }));

    const mediaByType = {
      sponsors: media.filter(m => m.type === 'sponsors'),
      logos: media.filter(m => m.type === 'logos'),
      videos: media.filter(m => m.type === 'videos'),
      images: media.filter(m => m.type === 'images'),
      posters: media.filter(m => m.type === 'posters')
    };

    let copernicoEvents = [];
    let copernicoEnv = raceData?.copernicoEnv || null;
    let raceSlug = raceData?.race_info?.id || targetRaceId;

    try {
      const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
      const baseUrl = envConfig.baseUrl;
      const headers = copernicoService.config.getRequestHeaders(copernicoEnv);
      const raceUrl = `${baseUrl}/${raceSlug}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

      const response = await fetch(raceUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      copernicoEvents = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    } catch (copernicoError) {
      console.warn("⚠️ [getConfigV3] No se pudo obtener eventos de Copernico:", copernicoError.message);
    }

    const normalizeKey = (value) => String(value || '').trim().toLowerCase();
    const buildRanking = (payload) => ({ ...payload });
    const buildPublishedRankings = (raceEvent) => {
      const categoryRankings = (raceEvent?.categories || []).map(category => buildRanking({
        name: category.name,
        family: "General",
        event: raceEvent.name,
        type: 'category',
        "type-value": category.name
      }));
      const genderRankings = ['male', 'female'].map(gender => buildRanking({
        name: gender,
        family: "General",
        event: raceEvent.name,
        type: 'gender',
        "type-value": gender
      }));
      const attrRankings = (raceEvent?.attributes || []).map(attr =>
        (attr.options || []).map(({ value }) => buildRanking({
          name: `${attr.name} ${value}`,
          family: "General",
          event: raceEvent.name,
          type: `attribute:${attr.name}`,
          "type-value": value
        }))
      ).flat();

      return [
        buildRanking({ name: "overall", "family": "General", event: raceEvent.name, type: "overall", "type-value": "" }),
        ...categoryRankings,
        ...genderRankings,
        ...attrRankings
      ];
    };

    const events = eventsSnapshot.docs.map(eventDoc => {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;
      const eventName = eventData?.name || eventId;

      const matchingEvent = copernicoEvents.find(evt =>
        normalizeKey(evt?.name) === normalizeKey(eventName) ||
        normalizeKey(evt?.name) === normalizeKey(eventId)
      );

      if (!matchingEvent) {
        return null;
      }

      const publishedRankings = buildPublishedRankings(matchingEvent || {});
      const eventMaps = matchingEvent?.maps ?? matchingEvent?.map ?? [];
      return {
        eventId: eventId,
        ...eventData,
        media: mediaByType,
        publishedRankings,
        maps: eventMaps
      };
    }).filter(Boolean);

    const { sponsors, images, videos, logos, ...cleanAppData } = targetApp;
    const response = {
      app: {
        appId: targetApp.id,
        name: targetApp.name,
        raceId: targetRaceId,
        raceName: raceData.name || targetApp.raceName,
        bundleId: targetApp.bundleId,
        ...cleanAppData,
        events: events,
        eventsCount: events.length,
        mediaCount: media.length
      },
      summary: {
        totalEvents: events.length,
        totalMedia: media.length,
        mediaByType: {
          sponsors: mediaByType.sponsors.length,
          logos: mediaByType.logos.length,
          videos: mediaByType.videos.length,
          images: mediaByType.images.length,
          posters: mediaByType.posters.length
        }
      }
    };

    console.log(`✅ [getConfigV3] Configuración obtenida exitosamente`);
    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error en GET /api/config-v3:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * /api/config-v3-by-app:
 *   get:
 *     summary: Obtener configuración con publishedRankings desde Copernico (requiere raceId + appId)
 */
router.get("/config-v3-by-app", async (req, res) => {
  try {
    const { raceId, appId } = req.query;

    if (!raceId || !appId) {
      return res.status(400).json({
        error: "raceId y appId son obligatorios",
        required: ["raceId", "appId"]
      });
    }

    const db = admin.firestore();

    const appDoc = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId).get();

    if (!appDoc.exists) {
      return res.status(404).json({
        error: "App no encontrada",
        filters: { raceId, appId }
      });
    }

    const targetApp = { id: appDoc.id, ...appDoc.data() };
    const raceDoc = await db.collection('races').doc(raceId).get();
    const raceData = raceDoc.exists ? raceDoc.data() : {};

    const eventsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').get();

    const mediaSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('media').get();

    const media = mediaSnapshot.docs.map(mediaDoc => ({
      mediaId: mediaDoc.id,
      ...mediaDoc.data()
    }));

    const mediaByType = {
      sponsors: media.filter(m => m.type === 'sponsors'),
      logos: media.filter(m => m.type === 'logos'),
      videos: media.filter(m => m.type === 'videos'),
      images: media.filter(m => m.type === 'images'),
      posters: media.filter(m => m.type === 'posters')
    };

    let copernicoEvents = [];
    const copernicoEnv = raceData?.copernicoEnv || null;
    const raceSlug = raceData?.race_info?.id || raceId;

    try {
      const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
      const baseUrl = envConfig.baseUrl;
      const headers = copernicoService.config.getRequestHeaders(copernicoEnv);
      const raceUrl = `${baseUrl}/${raceSlug}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), copernicoService.config.get("request.timeoutMs") || 10000);

      const response = await fetch(raceUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      copernicoEvents = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    } catch (copernicoError) {
      console.warn("⚠️ [getConfigV3ByApp] No se pudo obtener eventos de Copernico:", copernicoError.message);
    }

    const normalizeKey = (value) => String(value || '').trim().toLowerCase();
    const buildRanking = (payload) => ({ ...payload });
    const buildPublishedRankings = (raceEvent) => {
      const categoryRankings = (raceEvent?.categories || []).map(category => buildRanking({
        name: category.name,
        family: "General",
        event: raceEvent.name,
        type: 'category',
        "type-value": category.name
      }));
      const genderRankings = ['male', 'female'].map(gender => buildRanking({
        name: gender,
        family: "General",
        event: raceEvent.name,
        type: 'gender',
        "type-value": gender
      }));
      const attrRankings = (raceEvent?.attributes || []).map(attr =>
        (attr.options || []).map(({ value }) => buildRanking({
          name: `${attr.name} ${value}`,
          family: "General",
          event: raceEvent.name,
          type: `attribute:${attr.name}`,
          "type-value": value
        }))
      ).flat();

      return [
        buildRanking({ name: "overall", "family": "General", event: raceEvent.name, type: "overall", "type-value": "" }),
        ...categoryRankings,
        ...genderRankings,
        ...attrRankings
      ];
    };

    const events = eventsSnapshot.docs.map(eventDoc => {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;
      const eventName = eventData?.name || eventId;

      const matchingEvent = copernicoEvents.find(evt =>
        normalizeKey(evt?.name) === normalizeKey(eventName) ||
        normalizeKey(evt?.name) === normalizeKey(eventId)
      );

      if (!matchingEvent) {
        return null;
      }

      const publishedRankings = buildPublishedRankings(matchingEvent || {});
      const eventMaps = matchingEvent?.maps ?? matchingEvent?.map ?? [];
      return {
        eventId: eventId,
        ...eventData,
        media: mediaByType,
        publishedRankings,
        maps: eventMaps
      };
    }).filter(Boolean);

    const { sponsors, images, videos, logos, ...cleanAppData } = targetApp;
    const response = {
      app: {
        appId: targetApp.id,
        name: targetApp.name,
        raceId: raceId,
        raceName: raceData.name || targetApp.raceName,
        bundleId: targetApp.bundleId,
        ...cleanAppData,
        events: events,
        eventsCount: events.length,
        mediaCount: media.length
      },
      summary: {
        totalEvents: events.length,
        totalMedia: media.length,
        mediaByType: {
          sponsors: mediaByType.sponsors.length,
          logos: mediaByType.logos.length,
          videos: mediaByType.videos.length,
          images: mediaByType.images.length,
          posters: mediaByType.posters.length
        }
      }
    };

    console.log(`✅ [getConfigV3ByApp] Configuración obtenida exitosamente`);
    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Error en GET /api/config-v3-by-app:", error);
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
 * /api/admin/backfill-event-index:
 *   post:
 *     summary: Backfill eventIndex para eventNameNormalized
 *     description: Genera docs en races/{raceId}/eventIndex/{eventNameNormalized} usando eventos existentes.
 *     tags:
 *       - Admin
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *               appId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Backfill ejecutado
 *       400:
 *         description: Parámetros faltantes
 */
router.post("/admin/backfill-event-index", async (req, res) => {
  try {
    const apiKey = req.headers?.apikey || req.headers?.apiKey || req.body?.apiKey;
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY";
    if (apiKey !== expectedApiKey) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { raceId, appId } = req.body || {};
    if (!raceId) {
      return res.status(400).json({ error: "raceId es obligatorio" });
    }

    const normalizeEventKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const db = admin.firestore();
    let updated = 0;
    let scanned = 0;
    let batch = db.batch();
    let pending = 0;

    const appsSnapshot = appId
      ? await db.collection('races').doc(raceId).collection('apps').doc(appId).get().then(doc => (doc.exists ? [doc] : []))
      : await db.collection('races').doc(raceId).collection('apps').get().then(s => s.docs);

    for (const appDoc of appsSnapshot) {
      const currentAppId = appDoc.id;
      const eventsSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(currentAppId)
        .collection('events').get();

      for (const eventDoc of eventsSnapshot.docs) {
        scanned += 1;
        const eventData = eventDoc.data() || {};
        const baseName =
          eventData.event_info?.name ||
          eventData.name ||
          eventData.eventName ||
          eventDoc.id ||
          "";
        const normalized = normalizeEventKey(baseName);

        if (eventData.eventNameNormalized !== normalized) {
          batch.update(eventDoc.ref, { eventNameNormalized: normalized });
        }

        const indexRef = db.collection('races').doc(raceId)
          .collection('eventIndex').doc(normalized);
        batch.set(indexRef, {
          raceId,
          appId: currentAppId,
          eventId: eventDoc.id,
          eventNameNormalized: normalized,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        updated += 1;
        pending += 1;

        if (pending >= 450) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }
    }

    if (pending > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      raceId,
      appId: appId || null,
      scanned,
      updated
    });
  } catch (error) {
    console.error("❌ Error en POST /api/admin/backfill-event-index:", error);
    return res.status(500).json({ error: "Error interno del servidor", message: error.message });
  }
});

/**
 * @openapi
 * /api/admin/backfill-story-dates:
 *   post:
 *     summary: (TEMP) Backfill date/updatedAt en stories
 *     description: Completa date (ISO string) y updatedAt en stories de events y/o participants.
 *     tags:
 *       - Admin
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *               appId:
 *                 type: string
 *               eventId:
 *                 type: string
 *               scope:
 *                 type: string
 *                 enum: [events, participants, both]
 *     responses:
 *       200:
 *         description: Backfill ejecutado
 *       400:
 *         description: Parámetros faltantes
 */
router.post("/admin/backfill-story-dates", async (req, res) => {
  try {
    const apiKey = req.headers?.apikey || req.headers?.apiKey || req.body?.apiKey;
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY";
    if (apiKey !== expectedApiKey) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { raceId, appId, eventId, scope = "events" } = req.body || {};
    if (!raceId) {
      return res.status(400).json({ error: "raceId es obligatorio" });
    }

    const db = admin.firestore();
    let updated = 0;
    let scanned = 0;
    let batch = db.batch();
    let pending = 0;

    const commitBatchIfNeeded = async () => {
      if (pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    };

    const toIso = (value) => {
      if (!value) return null;
      if (typeof value === "string") return value;
      if (value.toDate) {
        return value.toDate().toISOString();
      }
      return null;
    };

    const buildUpdate = (data) => {
      const createdAt = data.createdAt || null;
      const updatedAt = data.updatedAt || null;
      const resolvedIso = data.date || toIso(createdAt) || toIso(updatedAt) || new Date().toISOString();
      const updateData = {};
      if (!data.date) updateData.date = resolvedIso;
      if (!data.updatedAt) updateData.updatedAt = updatedAt || createdAt || admin.firestore.FieldValue.serverTimestamp();
      if (!data.createdAt) updateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      return updateData;
    };

    const appsSnapshot = appId
      ? await db.collection('races').doc(raceId).collection('apps').doc(appId).get().then(doc => (doc.exists ? [doc] : []))
      : await db.collection('races').doc(raceId).collection('apps').get().then(s => s.docs);

    for (const appDoc of appsSnapshot) {
      const currentAppId = appDoc.id;
      const eventsSnapshot = eventId
        ? await db.collection('races').doc(raceId)
          .collection('apps').doc(currentAppId)
          .collection('events').doc(eventId).get().then(doc => (doc.exists ? [doc] : []))
        : await db.collection('races').doc(raceId)
          .collection('apps').doc(currentAppId)
          .collection('events').get().then(s => s.docs);

      for (const eventDoc of eventsSnapshot) {
        const currentEventId = eventDoc.id;

        if (scope === "events" || scope === "both") {
          const storiesSnap = await eventDoc.ref.collection('stories').get();
          for (const storyDoc of storiesSnap.docs) {
            scanned += 1;
            const data = storyDoc.data() || {};
            const updateData = buildUpdate(data);
            if (Object.keys(updateData).length > 0) {
              batch.update(storyDoc.ref, updateData);
              updated += 1;
              pending += 1;
              await commitBatchIfNeeded();
            }
          }
        }

        if (scope === "participants" || scope === "both") {
          const participantsSnap = await eventDoc.ref.collection('participants').get();
          for (const participantDoc of participantsSnap.docs) {
            const storiesSnap = await participantDoc.ref.collection('stories').get();
            for (const storyDoc of storiesSnap.docs) {
              scanned += 1;
              const data = storyDoc.data() || {};
              const updateData = buildUpdate(data);
              if (Object.keys(updateData).length > 0) {
                batch.update(storyDoc.ref, updateData);
                updated += 1;
                pending += 1;
                await commitBatchIfNeeded();
              }
            }
          }
        }
      }
    }

    if (pending > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      ok: true,
      raceId,
      appId: appId || null,
      eventId: eventId || null,
      scope,
      scanned,
      updated,
      note: "TEMP endpoint: eliminar después de ejecutar"
    });
  } catch (error) {
    console.error("❌ Error en /admin/backfill-story-dates:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message
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
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY";
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
    const response = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateStoriesFromChunks', {
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

    // ✅ CORREGIDO: La respuesta es JSON con clipUrl
    const result = await response.json();
    const clipUrl = result.clipUrl || result.url || result;
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

    // 🆕 GUARDAR CLIPURL EN EL CHECKPOINT DONDE SE GENERÓ
    try {
      console.log(`📍 Actualizando checkpoint con clipUrl: ${checkpointId}`);

      const checkpointRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("participants").doc(participantId)
        .collection("checkpoints").doc(checkpointId);

      await checkpointRef.update({
        clipUrl: clipUrl,
        clipGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        hasVideoClip: true
      });

      console.log(`✅ Checkpoint actualizado con clipUrl: ${checkpointId}`);
    } catch (checkpointError) {
      console.error(`⚠️ Error actualizando checkpoint con clipUrl:`, checkpointError);
    }

    // 🆕 GUARDAR CLIPURL EN EL SPLIT/LOCATION CORRESPONDIENTE
    try {
      console.log(`🏁 Buscando split/location para checkpoint: ${checkpointId}`);

      // Buscar el evento en la estructura nueva
      let eventDoc = null;
      let eventRef = null;

      // Buscar en todas las apps para encontrar el evento
      const appsSnapshot = await db.collection("races").doc(raceId).collection("apps").get();

      for (const appDoc of appsSnapshot.docs) {
        const appId = appDoc.id;
        const newEventRef = db.collection("races").doc(raceId)
          .collection("apps").doc(appId)
          .collection("events").doc(eventId);

        const newEventDoc = await newEventRef.get();
        if (newEventDoc.exists) {
          eventDoc = newEventDoc;
          eventRef = newEventRef;
          console.log(`✅ Evento encontrado: /races/${raceId}/apps/${appId}/events/${eventId}`);
          break;
        }
      }

      if (eventDoc && eventDoc.exists) {
        const eventData = eventDoc.data();

        // Buscar en splits si existe
        if (eventData.splits && Array.isArray(eventData.splits)) {
          const splitIndex = eventData.splits.findIndex(split =>
            split === checkpointId ||
            split.name === checkpointId ||
            split.id === checkpointId
          );

          if (splitIndex !== -1) {
            console.log(`📍 Split encontrado en índice ${splitIndex}: ${checkpointId}`);

            // Guardar en la misma estructura donde se encontró el evento
            const splitClipsCol = eventRef.collection("split-clips");

            // Buscar si ya existe un registro para el mismo splitName + participantId
            const existingSplitQuery = await splitClipsCol
              .where("splitName", "==", checkpointId)
              .where("participantId", "==", participantId)
              .limit(1)
              .get();

            const splitPayload = {
              splitName: checkpointId,
              splitIndex: splitIndex,
              clipUrl: clipUrl,
              participantId: participantId,
              raceId: raceId,
              eventId: eventId,
              streamId: streamId,
              timestamp: timestamp ? new Date(timestamp).toISOString() : null,
              generatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (!existingSplitQuery.empty) {
              const docRef = existingSplitQuery.docs[0].ref;
              await docRef.update(splitPayload);
              console.log(`✅ ClipUrl actualizado en split (mismo split+participant): ${docRef.id}`);
            } else {
              const newDocRef = await splitClipsCol.add({ ...splitPayload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
              console.log(`✅ ClipUrl guardado en split: ${newDocRef.id}`);
            }
          }
        }

        // Buscar en timingPoints si existe
        if (eventData.timingPoints && Array.isArray(eventData.timingPoints)) {
          const timingIndex = eventData.timingPoints.findIndex(point =>
            point === checkpointId ||
            point.name === checkpointId ||
            point.id === checkpointId
          );

          if (timingIndex !== -1) {
            console.log(`⏱️ Timing point encontrado en índice ${timingIndex}: ${checkpointId}`);

            // Guardar en la misma estructura donde se encontró el evento
            const timingClipsRef = eventRef.collection("timing-clips").doc(checkpointId);

            await timingClipsRef.set({
              timingPointName: checkpointId,
              timingIndex: timingIndex,
              clipUrl: clipUrl,
              participantId: participantId,
              raceId: raceId,
              eventId: eventId,
              streamId: streamId,
              timestamp: timestamp,
              generatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`✅ ClipUrl guardado en timing point: ${checkpointId}`);
          }
        }
      } else {
        console.log(`⚠️ No se encontró el evento ${eventId} en ninguna estructura`);
      }
    } catch (splitError) {
      console.error(`⚠️ Error guardando clipUrl en split/location:`, splitError);
    }

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

// 🔥 Configurar rutas de upload (MIGRADAS)
router.use("/", uploadStoryRouter);
router.use("/", uploadMediaRouter);
router.use("/", uploadRouter);

// 🔥 Importar gestores de WebSocket de Copernico
import copernicoSubscriptionManager from '../websocket/copernicoSubscriptionManager.mjs';
import copernicoWebSocketClient from '../websocket/copernicoWebSocketClient.mjs';
import copernicoMonitor from '../websocket/copernicoMonitor.mjs';

// ========================================
// ENDPOINTS COPERNICO WEBSOCKET
// ========================================

/**
 * @openapi
 * /api/copernico/subscribe:
 *   post:
 *     summary: Suscribirse a actualizaciones de atletas de Copernico
 *     description: Establece una suscripción WebSocket para recibir actualizaciones en tiempo real de atletas específicos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera en Copernico
 *               participantIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Lista de IDs de participantes (opcional, si no se especifica se suscribe a todos)
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *             required:
 *               - raceId
 *               - apiKey
 *     responses:
 *       '200':
 *         description: Suscripción establecida correctamente.
 *       '401':
 *         description: API key inválida.
 *       '400':
 *         description: Parámetros faltantes.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/copernico/subscribe", async (req, res) => {
  try {
    console.log("🎯 [Copernico] Solicitud de suscripción:", JSON.stringify(req.body, null, 2));

    const { raceId, participantIds, apiKey } = req.body;

    // Validaciones básicas
    if (!raceId || !apiKey) {
      console.error("❌ [Copernico] Parámetros requeridos faltantes");
      return res.status(400).json({
        error: "Parámetros requeridos faltantes",
        required: ["raceId", "apiKey"],
        received: { raceId: !!raceId, apiKey: !!apiKey }
      });
    }

    // Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || 'MISSING_WEBHOOK_API_KEY';
    if (apiKey !== expectedApiKey) {
      console.error("❌ [Copernico] API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }

    // Establecer suscripción
    const result = await copernicoSubscriptionManager.subscribeToRace(raceId, participantIds);

    console.log("✅ [Copernico] Suscripción establecida:", result);

    res.status(200).json({
      success: true,
      message: "Suscripción establecida correctamente",
      data: result
    });

  } catch (error) {
    console.error("❌ [Copernico] Error en suscripción:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/copernico/unsubscribe:
 *   post:
 *     summary: Desuscribirse de actualizaciones de una carrera
 *     description: Cancela la suscripción WebSocket para una carrera específica.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *             required:
 *               - raceId
 *               - apiKey
 *     responses:
 *       '200':
 *         description: Desuscripción exitosa.
 *       '401':
 *         description: API key inválida.
 *       '400':
 *         description: Parámetros faltantes.
 */
router.post("/copernico/unsubscribe", async (req, res) => {
  try {
    console.log("🛑 [Copernico] Solicitud de desuscripción:", JSON.stringify(req.body, null, 2));

    const { raceId, apiKey } = req.body;

    // Validaciones básicas
    if (!raceId || !apiKey) {
      return res.status(400).json({
        error: "Parámetros requeridos faltantes",
        required: ["raceId", "apiKey"]
      });
    }

    // Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || 'MISSING_WEBHOOK_API_KEY';
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({ error: "API key inválida" });
    }

    // Desuscribirse
    copernicoSubscriptionManager.unsubscribeFromRace(raceId);

    console.log("✅ [Copernico] Desuscripción exitosa");

    res.status(200).json({
      success: true,
      message: "Desuscripción exitosa"
    });

  } catch (error) {
    console.error("❌ [Copernico] Error en desuscripción:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/copernico/status:
 *   get:
 *     summary: Obtener estado de las conexiones WebSocket de Copernico
 *     description: Devuelve información sobre el estado actual de las conexiones y suscripciones.
 *     responses:
 *       '200':
 *         description: Estado obtenido correctamente.
 */
router.get("/copernico/status", async (req, res) => {
  try {
    const status = copernicoSubscriptionManager.getSubscriptionStatus();

    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error("❌ [Copernico] Error obteniendo estado:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/copernico/test-connection:
 *   post:
 *     summary: Probar conexión WebSocket con Copernico
 *     description: Endpoint para testing que establece una conexión temporal y verifica el funcionamiento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: ID de la carrera para probar
 *               environment:
 *                 type: string
 *                 enum: [dev, pro, alpha, demo]
 *                 description: Ambiente de Copernico a usar
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *             required:
 *               - raceId
 *               - apiKey
 *     responses:
 *       '200':
 *         description: Prueba de conexión exitosa.
 *       '401':
 *         description: API key inválida.
 *       '400':
 *         description: Parámetros faltantes.
 *       '500':
 *         description: Error en la conexión.
 */
router.post("/copernico/test-connection", async (req, res) => {
  try {
    console.log("🧪 [Copernico] Prueba de conexión:", JSON.stringify(req.body, null, 2));

    const { raceId, environment, apiKey } = req.body;

    // Validaciones básicas
    if (!raceId || !apiKey) {
      return res.status(400).json({
        error: "Parámetros requeridos faltantes",
        required: ["raceId", "apiKey"]
      });
    }

    // Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || 'MISSING_WEBHOOK_API_KEY';
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({ error: "API key inválida" });
    }

    // Cambiar ambiente si se especifica
    if (environment && ['dev', 'pro', 'alpha', 'demo'].includes(environment)) {
      copernicoWebSocketClient.config.env = environment;
      console.log(`🔧 [Copernico] Ambiente cambiado a: ${environment}`);
    }

    // Intentar conexión
    const connectionResult = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout de conexión (10 segundos)'));
      }, 10000);

      try {
        copernicoWebSocketClient.connect(raceId);

        // Esperar a que se establezca la conexión
        const checkConnection = setInterval(() => {
          if (copernicoWebSocketClient.isConnected) {
            clearInterval(checkConnection);
            clearTimeout(timeout);
            resolve({
              connected: true,
              raceId,
              environment: copernicoWebSocketClient.config.env,
              socketUrl: copernicoWebSocketClient.config[copernicoWebSocketClient.config.env].socket
            });
          }
        }, 500);

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    console.log("✅ [Copernico] Prueba de conexión exitosa:", connectionResult);

    res.status(200).json({
      success: true,
      message: "Conexión establecida correctamente",
      data: connectionResult
    });

  } catch (error) {
    console.error("❌ [Copernico] Error en prueba de conexión:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/copernico/metrics:
 *   get:
 *     summary: Obtener métricas de monitoreo del WebSocket de Copernico
 *     description: Devuelve métricas detalladas sobre conexiones, mensajes y alertas.
 *     responses:
 *       '200':
 *         description: Métricas obtenidas correctamente.
 */
router.get("/copernico/metrics", async (req, res) => {
  try {
    const metrics = copernicoMonitor.getMetrics();
    const recentAlerts = copernicoMonitor.getRecentAlerts(10);

    res.status(200).json({
      success: true,
      data: {
        metrics,
        recentAlerts,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("❌ [Copernico] Error obteniendo métricas:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @openapi
 * /api/copernico/reset-metrics:
 *   post:
 *     summary: Resetear métricas de monitoreo
 *     description: Reinicia todas las métricas y alertas del sistema de monitoreo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: API key para autenticación
 *             required:
 *               - apiKey
 *     responses:
 *       '200':
 *         description: Métricas reseteadas correctamente.
 *       '401':
 *         description: API key inválida.
 */
router.post("/copernico/reset-metrics", async (req, res) => {
  try {
    const { apiKey } = req.body;

    // Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || 'MISSING_WEBHOOK_API_KEY';
    if (!apiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({ error: "API key inválida" });
    }

    copernicoMonitor.resetMetrics();

    res.status(200).json({
      success: true,
      message: "Métricas reseteadas correctamente"
    });

  } catch (error) {
    console.error("❌ [Copernico] Error reseteando métricas:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
          storyType = "ATHLETE_STARTED";
        } else if (checkpoint.name === "FINISH") {
          storyType = "ATHLETE_FINISHED";
        } else {
          storyType = "ATHLETE_CROSSED_TIMING_SPLIT";
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

/**
 * @openapi
 * /api/media:
 *   get:
 *     summary: Obtener media de apps con filtros
 *     description: >
 *       Obtiene media desde la estructura races/apps/media con filtros por race, app y tipo.
 *       Siempre requiere raceId como filtro base.
 *     parameters:
 *       - in: query
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera (obligatorio)
 *         example: "race-001-madrid-marathon"
 *       - in: query
 *         name: appId
 *         schema:
 *           type: string
 *         description: ID de la aplicación (opcional, filtra por app específica)
 *         example: "RtME2RACih6YxgrlmuQR"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: ["sponsors", "logos", "videos", "images", "posters"]
 *         description: Tipo de media (opcional)
 *         example: "sponsors"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: ["promotional", "event", "participant", "branding"]
 *         description: Categoría de media (opcional)
 *         example: "promotional"
 *       - in: query
 *         name: group
 *         schema:
 *           type: string
 *         description: Grupo de media (opcional)
 *         example: "sponsors"
 *     responses:
 *       '200':
 *         description: Media obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 media:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 filters:
 *                   type: object
 *       '400':
 *         description: Parámetros faltantes (raceId es obligatorio)
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/media", async (req, res) => {
  try {
    const { raceId, appId, type, category, group } = req.query;

    // raceId es obligatorio
    if (!raceId) {
      return res.status(400).json({
        error: "El parámetro raceId es obligatorio",
        required: ["raceId"],
        optional: ["appId", "type", "category", "group"]
      });
    }

    console.log(`🎬 [getMedia] Obteniendo media - Race: ${raceId}${appId ? `, App: ${appId}` : ' (todas las apps)'}`);

    const db = admin.firestore();
    let allMedia = [];

    if (appId) {
      // Filtro específico por app
      console.log(`🔍 [getMedia] Buscando en app específica: ${appId}`);

      let mediaQuery = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('media');

      // Aplicar filtros adicionales
      if (type) {
        mediaQuery = mediaQuery.where('type', '==', type);
      }
      if (category) {
        mediaQuery = mediaQuery.where('category', '==', category);
      }
      if (group) {
        mediaQuery = mediaQuery.where('groupName', '==', group);
      }

      mediaQuery = mediaQuery.orderBy('createdAt', 'desc');

      const mediaSnapshot = await mediaQuery.get();
      allMedia = mediaSnapshot.docs.map(doc => ({
        mediaId: doc.id,
        raceId,
        appId,
        ...doc.data()
      }));

    } else {
      // Buscar en todas las apps de la race
      console.log(`🔍 [getMedia] Buscando en todas las apps de la race: ${raceId}`);

      const appsSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').get();

      for (const appDoc of appsSnapshot.docs) {
        const currentAppId = appDoc.id;

        let mediaQuery = db.collection('races').doc(raceId)
          .collection('apps').doc(currentAppId)
          .collection('media');

        // Aplicar filtros adicionales
        if (type) {
          mediaQuery = mediaQuery.where('type', '==', type);
        }
        if (category) {
          mediaQuery = mediaQuery.where('category', '==', category);
        }
        if (group) {
          mediaQuery = mediaQuery.where('groupName', '==', group);
        }

        mediaQuery = mediaQuery.orderBy('createdAt', 'desc');

        const mediaSnapshot = await mediaQuery.get();
        const appMedia = mediaSnapshot.docs.map(doc => ({
          mediaId: doc.id,
          raceId,
          appId: currentAppId,
          ...doc.data()
        }));

        allMedia.push(...appMedia);
      }
    }

    console.log(`✅ [getMedia] Encontrados ${allMedia.length} elementos de media`);

    return res.status(200).json({
      media: allMedia,
      total: allMedia.length,
      filters: { raceId, appId, type, category, group },
      summary: {
        byType: allMedia.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {}),
        byCategory: allMedia.reduce((acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {}),
        byGroup: allMedia.reduce((acc, item) => {
          acc[item.groupName] = (acc[item.groupName] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error("❌ [getMedia] Error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @openapi
 * /api/races/{raceId}/apps/{appId}/events_splits:
 *   get:
 *     summary: Get Race with Events and Status
 *     description: Retorna la información completa de una carrera específica, incluyendo todos sus eventos con splits y estados actuales.
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la carrera
 *       - in: path
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la aplicación
 *     responses:
 *       '200':
 *         description: Información completa de la carrera con eventos y splits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     race:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         timezone:
 *                           type: string
 *                         company:
 *                           type: string
 *                         idRace:
 *                           type: string
 *                     app:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           type:
 *                             type: string
 *                           distance:
 *                             type: number
 *                           startTime:
 *                             type: string
 *                           athletes:
 *                             type: number
 *                           company:
 *                             type: string
 *                           idRace:
 *                             type: string
 *                           status:
 *                             type: object
 *                             properties:
 *                               finished:
 *                                 type: boolean
 *                               wavesStarted:
 *                                 type: boolean
 *                               state:
 *                                 type: string
 *                                 enum: [NOT_STARTED, IN_PROGRESS, FINISHED]
 *                           waves:
 *                             type: array
 *                           splits:
 *                             type: array
 *                           categories:
 *                             type: array
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalEvents:
 *                           type: number
 *                         eventsNotStarted:
 *                           type: number
 *                         eventsInProgress:
 *                           type: number
 *                         eventsFinished:
 *                           type: number
 *                         totalSplits:
 *                           type: number
 *                         totalAthletes:
 *                           type: number
 *       '404':
 *         description: Carrera o aplicación no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                     message:
 *                       type: string
 *       '500':
 *         description: Error interno del servidor
 */
router.get("/races/:raceId/apps/:appId/events_splits", async (req, res) => {
  try {
    const { raceId, appId } = req.params;

    console.log(`🏁 [getRaceEventsWithSplits] Obteniendo race: ${raceId}, app: ${appId}`);

    const db = admin.firestore();

    // 1. Obtener datos de la carrera
    const raceDoc = await db.collection('races').doc(raceId).get();
    if (!raceDoc.exists) {
      return res.status(404).json({
        success: false,
        error: {
          code: "RACE_NOT_FOUND",
          message: `Race with ID ${raceId} not found`
        }
      });
    }

    const raceData = raceDoc.data();
    console.log(`✅ [getRaceEventsWithSplits] Race encontrada: ${raceData.name || 'Sin nombre'}`);

    // 2. Obtener datos de la app
    const appDoc = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId).get();

    if (!appDoc.exists) {
      return res.status(404).json({
        success: false,
        error: {
          code: "APP_NOT_FOUND",
          message: `App with ID ${appId} not found in race ${raceId}`
        }
      });
    }

    const appData = appDoc.data();
    console.log(`✅ [getRaceEventsWithSplits] App encontrada: ${appData.name || 'Sin nombre'}`);

    // 3. Obtener todos los eventos de esta app en esta race
    const eventsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').get();

    console.log(`📊 [getRaceEventsWithSplits] Eventos encontrados: ${eventsSnapshot.size}`);

    // 4. Procesar cada evento
    const events = [];
    let totalSplits = 0;
    let totalAthletes = 0;
    let eventsNotStarted = 0;
    let eventsInProgress = 0;
    let eventsFinished = 0;

    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();
      const eventInfo = eventData.event_info || {};
      const copernicoData = eventData.copernico_data || {};

      // Extraer splits de copernico_data
      const splits = copernicoData.splits || [];
      totalSplits += splits.length;

      // Extraer waves de copernico_data
      const waves = copernicoData.waves || [];

      // Extraer categories de copernico_data
      const categories = copernicoData.categories || [];

      // Calcular estado del evento
      const finished = copernicoData.finished || false;
      const wavesStarted = copernicoData.wavesStarted || false;

      let state = "NOT_STARTED";
      if (finished) {
        state = "FINISHED";
        eventsFinished++;
      } else if (wavesStarted) {
        state = "IN_PROGRESS";
        eventsInProgress++;
      } else {
        eventsNotStarted++;
      }

      // Contar atletas (si está disponible)
      const athletes = eventInfo.athletes || copernicoData.athletes || 0;
      totalAthletes += athletes;

      // Construir objeto del evento
      const eventObj = {
        id: eventDoc.id,
        name: eventInfo.name || eventDoc.id,
        type: eventInfo.type || "standard",
        distance: eventInfo.distance || copernicoData.distance || 0,
        startTime: eventInfo.startTime || copernicoData.startTime || null,
        athletes: athletes,
        company: raceData.company || eventInfo.company || "cronochip",
        idRace: raceData.idRace || raceData.id || raceId,
        status: {
          finished: finished,
          wavesStarted: wavesStarted,
          state: state
        },
        waves: waves.map(wave => ({
          name: wave.name || "Salida",
          startTime: wave.startTime || null,
          started: wave.started || false
        })),
        splits: splits.map((split, index) => ({
          name: split.name || `Split ${index + 1}`,
          distance: split.distance || 0,
          type: split.type || "standard",
          physicalLocation: split.physicalLocation || split.name || `Split ${index + 1}`,
          order: split.order || index + 1
        })),
        categories: categories.map(category => ({
          name: category.name || "General",
          gender: category.gender || "mixed",
          isAgeBased: category.isAgeBased || false,
          from: category.from || null,
          to: category.to || null
        }))
      };

      events.push(eventObj);
    }

    // 5. Construir respuesta
    const response = {
      success: true,
      data: {
        race: {
          id: raceDoc.id,
          name: raceData.name || "Sin nombre",
          timezone: raceData.timezone || "UTC",
          company: raceData.company || "cronochip",
          idRace: raceData.idRace || raceData.id || raceId
        },
        app: {
          id: appDoc.id,
          name: appData.name || "Sin nombre"
        },
        events: events,
        summary: {
          totalEvents: events.length,
          eventsNotStarted: eventsNotStarted,
          eventsInProgress: eventsInProgress,
          eventsFinished: eventsFinished,
          totalSplits: totalSplits,
          totalAthletes: totalAthletes
        }
      }
    };

    console.log(`✅ [getRaceEventsWithSplits] Respuesta generada: ${events.length} eventos, ${totalSplits} splits`);

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ [getRaceEventsWithSplits] Error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno del servidor"
      }
    });
  }
});

// Debug endpoint para ver usuarios con tokens FCM
router.get('/debug/users-with-tokens', async (req, res) => {
  try {
    const db = admin.firestore();

    // Obtener usuarios con tokens FCM
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .limit(10)
      .get();

    const users = [];
    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        email: userData.email || userData.profile?.email || 'Sin email',
        name: userData.name || userData.profile?.name || userData.displayName || 'Sin nombre',
        fcmToken: userData.fcmToken ? `${userData.fcmToken.substring(0, 20)}...` : null,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin || userData.lastActiveAt
      });
    });

    res.json({
      success: true,
      totalUsers: users.length,
      users: users
    });

  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🎯 ENDPOINTS PARA CONSULTAR SPLITS CON CLIPS DE PARTICIPANTES
 */

/**
 * @swagger
 * /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips:
 *   get:
 *     summary: Obtener splits donde el participante tiene clips
 *     tags: [Clips]
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la app (requerido)
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Incluir detalles de clips
 *     responses:
 *       200:
 *         description: Splits con clips obtenidos correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 participantId:
 *                   type: string
 *                 totalSplits:
 *                   type: number
 *                 totalClips:
 *                   type: number
 *                 splitsWithClips:
 *                   type: array
 *                   items:
 *                     type: string
 *                 detailedSplits:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips', async (req, res) => {
  const { raceId, eventId, participantId } = req.params;
  const { appId, detailed = 'false' } = req.query;

  try {
    console.log(`🎯 [API] Consultando splits con clips para participante: ${participantId}`);

    // Obtener referencia a Firestore
    const db = admin.firestore();

    // Validar que appId sea requerido
    if (!appId) {
      return res.status(400).json({
        success: false,
        error: "appId es requerido",
        message: "El parámetro appId es obligatorio para esta consulta"
      });
    }

    // Estructura nueva: /races/{raceId}/apps/{appId}/events/{eventId}/split-clips
    const splitClipsRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("split-clips");

    // Consultar clips del participante
    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .orderBy("splitIndex", "asc")
      .get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        participantId: participantId,
        totalSplits: 0,
        totalClips: 0,
        splitsWithClips: [],
        message: "No se encontraron clips para este participante"
      });
    }

    // Procesar resultados
    const splitsMap = new Map();
    let totalClips = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      totalClips++;

      if (!splitsMap.has(splitName)) {
        splitsMap.set(splitName, {
          splitName: splitName,
          splitIndex: data.splitIndex,
          clipCount: 1,
          clips: [{
            id: doc.id,
            clipUrl: data.clipUrl,
            timestamp: data.timestamp,
            generatedAt: data.generatedAt?.toDate()
          }]
        });
      } else {
        const existingSplit = splitsMap.get(splitName);
        existingSplit.clipCount++;
        existingSplit.clips.push({
          id: doc.id,
          clipUrl: data.clipUrl,
          timestamp: data.timestamp,
          generatedAt: data.generatedAt?.toDate()
        });
      }
    });

    // Convertir a array y ordenar
    const splits = Array.from(splitsMap.values())
      .sort((a, b) => a.splitIndex - b.splitIndex);

    // Respuesta según el nivel de detalle solicitado
    if (detailed === 'true') {
      // Respuesta detallada con todos los clips
      res.json({
        success: true,
        participantId: participantId,
        totalSplits: splits.length,
        totalClips: totalClips,
        splitsWithClips: splits.map(split => split.splitName),
        detailedSplits: splits
      });
    } else {
      // Respuesta simple solo con nombres de splits
      res.json({
        success: true,
        participantId: participantId,
        totalSplits: splits.length,
        totalClips: totalClips,
        splitsWithClips: splits.map(split => split.splitName)
      });
    }

    console.log(`✅ [API] Encontrados ${splits.length} splits con clips para ${participantId}`);

  } catch (error) {
    console.error("💥 [API] Error consultando splits del participante:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/races/{raceId}/events/{eventId}/participants/{participantId}/splits-with-clips/summary:
 *   get:
 *     summary: Obtener lista simple de splits donde el participante tiene clips
 *     tags: [Clips]
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: appId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la app (requerido)
 *     responses:
 *       200:
 *         description: Lista de splits obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 participantId:
 *                   type: string
 *                 totalSplits:
 *                   type: number
 *                 splitsWithClips:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips/summary', async (req, res) => {
  const { raceId, eventId, participantId } = req.params;
  const { appId } = req.query;

  try {
    console.log(`📋 [API] Obteniendo resumen de splits para participante: ${participantId}`);

    // Obtener referencia a Firestore
    const db = admin.firestore();

    // Validar que appId sea requerido
    if (!appId) {
      return res.status(400).json({
        success: false,
        error: "appId es requerido",
        message: "El parámetro appId es obligatorio para esta consulta"
      });
    }

    // Estructura nueva: /races/{raceId}/apps/{appId}/events/{eventId}/split-clips
    const splitClipsRef = db.collection("races").doc(raceId)
      .collection("apps").doc(appId)
      .collection("events").doc(eventId)
      .collection("split-clips");

    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .get();

    const splitNames = new Set();
    snapshot.forEach(doc => {
      splitNames.add(doc.data().splitName);
    });

    const splitsArray = Array.from(splitNames).sort();

    res.json({
      success: true,
      participantId: participantId,
      totalSplits: splitsArray.length,
      splitsWithClips: splitsArray
    });

    console.log(`✅ [API] Resumen: ${splitsArray.length} splits con clips para ${participantId}`);

  } catch (error) {
    console.error("💥 [API] Error obteniendo resumen de splits:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

export default router;
