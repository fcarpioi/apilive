import admin from "firebase-admin";
import {normalizeUTF8InObject} from "../utils/normalizeUTF8InObject.mjs";
import {findSpecificEvent} from "../competitions/findSpecificEvent.mjs";
import {findEventsByCompetition} from "../competitions/findEventsByCompetition.mjs";
import copernicoService from "../../services/copernicoService.mjs";
import {getCompetitionStreams} from "../competitions/getCompetitionStreams.mjs";
import {sendStoryNotificationToFollowers} from "../notifications/sendStoryNotificationToFollowers.mjs";
import {createAutomaticStory} from "../stories/createAutomaticStory.mjs";
import {recoverRaceData} from "../db/recoverRaceData.mjs";

const logStep = (label, init) => {
    const deltaMs = Date.now() - init;
    console.log(`⏱️ [BACKGROUND v3] ${label} (+${deltaMs}ms)`);
};

const COPERNICO_BATCH_SIZE = 10;

export async function processCheckpointInBackgroundV3(competitionId, copernicoId, participantId, participantsIds, type, extraData, rawTime, requestId, queueKey, options = {}, EVENT_CACHE_TTL_MS, eventResolutionCache) {
    console.log(`🔄 [BACKGROUND v3] Procesando checkpoint: ${requestId}`);
    const db = admin.firestore();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const updateQueue = options.updateQueue !== false;

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

        let participantData = null;
        let copernicoSuccess = false;
        let transformedData = null;
        const {raceData, copernicoEnv} = await recoverRaceData(db, competitionId);

        const locations = await getLocations({
            extraData,
            eventResolutionCache,
            competitionId,
            EVENT_CACHE_TTL_MS,
            db,
            checkpointRef
        });

        if (locations.length === 0) {
            const safeParticipantData = participantData ?? null;
            await checkpointRef.update({
                status: 'completed_no_events',
                completedAt: timestamp,
                message: `No se encontraron eventos para competitionId: ${competitionId}`,
                ...(safeParticipantData !== null ? {participantData: safeParticipantData} : {}),
                searchedEvent: extraData?.event || null
            });
            return;
        }

        if (type === 'creation' || type === 'deletion') {
            return await createDeleteParticipant({
                participantsIds,
                competitionId,
                copernicoId,
                raceData,
                updateQueue,
                locations, db,
                copernicoEnv,
                timestamp,
                queueKey,
                type
            });
        }

        const result = await getParticipantData({
            participantData,
            transformedData,
            copernicoSuccess,
            competitionId,
            copernicoId,
            raceData,
            participantId,
            locations,
            db,
            copernicoEnv
        });

        participantData = result.participantData;
        transformedData = result.transformedData;
        copernicoSuccess = result.copernicoSuccess;

        const results = [];

        const streamsResult = await getStreams({
            type,
            extraData,
            db,
            locations,
            competitionId
        });

        for (const location of locations) {
            try {
                const {raceId, appId, eventId} = location;
                const init = Date.now();


                const {existingParticipant, participantRef, participantDocId} = await getParticipantFromFB({
                    participantData,
                    db,
                    participantId,
                    raceId,
                    appId,
                    eventId,
                    init
                })
                logStep('participantRef.get done', init);
                const isFeatured = participantData.featured;

                await updateParticipant({
                    participantData,
                    existingParticipant,
                    participantRef,
                    participantId,
                    raceId,
                    eventId,
                    timestamp,
                    init,
                    competitionId
                });

                const followersSnap = await participantRef.collection('followers').limit(1).get();
                const hasFollowers = !followersSnap.empty;
                console.log(`👥 [BACKGROUND v3] followers count peek: ${followersSnap.size} for ${raceId}/${appId}/${eventId}/${participantDocId}`);
                logStep('followers check done', init);

                if (type === 'modification') {
                    results.push(await modificationProcess({
                        hasFollowers,
                        db,
                        location,
                        raceId,
                        appId,
                        eventId,
                        participantDocId,
                        extraData,
                        isFeatured,
                        participantData,
                        streamsResult,
                        copernicoSuccess,
                        transformedData,
                        rawTime
                    }));
                    continue;
                }

                results.push(await createStory({
                    isFeatured,
                    hasFollowers,
                    db,
                    location,
                    raceId,
                    appId,
                    eventId,
                    participantDocId,
                    extraData,
                    participantData,
                    streamsResult,
                    copernicoSuccess,
                    transformedData,
                    rawTime,
                    init,
                    type
                }))
            } catch (locationError) {
                console.error(`❌ [BACKGROUND v3] Error en ubicación ${location.raceId}/${location.appId}/${location.eventId}:`, locationError.message);
                results.push({
                    ...location,
                    error: locationError.message,
                    success: false
                });
            }
        }

        if (updateQueue) {
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
        }

        console.log(`✅ [BACKGROUND v3] Procesamiento completado para: ${requestId}`);
        return {results, locationsProcessed: locations.length};
    } catch (error) {
        console.error(`❌ [BACKGROUND v3] Error procesando ${requestId}:`, error.message);
        if (updateQueue) {
            await db.collection('processing_queue').doc(queueKey).update({
                status: 'failed',
                error: error.message,
                failedAt: timestamp,
                expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
                attempts: admin.firestore.FieldValue.increment(1)
            });
        }
        throw error;
    }
}


