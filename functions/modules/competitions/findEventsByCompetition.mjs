/**
 * Buscar todos los eventos dentro de una competición
 */
export async function findEventsByCompetition(db, competitionId) {
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