#!/usr/bin/env node

/**
 * Script para activar la suscripción al socket de Copernico
 * para la carrera generali-maraton-malaga-2025
 */

// Importar módulos necesarios
import fetch from 'node-fetch';

const RACE_ID = 'generali-maraton-malaga-2025';
const COMPETITION_ID = '69200553-464c-4bfd-9b35-4ca6ac1f17f5';
const API_ENDPOINT = 'https://liveapigateway-3rt3xwiooa-uc.a.run.app/api/checkpoint-participant';
const API_KEY = '9a6cf30847d9d4c1a9612270bc7dfa500cf557267d7cbbfe656034122fbe2ea0';

// Mapeo de splits de Copernico a nuestros checkpoints
const CHECKPOINT_MAPPING = {
  '5K': '5K',
  '10K': '10K', 
  '15K': '15K',
  'Media': 'Media',
  '21K': 'Media', // Alias para Media Maratón
  '25K': '25K',
  '30K': '30K',
  '35K': '35K',
  'Spotter': 'Spotter',
  'Meta': 'Meta',
  'Finish': 'Meta' // Alias para Meta
};

class CopernicoSocketActivator {
  constructor() {
    this.client = new CopernicoWebSocketClient();
    this.subscriptionManager = new CopernicoSubscriptionManager();
    this.processedEvents = new Set(); // Para evitar duplicados
  }

  /**
   * Activar suscripción completa al socket
   */
  async activate() {
    try {
      console.log("🚀 ACTIVANDO SUSCRIPCIÓN AL SOCKET DE COPERNICO");
      console.log("=" * 70);
      console.log(`🏁 Carrera: ${RACE_ID}`);
      console.log(`🆔 Competition ID: ${COMPETITION_ID}`);
      console.log(`🌐 API Endpoint: ${API_ENDPOINT}`);
      
      // 1. Conectar al socket
      console.log("\n📡 PASO 1: Conectando al socket...");
      await this.client.connect(RACE_ID);
      
      // Esperar conexión
      await this.waitForConnection();
      
      // 2. Configurar callbacks para procesar eventos
      console.log("\n⚙️ PASO 2: Configurando callbacks...");
      this.setupEventCallbacks();
      
      // 3. Suscribirse a todas las entidades relevantes
      console.log("\n📋 PASO 3: Suscribiéndose a entidades...");
      await this.subscribeToEntities();
      
      console.log("\n✅ SUSCRIPCIÓN ACTIVADA EXITOSAMENTE");
      console.log("🎯 El sistema ahora procesará automáticamente:");
      console.log("   • Todos los atletas de la carrera");
      console.log("   • Todos los checkpoints configurados");
      console.log("   • Generación automática de historias");
      
      // Mantener el proceso activo
      console.log("\n🔄 Manteniendo conexión activa...");
      console.log("   Presiona Ctrl+C para detener");
      
      // Monitoreo cada 30 segundos
      setInterval(() => {
        this.logStatus();
      }, 30000);
      
      // Mantener proceso vivo
      process.on('SIGINT', () => {
        console.log("\n🛑 Deteniendo suscripción...");
        this.client.disconnect();
        process.exit(0);
      });
      
    } catch (error) {
      console.error("❌ Error activando suscripción:", error);
      throw error;
    }
  }