async function getLocations({
                                extraData,
                                eventResolutionCache,
                                competitionId,
                                EVENT_CACHE_TTL_MS,
                                db,
                                checkpointRef
                            }) {
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
                            }, {merge: true});
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

    return locations;
}

async function createDeleteParticipant({
                                           participantsIds,
                                           competitionId,
                                           copernicoId,
                                           raceData,
                                           updateQueue,
                                           locations, db,
                                           copernicoEnv,
                                           timestamp,
                                           queueKey,
                                           type
                                       }) {
    const ids = Array.isArray(participantsIds) ? participantsIds : [];
    const results = [];

    const copernicoEventsByParticipant = new Map();
    const copernicoParticipantDataById = new Map();

    if (type === 'creation') {
        let raceSlug = competitionId;
        if (copernicoId) {
            raceSlug = copernicoId;
        } else if (raceData && raceData.race_info && raceData.race_info.id) {
            raceSlug = raceData.race_info.id;
        }

        for (let i = 0; i < ids.length; i += COPERNICO_BATCH_SIZE) {
            const batch = ids.slice(i, i + COPERNICO_BATCH_SIZE);
            await Promise.all(batch.map(async (pid) => {
                try {
                    const copernicoData = await copernicoService.getParticipantData(raceSlug, pid, copernicoEnv);
                    const transformed = copernicoService.transformCopernicoData(copernicoData);
                    const rawEvents = Array.isArray(copernicoData?.events) ? copernicoData.events : [];
                    const eventIds = rawEvents
                        .map(evt => String(evt?.event || evt?.name || evt?.eventName || "").trim())
                        .filter(Boolean);
                    copernicoEventsByParticipant.set(pid, new Set(eventIds));
                    copernicoParticipantDataById.set(pid, transformed?.participant || null);
                } catch (error) {
                    console.warn(`⚠️ [BACKGROUND v3] No se pudo obtener eventos de Copernico para ${pid}:`, error.message);
                    copernicoEventsByParticipant.set(pid, new Set());
                    copernicoParticipantDataById.set(pid, null);
                }
            }));
        }
    }

    const processParticipant = async (pid) => {
        const participantResults = [];
        const participantEvents = copernicoEventsByParticipant.get(pid) || new Set();

        if (type === 'creation' && participantEvents.size === 0) {
            participantResults.push({
                participantId: pid,
                action: 'skipped',
                success: false,
                reason: 'no_events_resolved_for_creation'
            });
            results.push(...participantResults);
            return;
        }

        await Promise.all(locations.map(async (loc) => {
            const {raceId, appId, eventId} = loc;
            const eventRef = db.collection('races').doc(raceId)
                .collection('apps').doc(appId)
                .collection('events').doc(eventId);

            if (type === 'creation' && !participantEvents.has(eventId)) {
                return;
            }

            const participantRef = eventRef.collection('participants').doc(pid);

            if (type === 'creation') {
                const copernicoParticipant = copernicoParticipantDataById.get(pid) || null;
                const hasCopernicoProfile = Boolean(copernicoParticipant && (copernicoParticipant.name || copernicoParticipant.fullName));
                const basicParticipant = {
                    externalId: pid,
                    name: copernicoParticipant?.name || null,
                    lastName: copernicoParticipant?.lastName || null,
                    fullName: copernicoParticipant?.fullName ||
                        `${copernicoParticipant?.name || ""} ${copernicoParticipant?.lastName || ""}`.trim() ||
                        `Participante ${pid}`,
                    gender: copernicoParticipant?.gender || null,
                    birthdate: copernicoParticipant?.birthdate || null,
                    country: copernicoParticipant?.country || copernicoParticipant?.nationality || null,
                    nationality: copernicoParticipant?.nationality || null,
                    dorsal: copernicoParticipant?.dorsal || null,
                    category: copernicoParticipant?.category || null,
                    team: copernicoParticipant?.team || null,
                    club: copernicoParticipant?.club || null,
                    raceId,
                    eventId,
                    competitionId,
                    featured: copernicoParticipant?.featured === true,
                    dataSource: hasCopernicoProfile ? 'copernico' : 'webhook_creation',
                    createdAt: timestamp,
                    registerDate: timestamp,
                    updatedAt: timestamp
                };
                await participantRef.set(basicParticipant, {merge: true});
                participantResults.push({raceId, appId, eventId, participantId: pid, action: 'created'});
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

    if (updateQueue) {
        await db.collection('processing_queue').doc(queueKey).update({
            status: 'completed',
            completedAt: timestamp,
            expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
            results: results,
            locationsProcessed: locations.length
        });
    }

    return {results, locationsProcessed: locations.length};
}


async function getParticipantData({
                                      participantData,
                                      transformedData,
                                      copernicoSuccess,
                                      competitionId,
                                      copernicoId,
                                      raceData,
                                      participantId,
                                      locations,
                                      db,
                                      copernicoEnv
                                  }) {


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

    return {
        participantData,
        transformedData,
        copernicoSuccess
    };
}

async function getStreams({
                              type,
                              extraData,
                              db,
                              locations,
                              competitionId
                          }) {
    let streamsResult = {success: false, streamMap: null};
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

    return streamsResult;
}

async function getParticipantFromFB({
                                        participantData,
                                        db,
                                        participantId,
                                        raceId,
                                        appId,
                                        eventId,
                                        init
                                    }) {
    const participantDocId = participantData.externalId || participantId;
    const participantRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants')
        .doc(participantDocId);
    logStep('participantRef ready', init);

    const existingParticipant = await participantRef.get();

    return {participantRef, existingParticipant, participantDocId};
}

async function updateParticipant({
                                     participantData,
                                     existingParticipant,
                                     participantRef,
                                     participantId,
                                     raceId,
                                     eventId,
                                     timestamp,
                                     init,
                                     competitionId
                                 }) {
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
        await participantRef.set(basicParticipantData, {merge: true});
        logStep('participant updated', init);
    } else {
        await participantRef.set({
            ...basicParticipantData,
            createdAt: timestamp,
            registerDate: timestamp
        });
        logStep('participant created', init);
    }
}

async function modificationProcess({
                                       hasFollowers,
                                       db,
                                       location,
                                       raceId,
                                       appId,
                                       eventId,
                                       participantDocId,
                                       extraData,
                                       isFeatured,
                                       participantData,
                                       streamsResult,
                                       copernicoSuccess,
                                       transformedData,
                                       rawTime
                                   }) {
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
            {updateOnly: false, skipClipGeneration: false}
        );
        await notifyStoryCreationWithoutClip({
            db,
            raceId,
            appId,
            eventId,
            participantId: participantDocId,
            storyResult,
            participantData
        });
    }

    return {
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
    }
}

async function createStory({
                               isFeatured,
                               hasFollowers,
                               db,
                               location,
                               raceId,
                               appId,
                               eventId,
                               participantDocId,
                               extraData,
                               participantData,
                               streamsResult,
                               copernicoSuccess,
                               transformedData,
                               rawTime,
                               init,
                               type
                           }) {
    let storyResult = null;
    console.log(`🧭 [BACKGROUND v3] story gate for ${raceId}/${appId}/${eventId}/${participantDocId}: featured=${isFeatured} followers=${hasFollowers} type=${type}`);
    if (isFeatured || hasFollowers) {
        logStep('before createAutomaticStory', init);
        storyResult = await createAutomaticStory(
            db,
            location,
            participantData,
            extraData,
            streamsResult.success ? streamsResult.streamMap : null,
            copernicoSuccess ? transformedData : null,
            rawTime
        );
        await notifyStoryCreationWithoutClip({
            db,
            raceId,
            appId,
            eventId,
            participantId: participantDocId,
            storyResult,
            participantData
        });
        logStep('after createAutomaticStory', init);
    }

    return {
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
    };
}

async function notifyStoryCreationWithoutClip({
                                                  db,
                                                  raceId,
                                                  appId,
                                                  eventId,
                                                  participantId,
                                                  storyResult,
                                                  participantData
                                              }) {
    if (!storyResult?.success || !storyResult?.storyId || storyResult?.updated) {
        return;
    }

    try {
        const storyDoc = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').doc(eventId)
            .collection('stories').doc(storyResult.storyId)
            .get();

        if (!storyDoc.exists) {
            return;
        }

        const storyData = storyDoc.data() || {};
        await sendStoryNotificationToFollowers({
            db,
            raceId,
            appId,
            eventId,
            participantId,
            storyId: storyResult.storyId,
            storyData,
            participantData: participantData || storyData.participant || {},
            notificationOverrides: {
                notificationType: "NEW_STORY_PENDING_CLIP",
                body: "Nuevo checkpoint disponible. El clip se esta generando."
            }
        });
    } catch (notifyError) {
        console.error(`⚠️ [BACKGROUND v3] Error enviando push de story sin clip:`, notifyError.message);
    }
}
