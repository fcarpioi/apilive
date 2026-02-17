import axios from "axios";

/**
 * Obtener streams de AWS para una competición
 */
export async function getCompetitionStreams(competitionId) {
    console.log(`🎬 [STREAMS] Obteniendo streams para competitionId: ${competitionId}`);

    try {
        const awsBaseUrl = 'https://streams.timingsense.cloud';
        const url = `${awsBaseUrl}/competitions/${competitionId}`;

        console.log(`🌐 [STREAMS] Llamando a: ${url}`);

        const response = await axios.get(url, {
            timeout: 10000, // 10 segundos timeout
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Firebase-Functions/1.0'
            }
        });

        if (response.data && response.data.data && response.data.data.streams) {
            const streams = response.data.data.streams;
            console.log(`✅ [STREAMS] Streams obtenidos:`, streams);

            // Crear mapa de location -> streamId
            const streamMap = {};
            streams.forEach(stream => {
                // Normalizar nombres para matching
                const normalizedName = stream.name.toLowerCase();
                streamMap[normalizedName] = stream.streamId;

                // Agregar variaciones comunes
                if (normalizedName === 'meta') {
                    streamMap['finish'] = stream.streamId;
                    streamMap['meta'] = stream.streamId;
                }
                if (normalizedName === 'salida') {
                    streamMap['start'] = stream.streamId;
                    streamMap['salida'] = stream.streamId;
                }
            });

            return {
                success: true,
                streams: streams,
                streamMap: streamMap
            };
        } else {
            console.log(`⚠️ [AWS] Respuesta sin streams:`, response.data);
            return {
                success: false,
                error: 'No streams found in response'
            };
        }

    } catch (error) {
        console.error(`❌ [STREAMS] Error obteniendo streams:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}