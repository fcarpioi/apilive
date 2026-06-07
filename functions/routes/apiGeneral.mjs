// apiGeneral.mjs
import express from "express";
//import cors from "cors";
import admin from "firebase-admin";
import fetch from "node-fetch";
import crypto from "crypto";
import {onDocumentCreated} from "firebase-functions/v2/firestore";

/**
 * Función para normalizar encoding UTF-8 en objetos
 */
import {normalizeUTF8InObject} from "../modules/utils/normalizeUTF8InObject.mjs";
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
// 🔥 Importar gestores de WebSocket de Copernico
import copernicoSubscriptionManager from '../websocket/copernicoSubscriptionManager.mjs';
import copernicoWebSocketClient from '../websocket/copernicoWebSocketClient.mjs';
import copernicoMonitor from '../websocket/copernicoMonitor.mjs';
import {pickParticipantRanking} from "../modules/participants/pickParticipantRanking.mjs";
import {normalizePositionsFromRanking} from "../modules/participants/normalizePositionsFromRanking.mjs";
import {getPositionByType} from "../modules/participants/getPositionByType.mjs";
import {buildParticipantName} from "../modules/participants/buildParticipantName.mjs";
import {normalizeGender} from "../modules/participants/normalizeGender.mjs";
import {getCompetitionStreams} from "../modules/competitions/getCompetitionStreams.mjs";
import {createAutomaticStory} from "../modules/stories/createAutomaticStory.mjs";
import {generateStoryVideoClip} from "../modules/stories/generateStoryVideoClip.mjs";
import {createSplitClipsFromStory} from "../modules/stories/createSplitClipsFromStory.mjs";
import {sendStoryNotificationToFollowers} from "../modules/notifications/sendStoryNotificationToFollowers.mjs";
import {processCheckpointInBackgroundV3} from "../modules/process/processCheckpointInBackgroundV3.mjs";
import {generateVideoClip} from "../modules/videos/generateVideoClip.mjs";
import {generateAutomaticStoryForCheckpoint} from "../modules/stories/generateAutomaticStoryForCheckpoint.mjs";
import {recoverRaceData} from "../modules/db/recoverRaceData.mjs";
import {
  requireFields,
  sendError,
  extractApiKey,
  hasValidApiKey,
  buildAppRef,
  buildEventRef,
  buildParticipantRef,
  buildStoryRef,
  ensureParticipantExists,
  ensureStoryExists,
  resolveParticipantWithLegacyFallback
} from "../modules/routes/apiRouteHelpers.mjs";

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}  
//router.use(cors({ origin: true }));
const router = express.Router();

const eventResolutionCache = new Map();
const EVENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CHECKPOINT_JOB_CHUNK_SIZE = 100;

router.use(express.json({ limit: "50mb" }));
router.use(express.urlencoded({ limit: "50mb", extended: true }));

function sanitizeForFirestoreValue(value, parentIsArray = false) {
  if (value === undefined || value === null) return null;

  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value;

  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const cleanedArray = value
      .map(item => sanitizeForFirestoreValue(item, true))
      .filter(item => item !== undefined);

    // Firestore no permite arrays directamente anidados dentro de arrays.
    if (parentIsArray) {
      return { items: cleanedArray };
    }
    return cleanedArray;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        return value.toDate();
      } catch (_error) {
        return null;
      }
    }

    if (value instanceof Map) {
      const objFromMap = Object.fromEntries(value.entries());
      return sanitizeForFirestoreValue(objFromMap, parentIsArray);
    }

    if (value instanceof Set) {
      return sanitizeForFirestoreValue(Array.from(value.values()), parentIsArray);
    }

    const cleaned = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (!key) continue;
      if (/^__.*__$/.test(key)) continue;
      const cleanedValue = sanitizeForFirestoreValue(nestedValue, false);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }

  return null;
}

