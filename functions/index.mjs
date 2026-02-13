// indexSimple.mjs - Versión simplificada para despliegue
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import express from "express";
import cors from "cors";

// Importar el router completo con search/participants actualizado
import apiGeneralRouter, { onCheckpointQueueCreated, onCheckpointQueueJobCreated } from "./routes/apiGeneral.mjs";

/**
 * Función para normalizar encoding UTF-8 en objetos
 */
function normalizeUTF8Object(obj) {
  if (typeof obj === 'string') {
    // Detectar y corregir doble encoding UTF-8
    try {
      // Si el string contiene secuencias como "Ã³" que deberían ser "ó"
      if (obj.includes('Ã³')) {
        return obj.replace(/Ã³/g, 'ó');
      }
      if (obj.includes('Ã¡')) {
        return obj.replace(/Ã¡/g, 'á');
      }
      if (obj.includes('Ã©')) {
        return obj.replace(/Ã©/g, 'é');
      }
      if (obj.includes('Ã­')) {
        return obj.replace(/Ã­/g, 'í');
      }
      if (obj.includes('Ãº')) {
        return obj.replace(/Ãº/g, 'ú');
      }
      if (obj.includes('Ã±')) {
        return obj.replace(/Ã±/g, 'ñ');
      }
      // Agregar más reemplazos según sea necesario
      return obj;
    } catch (error) {
      console.warn('Error normalizando UTF-8:', error);
      return obj;
    }
  } else if (Array.isArray(obj)) {
    return obj.map(item => normalizeUTF8Object(item));
  } else if (obj && typeof obj === 'object') {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[normalizeUTF8Object(key)] = normalizeUTF8Object(value);
    }
    return normalized;
  }
  return obj;
}

// 🔥 Importar triggers de Firestore
// import { onUserFollowsParticipant } from "./triggers/followingTrigger.mjs"; // COMENTADO TEMPORALMENTE
import { onStoryCreated } from "./triggers/storyNotificationTrigger.mjs";
import { onEventWritten, onLegacyEventWritten } from "./triggers/eventNormalizationTrigger.mjs";
import { cleanupEventSubcollectionsDaily } from "./triggers/cleanupEventSubcollections.mjs";

// Crear la aplicación Express principal
const app = express();

// Configurar CORS
app.use(cors({ origin: true }));

// Configurar middleware
// Middleware para parsear JSON con UTF-8 explícito
app.use(express.json({
  limit: "50mb",
  type: ['application/json', 'application/json; charset=utf-8']
}));
app.use(express.urlencoded({
  limit: "50mb",
  extended: true,
  type: ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded; charset=utf-8']
}));

// Middleware para normalizar encoding UTF-8
app.use((req, res, next) => {
  // Asegurar headers UTF-8
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Normalizar strings en el body si existen
  if (req.body && typeof req.body === 'object') {
    req.body = normalizeUTF8Object(req.body);
  }

  next();
});

// Configurar rutas
app.use("/api", apiGeneralRouter);

// Ruta raíz
app.get("/", (req, res) => {
  res.send("🚀 Firebase Functions API - Versión Simplificada");
});

// Exportar la función principal
setGlobalOptions({ memory: "2GiB", cpu: 1 });
export const liveApiGateway = onRequest(app);

// 🔥 Exportar triggers de Firestore
// export { onUserFollowsParticipant }; // COMENTADO TEMPORALMENTE
export { onStoryCreated, onEventWritten, onLegacyEventWritten };
export { cleanupEventSubcollectionsDaily };
export { onCheckpointQueueCreated, onCheckpointQueueJobCreated };
