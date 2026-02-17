export async function recoverRaceData(db, competitionId){
    let raceData = null;
    let raceDoc = null;
    let copernicoEnv = null;
    let raceSlug = competitionId;

    try {
        const raceDoc = await db.collection('races').doc(competitionId).get();
        if (raceDoc.exists) {
            raceData = raceDoc.data();
            if (raceData.copernicoEnv)
                copernicoEnv = raceData.copernicoEnv;

            raceSlug = raceData?.race_info?.id || null;
        }
    } catch (raceError) {
        console.error(`❌ [BACKGROUND v3] Error obteniendo config de carrera:`, raceError.message);
    }

    return { raceData, raceDoc, copernicoEnv, raceSlug };
}