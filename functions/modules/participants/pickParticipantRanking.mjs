/**
 * Selecciona el ranking más avanzado para un participante.
 * Prioriza el split solicitado; si no se envía, usa el split con mayor order/distance.
 */
export function pickParticipantRanking(copernicoData = {}, requestedSplit) {
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