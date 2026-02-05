// copernicoWebSocketClient.mjs
import io from 'socket.io-client';
import fetch from 'node-fetch';
import copernicoMonitor from './copernicoMonitor.mjs';

/**
 * Cliente WebSocket para Copernico basado en RaceSocket
 * Adaptado para Node.js/Firebase Functions
 */
class CopernicoWebSocketClient {
  
  static entities = ['athlete', 'split', 'athletes'];
  static DEFAULT_TOKEN = '';

  constructor() {
    this.race = '';
    this.socket = null;
    this.subscriptions = {};
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    
    // Configuración de Copernico
    this.config = {
      env: "pro", // Cambiar según necesidad: dev, pro, alpha, demo
      dev: {
        socket: "http://socketadmin-copernico.local.sportmaniacs.com/",
        api: "http://copernico.local.sportmaniacs.com/api/races",
        admin: "http://copernico.local.sportmaniacs.com/api/races",
        token: process.env.COPERNICO_DEV_API_KEY || "MISSING_COPERNICO_DEV_API_KEY"
      },
      pro: {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://api.copernico.cloud/api/races",
        admin: "https://api.copernico.cloud/api/races",
        token: process.env.COPERNICO_PROD_API_KEY || "MISSING_COPERNICO_PROD_API_KEY"
      },
      alpha: {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://y06aza4em1.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
        admin: "https://y06aza4em1.execute-api.eu-west-1.amazonaws.com/alpha/api/races",
        token: process.env.COPERNICO_ALPHA_API_KEY || "MISSING_COPERNICO_ALPHA_API_KEY"
      },
      demo: {
        socket: "https://socket-ss.sportmaniacs.com:4319/",
        api: "https://api-demo.copernico.cloud/api/races",
        admin: "https://api-demo.copernico.cloud/api/races",
        token: process.env.COPERNICO_DEMO_API_KEY || process.env.COPERNICO_DEV_API_KEY || "MISSING_COPERNICO_DEMO_API_KEY"
      }
    };

    // URL del webhook interno para procesar datos
    this.webhookUrl = 'https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint';
  }

  /**
   * Inicializar conexión WebSocket para una carrera específica
   */
  connect(raceId) {
    try {
      console.log(`🚀 [Copernico] Conectando a carrera: ${raceId}`);
      copernicoMonitor.recordConnectionAttempt();

      this.race = raceId;
      const socketUrl = this.config[this.config.env].socket;

      console.log(`🌐 [Copernico] URL Socket: ${socketUrl}`);

      // Crear conexión socket.io
      this.socket = io(socketUrl, {
        transports: ["websocket"],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay
      });

      this.setupEventHandlers();

      // Emitir evento de conexión con el ID de la carrera
      this.socket.emit('connected', raceId);

    } catch (error) {
      console.error('❌ [Copernico] Error conectando:', error);
      copernicoMonitor.recordConnectionFailure(error);
      throw error;
    }
  }

