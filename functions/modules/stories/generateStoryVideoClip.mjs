import axios from "axios";

/**
 * Generar clip de video automáticamente para stories
 */
export async function generateStoryVideoClip(streamId, checkpointRawTime, extraData) {
    console.log(`🎬 [CLIP] Generando clip para streamId: ${streamId}`);
    console.log(`🎬 [CLIP] CheckpointRawTime: ${checkpointRawTime}`);

    const retryDelaysMs = [0, 60000, 120000, 180000];

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        const delayMs = retryDelaysMs[attempt];
        if (delayMs > 0) {
            console.log(`⏳ [CLIP] Reintento ${attempt} en ${delayMs / 1000}s`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        try {
            // Calcular ventana de tiempo para el clip (15 segundos antes y después del checkpoint)
            // checkpointRawTime ya viene en milliseconds (UNIX timestamp)
            const startTime = new Date(checkpointRawTime - 15000); // 15 segundos antes
            const endTime = new Date(checkpointRawTime + 15000);   // 15 segundos después

            console.log(`⏰ [CLIP] Ventana de tiempo:`, {
                checkpoint: new Date(checkpointRawTime).toISOString(),
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                rawTime: checkpointRawTime
            });

            // Preparar datos para generateStoriesFromChunks
            const clipData = {
                streamId: streamId,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString()
            };

            console.log(`📡 [CLIP] Llamando a generateStoriesFromChunks (intento ${attempt + 1}):`, clipData);

            // Llamar al API generateStoriesFromChunks
            const response = await axios.post(
                'https://us-central1-copernico-jv5v73.cloudfunctions.net/generateStoriesFromChunks',
                clipData,
                {
                    timeout: 60000, // 60 segundos timeout
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.data && response.data.clipUrl) {
                console.log(`✅ [CLIP] Clip generado exitosamente: ${response.data.clipUrl}`);

                return {
                    success: true,
                    clipUrl: response.data.clipUrl,
                    fileName: response.data.fileName || `clip_${streamId}_${Date.now()}.mp4`,
                    generationInfo: {
                        streamId: streamId,
                        startTime: startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        generatedAt: new Date().toISOString(),
                        apiResponse: response.data
                    }
                };
            } else {
                console.log(`⚠️ [CLIP] Respuesta sin clipUrl:`, response.data);
            }
        } catch (error) {
            console.error(`❌ [CLIP] Error generando clip (intento ${attempt + 1}):`, error.message);
            if (attempt === retryDelaysMs.length - 1) {
                return {
                    success: false,
                    error: error.message,
                    details: error.response?.data || null
                };
            }
        }
    }

    return {
        success: false,
        error: 'No clipUrl in response'
    };
}