// subscriptionManager.mjs
import admin from "firebase-admin";

class SubscriptionManager {
  constructor() {
    this.db = admin.firestore();
    this.subscriptionsRef = this.db.collection("aws-websocket-subscriptions");
  }

  /**
   * Guardar suscripción en Firestore
   */
  async saveSubscription(raceId, eventId, participantId, userId = null) {
    try {
      const subscriptionId = `${raceId}:${eventId}:${participantId}`;
      
      await this.subscriptionsRef.doc(subscriptionId).set({
        raceId,
        eventId,
        participantId,
        userId,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSentAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Suscripción guardada: ${subscriptionId}`);
      return subscriptionId;
    } catch (error) {
      console.error("❌ Error guardando suscripción:", error);
      throw error;
    }
  }

  /**
   * Obtener todas las suscripciones activas
   */
  async getActiveSubscriptions() {
    try {
      const snapshot = await this.subscriptionsRef
        .where("status", "==", "active")
        .get();

      const subscriptions = [];
      snapshot.forEach(doc => {
        subscriptions.push({
          id: doc.id,
          ...doc.data()
        });
      });

      console.log(`📋 Encontradas ${subscriptions.length} suscripciones activas`);
      return subscriptions;
    } catch (error) {
      console.error("❌ Error obteniendo suscripciones:", error);
      return [];
    }
  }

  /**
   * Marcar suscripción como inactiva
   */
  async deactivateSubscription(subscriptionId) {
    try {
      await this.subscriptionsRef.doc(subscriptionId).update({
        status: "inactive",
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`⚠️ Suscripción desactivada: ${subscriptionId}`);
    } catch (error) {
      console.error("❌ Error desactivando suscripción:", error);
    }
  }

  /**
   * Limpiar suscripciones antiguas (más de 24 horas)
   */
  async cleanupOldSubscriptions() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const snapshot = await this.subscriptionsRef
        .where("createdAt", "<", admin.firestore.Timestamp.fromDate(oneDayAgo))
        .get();

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`🧹 Limpiadas ${snapshot.size} suscripciones antiguas`);
    } catch (error) {
      console.error("❌ Error limpiando suscripciones:", error);
    }
  }
}

export default new SubscriptionManager();
