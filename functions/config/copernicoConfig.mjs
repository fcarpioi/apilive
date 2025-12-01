// copernicoConfig.mjs
import admin from "firebase-admin";

class CopernicoConfig {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  /**
   * Cargar configuración desde variables de entorno y Firebase Config
   */
  loadConfig() {
    this.config = {
      // URLs base para diferentes entornos
      api: {
        dev: {
          baseUrl: process.env.COPERNICO_DEV_BASE_URL || "https://demo-api.copernico.cloud",
          apiKey: process.env.COPERNICO_DEV_API_KEY || this.getFirebaseConfig('copernico.dev.api_key')
        },
        prod: {
          baseUrl: process.env.COPERNICO_PROD_BASE_URL || "https://vendor-api.copernico.cloud", 
          apiKey: process.env.COPERNICO_PROD_API_KEY || this.getFirebaseConfig('copernico.prod.api_key')
        }
      },

      // Configuración de entorno actual
      environment: process.env.NODE_ENV || 'development',

      // Configuración de timeouts y reintentos
      request: {
        timeoutMs: parseInt(process.env.COPERNICO_TIMEOUT_MS) || 10000,
        retryAttempts: parseInt(process.env.COPERNICO_RETRY_ATTEMPTS) || 3,
        retryDelayMs: parseInt(process.env.COPERNICO_RETRY_DELAY_MS) || 1000
      },

      // Configuración de cache
      cache: {
        participantTtlMinutes: parseInt(process.env.COPERNICO_CACHE_TTL_MINUTES) || 30,
        enableCache: process.env.COPERNICO_ENABLE_CACHE !== 'false'
      },

      // Configuración de logging
      logging: {
        enableDebugLogs: process.env.NODE_ENV !== 'production',
        logRequests: process.env.COPERNICO_LOG_REQUESTS === 'true',
        logResponses: process.env.COPERNICO_LOG_RESPONSES === 'true'
      }
    };

    console.log("⚙️ Configuración Copernico cargada:", {
      environment: this.config.environment,
      devBaseUrl: this.config.api.dev.baseUrl,
      prodBaseUrl: this.config.api.prod.baseUrl,
      hasDevApiKey: !!this.config.api.dev.apiKey,
      hasProdApiKey: !!this.config.api.prod.apiKey,
      cacheEnabled: this.config.cache.enableCache
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
   * Obtener configuración del entorno actual
   */
  getCurrentEnvironmentConfig() {
    const isProduction = this.config.environment === 'production';
    return isProduction ? this.config.api.prod : this.config.api.dev;
  }

  /**
   * Obtener URL completa para un endpoint
   */
  getApiUrl(raceId, participantId) {
    const envConfig = this.getCurrentEnvironmentConfig();
    return `${envConfig.baseUrl}/api/races/${raceId}/athlete/${participantId}`;
  }

  /**
   * Obtener headers para las requests
   */
  getRequestHeaders() {
    const envConfig = this.getCurrentEnvironmentConfig();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${envConfig.apiKey}`,
      'User-Agent': 'LiveCopernico-API/1.0'
    };
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
}

// Exportar instancia singleton
const copernicoConfig = new CopernicoConfig();
export default copernicoConfig;
