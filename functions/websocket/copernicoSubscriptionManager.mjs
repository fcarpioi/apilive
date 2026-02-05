// copernicoSubscriptionManager.mjs
import copernicoWebSocketClient from './copernicoWebSocketClient.mjs';
import copernicoMonitor from './copernicoMonitor.mjs';
import { admin } from '../config/firebaseConfig.mjs';

/**
 * Gestor de suscripciones para el WebSocket de Copernico
 * Maneja las suscripciones a atletas y procesa los datos recibidos
 */
class CopernicoSubscriptionManager {
  
  constructor() {
    this.activeSubscriptions = new Map(); // raceId -> Set de participantIds
    this.webhookUrl = 'https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/webhook/runner-checkpoint';
    this.webhookApiKey = process.env.WEBHOOK_API_KEY || 'MISSING_WEBHOOK_API_KEY';
  }

  /**
   * Suscribirse a actualizaciones de atletas para una carrera específica
   */
  async subscribeToRace(raceId, participantIds = []) {
    try {
      console.log(`🏁 [CopernicoSub] Suscribiéndose a carrera: ${raceId}`);
      
      // Conectar al WebSocket si no está conectado
      if (!copernicoWebSocketClient.isConnected) {
        await copernicoWebSocketClient.connect(raceId);
        
        // Esperar un momento para que se establezca la conexión
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Registrar suscripciones activas
      if (!this.activeSubscriptions.has(raceId)) {
        this.activeSubscriptions.set(raceId, new Set());
      }

      // Si se especifican participantes específicos, suscribirse a cada uno
      if (participantIds && participantIds.length > 0) {
        participantIds.forEach(participantId => {
          this.activeSubscriptions.get(raceId).add(participantId);
          console.log(`👤 [CopernicoSub] Suscrito a participante: ${participantId}`);
        });
      }

      // Suscribirse a todos los atletas de la carrera
      copernicoWebSocketClient.addEntityCallback('athletes', null, (athleteData) => {
        this.processAthleteUpdate(raceId, athleteData);
      });

      console.log(`✅ [CopernicoSub] Suscripción activa para carrera ${raceId}`);
      
      return {
        success: true,
        raceId,
        subscribedParticipants: participantIds,
        message: 'Suscripción establecida correctamente'
      };

    } catch (error) {
      console.error(`❌ [CopernicoSub] Error suscribiéndose a carrera ${raceId}:`, error);
      throw error;
    }
  }

  /**
   * Procesar actualización de atleta recibida del WebSocket
   */
  async processAthleteUpdate(raceId, athleteData) {
    try {
      console.log(`🏃 [CopernicoSub] Procesando actualización de atleta:`, JSON.stringify(athleteData, null, 2));

      // Verificar si tenemos datos válidos
      if (!athleteData || !athleteData.id) {
        console.warn(`⚠️ [CopernicoSub] Datos de atleta inválidos`);
        return;
      }

      const participantId = athleteData.id.toString();
      
      // Verificar si estamos suscritos a este participante
      const raceSubscriptions = this.activeSubscriptions.get(raceId);
      if (raceSubscriptions && raceSubscriptions.size > 0 && !raceSubscriptions.has(participantId)) {
        console.log(`⏭️ [CopernicoSub] Participante ${participantId} no está en la lista de suscripciones`);
        return;
      }

      // Extraer información relevante del atleta
      const athleteInfo = this.extractAthleteInfo(athleteData);
      
      if (athleteInfo.hasNewCheckpoint) {
        console.log(`🎯 [CopernicoSub] Nuevo checkpoint detectado para ${participantId}`);
        
        // Convertir a formato compatible con el webhook existente
        const webhookPayload = this.convertToWebhookFormat(raceId, athleteInfo);
        
        // Enviar al webhook interno
        await this.sendToWebhook(webhookPayload);
      }

    } catch (error) {
      console.error(`❌ [CopernicoSub] Error procesando actualización de atleta:`, error);
    }
  }

  /**
   * Extraer información relevante del atleta
   */
  extractAthleteInfo(athleteData) {
    // Aquí necesitarás adaptar según la estructura real de datos de Copernico
    // Esta es una implementación base que deberás ajustar
    
    const info = {
      id: athleteData.id,
      bib: athleteData.bib || athleteData.dorsal,
      name: athleteData.name,
      hasNewCheckpoint: false,
      lastCheckpoint: null,
      timestamp: null
    };

    // Verificar si hay nuevos splits/checkpoints
    if (athleteData.splits && Array.isArray(athleteData.splits)) {
      const latestSplit = athleteData.splits[athleteData.splits.length - 1];
      if (latestSplit) {
        info.hasNewCheckpoint = true;
        info.lastCheckpoint = {
          id: latestSplit.id || latestSplit.checkpoint,
          time: latestSplit.time,
          timestamp: latestSplit.timestamp || new Date().toISOString()
        };
      }
    }

    return info;
  }

  /**
   * Convertir datos de atleta a formato del webhook
   */
  convertToWebhookFormat(raceId, athleteInfo) {
    return {
      runnerId: athleteInfo.id.toString(),
      runnerBib: athleteInfo.bib,
      checkpointId: athleteInfo.lastCheckpoint?.id || 'unknown',
      timestamp: athleteInfo.lastCheckpoint?.timestamp || new Date().toISOString(),
      raceId: raceId,
      eventId: raceId, // Asumiendo que eventId = raceId, ajustar si es diferente
      streamId: `copernico-${raceId}-${athleteInfo.id}-${Date.now()}`, // Generar streamId único
      apiKey: this.webhookApiKey
    };
  }

  /**
   * Enviar datos al webhook interno
   */
  async sendToWebhook(payload) {
    try {
      console.log(`📤 [CopernicoSub] Enviando al webhook:`, JSON.stringify(payload, null, 2));

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        timeout: 30000
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ [CopernicoSub] Webhook procesado exitosamente:`, result);
        return result;
      } else {
        const error = await response.text();
        console.error(`❌ [CopernicoSub] Error en webhook:`, response.status, error);
        throw new Error(`Webhook error: ${response.status} - ${error}`);
      }

    } catch (error) {
      console.error(`❌ [CopernicoSub] Error enviando al webhook:`, error);
      throw error;
    }
  }

  /**
   * Desuscribirse de una carrera
   */
  unsubscribeFromRace(raceId) {
    console.log(`🛑 [CopernicoSub] Desuscribiéndose de carrera: ${raceId}`);
    
    if (this.activeSubscriptions.has(raceId)) {
      this.activeSubscriptions.delete(raceId);
    }

    // Si no hay más suscripciones activas, desconectar
    if (this.activeSubscriptions.size === 0) {
      copernicoWebSocketClient.disconnect();
    }
  }

  /**
   * Obtener estado de las suscripciones
   */
  getSubscriptionStatus() {
    const status = {
      connected: copernicoWebSocketClient.isConnected,
      activeRaces: Array.from(this.activeSubscriptions.keys()),
      totalSubscriptions: this.activeSubscriptions.size,
      websocketStatus: copernicoWebSocketClient.getStatus()
    };

    return status;
  }
}

// Crear instancia singleton
const copernicoSubscriptionManager = new CopernicoSubscriptionManager();

export default copernicoSubscriptionManager;
