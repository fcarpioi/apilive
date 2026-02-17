import admin from "firebase-admin";

/**
 * Crear split-clips cuando se genera un clip desde una story
 */
export async function createSplitClipsFromStory({
                                                    db,
                                                    raceId,
                                                    appId,
                                                    eventId,
                                                    participantId,
                                                    checkpointId,
                                                    clipUrl,
                                                    streamId,
                                                    timestamp
                                                }) {
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
                    const newDocRef = await splitClipsCol.add({
                        ...splitPayload,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
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
                    const newDocRef = await timingClipsCol.add({
                        ...timingPayload,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`✅ [SPLIT-CLIPS] Timing-clip creado: ${newDocRef.id} (timing: ${checkpointId}, participant: ${participantId})`);
                }
            }
        }

    } catch (error) {
        console.error(`❌ [SPLIT-CLIPS] Error creando split-clips:`, error);
        throw error;
    }
}