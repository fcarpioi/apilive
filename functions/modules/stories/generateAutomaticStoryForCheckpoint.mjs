import admin from "firebase-admin";

/**
 * Función auxiliar para generar historias automáticas cuando un corredor pasa por checkpoint
 */
export async function generateAutomaticStoryForCheckpoint(checkpointData) {
    try {
        const {raceId, eventId, participantId, checkpointId, timestamp, runnerId, runnerBib, clipUrl} = checkpointData;

        console.log(`🎬 Generando historia automática para checkpoint: ${checkpointId}`);

        const db = admin.firestore();

        // Verificar si el participante tiene seguidores
        const followersRef = db.collection("races").doc(raceId)
            .collection("events").doc(eventId)
            .collection("participants").doc(participantId)
            .collection("followers");

        const followersSnapshot = await followersRef.get();
        const hasFollowers = !followersSnapshot.empty;

        // También verificar si es un "atleta destacado" (opcional)
        const participantRef = db.collection("races").doc(raceId)
            .collection("events").doc(eventId)
            .collection("participants").doc(participantId);

        const participantDoc = await participantRef.get();
        const participantData = participantDoc.exists ? participantDoc.data() : {};
        const isFeaturedAthlete = participantData.featured === true || participantData.autoGenerateStories === true;

        // Generar historia si tiene seguidores O es atleta destacado
        if (hasFollowers || isFeaturedAthlete) {
            const storyData = {
                participantId,
                raceId,
                eventId,
                description: `Corredor pasó por ${checkpointId} - Historia generada automáticamente`,
                moderationStatus: "approved",
                originType: "automatic_checkpoint",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                date: admin.firestore.FieldValue.serverTimestamp(),
                // Incluir URL del clip de video si está disponible
                fileUrl: clipUrl || null,
                fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
                // ✅ AGREGADO: Campos faltantes para completar estructura
                contentType: clipUrl ? "video/mp4" : null,
                mediaType: clipUrl ? "video" : null,
                sourceUrl: clipUrl || null,
                fileSize: 0, // Se actualizará cuando se conozca el tamaño real
                duration: clipUrl ? 20 : null, // Clips de 20 segundos por defecto
                filePath: clipUrl ? `races/${raceId}/events/${eventId}/participants/${participantId}/stories/clip_${checkpointId}_${Date.now()}.mp4` : null,
                checkpointInfo: {
                    checkpointId,
                    timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
                    runnerId,
                    runnerBib
                },
                generationInfo: {
                    source: "aws_webhook",
                    reason: hasFollowers ? "has_followers" : "featured_athlete",
                    followersCount: followersSnapshot.size,
                    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    hasVideoClip: !!clipUrl,
                    clipUrl: clipUrl || null,
                    startTime: clipUrl ? new Date(new Date(timestamp).getTime() - 10000).toISOString() : null,
                    endTime: clipUrl ? new Date(new Date(timestamp).getTime() + 10000).toISOString() : null
                }
            };

            // Crear la historia
            const storyRef = db.collection("races").doc(raceId)
                .collection("events").doc(eventId)
                .collection("participants").doc(participantId)
                .collection("stories").doc();

            await storyRef.set(storyData);

            console.log(`✅ Historia automática creada: ${storyRef.id} (${followersSnapshot.size} seguidores)`);

            return storyRef.id;
        } else {
            console.log(`⚠️ No se generó historia: participante sin seguidores y no es destacado`);
            return null;
        }

    } catch (error) {
        console.error("❌ Error generando historia automática:", error);
        throw error;
    }
}