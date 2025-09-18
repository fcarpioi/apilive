// followingTrigger.mjs
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import admin from "firebase-admin";
import fetch from "node-fetch";
import { awsWebSocketClient } from "../websocket/websocketManager.mjs";

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Trigger que se ejecuta cuando un usuario sigue a un participante
 * Escucha: users/{userId}/followings/{participantId}
 * Acción: Hace petición a AWS para obtener datos del participante
 */
export const onUserFollowsParticipant = onDocumentCreated(
  "users/{userId}/followings/{participantId}",
  async (event) => {
    try {
      console.log("🔔 Usuario siguió a un participante");
      
      // Obtener datos del documento creado
      const followingData = event.data.data();
      const { userId } = event.params;
      const participantId = event.params.participantId;
      
      console.log(`👤 Usuario: ${userId}`);
      console.log(`🏃 Participante: ${participantId}`);
      console.log(`📄 Datos:`, followingData);
      
      // Validar que sea un seguimiento de participante
      if (followingData.profileType !== "participant") {
        console.log("⚠️ No es un seguimiento de participante, ignorando");
        return;
      }
      
      // Extraer datos necesarios
      const { raceId, eventId } = followingData;
      
      if (!raceId || !eventId) {
        console.error("❌ Faltan raceId o eventId en el documento de seguimiento");
        return;
      }
      
      console.log("📤 Enviando suscripción a AWS via WebSocket:", {
        raceId,
        eventId,
        participantId
      });

      try {
        // Usar WebSocket con userId para tracking
        await awsWebSocketClient.subscribeToParticipant(raceId, eventId, participantId, userId);

        console.log("✅ Suscripción enviada via WebSocket");
        
        // Opcional: Guardar la suscripción en Firestore para referencia
        const db = admin.firestore();
        await db.collection("aws-subscriptions").add({
          userId,
          participantId,
          raceId,
          eventId,
          method: "websocket",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: "success"
        });

        console.log("✅ Suscripción WebSocket completada exitosamente");

      } catch (awsError) {
        console.error("❌ Error al suscribirse via WebSocket:", awsError);

        // Guardar el error para debugging
        const db = admin.firestore();
        await db.collection("aws-subscriptions").add({
          userId,
          participantId,
          raceId,
          eventId,
          method: "websocket",
          error: awsError.message,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: "error"
        });
      }
      
    } catch (error) {
      console.error("❌ Error en trigger de seguimiento:", error);
    }
  }
);

/**
 * Función auxiliar para generar historias automáticas
 * (Se puede llamar desde el webhook o desde este trigger)
 */
export async function generateAutomaticStory(participantData, checkpointData) {
  try {
    console.log("🎬 Generando historia automática...");
    
    const { raceId, eventId, participantId } = participantData;
    const db = admin.firestore();
    
    // Crear historia automática
    const storyData = {
      participantId,
      raceId,
      eventId,
      description: "Historia generada automáticamente por checkpoint",
      moderationStatus: "approved",
      originType: "automatic_checkpoint",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      date: admin.firestore.FieldValue.serverTimestamp(),
      checkpointInfo: checkpointData,
      generationInfo: {
        source: "aws_webhook",
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    };
    
    // Guardar en la colección de stories
    const storyRef = db.collection("races").doc(raceId)
      .collection("events").doc(eventId)
      .collection("participants").doc(participantId)
      .collection("stories").doc();
    
    await storyRef.set(storyData);
    
    console.log(`✅ Historia automática creada: ${storyRef.id}`);
    return storyRef.id;
    
  } catch (error) {
    console.error("❌ Error generando historia automática:", error);
    throw error;
  }
}
