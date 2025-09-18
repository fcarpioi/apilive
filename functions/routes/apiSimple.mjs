// apiSimple.mjs - Versión simplificada solo con el endpoint necesario
import express from "express";
import admin from "firebase-admin";
import fetch from "node-fetch";

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}

const router = express.Router();
router.use(express.json({ limit: "50mb" }));
router.use(express.urlencoded({ limit: "50mb", extended: true }));

/**
 * Endpoint raíz
 */
router.get("/", (req, res) => {
  res.send("¡Express en Firebase Functions - Versión Simplificada!");
});

/**
 * Función para generar clip de video usando el API de Copernico
 */
async function generateVideoClip({ streamId, timestamp, raceId, eventId, participantId, checkpointId }) {
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
    const response = await fetch('https://us-central1-copernico-jv5v73.cloudfunctions.net/generateClipUrlFromAsset', {
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
    
    const result = await response.json();
    console.log(`✅ Clip generado exitosamente:`, result);
    
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
      clipUrl: result.clipUrl || result.url || result,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      originalTimestamp: timestamp
    });
    
    return result.clipUrl || result.url || result;
    
  } catch (error) {
    console.error(`❌ Error generando clip de video:`, error);
    throw error;
  }
}

/**
 * Endpoint simplificado para cambios de participantes (NUEVO FLUJO)
 */
