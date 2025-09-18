// websocketMonitor.mjs
import admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

class WebSocketMonitor {
  constructor() {
    this.db = admin.firestore();
    this.metricsRef = this.db.collection("websocket-metrics");
    this.alertsRef = this.db.collection("websocket-alerts");
  }

  /**
   * Registrar métrica de conexión
   */
  async recordConnectionMetric(status, details = {}) {
    try {
      await this.metricsRef.add({
        type: "connection",
        status, // "connected", "disconnected", "error"
        details,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("❌ Error registrando métrica:", error);
    }
  }

  /**
   * Registrar métrica de mensaje procesado
   */
  async recordMessageMetric(messageType, processingTime, success = true) {
    try {
      await this.metricsRef.add({
        type: "message",
        messageType,
        processingTime,
        success,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("❌ Error registrando métrica de mensaje:", error);
    }
  }

  /**
   * Crear alerta crítica
   */
  async createAlert(level, message, details = {}) {
    try {
      const alert = {
        level, // "warning", "error", "critical"
        message,
        details,
        resolved: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await this.alertsRef.add(alert);
      console.log(`🚨 Alerta ${level}: ${message}`);

      // Si es crítica, enviar notificación inmediata
      if (level === "critical") {
        await this.sendCriticalAlert(alert);
      }
    } catch (error) {
      console.error("❌ Error creando alerta:", error);
    }
  }

  /**
   * Enviar alerta crítica (implementar según necesidades)
   */
  async sendCriticalAlert(alert) {
    // TODO: Implementar notificación por email, Slack, etc.
    console.log("🚨 ALERTA CRÍTICA:", alert);
  }

  /**
   * Verificar salud del WebSocket
   */
  async checkWebSocketHealth() {
    try {
      // Verificar última conexión exitosa
      const lastConnectionSnapshot = await this.metricsRef
        .where("type", "==", "connection")
        .where("status", "==", "connected")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (lastConnectionSnapshot.empty) {
        await this.createAlert("critical", "No hay conexiones WebSocket registradas");
        return false;
      }

      const lastConnection = lastConnectionSnapshot.docs[0].data();
      const lastConnectionTime = lastConnection.timestamp.toDate();
      const now = new Date();
      const timeDiff = now - lastConnectionTime;

      // Si la última conexión fue hace más de 10 minutos
      if (timeDiff > 10 * 60 * 1000) {
        await this.createAlert("critical", 
          `WebSocket desconectado por ${Math.round(timeDiff / 60000)} minutos`,
          { lastConnectionTime: lastConnectionTime.toISOString() }
        );
        return false;
      }

      // Verificar mensajes recientes
      const recentMessagesSnapshot = await this.metricsRef
        .where("type", "==", "message")
        .where("timestamp", ">", admin.firestore.Timestamp.fromDate(new Date(now - 30 * 60 * 1000)))
        .get();

      console.log(`📊 Salud WebSocket: ${recentMessagesSnapshot.size} mensajes en últimos 30 min`);
      return true;

    } catch (error) {
      console.error("❌ Error verificando salud:", error);
      await this.createAlert("error", "Error verificando salud del WebSocket", { error: error.message });
      return false;
    }
  }

  /**
   * Obtener estadísticas de rendimiento
   */
  async getPerformanceStats(hours = 24) {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const messagesSnapshot = await this.metricsRef
        .where("type", "==", "message")
        .where("timestamp", ">", admin.firestore.Timestamp.fromDate(since))
        .get();

      let totalMessages = 0;
      let successfulMessages = 0;
      let totalProcessingTime = 0;

      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        totalMessages++;
        if (data.success) successfulMessages++;
        if (data.processingTime) totalProcessingTime += data.processingTime;
      });

      const stats = {
        totalMessages,
        successfulMessages,
        failedMessages: totalMessages - successfulMessages,
        successRate: totalMessages > 0 ? (successfulMessages / totalMessages * 100).toFixed(2) : 0,
        averageProcessingTime: totalMessages > 0 ? (totalProcessingTime / totalMessages).toFixed(2) : 0,
        period: `${hours} horas`
      };

      console.log("📊 Estadísticas de rendimiento:", stats);
      return stats;

    } catch (error) {
      console.error("❌ Error obteniendo estadísticas:", error);
      return null;
    }
  }
}

const monitor = new WebSocketMonitor();

/**
 * Función programada para verificar salud cada 5 minutos
 */
export const websocketHealthCheck = onSchedule("every 5 minutes", async (event) => {
  console.log("🔍 Verificando salud del WebSocket...");
  await monitor.checkWebSocketHealth();
});

/**
 * Función programada para limpiar métricas antiguas cada día
 */
export const cleanupOldMetrics = onSchedule("every 24 hours", async (event) => {
  try {
    console.log("🧹 Limpiando métricas antiguas...");
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const oldMetricsSnapshot = await monitor.metricsRef
      .where("timestamp", "<", admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();

    const batch = monitor.db.batch();
    oldMetricsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`🧹 Limpiadas ${oldMetricsSnapshot.size} métricas antiguas`);

  } catch (error) {
    console.error("❌ Error limpiando métricas:", error);
  }
});

export default monitor;
