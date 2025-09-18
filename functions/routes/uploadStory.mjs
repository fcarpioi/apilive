import express from "express";
import B2 from "backblaze-b2";
//import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import * as functions from "firebase-functions";
import fetch from "node-fetch";
import path from "path";

//app.use(cors({ origin: true }));
const router = express.Router();

// 📌 Configuración de Backblaze
const backblazeConfig = {
    key_id: "003f9b4aeb02d5e0000000002",
    key: "K0031zsdF1J6Gj2zPOlDaRzei7y9XwI",
    bucket_id: "4f69eb541a9e1b30925d051e",
    bucket_name: "LiveCopernico"
};

// 📌 Inicializa Backblaze
const b2 = new B2({
    applicationKeyId: backblazeConfig.key_id,
    applicationKey: backblazeConfig.key
});

// 📌 Middleware para procesar JSON
router.use(express.json({ limit: "10mb" }));

/**
 * @openapi
 * /api/uploadStory/uploadFullFlow:
 *   post:
 *     summary: Descargar archivo desde URL y subirlo a Firebase Storage
 *     description: >
 *       Descarga un archivo desde una URL proporcionada y lo sube a Firebase Storage.
 *       Requiere API Key para autenticación y parámetros en el body JSON.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: API Key para autenticación del webhook
 *                 example: "temp-dev-key-12345"
 *               raceId:
                 type: string
                 description: Identificador de la carrera (NUEVO - requerido)
                 example: "57640500-c3ac-4afa-8f6b-6d55bc5ffd28"
               eventId:
 *                 type: string
 *                 description: Identificador del evento
 *                 example: "EHBvfwgOYBptYjXHOJK3"
 *               participantId:
 *                 type: string
 *                 description: Identificador del participante
 *                 example: "CZefBK0s01UlbOTX4yqH"
 *               fileUrl:
 *                 type: string
 *                 description: URL del archivo a descargar
 *                 example: "https://example.com/video.mp4"
 *               description:
 *                 type: string
 *                 description: Descripción del archivo (opcional)
 *                 example: "Video del participante"
 *               originType:
 *                 type: string
 *                 description: Origen del archivo
 *                 example: "webhook-download"
 *               date:
 *                 type: string
 *                 description: Fecha del archivo (opcional)
 *                 example: "2024-01-15T10:30:00.000Z"
 *             required:
 *               - apiKey
 *               - raceId
 *               - eventId
 *               - participantId
 *               - fileUrl
 *               - originType
 *     responses:
 *       '200':
 *         description: Archivo subido y registrado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ Archivo subido y registrado exitosamente"
 *                 fileUrl:
 *                   type: string
 *                   example: "https://f003.backblazeb2.com/file/LiveCopernico/stories/..."
 *                 documentId:
 *                   type: string
 *                   example: "abc123def456"
 *       '400':
 *         description: Parámetros faltantes o archivo no recibido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Faltan parámetros en los Headers"
 *       '401':
 *         description: No autorizado - API Key inválida.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No autorizado - API Key inválida"
 *       '500':
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error interno del servidor"
 *                 error:
 *                   type: string
 */