router.post("/participant-checkpoint", async (req, res) => {
  try {
    console.log("🔔 Cambio de participante recibido:", JSON.stringify(req.body, null, 2));
    
    const { runnerId, raceId, eventId, apiKey, data } = req.body;
    
    // 1. Validar API key
    const expectedApiKey = process.env.WEBHOOK_API_KEY || "9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0";
    if (!apiKey || apiKey !== expectedApiKey) {
      console.error("❌ API key inválida");
      return res.status(401).json({ error: "API key inválida" });
    }
    
    // 2. Validar parámetros requeridos
    if (!runnerId || !raceId || !eventId || !data) {
      console.error("❌ Parámetros faltantes");
      return res.status(400).json({ 
        error: "Parámetros faltantes",
        required: ["runnerId", "raceId", "eventId", "data"],
        received: { runnerId: !!runnerId, raceId: !!raceId, eventId: !!eventId, data: !!data }
      });
    }
    
    // 3. Validar estructura de datos
    if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
      console.error("❌ Estructura de datos inválida: falta events");
      return res.status(400).json({
        error: "Estructura de datos inválida",
        expected: "data.events debe ser un array con al menos un evento"
      });
    }
    
    console.log("✅ Validación exitosa");
    console.log(`📊 Procesando participante: runnerId=${runnerId}`);

    const db = admin.firestore();
    
    // 4. Extraer información del participante
    const runnerBib = data.events[0]?.dorsal || null;
    const runnerName = data.name || data.fullname || "Participante";
    
    console.log(`👤 Datos del participante: ${runnerName}, dorsal: ${runnerBib}`);
    
    // 5. Buscar el participante por runnerId o runnerBib
    let participantId = null;
    const participantsRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants");
    
    console.log(`🔍 Buscando participante: runnerId=${runnerId}, bib=${runnerBib}`);
    
    // Intentar buscar por runnerId primero
    const participantByIdQuery = await participantsRef
      .where("runnerId", "==", runnerId)
      .get();
    
    if (!participantByIdQuery.empty) {
      participantId = participantByIdQuery.docs[0].id;
      console.log(`✅ Participante encontrado por runnerId: ${participantId}`);
    } else if (runnerBib) {
      // Si no se encuentra por runnerId, buscar por número de dorsal
      const participantByBibQuery = await participantsRef
        .where("bib", "==", runnerBib)
        .get();
      
      if (!participantByBibQuery.empty) {
        participantId = participantByBibQuery.docs[0].id;
        console.log(`✅ Participante encontrado por bib: ${participantId}`);
      }
    }
    
    if (!participantId) {
      console.error(`❌ Participante no encontrado: runnerId=${runnerId}, bib=${runnerBib}`);
      return res.status(404).json({ 
        error: "Participante no encontrado",
        runnerId,
        runnerBib
      });
    }
    
    // 6. Procesar checkpoints del evento
    const eventData = data.events[0]; // Tomar el primer evento
    const times = eventData.times || {};
    
    console.log(`📍 Procesando ${Object.keys(times).length} checkpoints...`);
    
    let newCheckpointsProcessed = 0;
    let storiesCreated = 0;
    const processedCheckpoints = [];
    
    // Procesar cada checkpoint en times
    for (const [pointName, timeData] of Object.entries(times)) {
      try {
        console.log(`\n🔍 Procesando checkpoint: ${pointName}`);
        
        // Extraer datos del checkpoint
        const checkpointId = pointName;
        const timestamp = new Date(timeData.raw?.originalTime || timeData.raw?.rawTime || Date.now());
        const streamId = timeData.raw?.device || `stream-${pointName}-${runnerId}`; // Usar device como streamId o generar uno
        
        console.log(`⏰ Timestamp: ${timestamp.toISOString()}`);
        console.log(`📹 StreamId: ${streamId}`);
        
        // Verificar si el checkpoint ya existe
        const checkpointRef = db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId)
          .collection("checkpoints").doc(checkpointId);
        
        const existingCheckpoint = await checkpointRef.get();
        
        if (!existingCheckpoint.exists) {
          // Guardar checkpoint nuevo
          const checkpointData = {
            runnerId,
            runnerBib: runnerBib || null,
            checkpointId,
            timestamp: admin.firestore.Timestamp.fromDate(timestamp),
            streamId,
            timeData: timeData, // Guardar todos los datos del tiempo
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            processed: true,
            source: "aws_endpoint"
          };
          
          await checkpointRef.set(checkpointData);
          console.log(`✅ Checkpoint guardado: ${checkpointId}`);
          newCheckpointsProcessed++;
        } else {
          console.log(`⚠️ Checkpoint ya existe: ${checkpointId}`);
        }
        
        // Verificar si ya existe historia para este checkpoint
        const storiesRef = db.collection("races").doc(raceId)
          .collection("events").doc(eventId)
          .collection("participants").doc(participantId)
          .collection("stories");
        
        const existingStoryQuery = await storiesRef
          .where("checkpointInfo.checkpointId", "==", checkpointId)
          .limit(1)
          .get();
        
        if (!existingStoryQuery.empty) {
          console.log(`⚠️ Historia ya existe para checkpoint: ${checkpointId}`);
          processedCheckpoints.push({
            checkpointId,
            action: "skipped",
            reason: "story_exists",
            storyId: existingStoryQuery.docs[0].id
          });
          continue; // Pasar al siguiente checkpoint
        }
        
        // Generar clip de video si streamId es válido
        let clipUrl = null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (uuidRegex.test(streamId)) {
          try {
            clipUrl = await generateVideoClip({
              streamId,
              timestamp: timestamp.toISOString(),
              raceId,
              eventId,
              participantId,
              checkpointId
            });
            console.log(`✅ Clip de video generado: ${clipUrl}`);
          } catch (clipError) {
            console.error("⚠️ Error generando clip de video:", clipError);
          }
        } else {
          console.log(`⚠️ StreamId no es UUID válido, no se puede generar clip: ${streamId}`);
        }
        
        // Crear historia automática
        const storyData = {
          participantId,
          raceId,
          eventId,
          description: `${runnerName} pasó por ${checkpointId} - Historia generada automáticamente`,
          moderationStatus: "approved",
          originType: "automatic_checkpoint",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          date: admin.firestore.FieldValue.serverTimestamp(),
          fileUrl: clipUrl || null,
          fileName: clipUrl ? `clip_${checkpointId}_${Date.now()}.mp4` : null,
          checkpointInfo: {
            checkpointId,
            timestamp: admin.firestore.Timestamp.fromDate(timestamp),
            runnerId,
            runnerBib,
            streamId,
            timeData: timeData
          },
          generationInfo: {
            source: "aws_endpoint_simple",
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            hasVideoClip: !!clipUrl
          }
        };
        
        const storyRef = await storiesRef.add(storyData);
        console.log(`✅ Historia creada: ${storyRef.id}`);
        storiesCreated++;
        
        processedCheckpoints.push({
          checkpointId,
          action: "created",
          storyId: storyRef.id,
          clipGenerated: !!clipUrl
        });
        
      } catch (checkpointError) {
        console.error(`❌ Error procesando checkpoint ${pointName}:`, checkpointError);
        processedCheckpoints.push({
          checkpointId: pointName,
          action: "error",
          error: checkpointError.message
        });
      }
    }
    
    // Respuesta final con resumen del procesamiento
    console.log(`\n📊 Resumen del procesamiento:`);
    console.log(`   - Checkpoints nuevos: ${newCheckpointsProcessed}`);
    console.log(`   - Historias creadas: ${storiesCreated}`);
    console.log(`   - Total procesados: ${processedCheckpoints.length}`);
    
    return res.status(200).json({
      success: true,
      message: `Participante procesado correctamente`,
      data: {
        participantId,
        participantName: runnerName,
        runnerId,
        runnerBib,
        checkpointsProcessed: processedCheckpoints.length,
        newCheckpoints: newCheckpointsProcessed,
        storiesCreated: storiesCreated,
        checkpoints: processedCheckpoints
      }
    });
    
  } catch (error) {
    console.error("❌ Error procesando cambio de participante:", error);
    return res.status(500).json({ 
      error: "Error interno del servidor",
      details: error.message
    });
  }
});

export default router;
