import {
    sendSilentCheckpointNotificationToFollowers
} from "../notifications/sendSilentCheckpointNotificationToFollowers.mjs";

/**
 * Procesar participante en una ubicación específica
 */
export async function processParticipantInLocation(db, location, participantData, timestamp, extraData = {}, rawTime = null, transformedData = null) {
    const {raceId, appId, eventId} = location;

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
    } else {
        // Crear nuevo usando externalId como document ID
        locationParticipantData.createdAt = timestamp;
        locationParticipantData.registerDate = timestamp;

        // Usar externalId como document ID para consistencia (participantRef ya está definido arriba)
        await participantRef.set(locationParticipantData);
        participantId = externalId; // El ID del documento es el externalId
        isNewParticipant = true;
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