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
    // Configuración real de Copernico con tokens válidos
    const copernicoEnvironments = {
      "dev": {
        socket: "http://socketadmin-copernico.local.sportmaniacs.com/",
        api: "http://copernico.local.sportmaniacs.com/api/races",
        admin: "http://copernico.local.sportmaniacs.com/api/races",
        token: "CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF"
      },
      "pro": {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://api.copernico.cloud/api/races",
        admin: "https://api.copernico.cloud/api/races",
        token: "CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF"
      },
      "alpha": {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
        admin: "https://psexjdg973.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
        token: "mKINguaR0D6Qm3T5KPTUiaETudOt1teR5I8T4JjN"
      },
      "demo": {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://demo-api.copernico.cloud/api/races",
        admin: "https://demo-api.copernico.cloud/api/races",
        token: "CBYVVSjdeA9WmQWzUvwD61o9CTHQL6yP2aXyq1TF"
      }
    };

    // Determinar entorno actual (usar 'pro' para producción)
    const currentEnv = process.env.COPERNICO_ENV || 'pro';
    const selectedConfig = copernicoEnvironments[currentEnv];

    this.config = {
      // Configuración de entornos
      environments: copernicoEnvironments,
      currentEnvironment: currentEnv,

      // URLs base para diferentes entornos (formato legacy para compatibilidad)
      api: {
        dev: {
          baseUrl: copernicoEnvironments.dev.api,
          apiKey: copernicoEnvironments.dev.token
        },
        prod: {
          baseUrl: copernicoEnvironments.pro.api,
          apiKey: copernicoEnvironments.pro.token
        },
        demo: {
          baseUrl: copernicoEnvironments.demo.api,
          apiKey: copernicoEnvironments.demo.token
        },
        alpha: {
          baseUrl: copernicoEnvironments.alpha.api,
          apiKey: copernicoEnvironments.alpha.token
        }
      },

      // Configuración activa
      active: {
        baseUrl: selectedConfig.api,
        apiKey: selectedConfig.token,
        socketUrl: selectedConfig.socket,
        adminUrl: selectedConfig.admin
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
        logRequests: true, // Habilitar temporalmente para debug
        logResponses: true // Habilitar temporalmente para debug
      }
    };

    console.log("⚙️ Configuración Copernico cargada:", {
      currentEnvironment: this.config.currentEnvironment,
      activeBaseUrl: this.config.active.baseUrl,
      hasActiveApiKey: !!this.config.active.apiKey,
      socketUrl: this.config.active.socketUrl,
      cacheEnabled: this.config.cache.enableCache,
      availableEnvironments: Object.keys(this.config.environments)
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
    return this.config.active;
  }

  /**
   * Obtener URL completa para un endpoint de participante
   */
  getApiUrl(raceId, participantId) {
    const envConfig = this.getCurrentEnvironmentConfig();
    // La URL base ya incluye /api/races, solo agregar el participante
    return `${envConfig.baseUrl}/${raceId}/athlete/${participantId}`;
  }

  /**
   * Obtener headers para las requests
   */
  getRequestHeaders() {
    const envConfig = this.getCurrentEnvironmentConfig();
    return {
      'Content-Type': 'application/json',
      'x-api-key': envConfig.apiKey,
      'User-Agent': 'LiveCopernico-API/1.0',
      'Accept': 'application/json'
    };
  }

  /**
   * Cambiar entorno de Copernico
   */
  setEnvironment(env) {
    if (this.config.environments[env]) {
      this.config.currentEnvironment = env;
      this.config.active = {
        baseUrl: this.config.environments[env].api,
        apiKey: this.config.environments[env].token,
        socketUrl: this.config.environments[env].socket,
        adminUrl: this.config.environments[env].admin
      };
      console.log(`🔄 Copernico environment cambiado a: ${env}`);
      return true;
    }
    return false;
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
