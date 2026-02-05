// websocketConfig.mjs
import admin from "firebase-admin";

class WebSocketConfig {
  constructor() {
    this.config = null;
    // COMENTADO TEMPORALMENTE PARA EVITAR INICIALIZACIÓN DURANTE BUILD
    // this.loadConfig();
  }

  /**
   * Cargar configuración desde variables de entorno y Firebase Config
   */
  loadConfig() {
    this.config = {
      // URLs y endpoints
      aws: {
        websocketUrl: process.env.AWS_WEBSOCKET_URL || this.getFirebaseConfig('aws.websocket_url') || "wss://aws-socket-temporal.com/live-timing",
        apiKey: process.env.AWS_API_KEY || this.getFirebaseConfig('aws.api_key') || "tu-aws-api-key",
        testingUrl: process.env.AWS_TESTING_URL || this.getFirebaseConfig('aws.testing_url') || null
      },

      // Configuración de reconexión
      reconnection: {
        maxAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS) || 10,
        initialDelay: parseInt(process.env.WS_INITIAL_DELAY) || 5000,
        maxDelay: parseInt(process.env.WS_MAX_DELAY) || 30000,
        backoffMultiplier: parseFloat(process.env.WS_BACKOFF_MULTIPLIER) || 1.5
      },

      // Configuración de monitoreo
      monitoring: {
        healthCheckInterval: parseInt(process.env.WS_HEALTH_CHECK_INTERVAL) || 5 * 60 * 1000, // 5 minutos
        metricsRetentionDays: parseInt(process.env.WS_METRICS_RETENTION_DAYS) || 7,
        alertThresholdMinutes: parseInt(process.env.WS_ALERT_THRESHOLD_MINUTES) || 10
      },

      // Configuración de mensajes
      messages: {
        deduplicationTtlHours: parseInt(process.env.WS_DEDUP_TTL_HOURS) || 24,
        maxProcessingTimeMs: parseInt(process.env.WS_MAX_PROCESSING_TIME) || 5000,
        retryAttempts: parseInt(process.env.WS_RETRY_ATTEMPTS) || 3
      },

      // URLs internas
      internal: {
        webhookUrl: process.env.WEBHOOK_URL || "https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint",
        webhookApiKey: process.env.WEBHOOK_API_KEY || "MISSING_WEBHOOK_API_KEY"
      },

      // Configuración de desarrollo
      development: {
        enableDebugLogs: process.env.NODE_ENV !== 'production',
        enableTestMode: process.env.WS_TEST_MODE === 'true',
        simulateLatency: parseInt(process.env.WS_SIMULATE_LATENCY) || 0
      }
    };

    console.log("⚙️ Configuración WebSocket cargada:", {
      awsUrl: this.config.aws.websocketUrl,
      hasApiKey: !!this.config.aws.apiKey,
      environment: process.env.NODE_ENV || 'development',
      testMode: this.config.development.enableTestMode
    });
  }

  /**
   * Obtener configuración de Firebase Functions
   */
  getFirebaseConfig(path) {
    try {
      const functions = admin.functions();
      return functions.config()[path];
    } catch (error) {
      return null;
    }
  }

  /**
   * Obtener configuración completa
   */
  getConfig() {
    return this.config;
  }

  /**
   * Obtener configuración específica
   */
  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  }

  /**
   * Validar configuración crítica
   */
  validateConfig() {
    const errors = [];

    // Validar URL de WebSocket
    if (!this.config.aws.websocketUrl || this.config.aws.websocketUrl.includes('temporal')) {
      errors.push("AWS WebSocket URL no configurada o usando valor temporal");
    }

    // Validar API Key
    if (!this.config.aws.apiKey || this.config.aws.apiKey === 'tu-aws-api-key') {
      errors.push("AWS API Key no configurada o usando valor temporal");
    }

    // Validar URL de webhook interno
    if (!this.config.internal.webhookUrl) {
      errors.push("URL de webhook interno no configurada");
    }

    if (errors.length > 0) {
      console.warn("⚠️ Problemas de configuración detectados:");
      errors.forEach(error => console.warn(`  - ${error}`));
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Configuración inválida para producción: ${errors.join(', ')}`);
      }
    }

    return errors.length === 0;
  }

  /**
   * Recargar configuración
   */
  reload() {
    console.log("🔄 Recargando configuración WebSocket...");
    this.loadConfig();
    return this.validateConfig();
  }

  /**
   * Obtener configuración para logging (sin datos sensibles)
   */
  getLoggableConfig() {
    return {
      aws: {
        websocketUrl: this.config.aws.websocketUrl,
        hasApiKey: !!this.config.aws.apiKey,
        hasTestingUrl: !!this.config.aws.testingUrl
      },
      reconnection: this.config.reconnection,
      monitoring: this.config.monitoring,
      messages: this.config.messages,
      development: this.config.development
    };
  }
}

// COMENTADO TEMPORALMENTE PARA EVITAR INICIALIZACIÓN DURANTE BUILD
// Crear instancia singleton
// const websocketConfig = new WebSocketConfig();

// Validar configuración al cargar
// websocketConfig.validateConfig();

// export default websocketConfig;

// Exportar función factory en lugar de instancia singleton
export function createWebSocketConfig() {
  const config = new WebSocketConfig();
  config.loadConfig();
  config.validateConfig();
  return config;
}

export { WebSocketConfig };