function buildCopernicoEventForStorage(eventData = {}) {
  const safeEvent = {
    id: eventData?.id || null,
    event: eventData?.event || null,
    name: eventData?.name || null,
    type: eventData?.type || null,
    finished: Boolean(eventData?.finished ?? eventData?.status?.finished ?? false),
    status: sanitizeForFirestoreValue(eventData?.status || null),
    distance: eventData?.distance ?? null,
    startTime: eventData?.startTime || null,
    athletes: eventData?.athletes ?? null,
    waves: Array.isArray(eventData?.waves) ? sanitizeForFirestoreValue(eventData.waves) : [],
    splits: Array.isArray(eventData?.splits) ? sanitizeForFirestoreValue(eventData.splits) : [],
    categories: Array.isArray(eventData?.categories) ? sanitizeForFirestoreValue(eventData.categories) : [],
    locations: Array.isArray(eventData?.locations) ? sanitizeForFirestoreValue(eventData.locations) : [],
    maps: sanitizeForFirestoreValue(eventData?.maps ?? eventData?.map ?? [])
  };

  return sanitizeForFirestoreValue(safeEvent) || {};
}

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

    const {raceData, copernicoEnv, raceDoc, raceSlug} = await recoverRaceData(db, raceId);

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

      const finished = (
        eventData?.finished ??
        eventData?.copernico_data?.finished ??
        matchingEvent?.finished ??
        matchingEvent?.status?.finished ??
        false
      );

      const publishedRankings = buildPublishedRankings(matchingEvent || {});
      const eventMaps = matchingEvent?.maps ?? matchingEvent?.map ?? [];
      return {
        eventId: eventId,
        ...eventData,
        finished,
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
 *       - in: query
 *         name: raceId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filtra el conteo por carrera.
 *       - in: query
 *         name: appId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filtra el conteo por app.
 *       - in: query
 *         name: eventId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filtra el conteo por evento.
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
router.post("/follow-v3", async (req, res) => {
  try {
    let { followerId, followingId, raceId, appId, eventId, eventStatus } = req.body;
    const missingRequired = requireFields(req.body, ["followerId", "followingId", "raceId", "appId", "eventId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "followerId, followingId, raceId, appId y eventId son obligatorios.", {
        message: "followerId, followingId, raceId, appId y eventId son obligatorios.",
        required: ["followerId", "followingId", "raceId", "appId", "eventId"],
        missing: missingRequired
      });
    }

    eventId = normalizeUTF8InObject(eventId);
    const db = admin.firestore();

    const participantRef = buildParticipantRef(db, {
      raceId,
      appId,
      eventId,
      participantId: followingId
    });

    let participantDoc = await participantRef.get();
    let resolvedExternalId = followingId;
    let participantData = null;
    let transformedData = null;

    if (participantDoc.exists) {
      const existingData = participantDoc.data() || {};
      resolvedExternalId = existingData.externalId || followingId;
      participantData = existingData;
    } else {

      const {raceSlug, raceDoc, raceData, copernicoEnv} = await recoverRaceData(db, raceId);

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
      return sendError(res, 400, "Ya sigues a este participante.", { message: "Ya sigues a este participante." });
    }

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

    setImmediate(async () => {
      try {
        const normalizedStatus = String(eventStatus || "").trim().toLowerCase();
        if (normalizedStatus !== "in progress") {
          return;
        }

        let effectiveTransformed = transformedData;
        if (!effectiveTransformed) {
          const {raceSlug, raceDoc, raceData, copernicoEnv} = await recoverRaceData(db, raceId);

          try {
            const copernicoData = await copernicoService.getParticipantData(raceSlug, resolvedExternalId, copernicoEnv);
            effectiveTransformed = copernicoService.transformCopernicoData(copernicoData);
          } catch (copernicoError) {
            console.warn("No se pudo obtener tiempos desde Copernico:", copernicoError.message);
            return;
          }
        }

        const normalizeKey = (value) => String(value || '').trim().toLowerCase();
        const times = effectiveTransformed.times || {};
        const timeEntries = Object.entries(times);
        if (timeEntries.length === 0) {
          console.log(`ℹ️ [FOLLOW v3] Sin tiempos disponibles; no se generan historias`);
          return;
        }

        const rawLastSplitSeen =
          effectiveTransformed?.participant?.lastSplitSeen ||
          effectiveTransformed?.rawData?.events?.[0]?.last_split_seen ||
          effectiveTransformed?.rawData?.events?.[0]?.lastSplitSeen ||
          null;

        let lastSplitKey = null;
        if (rawLastSplitSeen) {
          const lastNorm = normalizeKey(rawLastSplitSeen);
          const match = timeEntries.find(([pointName]) => normalizeKey(pointName) === lastNorm);
          if (match) {
            lastSplitKey = match[0];
          }
        }

        const entriesWithOrder = timeEntries.map(([pointName, timeData], index) => {
          const orderValue = Number.isFinite(Number(timeData?.order))
            ? Number(timeData.order)
            : (Number.isFinite(Number(timeData?.distance)) ? Number(timeData.distance) : index);
          return { pointName, timeData, orderValue };
        });

        let maxOrder = null;
        if (lastSplitKey) {
          const match = entriesWithOrder.find(entry => entry.pointName === lastSplitKey);
          if (match) {
            maxOrder = match.orderValue;
          }
        }

        const filteredEntries = entriesWithOrder.filter(entry => {
          const timeData = entry.timeData || {};
          const hasTime = Boolean(timeData.raw?.rawTime || timeData.rawTime || timeData.time || timeData.netTime);
          if (!hasTime) return false;
          if (maxOrder !== null) {
            return entry.orderValue <= maxOrder;
          }
          return true;
        });

        if (filteredEntries.length === 0) {
          console.log(`ℹ️ [FOLLOW v3] No hay splits válidos para generar historias`);
          return;
        }

        const location = { raceId, appId, eventId };
        let streamsResult = { success: false, streamMap: null };
        let videoSplits = null;
        let splitKeys = [];
        let hasEnabledSplit = false;
        try {
          const eventDoc = await buildEventRef(db, { raceId, appId, eventId }).get();
          videoSplits = eventDoc.exists ? eventDoc.data()?.videoSplits : null;
          splitKeys = videoSplits ? Object.keys(videoSplits) : [];
          hasEnabledSplit = splitKeys.some(key => videoSplits?.[key]?.status === true);
          if (hasEnabledSplit) {
            streamsResult = await getCompetitionStreams(raceId);
          } else {
            console.log(`🎬 [FOLLOW v3] Sin splits habilitados; no se consultan streams`);
          }
        } catch (streamError) {
          console.error("❌ [FOLLOW v3] Error obteniendo streams:", streamError.message);
        }

        for (const entry of filteredEntries) {
          const pointName = entry.pointName;
          const timeData = entry.timeData || {};
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
          const pointMatch = pointKey ? splitKeys.find(key => key.toLowerCase() === pointKey.toLowerCase()) : null;
          const matchedKey = pointMatch || null;
          const splitStatus = matchedKey ? videoSplits?.[matchedKey]?.status : undefined;
          const allowClipGeneration = Boolean(videoSplits && splitKeys.length > 0 && splitStatus === true);

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
        console.error("Error creando historias en follow-v3:", error);
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
    const missingRequired = requireFields(req.body, ["followerId", "followingId", "raceId", "appId", "eventId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "followerId, followingId, raceId, appId y eventId son obligatorios.", {
        message: "followerId, followingId, raceId, appId y eventId son obligatorios.",
        required: ["followerId", "followingId", "raceId", "appId", "eventId"],
        missing: missingRequired
      });
    }

    // Normalizar eventId para evitar problemas de encoding
    eventId = normalizeUTF8InObject(eventId);

    const db = admin.firestore();

    // 🆕 NUEVA ESTRUCTURA: Solo buscar en estructura con appId
    console.log(`🔍 [UNFOLLOW] Buscando participante: races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`);
    const participantRef = buildParticipantRef(db, {
      raceId,
      appId,
      eventId,
      participantId: followingId
    });

    const participantCheck = await ensureParticipantExists(res, participantRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${followingId}`
    });
    if (!participantCheck.exists) {
      return participantCheck.response;
    }

    // Referencias a los documentos de seguimiento
    const followingsRef = db.collection("users").doc(followerId).collection("followings").doc(followingId);
    const followersRef = participantRef.collection("followers").doc(followerId);

    // Verificar que se está siguiendo al participante
    const currentlyFollowing = await followingsRef.get();
    if (!currentlyFollowing.exists) {
      return sendError(res, 400, "No estás siguiendo a este participante.", { message: "No estás siguiendo a este participante." });
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
    const missingRequired = requireFields(req.body, ["raceId", "appId", "eventId", "participantId", "storyId", "userId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId, appId, eventId, participantId, storyId y userId son obligatorios.", {
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios.",
        required: ["raceId", "appId", "eventId", "participantId", "storyId", "userId"],
        missing: missingRequired
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants/stories
    const storyRef = buildStoryRef(db, { raceId, appId, eventId, participantId, storyId });

    const storyCheck = await ensureStoryExists(res, storyRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
    });
    if (!storyCheck.exists) {
      return storyCheck.response;
    }

    // Verificar si el usuario ya dio like a esta historia
    const existingLike = await storyRef.collection("likes")
      .where("userId", "==", userId)
      .get();

    if (!existingLike.empty) {
      return sendError(res, 400, "El usuario ya dio like a esta historia.", {
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

    const missingRequired = requireFields(req.query, ["raceId", "appId", "eventId", "participantId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId, appId, eventId y participantId son obligatorios.", {
        message: "raceId, appId, eventId y participantId son obligatorios.",
        required: ["raceId", "appId", "eventId", "participantId"],
        missing: missingRequired
      });
    }

    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants
    const participantRef = buildParticipantRef(db, { raceId, appId, eventId, participantId });

    const participantCheck = await ensureParticipantExists(res, participantRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`
    });
    if (!participantCheck.exists) {
      return participantCheck.response;
    }

    let totalShares = 0;
    let sharesByType = { social_media: 0, direct_message: 0, copy_link: 0, other: 0 };
    let sharesByPlatform = {};

    if (storyId) {
      // Contar comparticiones de una historia específica
      const storyRef = participantRef.collection("stories").doc(storyId);
      const storyCheck = await ensureStoryExists(res, storyRef, {
        path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
      });
      if (!storyCheck.exists) {
        return storyCheck.response;
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
    const missingRequired = requireFields(req.query, ["raceId", "appId", "eventId", "participantId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId, appId, eventId y participantId son obligatorios.", {
        message: "raceId, appId, eventId y participantId son obligatorios.",
        required: ["raceId", "appId", "eventId", "participantId"],
        missing: missingRequired
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants
    const participantRef = buildParticipantRef(db, { raceId, appId, eventId, participantId });

    const participantCheck = await ensureParticipantExists(res, participantRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`
    });
    if (!participantCheck.exists) {
      return participantCheck.response;
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
    const missingRequired = requireFields(req.body, ["raceId", "appId", "eventId", "participantId", "storyId", "userId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId, appId, eventId, participantId, storyId y userId son obligatorios.", {
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios.",
        required: ["raceId", "appId", "eventId", "participantId", "storyId", "userId"],
        missing: missingRequired
      });
    }
    const db = admin.firestore();

    // Usar la estructura correcta: races/apps/events/participants/stories
    const storyRef = buildStoryRef(db, { raceId, appId, eventId, participantId, storyId });

    const storyCheck = await ensureStoryExists(res, storyRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
    });
    if (!storyCheck.exists) {
      return storyCheck.response;
    }

    // Buscar el like del usuario
    const existingLike = await storyRef.collection("likes")
      .where("userId", "==", userId)
      .get();

    if (existingLike.empty) {
      return sendError(res, 400, "El usuario no había dado like a esta historia.", {
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
    const missingRequired = requireFields(req.body, ["raceId", "appId", "eventId", "participantId", "storyId", "userId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId, appId, eventId, participantId, storyId y userId son obligatorios.", {
        message: "raceId, appId, eventId, participantId, storyId y userId son obligatorios.",
        required: ["raceId", "appId", "eventId", "participantId", "storyId", "userId"],
        missing: missingRequired
      });
    }

    const db = admin.firestore();

    // Verificar que la historia existe
    const storyRef = buildStoryRef(db, { raceId, appId, eventId, participantId, storyId });

    const storyCheck = await ensureStoryExists(res, storyRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
    });
    if (!storyCheck.exists) {
      return storyCheck.response;
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
    const storyRef = buildStoryRef(db, { raceId, appId, eventId, participantId, storyId });

    const storyCheck = await ensureStoryExists(res, storyRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${storyId}`
    });
    if (!storyCheck.exists) {
      return storyCheck.response;
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
      const eventStoryRef = buildEventRef(db, { raceId, appId, eventId })
        .collection("stories").doc(storyId);
      await eventStoryRef.delete();
    } catch (e) {
      console.warn("No se pudo eliminar story espejo en events/stories:", e.message || e);
    }

    // También eliminar referencias asociadas en split-clips y timing-clips (por storyId + participantId)
    try {
      const eventRef = buildEventRef(db, { raceId, appId, eventId });

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
    const eventRef = buildEventRef(db, { raceId, appId, eventId });

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
    if (appId) {
      console.log(`🔍 Buscando participante en nueva estructura: races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`);
    }
    console.log(`🔍 Buscando participante en estructura antigua: races/${raceId}/events/${eventId}/participants/${participantId}`);
    const { participantRef, participantDoc } = await resolveParticipantWithLegacyFallback(db, {
      raceId,
      appId,
      eventId,
      participantId
    });

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
    const {raceSlug, raceDoc, raceData, copernicoEnv} = await recoverRaceData(db, raceId);

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
    const participantRef = buildParticipantRef(db, { raceId, appId, eventId, participantId });
    const participantCheck = await ensureParticipantExists(res, participantRef, {
      path: `/races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}`
    });
    if (!participantCheck.exists) {
      return participantCheck.response;
    }
    const participantDoc = participantCheck.doc;

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
 * @openapi
 * /api/apps/leaderboard-v3:
 *   get:
 *     summary: (BETA) Leaderboard desde Copernico
 *     description: Consulta leaders directamente en Copernico segun el entorno.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID del usuario para filtrar solo participantes seguidos.
 *       - in: query
 *         name: followingOnly
 *         required: false
 *         schema:
 *           type: string
 *           example: "1"
 *         description: Si es "1" y se provee userId, retorna solo participantes seguidos con posición calculada por participante.
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
      page,
      userId,
      followingOnly
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
    const {raceSlug, raceDoc, raceData, copernicoEnv} = await recoverRaceData(db, raceId);

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

    const resolveExternalId = async (participantId) => {
      try {
        const participantRef = db.collection("races").doc(raceId)
          .collection("apps").doc(appId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId);
        const participantDoc = await participantRef.get();
        if (participantDoc.exists) {
          const data = participantDoc.data() || {};
          return data.externalId || participantId;
        }
      } catch (error) {
        console.warn("No se pudo resolver externalId del participante:", error.message);
      }
      return participantId;
    };

    const shouldUseFollowingsOnly = Boolean(userId) && String(followingOnly || "").toLowerCase() === "1";

    if (shouldUseFollowingsOnly) {
      const followingsSnapshot = await db.collection("users").doc(userId)
        .collection("followings")
        .where("profileType", "==", "participant")
        .where("raceId", "==", raceId)
        .where("appId", "==", appId)
        .where("eventId", "==", eventId)
        .get();

      if (followingsSnapshot.empty) {
        return res.status(200).json({
          raceId,
          appId,
          eventId,
          type: normalizedType,
          gender: normalizedType === "gender" ? (gender || null) : null,
          category: normalizedType === "category" ? (category || null) : null,
          split: split || null,
          limit: limitNum,
          page: pageValue,
          offset: offsetNum,
          groupCount: 1,
          totalParticipants: 0,
          groups: [{
            group: leaderGroup || "all",
            totalCandidates: 0,
            returned: 0,
            hasMore: false,
            nextOffset: null,
            leaders: []
          }]
        });
      }

      const followedIds = followingsSnapshot.docs.map(doc => {
        const data = doc.data() || {};
        return data.profileId || doc.id;
      });

      const leaders = [];
      for (const participantId of followedIds) {
        const resolvedExternalId = await resolveExternalId(participantId);
        try {
          const copernicoData = await copernicoService.getParticipantData(raceSlug, resolvedExternalId, copernicoEnv);
          const transformed = copernicoService.transformCopernicoData(copernicoData);
          const selectedRanking = pickParticipantRanking(transformed, split);
          if (!selectedRanking || !selectedRanking.data) continue;

          const participantGenderRaw = transformed.participant?.gender || copernicoData?.gender || "";
          const participantGender = normalizeGender(participantGenderRaw) || null;
          const participantCategory = (transformed.participant?.category || copernicoData?.events?.[0]?.category || "").toString() || null;

          if (normalizedType === "gender" && gender && participantGender !== normalizeGender(gender)) {
            continue;
          }
          if (normalizedType === "category" && category && participantCategory?.toLowerCase() !== category.toString().toLowerCase()) {
            continue;
          }

          const position = getPositionByType(selectedRanking.data, normalizedType);
          if (position === null || position === undefined) continue;

          const normalizedPositions = normalizePositionsFromRanking(selectedRanking.data);
          const timeValue = selectedRanking.data.net ?? selectedRanking.data.time ?? null;

          leaders.push({
            participantId,
            externalId: resolvedExternalId,
            fullName: transformed.participant?.fullName || [copernicoData?.name, copernicoData?.surname].filter(Boolean).join(" ").trim() || null,
            dorsal: transformed.participant?.dorsal || copernicoData?.events?.[0]?.dorsal || null,
            gender: participantGender,
            category: participantCategory,
            status: transformed.participant?.status || transformed.participant?.realStatus || null,
            split: selectedRanking.key,
            splitOrder: selectedRanking.order,
            distance: selectedRanking.distance || null,
            time: timeValue,
            average: selectedRanking.data.averageNet ?? selectedRanking.data.average ?? null,
            position,
            positions: normalizedPositions
          });
        } catch (followError) {
          console.warn("No se pudo obtener ranking del seguido:", followError.message);
        }
      }

      const sortFn = (a, b) => {
        if (a.position !== b.position) return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
        if (a.time !== b.time) return (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER);
        return (a.splitOrder ?? 0) - (b.splitOrder ?? 0);
      };

      leaders.sort(sortFn);
      const paginated = leaders.slice(offsetNum, offsetNum + limitNum);
      const nextOffset = offsetNum + paginated.length;
      const hasMore = nextOffset < leaders.length;
      const selectedSplit = split || (paginated[0]?.split ?? null);

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
          group: leaderGroup || "all",
          totalCandidates: leaders.length,
          returned: paginated.length,
          hasMore,
          nextOffset: hasMore ? nextOffset : null,
          leaders: paginated
        }]
      });
    }

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
      rawTime
    } = req.body;

    const missingRequired = requireFields(req.body, ["competitionId", "type"]);
    if (missingRequired.length > 0) {
      console.error("❌ Parámetros requeridos faltantes");
      return sendError(res, 400, "Parámetros requeridos faltantes", {
        required: ["competitionId", "type"],
        missing: missingRequired,
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

    const receivedApiKey = extractApiKey(req, { allowBody: true });
    if (!hasValidApiKey(req, { allowBody: true })) {
      console.error("❌ API key inválida. Recibida:", receivedApiKey ? "***" + receivedApiKey.slice(-4) : "null");
      return sendError(res, 401, "API key inválida", {
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

    const idsArray = Array.isArray(participantsIds) ? participantsIds : [];
    const idsHash = idsArray.length > 0
      ? crypto.createHash("sha1").update(idsArray.join("|")).digest("hex").slice(0, 10)
      : null;
    const participantIdKey = participantId || (idsArray.length > 0 ? `batch_${idsArray.length}_${idsHash}` : "batch");
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

    const requestTs = Date.now();
    const requestId = `${competitionId}_${participantIdKey}_${type}_${requestTs}`;
    const dedupeKey = `${sanitize(competitionId)}_${sanitize(participantIdKey)}_${sanitize(type)}_${sanitize(point)}_${sanitize(location)}_V3`;
    const queueKey = `${dedupeKey}_${requestTs}`;

    // 2. VERIFICAR SI YA ESTÁ EN COLA O PROCESÁNDOSE
    const existingQueueSnap = await db.collection('processing_queue')
      .where('dedupeKey', '==', dedupeKey)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!existingQueueSnap.empty) {
      const queueData = existingQueueSnap.docs[0].data();
      if (["queued", "queued_jobs", "processing"].includes(queueData.status))
        return res.status(200).json({
          success: true,
          message: "Request ya está en cola o en procesamiento",
          data: {
            requestId: queueData.requestId,
            queueKey: queueData.queueKey || existingQueueSnap.docs[0].id,
            status: "already_processing",
            queuedAt: queueData.createdAt?.toDate ? queueData.createdAt.toDate().toISOString() : null,
            estimatedProcessingTime: "1 minuto"
          }
        });
    }

    const expireAt = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    const queueData = {
      requestId,
      queueKey,
      dedupeKey,
      competitionId,
      copernicoId,
      participantId: participantId || null,
      participantsCount: idsArray.length || null,
      type,
      extraData: normalizedExtraData,
      rawTime: rawTime || null,
      status: (type === 'creation' || type === 'deletion') ? 'queued_jobs' : 'queued',
      createdAt: timestamp,
      expireAt,
      attempts: 0,
      source: 'copernico-webhook-v3'
    };

    const queueRef = db.collection('processing_queue').doc(queueKey);
    const jobsTotal = (type === 'creation' || type === 'deletion')
      ? Math.ceil(idsArray.length / CHECKPOINT_JOB_CHUNK_SIZE)
      : null;
    if (jobsTotal !== null) {
      queueData.jobsTotal = jobsTotal;
      queueData.jobsCompleted = 0;
      queueData.jobsFailed = 0;
    }

    await queueRef.set(queueData);

    if (type === 'creation' || type === 'deletion') {
      let batch = db.batch();
      let pending = 0;

      for (let i = 0; i < idsArray.length; i += CHECKPOINT_JOB_CHUNK_SIZE) {
        const chunk = idsArray.slice(i, i + CHECKPOINT_JOB_CHUNK_SIZE);
        const jobRef = db.collection("processing_queue_jobs").doc();
        batch.set(jobRef, {
          queueKey,
          requestId,
          competitionId,
          copernicoId,
          type,
          participantsIds: chunk,
          extraData: normalizedExtraData,
          rawTime: rawTime || null,
          status: "queued",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        pending += 1;

        if (pending >= 400) {
          await batch.commit();
          batch = db.batch();
          pending = 0;
        }
      }

      if (pending > 0) {
        await batch.commit();
      }
    }

    const responseData = {
      requestId,
      queueKey,
      competitionId,
      participantsCount: idsArray.length || null,
      type,
      status: "queued",
      queuedAt: new Date().toISOString(),
      estimatedProcessingTime: "1-2 minutos"
    };
    if (jobsTotal !== null) {
      responseData.jobsTotal = jobsTotal;
    }
    if (participantId) {
      responseData.participantId = participantId;
    }

    res.status(200).json({
      success: true,
      message: "Request encolada exitosamente para procesamiento",
      data: responseData
    });
  } catch (error) {
    console.error("❌ Error procesando webhook checkpoint v3:", error);
    if (res.headersSent) {
      return;
    }
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
    const normalizedEventId = normalizeUTF8InObject(eventId);

    const normalizedAudience = String(audience || "all").toLowerCase();
    if (!["all", "featured"].includes(normalizedAudience)) {
      return res.status(400).json({
        error: "audience debe ser 'all' o 'featured'."
      });
    }

    console.log(`🔍 Obteniendo eventos (v3) - Race: ${raceId}, App: ${appId}, Event: ${normalizedEventId}, Type: ${type || 'ALL'}, Participant: ${participantId || 'ALL'}, Audience: ${normalizedAudience}, User: ${userId || 'NONE'}`);
    console.log(`🔤 [race-events-v3] eventId codepoints:`, Array.from(String(normalizedEventId || '')).map(c => c.charCodeAt(0)));

    try {
      const eventsSnap = await buildAppRef(db, { raceId, appId })
        .collection('events')
        .get();
      const eventIds = eventsSnap.docs.map(doc => doc.id);
      console.log(`🔤 [race-events-v3] eventIds disponibles (${eventIds.length}):`, eventIds);
      eventIds.forEach(id => {
        console.log(`🔤 [race-events-v3] eventId "${id}" codepoints:`, Array.from(String(id)).map(c => c.charCodeAt(0)));
      });
    } catch (eventListError) {
      console.warn(`⚠️ [race-events-v3] No se pudieron listar events:`, eventListError.message);
    }

    // Obtener sponsors una vez
    const sponsorsSnapshot = await buildAppRef(db, { raceId, appId })
      .collection('sponsors')
      .get();

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
      const participantRef = buildParticipantRef(db, {
        raceId,
        appId,
        eventId: normalizedEventId,
        participantId
      });
      const participantCheck = await ensureParticipantExists(res, participantRef, {
        message: "Participante no encontrado",
        extra: { participantId, raceId, appId, eventId: normalizedEventId }
      });
      if (!participantCheck.exists) {
        return participantCheck.response;
      }
    }

    const eventRef = buildEventRef(db, { raceId, appId, eventId: normalizedEventId });

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

    const buildStoriesQuery = () => {
      let query = eventRef.collection('stories');
      if (participantId) {
        query = query.where('participantId', '==', participantId);
      }
      if (type) {
        query = query.where('type', '==', type);
      }
      return query.orderBy('updatedAt', 'desc');
    };

    const storiesQuery = buildStoriesQuery();

    let followedIds = new Set();
    if (userId) {
      try {
        let followingsQuery = db.collection("users")
          .doc(userId)
          .collection("followings")
          .where("profileType", "==", "participant")
          .where("raceId", "==", raceId)
          .where("eventId", "==", normalizedEventId);
        if (appId) {
          followingsQuery = followingsQuery.where("appId", "==", appId);
        }

        const followingsSnapshot = await followingsQuery.get();
        followingsSnapshot.forEach(doc => {
          const data = doc.data() || {};
          if (data.profileId) {
            followedIds.add(String(data.profileId));
          }
          followedIds.add(String(doc.id));
        });
      } catch (followError) {
        console.warn("No se pudieron obtener followings para filtrar:", followError.message);
      }
    }

    const isFeaturedByStoryData = (storyData) =>
      storyData?.featured === true || storyData?.participant?.featured === true;

    const matchesAudienceByStoryData = (storyData) => {
      const storyParticipantId = String(
        storyData?.participantId ||
        storyData?.participant?.externalId ||
        storyData?.participant?.id ||
        ""
      );
      if (userId) {
        if (normalizedAudience === "featured") {
          return followedIds.has(storyParticipantId) || isFeaturedByStoryData(storyData);
        }
        return followedIds.has(storyParticipantId);
      }

      if (normalizedAudience === "featured") {
        return isFeaturedByStoryData(storyData);
      }
      return true;
    };

    const getUpdatedAtMs = (storyDoc) => {
      const data = storyDoc.data() || {};
      const v = data.updatedAt || data.date || data.createdAt || null;
      if (!v) return 0;
      if (typeof v.toMillis === "function") return v.toMillis();
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const parsed = Date.parse(String(v));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const loadUnionDocs = async (queries, target) => {
      const map = new Map();
      let maybeMore = false;

      for (const query of queries) {
        const snap = await query.limit(target).get();
        if (snap.size >= target) {
          maybeMore = true;
        }
        for (const doc of snap.docs) {
          map.set(doc.id, doc);
        }
      }

      const docs = Array.from(map.values()).sort((a, b) => getUpdatedAtMs(b) - getUpdatedAtMs(a));
      return {docs, maybeMore};
    };

    let selectedStoryDocs = [];
    let totalStories = null;
    let hasMore = false;
    const filterApplied = normalizedAudience === "featured" || Boolean(userId);

    if (!filterApplied) {
      try {
        const countSnapshot = await storiesQuery.count().get();
        totalStories = countSnapshot.data().count || 0;
      } catch (error) {
        totalStories = null;
      }
      const storiesSnapshot = await storiesQuery.offset(offsetNum).limit(limitNum).get();
      selectedStoryDocs = storiesSnapshot.docs;
      hasMore = totalStories !== null ? (offsetNum + limitNum) < totalStories : selectedStoryDocs.length === limitNum;
    } else {
      const target = offsetNum + limitNum + 1;
      const chunkSize = 10;
      const queryList = [];

      if (userId) {
        let followedList = Array.from(followedIds);
        if (participantId) {
          followedList = followedList.filter(id => id === String(participantId));
        }

        if (followedList.length > 0) {
          const chunks = chunkArray(followedList, chunkSize);
          chunks.forEach((idsChunk) => {
            let query = eventRef.collection('stories').where('participantId', 'in', idsChunk);
            if (type) {
              query = query.where('type', '==', type);
            }
            queryList.push(query.orderBy('updatedAt', 'desc'));
          });
        }

        if (normalizedAudience === "featured") {
          let featuredQuery = eventRef.collection('stories').where('featured', '==', true);
          if (participantId) {
            featuredQuery = featuredQuery.where('participantId', '==', participantId);
          }
          if (type) {
            featuredQuery = featuredQuery.where('type', '==', type);
          }
          queryList.push(featuredQuery.orderBy('updatedAt', 'desc'));
        }
      } else if (normalizedAudience === "featured") {
        let featuredQuery = eventRef.collection('stories').where('featured', '==', true);
        if (participantId) {
          featuredQuery = featuredQuery.where('participantId', '==', participantId);
        }
        if (type) {
          featuredQuery = featuredQuery.where('type', '==', type);
        }
        queryList.push(featuredQuery.orderBy('updatedAt', 'desc'));
      }

      if (queryList.length === 0) {
        selectedStoryDocs = [];
        totalStories = 0;
        hasMore = false;
      } else {
        const {docs, maybeMore} = await loadUnionDocs(queryList, target);

        // Si un participante seguido tiene historia de trofeo y historia normal para el
        // mismo splitName, mostrar solo la de trofeo.
        const trophyKeys = new Set();
        for (const doc of docs) {
          const d = doc.data() || {};
          const pid = String(d.participantId || d.participant?.externalId || "");
          const split = d.splitName;
          if (d.type === "ATHLETE_TROPHY" && pid && split) {
            trophyKeys.add(`${pid}|${split}`);
          }
        }
        const deduplicatedDocs = trophyKeys.size > 0
          ? docs.filter(doc => {
              const d = doc.data() || {};
              if (d.type === "ATHLETE_TROPHY") return true;
              const pid = String(d.participantId || d.participant?.externalId || "");
              const split = d.splitName;
              if (!pid || !split) return true;
              return !trophyKeys.has(`${pid}|${split}`);
            })
          : docs;

        selectedStoryDocs = deduplicatedDocs.slice(offsetNum, offsetNum + limitNum);
        hasMore = deduplicatedDocs.length > (offsetNum + limitNum) || maybeMore;
        totalStories = maybeMore ? null : deduplicatedDocs.length;
      }
    }

    // Resolver race slug y env para Copernico
    const {raceSlug, raceDoc, raceData, copernicoEnv} = await recoverRaceData(db, raceId);

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
    const allStoryDocs = selectedStoryDocs;
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

    const totalSafe = totalStories !== null
      ? totalStories
      : (offsetNum + stories.length + (hasMore ? 1 : 0));

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
        eventId: normalizedEventId,
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
    const missingRequired = requireFields(req.query, ["raceId", "appId", "eventId", "participantId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "Los parámetros raceId, appId, eventId y participantId son obligatorios.", {
        required: ["raceId", "appId", "eventId", "participantId"],
        missing: missingRequired
      });
    }

    // Normalizar eventId para evitar problemas de encoding
    eventId = normalizeUTF8InObject(eventId);

    const db = admin.firestore();
    const followersRef = buildParticipantRef(db, { raceId, appId, eventId, participantId })
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
    const { userId, raceId, appId, eventId } = req.query;
    const missingRequired = requireFields(req.query, ["userId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "El parámetro userId es obligatorio.", {
        required: ["userId"],
        missing: missingRequired
      });
    }
    const db = admin.firestore();
    let followingsRef = db.collection("users").doc(userId)
      .collection("followings")
      .where("profileType", "==", "participant");
    if (raceId) {
      followingsRef = followingsRef.where("raceId", "==", raceId);
    }
    if (appId) {
      followingsRef = followingsRef.where("appId", "==", appId);
    }
    if (eventId) {
      followingsRef = followingsRef.where("eventId", "==", eventId);
    }
    const followingsSnapshot = await followingsRef.get();
    const followingCount = followingsSnapshot.size;
    return res.status(200).json({
      userId,
      ...(raceId ? { raceId } : {}),
      ...(appId ? { appId } : {}),
      ...(eventId ? { eventId } : {}),
      followingCount
    });
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
            participantRef = buildParticipantRef(db, {
              raceId,
              appId,
              eventId: normalizedEventId,
              participantId
            });
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

const searchParticipantsV3Handler = async (req, res) => {
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

    const participantsRef = buildEventRef(db, { raceId, appId, eventId })
      .collection("participants");

    const normalizeSearchText = (value) => String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const includesText = (value, normalizedQuery) => normalizeSearchText(value).includes(normalizedQuery);

    const searchTerm = query ? String(query).trim() : "";
    const searchLower = normalizeSearchText(searchTerm);
    const isQueryEmpty = !searchTerm;
    const totalSnapshot = await participantsRef.count().get();
    const totalFromFirestore = totalSnapshot.data().count || 0;

    // Mapa de participantes seguidos (misma lógica que v1)
    const followedParticipantsMap = new Map();
    const followedProfileIds = [];
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
            followedProfileIds.push(profileId);
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

    const eventParticipantMap = new Map();
    const collectIdCandidates = (obj = {}, fallbackId = "") => {
      const candidates = [
        fallbackId,
        obj.id,
        obj.participantId,
        obj.externalId,
        obj.profileId
      ]
        .filter(Boolean)
        .map((value) => String(value));
      return [...new Set(candidates)];
    };
    const listEventParticipantDocs = async ({ fullScan = false, pageSize = 1000 }) => {
      if (!fullScan) {
        const snap = await participantsRef.limit(limitNum).get();
        return snap.docs;
      }

      const docs = [];
      let lastDocId = null;
      while (true) {
        let queryRef = participantsRef
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(pageSize);

        if (lastDocId) {
          queryRef = queryRef.startAfter(lastDocId);
        }

        const snap = await queryRef.get();
        if (snap.empty) break;

        docs.push(...snap.docs);
        lastDocId = snap.docs[snap.docs.length - 1].id;

        if (snap.size < pageSize) break;
      }

      return docs;
    };

    let candidateIds = [];
    if (isQueryEmpty && userId && followedProfileIds.length > 0) {
      candidateIds = [...new Set(followedProfileIds.map((id) => String(id)))];

      const followedDocs = await Promise.all(
        candidateIds.map((participantId) => participantsRef.doc(participantId).get())
      );
      followedDocs.forEach((doc) => {
        if (!doc.exists) return;
        const data = doc.data() || {};
        collectIdCandidates(data, doc.id).forEach((candidateId) => {
          if (!eventParticipantMap.has(candidateId)) {
            eventParticipantMap.set(candidateId, { id: doc.id, ...data });
          }
        });
      });
    } else {
      const eventParticipantDocs = await listEventParticipantDocs({
        fullScan: Boolean(searchTerm),
        pageSize: 1000
      });

      const discoveredIds = [];
      eventParticipantDocs.forEach((doc) => {
        const data = doc.data() || {};
        const ids = collectIdCandidates(data, doc.id);
        ids.forEach((id) => {
          if (!eventParticipantMap.has(id)) {
            eventParticipantMap.set(id, { id: doc.id, ...data });
          }
          discoveredIds.push(id);
        });
      });
      candidateIds = [...new Set(discoveredIds)];
    }

    const canonicalParticipantsMap = new Map();
    if (candidateIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < candidateIds.length; i += 30) {
        chunks.push(candidateIds.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const snap = await db.collection("races").doc(raceId)
          .collection("participants")
          .where(admin.firestore.FieldPath.documentId(), "in", chunk)
          .get();

        snap.forEach((doc) => {
          canonicalParticipantsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
      }
    }

    let athletes = candidateIds.map((candidateId) => {
      const eventData = eventParticipantMap.get(candidateId) || {};
      const canonicalData = canonicalParticipantsMap.get(candidateId) || {};

      return {
        ...eventData,
        ...canonicalData,
        id: canonicalData.id || eventData.id || candidateId
      };
    }).filter((athlete) => athlete && athlete.id);

    if (searchTerm) {
      athletes = athletes.filter((athlete) => {
        const name = athlete.name || "";
        const lastName = athlete.lastName || athlete.surname || "";
        const fullName = athlete.fullName || `${athlete.name || ""} ${athlete.lastName || athlete.surname || ""}`;

        return includesText(name, searchLower) ||
          includesText(lastName, searchLower) ||
          includesText(fullName, searchLower) ||
          includesText(athlete.dorsal, searchLower) ||
          includesText(athlete.category, searchLower) ||
          includesText(athlete.team, searchLower) ||
          includesText(athlete.club, searchLower) ||
          includesText(athlete.id, searchLower) ||
          includesText(athlete.externalId, searchLower);
      });
    }

    athletes = athletes.slice(0, limitNum);

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
        externalId: athlete.externalId || athlete.id || null,
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

    let finalParticipants = participantsSorted;
    if (isQueryEmpty && userId && followedParticipantsMap.size > 0) {
      finalParticipants = participantsSorted.filter(p => p.following);
    }

    return res.status(200).json({
      participants: finalParticipants,
      total: finalParticipants.length,
      totalCopernico: totalFromFirestore, // total real de participantes en Firestore
      query: query || "",
      searchMethod: "firestore_native_v3",
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
};

router.get("/search/participants-v3", searchParticipantsV3Handler);
router.get("/search/participant-v3", searchParticipantsV3Handler);

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
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 403, "Forbidden");
    }

    const { raceId, appId } = req.body || {};
    const missingRequired = requireFields(req.body || {}, ["raceId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId es obligatorio");
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
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 403, "Forbidden");
    }

    const { raceId, appId, eventId, scope = "events" } = req.body || {};
    const missingRequired = requireFields(req.body || {}, ["raceId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "raceId es obligatorio");
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
 * /api/admin/update-event-status:
 *   post:
 *     summary: Sincronizar eventos de una carrera desde Copernico
 *     description: Recibe una lista de nombres de eventos, consulta Copernico por competitionId y actualiza los campos del evento en Firestore.
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
 *               competitionId:
 *                 type: string
 *               eventsNames:
 *                 type: array
 *                 items:
 *                   type: string
 *               apiKey:
 *                 type: string
 *             required:
 *               - raceId
 *               - competitionId
 *               - eventsNames
 *               - apiKey
 *     responses:
 *       200:
 *         description: Eventos sincronizados
 *       400:
 *         description: Parámetros faltantes o inválidos
 *       403:
 *         description: API key inválida
 */
router.post("/admin/update-event-status", async (req, res) => {
  try {
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 403, "Forbidden");
    }

    const {
      raceId: legacyRaceId,
      competitionId: incomingCompetitionId,
      copernicoId: incomingCopernicoId,
      eventsNames,
      type
    } = req.body || {};

    // Compatibilidad de payloads:
    // Nuevo: competitionId => raceId Firebase, copernicoId => ID de carrera en Copernico
    // Legacy: raceId => raceId Firebase, competitionId => ID de carrera en Copernico
    const resolvedRaceId = String(legacyRaceId || incomingCompetitionId || "").trim();
    const resolvedCopernicoRaceId = String(
      incomingCopernicoId ||
      ((legacyRaceId && incomingCompetitionId) ? incomingCompetitionId : "")
    ).trim();

    if (!resolvedRaceId || !resolvedCopernicoRaceId || !Array.isArray(eventsNames)) {
      return res.status(400).json({
        error: "competitionId (raceId), copernicoId y eventsNames son obligatorios",
        required: ["competitionId", "copernicoId", "eventsNames"],
        note: "Compatibilidad legacy: también acepta raceId + competitionId."
      });
    }

    const requestedNames = eventsNames
      .map(name => String(name || "").trim())
      .filter(Boolean);
    if (requestedNames.length === 0) {
      return res.status(400).json({
        error: "eventsNames debe incluir al menos un nombre de evento"
      });
    }

    const db = admin.firestore();
    const raceRef = db.collection("races").doc(resolvedRaceId);
    const raceDoc = await raceRef.get();
    if (!raceDoc.exists) {
      return res.status(404).json({ error: "Race no encontrada", raceId: resolvedRaceId });
    }
    const raceData = raceDoc.data() || {};

    const normalizeEventKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const copernicoEnv = raceData?.copernicoEnv || null;
    const envConfig = copernicoService.config.getEnvironmentConfig(copernicoEnv);
    const headers = copernicoService.config.getRequestHeaders(copernicoEnv);
    const raceUrl = `${envConfig.baseUrl}/${resolvedCopernicoRaceId}`;

    console.log("📤 [update-event-status] Request Copernico", {
      api: "GET /api/races/{competitionId}",
      url: raceUrl,
      method: "GET",
      payload: null,
      requestContext: {
        raceId: resolvedRaceId,
        copernicoId: resolvedCopernicoRaceId,
        eventsNames: requestedNames,
        type: type || null
      },
      headers: {
        "Content-Type": headers["Content-Type"],
        "x-api-key": headers["x-api-key"] ? "***" : null,
        "User-Agent": headers["User-Agent"],
        "Accept": headers["Accept"]
      }
    });

    let copernicoEvents = [];
    try {
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
      console.log("📥 [update-event-status] Response Copernico", {
        status: response.status,
        ok: response.ok,
        result: payload?.result || null,
        eventsCount: Array.isArray(payload?.data?.events) ? payload.data.events.length : 0,
        sampleEvent: Array.isArray(payload?.data?.events) && payload.data.events.length > 0
          ? {
              id: payload.data.events[0]?.id || null,
              event: payload.data.events[0]?.event || null,
              name: payload.data.events[0]?.name || null,
              keys: Object.keys(payload.data.events[0] || {})
            }
          : null
      });

      if (!payload?.result || (payload.result.code !== 0 && payload.result.code !== 1)) {
        throw new Error(payload?.result?.message || "Respuesta invalida de Copernico");
      }

      copernicoEvents = Array.isArray(payload?.data?.events) ? payload.data.events : [];
    } catch (copernicoError) {
      return res.status(502).json({
        error: "No se pudo consultar Copernico",
        message: copernicoError.message,
        copernicoId: resolvedCopernicoRaceId
      });
    }

    const copernicoByNormalized = new Map();
    const copernicoByEventId = new Map();
    for (const eventData of copernicoEvents) {
      const possibleIds = [eventData?.event, eventData?.id];
      for (const possibleId of possibleIds) {
        const normalizedId = normalizeEventKey(normalizeUTF8InObject(possibleId));
        if (normalizedId) {
          copernicoByEventId.set(normalizedId, eventData);
        }
      }

      const possibleNames = [eventData?.name, eventData?.event, eventData?.id];
      for (const possibleName of possibleNames) {
        const normalized = normalizeEventKey(normalizeUTF8InObject(possibleName));
        if (normalized) {
          copernicoByNormalized.set(normalized, eventData);
        }
      }
    }

    const firestoreByNormalized = new Map();
    const firestoreByEventId = new Map();
    const appsSnapshot = await raceRef.collection("apps").get();
    for (const appDoc of appsSnapshot.docs) {
      const appId = appDoc.id;
      const eventsSnapshot = await raceRef.collection("apps").doc(appId).collection("events").get();
      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data() || {};
        const baseName = eventData.event_info?.name || eventData.name || eventData.eventName || eventDoc.id;
        const eventIdKey = normalizeEventKey(normalizeUTF8InObject(eventDoc.id));
        if (!firestoreByEventId.has(eventIdKey)) {
          firestoreByEventId.set(eventIdKey, []);
        }
        firestoreByEventId.get(eventIdKey).push({
          appId,
          eventId: eventDoc.id,
          ref: eventDoc.ref,
          data: eventData
        });

        const keys = [...new Set([
          normalizeEventKey(normalizeUTF8InObject(baseName)),
          normalizeEventKey(normalizeUTF8InObject(eventDoc.id)),
          normalizeEventKey(normalizeUTF8InObject(eventData.eventNameNormalized))
        ].filter(Boolean))];
        for (const key of keys) {
          if (!firestoreByNormalized.has(key)) {
            firestoreByNormalized.set(key, []);
          }
          firestoreByNormalized.get(key).push({
            appId,
            eventId: eventDoc.id,
            ref: eventDoc.ref,
            data: eventData
          });
        }
      }
    }

    let batch = db.batch();
    let pending = 0;
    const results = [];
    let totalUpdatedDocs = 0;

    const commitBatchIfNeeded = async () => {
      if (pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    };

    const processedRequestedKeys = new Set();
    for (const requestedName of requestedNames) {
      const normalizedRequested = normalizeEventKey(normalizeUTF8InObject(requestedName));
      if (!normalizedRequested || processedRequestedKeys.has(normalizedRequested)) {
        continue;
      }
      processedRequestedKeys.add(normalizedRequested);

      // Prioridad: buscar por eventId de Firebase
      let targets = firestoreByEventId.get(normalizedRequested) || [];
      let matchedBy = "eventId";
      if (targets.length === 0) {
        // Fallback: buscar por nombre normalizado
        targets = firestoreByNormalized.get(normalizedRequested) || [];
        matchedBy = "name";
      }

      if (targets.length === 0) {
        results.push({
          eventName: requestedName,
          status: "not_found_in_firestore"
        });
        continue;
      }

      // Prioridad: resolver evento de Copernico por eventId; fallback por nombre
      let copernicoEvent = copernicoByEventId.get(normalizedRequested) || null;
      if (!copernicoEvent) {
        const candidateNames = new Set([normalizedRequested]);
        for (const target of targets) {
          const targetName =
            target?.data?.event_info?.name ||
            target?.data?.name ||
            target?.data?.eventName ||
            target?.eventId;
          const normalizedTargetName = normalizeEventKey(normalizeUTF8InObject(targetName));
          if (normalizedTargetName) {
            candidateNames.add(normalizedTargetName);
          }
        }

        for (const candidate of candidateNames) {
          const candidateEvent = copernicoByNormalized.get(candidate);
          if (candidateEvent) {
            copernicoEvent = candidateEvent;
            break;
          }
        }
      }

      if (!copernicoEvent) {
        results.push({
          eventName: requestedName,
          status: "not_found_in_copernico",
          matchedBy
        });
        continue;
      }

      const finished = Boolean(
        copernicoEvent?.finished ??
        copernicoEvent?.status?.finished ??
        false
      );
      const waves = Array.isArray(copernicoEvent?.waves) ? copernicoEvent.waves : [];
      const eventName = copernicoEvent?.name || requestedName;
      const sanitizedCopernicoEvent = buildCopernicoEventForStorage(copernicoEvent);

      for (const target of targets) {
        const updateData = {
          name: eventName,
          finished,
          waves,
          copernico_data: sanitizedCopernicoEvent || {},
          event_info: {
            name: eventName,
            type: copernicoEvent?.type || null,
            distance: copernicoEvent?.distance ?? null,
            startTime: copernicoEvent?.startTime || null,
            athletes: copernicoEvent?.athletes ?? null
          },
          eventNameNormalized: normalizeEventKey(normalizeUTF8InObject(eventName)),
          competitionId: resolvedRaceId,
          copernicoId: resolvedCopernicoRaceId,
          updateType: type || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.set(target.ref, updateData, { merge: true });
        pending += 1;
        totalUpdatedDocs += 1;
        await commitBatchIfNeeded();
      }

      results.push({
        eventName: requestedName,
        status: "updated",
        matchedBy,
        firestoreDocsUpdated: targets.length
      });
    }

    if (pending > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      raceId: resolvedRaceId,
      competitionId: resolvedRaceId,
      copernicoId: resolvedCopernicoRaceId,
      type: type || null,
      requestedEvents: requestedNames.length,
      updatedDocuments: totalUpdatedDocs,
      results
    });
  } catch (error) {
    console.error("❌ Error en POST /api/admin/update-event-status:", error);
    return res.status(500).json({ error: "Error interno del servidor", message: error.message });
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

    const { runnerId, runnerBib, checkpointId, timestamp, raceId, eventId, streamId } = req.body;

    // 1. Validar API key
    if (!hasValidApiKey(req, { allowBody: true })) {
      console.error("❌ API key inválida");
      return sendError(res, 401, "API key inválida");
    }

    // 2. Validar parámetros requeridos
    const missingRequired = requireFields(req.body, [
      "runnerId",
      "checkpointId",
      "timestamp",
      "raceId",
      "eventId",
      "streamId"
    ]);
    if (missingRequired.length > 0) {
      console.error("❌ Parámetros faltantes");
      return sendError(res, 400, "Parámetros faltantes", {
        required: ["runnerId", "checkpointId", "timestamp", "raceId", "eventId", "streamId"],
        missing: missingRequired,
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

    const { raceId, participantIds } = req.body;

    // Validaciones básicas
    const missingRequired = requireFields(req.body, ["raceId"]);
    if (missingRequired.length > 0) {
      console.error("❌ [Copernico] Parámetros requeridos faltantes");
      return sendError(res, 400, "Parámetros requeridos faltantes", {
        required: ["raceId"],
        missing: missingRequired,
        received: { raceId: !!raceId }
      });
    }

    // Validar API key
    if (!hasValidApiKey(req, { allowBody: true })) {
      console.error("❌ [Copernico] API key inválida");
      return sendError(res, 401, "API key inválida");
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

    const { raceId } = req.body;

    // Validaciones básicas
    const missingRequired = requireFields(req.body, ["raceId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "Parámetros requeridos faltantes", {
        required: ["raceId"],
        missing: missingRequired
      });
    }

    // Validar API key
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 401, "API key inválida");
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

    const { raceId, environment } = req.body;

    // Validaciones básicas
    const missingRequired = requireFields(req.body, ["raceId"]);
    if (missingRequired.length > 0) {
      return sendError(res, 400, "Parámetros requeridos faltantes", {
        required: ["raceId"],
        missing: missingRequired
      });
    }

    // Validar API key
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 401, "API key inválida");
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
    // Validar API key
    if (!hasValidApiKey(req, { allowBody: true })) {
      return sendError(res, 401, "API key inválida");
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

      // Extraer categories de copernico_data
      const categories = copernicoData.categories || [];

      // Calcular estado del evento usando finished y waves.started
      const finished = Boolean(eventData.finished ?? copernicoData.finished ?? false);
      const wavesData = Array.isArray(eventData.waves) ? eventData.waves : (copernicoData.waves || []);
      const wavesStarted = Array.isArray(wavesData) && wavesData.some(wave => wave?.started === true);

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
        waves: wavesData.map(wave => ({
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

// onCheckpointQueueCreated, onCheckpointQueueJobCreated, onClipGenerationJobCreated
// eliminados — manejados exclusivamente por v2 (onCheckpointQueueCreatedV2, onCheckpointQueueJobCreatedV2, onClipGenerationJobCreatedV2)

export default router;
