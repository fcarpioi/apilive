export function normalizePositionsFromRanking(ranking = {}) {
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