// websocketManager.mjs
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import express from "express";
import awsWebSocketClient from "./awsWebSocketClient.mjs";

const app = express();
app.use(express.json());

/**
 * Endpoint para inicializar la conexión WebSocket
 */
app.post("/start", async (req, res) => {
  try {
    console.log("🚀 Iniciando conexión WebSocket con AWS...");
    
    if (awsWebSocketClient.isConnected) {
      return res.status(200).json({
        success: true,
        message: "WebSocket ya está conectado",
        status: awsWebSocketClient.getStatus()
      });
    }

    awsWebSocketClient.connect();
    
    // Esperar un momento para verificar conexión
    setTimeout(() => {
      res.status(200).json({
        success: true,
        message: "Conexión WebSocket iniciada",
        status: awsWebSocketClient.getStatus()
      });
    }, 2000);

  } catch (error) {
    console.error("❌ Error iniciando WebSocket:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Endpoint para obtener estado del WebSocket
 */
app.get("/status", async (req, res) => {
  try {
    const status = await awsWebSocketClient.getStatus();
    res.status(200).json({
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Endpoint para suscribir manualmente a un participante
 */
app.post("/subscribe", async (req, res) => {
  try {
    const { raceId, eventId, participantId } = req.body;
    
    if (!raceId || !eventId || !participantId) {
      return res.status(400).json({
        success: false,
        error: "raceId, eventId y participantId son requeridos"
      });
    }

    await awsWebSocketClient.subscribeToParticipant(raceId, eventId, participantId);
    
    res.status(200).json({
      success: true,
      message: `Suscripción enviada para participante ${participantId}`,
      subscription: `${raceId}:${eventId}:${participantId}`
    });

  } catch (error) {
    console.error("❌ Error suscribiendo:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Endpoint para desconectar WebSocket
 */
app.post("/stop", (req, res) => {
  try {
    awsWebSocketClient.disconnect();
    res.status(200).json({
      success: true,
      message: "WebSocket desconectado"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Función programada para mantener la conexión activa
 * Se ejecuta cada 5 minutos
 */
export const keepWebSocketAlive = onSchedule("every 5 minutes", async (event) => {
  try {
    console.log("🔄 Verificando estado del WebSocket...");
    
    if (!awsWebSocketClient.isConnected) {
      console.log("⚠️ WebSocket desconectado, intentando reconectar...");
      awsWebSocketClient.connect();
    } else {
      console.log("✅ WebSocket activo");
      
      // Enviar ping si AWS lo soporta
      if (awsWebSocketClient.socket && awsWebSocketClient.socket.readyState === 1) {
        awsWebSocketClient.socket.ping();
      }
    }
    
  } catch (error) {
    console.error("❌ Error en keepAlive:", error);
  }
});

/**
 * Función para inicializar automáticamente al desplegar
 */
export const initWebSocketOnDeploy = onRequest(async (req, res) => {
  try {
    console.log("🚀 Inicializando WebSocket automáticamente...");
    
    // Iniciar conexión
    awsWebSocketClient.connect();
    
    // Esperar y responder
    setTimeout(() => {
      res.status(200).json({
        success: true,
        message: "WebSocket inicializado automáticamente",
        status: awsWebSocketClient.getStatus()
      });
    }, 3000);
    
  } catch (error) {
    console.error("❌ Error en inicialización automática:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Exportar el manager principal
export const websocketManager = onRequest(app);

// Exportar cliente para uso en otros módulos
export { awsWebSocketClient };