router.post("/uploadFullFlow", async (req, res) => {
    try {
        console.log("🚀 [uploadFullFlow] Iniciando proceso...");
        console.log("� [uploadFullFlow] Body recibido:", req.body);

        // ✅ Extraer parámetros del body JSON
        const { apiKey, raceId, eventId, participantId, fileUrl, description, originType, date } = req.body;

        // 🔐 Verificación de autenticación para webhooks
        const expectedApiKey = process.env.WEBHOOK_API_KEY ||
                              (typeof functions !== 'undefined' && functions.config().webhook?.api_key) ||
                              "temp-dev-key-12345"; // Solo para desarrollo

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error("❌ [uploadFullFlow] API Key inválida o faltante");
            console.error("Expected:", expectedApiKey ? "***configured***" : "NOT_CONFIGURED");
            console.error("Received:", apiKey ? "***provided***" : "NOT_PROVIDED");
            return res.status(401).json({ message: "No autorizado - API Key inválida" });
        }

        console.log("✅ [uploadFullFlow] API Key válida");

        // Validar parámetros requeridos
        if (!raceId || !eventId || !participantId || !fileUrl || !originType) {
            console.error("❌ [uploadFullFlow] Parámetros faltantes:", {
                raceId: !!raceId,
                eventId: !!eventId,
                participantId: !!participantId,
                fileUrl: !!fileUrl,
                originType: !!originType
            });
            return res.status(400).json({ message: "raceId, eventId, participantId, fileUrl y originType son requeridos" });
        }

        // Usar fecha proporcionada o fecha actual
        const recordingDate = date || new Date().toISOString();
        const recordingTimestamp = admin.firestore.Timestamp.fromDate(new Date(recordingDate));
        console.log("📡 [uploadFullFlow] Parámetros recibidos:", {
            raceId,
            eventId,
            participantId,
            fileUrl,
            description,
            originType,
            recordingDate
        });

        // ✅ 1️⃣ Descargar archivo desde la URL
        console.log("📥 [uploadFullFlow] Descargando archivo desde URL:", fileUrl);

        const downloadResponse = await fetch(fileUrl);
        if (!downloadResponse.ok) {
            console.error("❌ [uploadFullFlow] Error descargando archivo:", downloadResponse.status, downloadResponse.statusText);
            return res.status(400).json({ message: `Error descargando archivo: ${downloadResponse.status} ${downloadResponse.statusText}` });
        }

        const fileBuffer = await downloadResponse.buffer();
        const contentType = downloadResponse.headers.get('content-type') || 'application/octet-stream';

        console.log("📦 [uploadFullFlow] Archivo descargado:", {
            size: fileBuffer.length,
            contentType: contentType
        });

        // ✅ 2️⃣ Determinar extensión y nombre del archivo
        const urlPath = new URL(fileUrl).pathname;
        const originalFileName = path.basename(urlPath) || 'downloaded-file';
        const fileExtension = path.extname(originalFileName) || '.bin';

        // Determinar tipo de media
        const isVideo = contentType.startsWith('video/');
        const isImage = contentType.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        // ✅ 3️⃣ Generar nombre único y path en Firebase Storage (estructura corregida)
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `races/${raceId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`;

        console.log("📄 [uploadFullFlow] Archivo generado:", {
            originalFileName,
            uniqueFileName,
            filePath,
            mediaType
        });

        // ✅ 4️⃣ Subir archivo a Firebase Storage
        console.log("📤 [uploadFullFlow] Subiendo archivo a Firebase Storage...");
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(fileBuffer, {
            metadata: {
                contentType: contentType,
                metadata: {
                    raceId,
                    eventId,
                    participantId,
                    mediaType,
                    originalName: originalFileName,
                    sourceUrl: fileUrl,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        // Hacer el archivo público y obtener URL
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        console.log("✅ [uploadFullFlow] Archivo subido a Firebase Storage:", publicUrl);

        // ✅ 5️⃣ Registrar la metadata en Firestore
        console.log("📝 [uploadFullFlow] Registrando metadata en Firestore...");

        // ✅ CORREGIDO: Usar estructura correcta races/events/participants/stories
        const docRef = await firestore
            .collection("races")
            .doc(raceId)
            .collection("events")
            .doc(eventId)
            .collection("participants")
            .doc(participantId)
            .collection("stories")
            .add({
                raceId,
                eventId,
                participantId,
                fileName: uniqueFileName,
                filePath,
                fileUrl: publicUrl,
                mediaType,
                contentType: contentType,
                originalName: originalFileName,
                fileSize: fileBuffer.length,
                sourceUrl: fileUrl,
                description: description || null,
                moderationStatus: "approved",
                originType: originType,
                date: recordingTimestamp,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                // Campos adicionales para completar estructura
                duration: null, // Se puede calcular después si es video
                generationInfo: {
                    source: "upload_story_api",
                    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    uploadMethod: "direct_upload"
                }
            });

        console.log("✅ [uploadFullFlow] Archivo registrado en Firestore con ID:", docRef.id);

        return res.status(200).json({
            message: "✅ Archivo descargado y subido exitosamente",
            fileUrl: publicUrl,
            fileName: uniqueFileName,
            mediaType,
            originalFileName,
            sourceUrl: fileUrl,
            documentId: docRef.id,
        });

    } catch (error) {
        console.error("❌ [uploadFullFlow] Error en el proceso:", error);
        return res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
});

export default router;