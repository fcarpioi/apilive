// indexSimple.mjs - Versión simplificada para despliegue
import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import cors from "cors";

// Importar el router completo con search/participants actualizado
import apiGeneralRouter from "./routes/apiGeneral.mjs";

// Crear la aplicación Express principal
const app = express();

// Configurar CORS
app.use(cors({ origin: true }));

// Configurar middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Configurar rutas
app.use("/api", apiGeneralRouter);

// Ruta raíz
app.get("/", (req, res) => {
  res.send("🚀 Firebase Functions API - Versión Simplificada");
});

// Exportar la función principal
export const liveApiGateway = onRequest(app);
