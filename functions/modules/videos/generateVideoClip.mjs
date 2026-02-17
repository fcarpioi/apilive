import fetch from "node-fetch";
import admin from "firebase-admin";

/**
 * Función para generar clip de video usando el API de Copernico
 */
export async function generateVideoClip({streamId, timestamp, raceId, eventId, participantId, checkpointId}) {
    try {
        console.log(`🎬 Generando clip de video para checkpoint: ${checkpointId}`);
        console.log(`📹 StreamId: ${streamId}`);
        console.log(`⏰ Timestamp original: ${timestamp}`);

        // Calcular startTime y endTime (±10 segundos)
        const checkpointTime = new Date(timestamp);
        const startTime = new Date(checkpointTime.getTime() - 10 * 1000).toISOString(); // -10 segundos
        const endTime = new Date(checkpointTime.getTime() + 10 * 1000).toISOString();   // +10 segundos

        console.log(`⏰ Rango de clip: ${startTime} → ${endTime} (20 segundos total)`);

        const clipPayload = {
            streamId,
            startTime,
            endTime
            // frameOverlayUrl es opcional por ahora
        };

        console.log(`📤 Enviando request para generar clip:`, clipPayload);

        // Llamar al API de generación de clips
        const response = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateStoriesFromChunks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clipPayload),
            timeout: 30000 // 30 segundos timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API de clips respondió con ${response.status}: ${errorText}`);
        }

        // ✅ CORREGIDO: La respuesta es JSON con clipUrl
        const result = await response.json();
        const clipUrl = result.clipUrl || result.url || result;
        console.log(`✅ Clip generado exitosamente: ${clipUrl}`);

        // Guardar información del clip en Firestore para referencia
        const db = admin.firestore();
        await db.collection("video-clips").add({
            raceId,
            eventId,
            participantId,
            checkpointId,
            streamId,
            startTime,
            endTime,
            clipUrl: clipUrl,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            originalTimestamp: timestamp
        });

        // 🆕 GUARDAR CLIPURL EN EL CHECKPOINT DONDE SE GENERÓ
        try {
            console.log(`📍 Actualizando checkpoint con clipUrl: ${checkpointId}`);

            const checkpointRef = db.collection("races").doc(raceId)
                .collection("events").doc(eventId)
                .collection("participants").doc(participantId)
                .collection("checkpoints").doc(checkpointId);

            await checkpointRef.update({
                clipUrl: clipUrl,
                clipGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                hasVideoClip: true
            });

            console.log(`✅ Checkpoint actualizado con clipUrl: ${checkpointId}`);
        } catch (checkpointError) {
            console.error(`⚠️ Error actualizando checkpoint con clipUrl:`, checkpointError);
        }

        // 🆕 GUARDAR CLIPURL EN EL SPLIT/LOCATION CORRESPONDIENTE
        try {
            console.log(`🏁 Buscando split/location para checkpoint: ${checkpointId}`);

            // Buscar el evento en la estructura nueva
            let eventDoc = null;
            let eventRef = null;

            // Buscar en todas las apps para encontrar el evento
            const appsSnapshot = await db.collection("races").doc(raceId).collection("apps").get();

            for (const appDoc of appsSnapshot.docs) {
                const appId = appDoc.id;
                const newEventRef = db.collection("races").doc(raceId)
                    .collection("apps").doc(appId)
                    .collection("events").doc(eventId);

                const newEventDoc = await newEventRef.get();
                if (newEventDoc.exists) {
                    eventDoc = newEventDoc;
                    eventRef = newEventRef;
                    console.log(`✅ Evento encontrado: /races/${raceId}/apps/${appId}/events/${eventId}`);
                    break;
                }
            }

            if (eventDoc && eventDoc.exists) {
                const eventData = eventDoc.data();

                // Buscar en splits si existe
                if (eventData.splits && Array.isArray(eventData.splits)) {
                    const splitIndex = eventData.splits.findIndex(split =>
                        split === checkpointId ||
                        split.name === checkpointId ||
                        split.id === checkpointId
                    );

                    if (splitIndex !== -1) {
                        console.log(`📍 Split encontrado en índice ${splitIndex}: ${checkpointId}`);

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
                            generatedAt: admin.firestore.FieldValue.serverTimestamp()
                        };

                        if (!existingSplitQuery.empty) {
                            const docRef = existingSplitQuery.docs[0].ref;
                            await docRef.update(splitPayload);
                            console.log(`✅ ClipUrl actualizado en split (mismo split+participant): ${docRef.id}`);
                        } else {
                            const newDocRef = await splitClipsCol.add({
                                ...splitPayload,
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`✅ ClipUrl guardado en split: ${newDocRef.id}`);
                        }
                    }
                }

                // Buscar en timingPoints si existe
                if (eventData.timingPoints && Array.isArray(eventData.timingPoints)) {
                    const timingIndex = eventData.timingPoints.findIndex(point =>
                        point === checkpointId ||
                        point.name === checkpointId ||
                        point.id === checkpointId
                    );

                    if (timingIndex !== -1) {
                        console.log(`⏱️ Timing point encontrado en índice ${timingIndex}: ${checkpointId}`);

                        // Guardar en la misma estructura donde se encontró el evento
                        const timingClipsRef = eventRef.collection("timing-clips").doc(checkpointId);

                        await timingClipsRef.set({
                            timingPointName: checkpointId,
                            timingIndex: timingIndex,
                            clipUrl: clipUrl,
                            participantId: participantId,
                            raceId: raceId,
                            eventId: eventId,
                            streamId: streamId,
                            timestamp: timestamp,
                            generatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, {merge: true});

                        console.log(`✅ ClipUrl guardado en timing point: ${checkpointId}`);
                    }
                }
            } else {
                console.log(`⚠️ No se encontró el evento ${eventId} en ninguna estructura`);
            }
        } catch (splitError) {
            console.error(`⚠️ Error guardando clipUrl en split/location:`, splitError);
        }

        return clipUrl;

    } catch (error) {
        console.error(`❌ Error generando clip de video:`, error);
        throw error;
    }
}