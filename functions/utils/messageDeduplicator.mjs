// messageDeduplicator.mjs
import admin from "firebase-admin";

class MessageDeduplicator {
  constructor() {
    this.db = admin.firestore();
    this.processedMessagesRef = this.db.collection("processed-messages");
  }

  /**
   * Generar ID único para un mensaje de checkpoint
   */
  generateMessageId(raceId, eventId, participantId, checkpointId, timestamp) {
    return `${raceId}:${eventId}:${participantId}:${checkpointId}:${timestamp}`;
  }

  /**
   * Verificar si un mensaje ya fue procesado
   */
  async isMessageProcessed(messageId) {
    try {
      const doc = await this.processedMessagesRef.doc(messageId).get();
      return doc.exists;
    } catch (error) {
      console.error("❌ Error verificando mensaje duplicado:", error);
      return false; // En caso de error, procesar el mensaje
    }
  }

  /**
   * Marcar mensaje como procesado
   */
  async markMessageAsProcessed(messageId, messageData) {
    try {
      await this.processedMessagesRef.doc(messageId).set({
        messageId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        messageData,
        ttl: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) // TTL 24 horas
      });

      console.log(`✅ Mensaje marcado como procesado: ${messageId}`);
    } catch (error) {
      console.error("❌ Error marcando mensaje como procesado:", error);
    }
  }

  /**
   * Procesar mensaje con deduplicación
   */
  async processWithDeduplication(messageData, processingFunction) {
    const { raceId, eventId, participantId, checkpointId, timestamp } = messageData;
    
    const messageId = this.generateMessageId(raceId, eventId, participantId, checkpointId, timestamp);
    
    // Verificar si ya fue procesado
    const alreadyProcessed = await this.isMessageProcessed(messageId);
    
    if (alreadyProcessed) {
      console.log(`⚠️ Mensaje duplicado ignorado: ${messageId}`);
      return { success: true, duplicate: true, messageId };
    }

    try {
      // Procesar mensaje
      const result = await processingFunction(messageData);
      
      // Marcar como procesado solo si fue exitoso
      if (result.success) {
        await this.markMessageAsProcessed(messageId, messageData);
      }

      return { ...result, duplicate: false, messageId };
    } catch (error) {
      console.error(`❌ Error procesando mensaje ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Limpiar mensajes procesados antiguos (TTL automático)
   */
  async cleanupExpiredMessages() {
    try {
      const now = admin.firestore.Timestamp.now();
      
      const expiredSnapshot = await this.processedMessagesRef
        .where("ttl", "<", now)
        .limit(100) // Procesar en lotes
        .get();

      if (expiredSnapshot.empty) {
        console.log("🧹 No hay mensajes expirados para limpiar");
        return;
      }

      const batch = this.db.batch();
      expiredSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`🧹 Limpiados ${expiredSnapshot.size} mensajes expirados`);

    } catch (error) {
      console.error("❌ Error limpiando mensajes expirados:", error);
    }
  }
}

export default new MessageDeduplicator();
