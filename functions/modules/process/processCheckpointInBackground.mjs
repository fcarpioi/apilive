import admin from "firebase-admin";
import copernicoService from "../../services/copernicoService.mjs";
import {findSpecificEvent} from "../competitions/findSpecificEvent.mjs";
import {findEventsByCompetition} from "../competitions/findEventsByCompetition.mjs";
import {getCompetitionStreams} from "../competitions/getCompetitionStreams.mjs";
import {processParticipantInLocation} from "./processParticipantInLocation.mjs";
import {createAutomaticStory} from "../stories/createAutomaticStory.mjs";
import {recoverRaceData} from "../db/recoverRaceData.mjs";

/**
 * Función para procesar checkpoint en background (no bloquea la respuesta HTTP)
 */
export async function processCheckpointInBackground(competitionId, copernicoId, participantId, type, extraData, rawTime, requestId, queueKey) {
    console.log(`🔄 [BACKGROUND] Procesando checkpoint: ${requestId}`);
    console.log(`📊 [BACKGROUND] Datos recibidos:`, {
        competitionId,
        copernicoId,
        participantId,
        type,
        extraData,
        rawTime
    });

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
            const {raceData, copernicoEnv} = await recoverRaceData(db, competitionId);

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
                {forceRefresh: type === 'modification'}
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

            const safeParticipantData = participantData ?? null;
            // Actualizar checkpoint como completado pero sin ubicaciones
            await checkpointRef.update({
                status: 'completed_no_events',
                completedAt: timestamp,
                message: `No se encontraron eventos para competitionId: ${competitionId}`,
                ...(safeParticipantData !== null ? {participantData: safeParticipantData} : {}),
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