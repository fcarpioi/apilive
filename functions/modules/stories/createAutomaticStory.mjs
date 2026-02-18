import {normalizeUTF8InObject} from "../utils/normalizeUTF8InObject.mjs";
import admin from "firebase-admin";

/**
 * Crear story automática para un checkpoint
 */
export async function createAutomaticStory(db, location, participantData, extraData, streamMap, copernicoData = null, rawTime = null, options = {}) {
    try {
        const {updateOnly = false, skipClipGeneration = false} = options;
        let {raceId, appId, eventId} = location;

        // Normalizar eventId para evitar problemas de encoding
        const originalEventId = eventId;
        eventId = normalizeUTF8InObject(eventId);

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
            streamId = streamMap[locationKey];
        } else if (!extraData?.location && streamMap) {
            // Si no se encuentra, intentar con variaciones comunes
            if (!streamId) {
                // Intentar con variaciones para checkpoints intermedios
                if (locationKey.includes('k') || locationKey.includes('km')) {
                    // Para checkpoints como "5k", "10k", etc., usar el primer stream disponible
                    const availableStreams = Object.keys(streamMap);
                    if (availableStreams.length > 0) {
                        streamId = streamMap[availableStreams[0]];
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
            extraData: extraData ? {...extraData} : {},

            // Datos de generación (se actualizarán cuando se genere el clip)
            generationInfo: {
                ...(streamId && {streamId: streamId}), // Solo incluir streamId si no es undefined
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
                existingStoryDoc.ref.set(updateData, {merge: true}),
                eventStoryRef.set(updateData, {merge: true})
            ]);
            console.log(`✅ [STORY] Story actualizada: ${existingStoryDoc.id}`);
            const hasMedia = Boolean(existingData.fileUrl || existingData.clipUrl || existingData.filePath);
            if (hasMedia || updateOnly) {
                return {success: true, storyId: existingStoryDoc.id, updated: true};
            }
            storyRef = existingStoryDoc.ref;
        }

        if (updateOnly) {
            return {success: false, storyId: null, updated: false, skipped: true};
        }

        // 4. Guardar story en Firestore
        const storyPath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories`;
        if (!storyRef) {
            storyRef = await db.collection(storyPath).add(storyData);
            eventStoryRef = db.collection('races').doc(raceId)
                .collection('apps').doc(appId)
                .collection('events').doc(eventId)
                .collection('stories').doc(storyRef.id);

            await eventStoryRef.set(storyData, {merge: true});
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
                eventStoryRef.set(updateData, {merge: true})
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
                } else if (splitStatus !== true) {
                    allowClipGeneration = false;
                    await updateStoryRefs({
                        'generationInfo.status': 'video_split_disabled',
                        'generationInfo.reason': 'video_split_status_not_true'
                    });
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
            try {
                // Determinar timestamp del checkpoint - PRIORIDAD: rawTime del webhook
                let checkpointRawTime = null;

                // 1. PRIORIDAD: Usar rawTime del webhook si está disponible
                if (rawTime) {
                    checkpointRawTime = rawTime; // UNIX timestamp en milliseconds
                }
                // 2. FALLBACK: Buscar rawTime en datos transformados de Copernico
                else if (copernicoData && copernicoData.times) {
                    const times = copernicoData.times;
                    const pointName = extraData?.point;
                    const locationName = extraData?.location;
                    const timeEntry = resolveTimesEntry(times, pointName) || resolveTimesEntry(times, locationName);
                    if (timeEntry && (timeEntry.raw?.rawTime || timeEntry.rawTime)) {
                        checkpointRawTime = timeEntry.raw?.rawTime || timeEntry.rawTime;
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
                        }
                    }
                }

                // Encolar generación de clip para procesamiento en background
                const pendingJobSnapshot = await db.collection("clip_generation_jobs")
                    .where("storyRefPath", "==", storyRef.path)
                    .where("status", "in", ["queued", "processing"])
                    .limit(1)
                    .get();

                if (!pendingJobSnapshot.empty) {
                    const queuedJob = pendingJobSnapshot.docs[0];
                    clipResult = {
                        success: true,
                        queued: true,
                        jobId: queuedJob.id
                    };
                    await updateStoryRefs({
                        "generationInfo.status": "queued",
                        "generationInfo.jobId": queuedJob.id
                    });
                } else {
                    const clipJobRef = db.collection("clip_generation_jobs").doc();
                    await clipJobRef.set({
                        status: "queued",
                        raceId,
                        appId,
                        eventId,
                        participantId,
                        participantExternalId: participantData.externalId || participantId,
                        storyId: storyRef.id,
                        storyRefPath: storyRef.path,
                        eventStoryRefPath: eventStoryRef.path,
                        streamId,
                        checkpointRawTime: checkpointRawTime || Date.now(),
                        checkpointId: extraData?.point || extraData?.location || null,
                        extraData: extraData || {},
                        participantData: participantData || {},
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        attempts: 0
                    });

                    await updateStoryRefs({
                        "generationInfo.status": "queued",
                        "generationInfo.jobId": clipJobRef.id,
                        "generationInfo.queuedAt": admin.firestore.FieldValue.serverTimestamp()
                    });

                    clipResult = {
                        success: true,
                        queued: true,
                        jobId: clipJobRef.id
                    };
                }
            } catch (clipError) {
                console.error(`❌ [STORY] Error encolando clip:`, clipError);

                // Actualizar story con error de encolado
                await updateStoryRefs({
                    'generationInfo.status': 'failed',
                    'generationInfo.error': clipError.message,
                    'generationInfo.failedAt': admin.firestore.FieldValue.serverTimestamp()
                });

                clipResult = {success: false, error: clipError.message};
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
