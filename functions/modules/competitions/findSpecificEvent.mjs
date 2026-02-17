import {normalizeUTF8InObject} from "../utils/normalizeUTF8InObject.mjs";

/**
 * Buscar un evento específico por nombre en una competición
 */
export async function findSpecificEvent(db, competitionId, eventName) {
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
                            await eventDoc.ref.update({eventNameNormalized: normalizedFromDoc});
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