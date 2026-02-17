import {normalizePositionsFromRanking} from "./normalizePositionsFromRanking.mjs";

export function getPositionByType(ranking = {}, type = "overall") {
    const normalizedPositions = normalizePositionsFromRanking(ranking);
    switch (type) {
        case "gender":
            return normalizedPositions.gender
                ?? normalizedPositions.genderNet
                ?? ranking.posGen
                ?? ranking.posGenNet
                ?? ranking.pos
                ?? ranking.posNet
                ?? null;
        case "category":
            return normalizedPositions.category
                ?? normalizedPositions.categoryNet
                ?? ranking.posCat
                ?? ranking.posCatNet
                ?? null;
        default:
            return normalizedPositions.overall
                ?? normalizedPositions.overallNet
                ?? ranking.posGen
                ?? ranking.pos
                ?? ranking.posGenNet
                ?? ranking.posNet
                ?? null;
    }
}