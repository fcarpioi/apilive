// awsWebSocketClient.mjs
import WebSocket from 'ws';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
// COMENTADO TEMPORALMENTE PARA EVITAR INICIALIZACIÓN DURANTE BUILD
// import websocketConfig from '../config/websocketConfig.mjs';
// import subscriptionManager from './subscriptionManager.mjs';
// import monitor from '../monitoring/websocketMonitor.mjs';
// import messageDeduplicator from '../utils/messageDeduplicator.mjs';

// Inicializar Firebase Admin (si aún no lo está)
if (!admin.apps.length) {
  admin.initializeApp();
}

class AWSWebSocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.subscriptions = new Set(); // Cache local de suscripciones
    this.lastHeartbeat = null;
    this.connectionStartTime = null;

    // COMENTADO TEMPORALMENTE PARA EVITAR INICIALIZACIÓN DURANTE BUILD
    // Cargar configuración
    // this.config = websocketConfig.getConfig();
    // this.wsUrl = this.config.aws.websocketUrl;
    // this.apiKey = this.config.aws.apiKey;
    // this.webhookUrl = this.config.internal.webhookUrl;

    // console.log("🔧 WebSocket Client inicializado con configuración:", websocketConfig.getLoggableConfig());
  }

  /**
   * Conectar al WebSocket de AWS
   */
  async connect() {
    try {
      console.log(`🔌 Conectando a AWS WebSocket: ${this.wsUrl}`);
      this.connectionStartTime = Date.now();

      this.socket = new WebSocket(this.wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Firebase-WebSocket-Client/2.0'
        }
      });

      this.socket.on('open', async () => {
        console.log('✅ Conectado a AWS WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastHeartbeat = Date.now();

        // Registrar métrica de conexión
        await monitor.recordConnectionMetric('connected', {
          url: this.wsUrl,
          connectionTime: Date.now() - this.connectionStartTime
        });

        // Recargar y reenviar suscripciones desde Firestore
        await this.resubscribeFromFirestore();
      });

      this.socket.on('message', async (data) => {
        try {
          const startTime = Date.now();
          const message = JSON.parse(data.toString());

          if (this.config.development.enableDebugLogs) {
            console.log('📨 Mensaje recibido de AWS:', message);
          }

          this.lastHeartbeat = Date.now();
          await this.handleMessage(message);

          // Registrar métrica de procesamiento
          const processingTime = Date.now() - startTime;
          await monitor.recordMessageMetric(message.type || 'unknown', processingTime, true);

        } catch (error) {
          console.error('❌ Error procesando mensaje de AWS:', error);
          await monitor.recordMessageMetric('error', 0, false);
          await monitor.createAlert('error', 'Error procesando mensaje de AWS', { error: error.message });
        }
      });

      this.socket.on('close', async (code, reason) => {
        console.log(`⚠️ Conexión WebSocket cerrada. Código: ${code}, Razón: ${reason}`);
        this.isConnected = false;

        // Registrar métrica de desconexión
        await monitor.recordConnectionMetric('disconnected', { code, reason: reason?.toString() });

        // Crear alerta si es una desconexión inesperada
        if (code !== 1000) { // 1000 = cierre normal
          await monitor.createAlert('warning', `WebSocket cerrado inesperadamente`, { code, reason });
        }

        this.attemptReconnect();
      });

      this.socket.on('error', async (error) => {
        console.error('❌ Error en WebSocket:', error);
        this.isConnected = false;

        // Registrar métrica de error
        await monitor.recordConnectionMetric('error', { error: error.message });
        await monitor.createAlert('error', 'Error en conexión WebSocket', { error: error.message });
      });

    } catch (error) {
      console.error('❌ Error conectando a WebSocket:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Manejar mensajes recibidos de AWS
   */
  async handleMessage(message) {
    try {
      // Verificar si es un mensaje de checkpoint
      if (message.type === 'checkpoint' || message.runnerId) {
        console.log('🏃 Procesando checkpoint de corredor...');
        await this.processCheckpointMessage(message);
      } 
      // Verificar si es confirmación de suscripción
      else if (message.type === 'subscription_confirmed') {
        console.log('✅ Suscripción confirmada:', message);
      }
      // Otros tipos de mensajes
      else {
        console.log('📄 Mensaje no reconocido:', message);
      }
    } catch (error) {
      console.error('❌ Error manejando mensaje:', error);
    }
  }

  /**
   * Procesar mensaje de checkpoint con deduplicación y generación de clips
   */
  async processCheckpointMessage(checkpointData) {
    try {
      // Formatear datos para el webhook existente
      const webhookPayload = {
        runnerId: checkpointData.runnerId || checkpointData.participantId,
        runnerBib: checkpointData.runnerBib || checkpointData.bib,
        checkpointId: checkpointData.checkpointId,
        timestamp: checkpointData.timestamp,
        raceId: checkpointData.raceId,
        eventId: checkpointData.eventId,
        streamId: checkpointData.streamId, // NUEVO: ID del stream para generar clip
        apiKey: this.config.internal.webhookApiKey
      };

      // Procesar con deduplicación
      const result = await messageDeduplicator.processWithDeduplication(
        webhookPayload,
        async (payload) => {
          console.log('📤 Enviando al webhook interno:', payload);

          // Simular latencia si está configurado (para testing)
          if (this.config.development.simulateLatency > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.development.simulateLatency));
          }

          // Llamar al webhook existente
          const response = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            timeout: this.config.messages.maxProcessingTimeMs
          });

          if (response.ok) {
            const result = await response.json();
            console.log('✅ Webhook procesado exitosamente:', result);
            return { success: true, result };
          } else {
            const error = await response.text();
            console.error('❌ Error en webhook:', response.status, error);
            throw new Error(`Webhook error: ${response.status} - ${error}`);
          }
        }
      );

      if (result.duplicate) {
        console.log(`⚠️ Mensaje duplicado ignorado: ${result.messageId}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Error procesando checkpoint:', error);
      await monitor.createAlert('error', 'Error procesando checkpoint', {
        error: error.message,
        checkpointData
      });
      throw error;
    }
  }

  /**
   * Suscribirse a un participante
   */
  async subscribeToParticipant(raceId, eventId, participantId, userId = null) {
    try {
      const subscriptionKey = `${raceId}:${eventId}:${participantId}`;

      // Verificar si ya está suscrito localmente
      if (this.subscriptions.has(subscriptionKey)) {
        console.log(`⚠️ Ya suscrito localmente: ${subscriptionKey}`);
        return { success: true, alreadySubscribed: true };
      }

      // Guardar suscripción en Firestore
      await subscriptionManager.saveSubscription(raceId, eventId, participantId, userId);

      const subscriptionMessage = {
        type: 'subscribe',
        idRace: raceId,
        eventId: eventId,
        participantId: participantId,
        apiKey: this.apiKey
      };

      if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(subscriptionMessage));
        this.subscriptions.add(subscriptionKey);
        console.log(`✅ Suscripción enviada: ${subscriptionKey}`);
        return { success: true, sent: true };
      } else {
        console.log(`⚠️ WebSocket no conectado, suscripción guardada para reenvío: ${subscriptionKey}`);
        this.subscriptions.add(subscriptionKey);
        return { success: true, queued: true };
      }

    } catch (error) {
      console.error('❌ Error suscribiendo a participante:', error);
      await monitor.createAlert('error', 'Error en suscripción', {
        error: error.message,
        raceId,
        eventId,
        participantId
      });
      throw error;
    }
  }

  /**
   * Recargar suscripciones desde Firestore y reenviar
   */
  async resubscribeFromFirestore() {
    try {
      console.log('🔄 Recargando suscripciones desde Firestore...');

      // Obtener suscripciones activas desde Firestore
      const activeSubscriptions = await subscriptionManager.getActiveSubscriptions();

      if (activeSubscriptions.length === 0) {
        console.log('📝 No hay suscripciones activas en Firestore');
        return;
      }

      console.log(`🔄 Reenviando ${activeSubscriptions.length} suscripciones desde Firestore...`);

      // Limpiar cache local y recargar
      this.subscriptions.clear();

      for (const subscription of activeSubscriptions) {
        const { raceId, eventId, participantId } = subscription;
        const subscriptionKey = `${raceId}:${eventId}:${participantId}`;

        const subscriptionMessage = {
          type: 'subscribe',
          idRace: raceId,
          eventId: eventId,
          participantId: participantId,
          apiKey: this.apiKey
        };

        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify(subscriptionMessage));
          this.subscriptions.add(subscriptionKey);
          console.log(`🔄 Resuscrito desde Firestore: ${subscriptionKey}`);
        }
      }

      console.log(`✅ ${this.subscriptions.size} suscripciones reenviadas exitosamente`);

    } catch (error) {
      console.error('❌ Error recargando suscripciones desde Firestore:', error);
      await monitor.createAlert('error', 'Error recargando suscripciones', { error: error.message });
    }
  }

  /**
   * Reenviar suscripciones del cache local (fallback)
   */
  async resubscribeFromCache() {
    if (this.subscriptions.size === 0) {
      console.log('📝 No hay suscripciones en cache local');
      return;
    }

    console.log(`🔄 Reenviando ${this.subscriptions.size} suscripciones desde cache...`);

    for (const subscriptionKey of this.subscriptions) {
      const [raceId, eventId, participantId] = subscriptionKey.split(':');

      const subscriptionMessage = {
        type: 'subscribe',
        idRace: raceId,
        eventId: eventId,
        participantId: participantId,
        apiKey: this.apiKey
      };

      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(subscriptionMessage));
        console.log(`🔄 Resuscrito desde cache: ${subscriptionKey}`);
      }
    }
  }

  /**
   * Intentar reconectar con backoff exponencial
   */
  async attemptReconnect() {
    const maxAttempts = this.config.reconnection.maxAttempts;

    if (this.reconnectAttempts >= maxAttempts) {
      console.error(`❌ Máximo de intentos de reconexión alcanzado (${maxAttempts})`);
      await monitor.createAlert('critical',
        `WebSocket: Máximo de intentos de reconexión alcanzado (${maxAttempts})`,
        { attempts: this.reconnectAttempts }
      );
      return;
    }

    this.reconnectAttempts++;

    // Calcular delay con backoff exponencial
    const baseDelay = this.config.reconnection.initialDelay;
    const multiplier = this.config.reconnection.backoffMultiplier;
    const maxDelay = this.config.reconnection.maxDelay;

    const delay = Math.min(baseDelay * Math.pow(multiplier, this.reconnectAttempts - 1), maxDelay);

    console.log(`🔄 Intento de reconexión ${this.reconnectAttempts}/${maxAttempts} en ${delay}ms...`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Error en intento de reconexión:', error);
        await monitor.createAlert('warning', 'Error en intento de reconexión', {
          error: error.message,
          attempt: this.reconnectAttempts
        });
      }
    }, delay);
  }

  /**
   * Desconectar WebSocket
   */
  disconnect() {
    if (this.socket) {
      console.log('🔌 Desconectando WebSocket...');
      this.socket.close();
      this.isConnected = false;
    }
  }

  /**
   * Obtener estado detallado de la conexión
   */
  async getStatus() {
    try {
      // Obtener suscripciones desde Firestore
      const firestoreSubscriptions = await subscriptionManager.getActiveSubscriptions();

      return {
        connection: {
          connected: this.isConnected,
          url: this.wsUrl,
          reconnectAttempts: this.reconnectAttempts,
          lastHeartbeat: this.lastHeartbeat ? new Date(this.lastHeartbeat).toISOString() : null,
          connectionStartTime: this.connectionStartTime ? new Date(this.connectionStartTime).toISOString() : null,
          uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
        },
        subscriptions: {
          local: Array.from(this.subscriptions),
          localCount: this.subscriptions.size,
          firestore: firestoreSubscriptions.map(sub => `${sub.raceId}:${sub.eventId}:${sub.participantId}`),
          firestoreCount: firestoreSubscriptions.length
        },
        config: {
          environment: process.env.NODE_ENV || 'development',
          testMode: this.config.development.enableTestMode,
          debugLogs: this.config.development.enableDebugLogs
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error obteniendo estado:', error);
      return {
        connection: {
          connected: this.isConnected,
          reconnectAttempts: this.reconnectAttempts,
          error: error.message
        },
        subscriptions: {
          local: Array.from(this.subscriptions),
          localCount: this.subscriptions.size
        },
        timestamp: new Date().toISOString()
      };
    }
  }
}

// COMENTADO TEMPORALMENTE PARA EVITAR INICIALIZACIÓN DURANTE BUILD
// Crear instancia global
// const awsWebSocketClient = new AWSWebSocketClient();

// Exportar instancia y clase
// export default awsWebSocketClient;
export { AWSWebSocketClient };

// Exportar función factory en lugar de instancia global
export function createWebSocketClient() {
  return new AWSWebSocketClient();
}