  /**
   * Esperar a que se establezca la conexión
   */
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout esperando conexión"));
      }, 30000);

      const checkConnection = () => {
        if (this.client.isConnected) {
          clearTimeout(timeout);
          console.log("✅ Conexión establecida");
          resolve();
        } else {
          setTimeout(checkConnection, 1000);
        }
      };

      checkConnection();
    });
  }

  /**
   * Configurar callbacks para procesar eventos de atletas
   */
  setupEventCallbacks() {
    // Callback para actualizaciones de atletas individuales
    this.client.addEntityCallback('athlete', null, (athleteData) => {
      this.processAthleteUpdate(athleteData);
    });

    // Callback para actualizaciones masivas de atletas
    this.client.addEntityCallback('athletes', null, (athletesData) => {
      this.processAthletesUpdate(athletesData);
    });

    // Callback para actualizaciones de splits
    this.client.addEntityCallback('split', null, (splitData) => {
      this.processSplitUpdate(splitData);
    });

    console.log("✅ Callbacks configurados para athlete, athletes y split");
  }

  /**
   * Suscribirse a las entidades relevantes
   */
  async subscribeToEntities() {
    try {
      // Suscribirse a todos los atletas
      this.client.subscribeToEntity('athletes', null);
      console.log("✅ Suscrito a 'athletes' (todos los atletas)");

      // Suscribirse a todos los splits
      this.client.subscribeToEntity('split', null);
      console.log("✅ Suscrito a 'split' (todos los checkpoints)");

      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error("❌ Error suscribiéndose:", error);
      throw error;
    }
  }

  /**
   * Procesar actualización de un atleta individual
   */
  async processAthleteUpdate(athleteData) {
    try {
      console.log("👤 Actualización de atleta recibida:", athleteData);
      
      if (athleteData && athleteData.id) {
        await this.checkForNewCheckpoints(athleteData.id, athleteData);
      }
      
    } catch (error) {
      console.error("❌ Error procesando atleta:", error);
    }
  }

  /**
   * Procesar actualización masiva de atletas
   */
  async processAthletesUpdate(athletesData) {
    try {
      console.log("👥 Actualización masiva de atletas:", athletesData);
      
      if (Array.isArray(athletesData)) {
        for (const athlete of athletesData) {
          if (athlete && athlete.id) {
            await this.checkForNewCheckpoints(athlete.id, athlete);
          }
        }
      }
      
    } catch (error) {
      console.error("❌ Error procesando atletas:", error);
    }
  }

  /**
   * Procesar actualización de split/checkpoint
   */
  async processSplitUpdate(splitData) {
    try {
      console.log("📍 Actualización de split recibida:", splitData);

      // Extraer información del split
      if (splitData && splitData.athleteId && splitData.split) {
        await this.triggerCheckpointAPI(splitData.athleteId, splitData.split, splitData);
      }

    } catch (error) {
      console.error("❌ Error procesando split:", error);
    }
  }

  /**
   * Verificar si hay nuevos checkpoints para un atleta
   */
  async checkForNewCheckpoints(athleteId, athleteData) {
    try {
      if (!athleteData.events || !athleteData.events[0] || !athleteData.events[0].times) {
        return;
      }

      const times = athleteData.events[0].times;

      // Revisar cada checkpoint en los times
      for (const [checkpoint, timeData] of Object.entries(times)) {
        if (timeData && timeData.time) {
          const eventKey = `${athleteId}_${checkpoint}_${timeData.time}`;

          // Evitar procesar el mismo evento múltiples veces
          if (!this.processedEvents.has(eventKey)) {
            this.processedEvents.add(eventKey);

            console.log(`🎯 Nuevo checkpoint detectado: ${athleteId} → ${checkpoint}`);
            await this.triggerCheckpointAPI(athleteId, checkpoint, timeData);
          }
        }
      }

    } catch (error) {
      console.error("❌ Error verificando checkpoints:", error);
    }
  }

  /**
   * Ejecutar nuestro API checkpoint-participant
   */
  async triggerCheckpointAPI(participantId, checkpoint, checkpointData) {
    try {
      // Mapear checkpoint de Copernico a nuestro sistema
      const mappedCheckpoint = CHECKPOINT_MAPPING[checkpoint] || checkpoint;

      console.log(`🚀 Ejecutando API para ${participantId} en ${mappedCheckpoint}`);

      const payload = {
        apiKey: API_KEY,
        competitionId: COMPETITION_ID,
        copernicoId: RACE_ID,
        type: "detection",
        participantId: participantId,
        extraData: {
          point: mappedCheckpoint,
          event: "Maratón",
          location: mappedCheckpoint,
          originalCheckpoint: checkpoint,
          timeData: checkpointData,
          source: "copernico_socket",
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(`✅ Historia encolada: ${participantId} → ${mappedCheckpoint} (${result.data?.queueKey?.substring(0, 20)}...)`);
      } else {
        console.log(`❌ Error API: ${participantId} → ${mappedCheckpoint}: ${result.message}`);
      }

    } catch (error) {
      console.error(`💥 Exception API: ${participantId} → ${checkpoint}:`, error.message);
    }
  }

  /**
   * Log del estado actual
   */
  logStatus() {
    const status = {
      connected: this.client.isConnected,
      race: RACE_ID,
      processedEvents: this.processedEvents.size,
      timestamp: new Date().toISOString()
    };

    console.log(`📊 Estado: ${JSON.stringify(status)}`);
  }
}

// Ejecutar activación
async function main() {
  try {
    const activator = new CopernicoSocketActivator();
    await activator.activate();
  } catch (error) {
    console.error("💥 Error fatal:", error);
    process.exit(1);
  }
}

// Solo ejecutar si es el archivo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
