// copernicoMonitor.mjs
import { admin } from '../config/firebaseConfig.mjs';

/**
 * Sistema de monitoreo para las conexiones WebSocket de Copernico
 */
class CopernicoMonitor {
  
  constructor() {
    this.db = admin.firestore();
    this.metrics = {
      connectionsAttempted: 0,
      connectionsSuccessful: 0,
      connectionsFailed: 0,
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      lastError: null,
      uptime: Date.now()
    };
    
    this.alerts = [];
    this.maxAlerts = 100;
  }

  /**
   * Registrar intento de conexión
   */
  recordConnectionAttempt() {
    this.metrics.connectionsAttempted++;
    this.metrics.lastConnectionAttempt = new Date().toISOString();
    console.log(`📊 [CopernicoMonitor] Intento de conexión #${this.metrics.connectionsAttempted}`);
  }

  /**
   * Registrar conexión exitosa
   */
  recordSuccessfulConnection() {
    this.metrics.connectionsSuccessful++;
    this.metrics.lastSuccessfulConnection = new Date().toISOString();
    console.log(`✅ [CopernicoMonitor] Conexión exitosa #${this.metrics.connectionsSuccessful}`);
    
    this.createAlert('info', 'Conexión WebSocket establecida', {
      timestamp: this.metrics.lastSuccessfulConnection,
      totalConnections: this.metrics.connectionsSuccessful
    });
  }

  /**
   * Registrar fallo de conexión
   */
  recordConnectionFailure(error) {
    this.metrics.connectionsFailed++;
    this.metrics.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      type: 'connection_failure'
    };
    
    console.error(`❌ [CopernicoMonitor] Fallo de conexión #${this.metrics.connectionsFailed}:`, error);
    
    this.createAlert('error', 'Fallo de conexión WebSocket', {
      error: error.message,
      timestamp: this.metrics.lastError.timestamp,
      totalFailures: this.metrics.connectionsFailed
    });
  }

  /**
   * Registrar mensaje recibido
   */
  recordMessageReceived(messageType, data) {
    this.metrics.messagesReceived++;
    console.log(`📨 [CopernicoMonitor] Mensaje recibido #${this.metrics.messagesReceived} (${messageType})`);
    
    // Log detallado cada 10 mensajes
    if (this.metrics.messagesReceived % 10 === 0) {
      this.createAlert('info', `${this.metrics.messagesReceived} mensajes procesados`, {
        messageType,
        totalReceived: this.metrics.messagesReceived,
        totalProcessed: this.metrics.messagesProcessed
      });
    }
  }

  /**
   * Registrar mensaje procesado exitosamente
   */
  recordMessageProcessed(messageType, result) {
    this.metrics.messagesProcessed++;
    console.log(`✅ [CopernicoMonitor] Mensaje procesado #${this.metrics.messagesProcessed} (${messageType})`);
  }

  /**
   * Registrar fallo en procesamiento de mensaje
   */
  recordMessageFailure(messageType, error) {
    this.metrics.messagesFailed++;
    this.metrics.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      type: 'message_processing_failure',
      messageType
    };
    
    console.error(`❌ [CopernicoMonitor] Fallo procesando mensaje #${this.metrics.messagesFailed} (${messageType}):`, error);
    
    this.createAlert('error', 'Error procesando mensaje', {
      messageType,
      error: error.message,
      timestamp: this.metrics.lastError.timestamp,
      totalFailures: this.metrics.messagesFailed
    });
  }

  /**
   * Crear alerta
   */
  createAlert(level, message, data = {}) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level, // 'info', 'warning', 'error', 'critical'
      message,
      data,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.unshift(alert);
    
    // Mantener solo las últimas alertas
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Log según el nivel
    switch (level) {
      case 'error':
      case 'critical':
        console.error(`🚨 [CopernicoMonitor] ${level.toUpperCase()}: ${message}`, data);
        break;
      case 'warning':
        console.warn(`⚠️ [CopernicoMonitor] WARNING: ${message}`, data);
        break;
      default:
        console.log(`ℹ️ [CopernicoMonitor] INFO: ${message}`, data);
    }

    // Guardar alertas críticas en Firestore
    if (level === 'critical' || level === 'error') {
      this.saveAlertToFirestore(alert).catch(error => {
        console.error('Error guardando alerta en Firestore:', error);
      });
    }

    return alert;
  }

  /**
   * Guardar alerta en Firestore
   */
  async saveAlertToFirestore(alert) {
    try {
      await this.db.collection('system-alerts').doc(alert.id).set({
        ...alert,
        source: 'copernico-websocket',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error guardando alerta:', error);
    }
  }

  /**
   * Obtener métricas actuales
   */
  getMetrics() {
    const now = Date.now();
    const uptimeMs = now - this.metrics.uptime;
    
    return {
      ...this.metrics,
      uptimeMs,
      uptimeFormatted: this.formatUptime(uptimeMs),
      successRate: this.metrics.connectionsAttempted > 0 
        ? (this.metrics.connectionsSuccessful / this.metrics.connectionsAttempted * 100).toFixed(2) + '%'
        : '0%',
      messageSuccessRate: this.metrics.messagesReceived > 0
        ? (this.metrics.messagesProcessed / this.metrics.messagesReceived * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Obtener alertas recientes
   */
  getRecentAlerts(limit = 20) {
    return this.alerts.slice(0, limit);
  }

  /**
   * Formatear tiempo de actividad
   */
  formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Resetear métricas
   */
  resetMetrics() {
    console.log('🔄 [CopernicoMonitor] Reseteando métricas');
    this.metrics = {
      connectionsAttempted: 0,
      connectionsSuccessful: 0,
      connectionsFailed: 0,
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      lastError: null,
      uptime: Date.now()
    };
    this.alerts = [];
  }
}

// Crear instancia singleton
const copernicoMonitor = new CopernicoMonitor();

export default copernicoMonitor;