  /**
   * Configurar manejadores de eventos del socket
   */
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('✅ [Copernico] Conectado al WebSocket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      copernicoMonitor.recordSuccessfulConnection();
      this.initHelpers();
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`⚠️ [Copernico] Desconectado: ${reason}`);
      this.isConnected = false;
      copernicoMonitor.createAlert('warning', 'WebSocket desconectado', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ [Copernico] Error de conexión:', error);
      this.isConnected = false;
      copernicoMonitor.recordConnectionFailure(error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 [Copernico] Reconectado después de ${attemptNumber} intentos`);
      this.isConnected = true;
      copernicoMonitor.recordSuccessfulConnection();
      copernicoMonitor.createAlert('info', 'WebSocket reconectado', { attemptNumber });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ [Copernico] Error de reconexión:', error);
      copernicoMonitor.recordConnectionFailure(error);
    });
  }

  /**
   * Inicializar helpers para escuchar actualizaciones de entidades
   */
  initHelpers() {
    CopernicoWebSocketClient.entities.forEach(entity => {
      this.socket.on(`update-${entity}`, (data) => {
        console.log(`📡 [Copernico] Actualización recibida para ${entity}:`, data);
        copernicoMonitor.recordMessageReceived(entity, data);

        try {
          let id = JSON.parse(data);
          if (id && id.athletes) {
            id = id.athletes;
          }

          this.fetchEntity(entity, this.formatSocketId(id, entity), this.getSubscriptionCallbacks(entity, id));
          copernicoMonitor.recordMessageProcessed(entity, { id });
        } catch (error) {
          copernicoMonitor.recordMessageFailure(entity, error);
          console.error(`❌ [Copernico] Error procesando actualización de ${entity}:`, error);
        }
      });
    });
  }

  /**
   * Formatear ID del socket
   */
  formatSocketId(id, entity) {
    return id.toString();
  }

  /**
   * Construir URL de la API de carreras
   */
  buildRaceURL() {
    return `${this.config[this.config.env].api}/${this.race}`;
  }

  /**
   * Obtener callbacks de suscripción para una entidad
   */
  getSubscriptionCallbacks(entity, id) {
    if (!this.subscriptions[entity]) {
      return [];
    }

    let callBacks = this.subscriptions[entity][id];

    if (Array.isArray(this.subscriptions[entity])) {
      callBacks = this.subscriptions[entity];
    }

    return callBacks || [];
  }

  /**
   * Agregar callback para una entidad específica
   * Uso: addEntityCallback('athletes', null, callback) para todos los atletas
   */
  addEntityCallback(entity, entityId, cb) {
    console.log(`📝 [Copernico] Agregando callback para ${entity}${entityId ? `:${entityId}` : ''}`);

    this.subscribeToEntity(entity, entityId);

    if (entityId) {
      if (!this.subscriptions[entity]) {
        this.subscriptions[entity] = {};
      }

      if (!this.subscriptions[entity][entityId]) {
        this.subscriptions[entity][entityId] = [];
      }

      this.subscriptions[entity][entityId].push(cb);
    } else {
      if (!this.subscriptions[entity]) {
        this.subscriptions[entity] = [];
      }

      this.subscriptions[entity].push(cb);
    }
  }

  /**
   * Remover callback de una entidad
   */
  removeEntityCallback(entity, entityId, cb) {
    if (!this.subscriptions[entity] || !this.subscriptions[entity][entityId]) {
      return;
    }

    const cbsCollection = this.subscriptions[entity][entityId];
    const cbIndex = cbsCollection.indexOf(cb);

    if (cbIndex > -1) {
      cbsCollection.splice(cbIndex, 1);
      console.log(`🗑️ [Copernico] Callback removido para ${entity}:${entityId}`);
    }
  }

  /**
   * Obtener datos de una entidad desde la API
   */
  async fetchEntity(entity, id, callbacks = []) {
    try {
      const encodedId = encodeURI(id);
      const url = `${this.buildRaceURL()}/${entity}/${encodedId}`;
      const token = this.config[this.config.env].token || CopernicoWebSocketClient.DEFAULT_TOKEN;

      console.log(`🌐 [Copernico] Obteniendo ${url} con token ${token}`);

      const response = await fetch(url, {
        headers: {
          'content-type': 'application/json',
          'x-api-key': token,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      const data = responseData.data;

      console.log(`✅ [Copernico] Datos obtenidos para ${entity}:${id}`);

      // Ejecutar todos los callbacks
      if (callbacks && callbacks.length > 0) {
        callbacks.forEach(func => {
          try {
            func(data);
          } catch (error) {
            console.error(`❌ [Copernico] Error ejecutando callback:`, error);
          }
        });
      }

      return data;

    } catch (error) {
      console.error(`❌ [Copernico] Error obteniendo ${entity}:${id}:`, error);
      throw error;
    }
  }

  /**
   * Suscribirse a una entidad
   */
  subscribeToEntity(entity, id) {
    if (!this.socket || !this.isConnected) {
      console.warn(`⚠️ [Copernico] No conectado, no se puede suscribir a ${entity}:${id}`);
      return;
    }

    console.log(`📡 [Copernico] Suscribiéndose a ${entity}:${id || 'all'}`);
    this.socket.emit('subscribe', this.race, entity, id);
  }

  /**
   * Desuscribirse de una entidad
   */
  unSubscribeToEntity(entity, id) {
    if (!this.socket) {
      return;
    }

    console.log(`📡 [Copernico] Desuscribiéndose de ${entity}:${id || 'all'}`);
    this.socket.emit('unsubscribe', this.race, entity, id);
  }

  /**
   * Desconectar del WebSocket
   */
  disconnect() {
    if (this.socket) {
      console.log('🔌 [Copernico] Desconectando...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * Obtener estado de la conexión
   */
  getStatus() {
    return {
      connected: this.isConnected,
      race: this.race,
      subscriptions: Object.keys(this.subscriptions),
      environment: this.config.env
    };
  }
}

// Crear instancia singleton
const copernicoWebSocketClient = new CopernicoWebSocketClient();

export default copernicoWebSocketClient;
