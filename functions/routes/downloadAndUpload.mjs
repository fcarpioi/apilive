import express from "express";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import fetch from "node-fetch";
import path from "path";

const router = express.Router();

// 📌 Middleware específico que evita el fileUpload global
router.use('/downloadAndUpload', (req, res, next) => {
    // Saltarse el middleware fileUpload para esta ruta
    req._body = true; // Marcar como ya procesado para evitar fileUpload
    next();
}, express.json({ limit: "10mb" }));

/**
 * @openapi
 * /api/downloadAndUpload:
 *   post:
 *     summary: Descargar archivo desde URL y subirlo a Firebase Storage
 *     description: >
 *       Descarga un archivo desde una URL proporcionada y lo sube a Firebase Storage.
 *       Endpoint completamente nuevo sin conflictos de middlewares.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apiKey:
 *                 type: string
 *                 description: API Key para autenticación
 *                 example: "your-webhook-api-key"
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido para nueva estructura)
 *                 example: "race123"
 *               eventId:
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
 *                 example: "aws-webhook"
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
 *         description: Archivo descargado y subido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ Archivo descargado y subido exitosamente"
 *                 fileUrl:
 *                   type: string
 *                   example: "https://storage.googleapis.com/..."
 *                 fileName:
 *                   type: string
 *                   example: "abc123-video.mp4"
 *                 mediaType:
 *                   type: string
 *                   enum: [image, video, unknown]
 *                 originalFileName:
 *                   type: string
 *                   example: "video.mp4"
 *                 sourceUrl:
 *                   type: string
 *                   example: "https://example.com/video.mp4"
 *                 documentId:
 *                   type: string
 *                   example: "doc123abc"
 *       '400':
 *         description: Parámetros faltantes o error descargando archivo
 *       '401':
 *         description: API Key inválida
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/downloadAndUpload", async (req, res) => {
    try {
        console.log("🚀 [downloadAndUpload] Iniciando proceso...");
        console.log("📡 [downloadAndUpload] Body recibido:", req.body);

        // ✅ Extraer parámetros del body JSON
        const { apiKey, raceId, eventId, participantId, fileUrl, description, originType, date } = req.body;

        // 🔐 Verificación de autenticación
        const expectedApiKey = process.env.WEBHOOK_API_KEY;

        if (!expectedApiKey) {
            console.error("❌ [downloadAndUpload] API Key no configurada en el servidor");
            return res.status(500).json({ message: "Error de configuración del servidor" });
        }

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error("❌ [downloadAndUpload] API Key inválida o faltante");
            return res.status(401).json({ message: "No autorizado - API Key inválida" });
        }

        console.log("✅ [downloadAndUpload] API Key válida");

        // Validar parámetros requeridos
        if (!raceId || !eventId || !participantId || !fileUrl || !originType) {
            console.error("❌ [downloadAndUpload] Parámetros faltantes:", {
                raceId: !!raceId,
                eventId: !!eventId,
                participantId: !!participantId,
                fileUrl: !!fileUrl,
                originType: !!originType
            });
            return res.status(400).json({
                message: "raceId, eventId, participantId, fileUrl y originType son requeridos"
            });
        }

        // Usar fecha proporcionada o fecha actual
        const recordingDate = date || new Date().toISOString();
        const recordingTimestamp = admin.firestore.Timestamp.fromDate(new Date(recordingDate));
        
        console.log("📡 [downloadAndUpload] Parámetros recibidos:", {
            raceId,
            eventId,
            participantId,
            fileUrl,
            description,
            originType,
            recordingDate
        });

        // ✅ 1️⃣ Descargar archivo desde la URL
        console.log("📥 [downloadAndUpload] Descargando archivo desde URL:", fileUrl);
        
        const downloadResponse = await fetch(fileUrl);
        if (!downloadResponse.ok) {
            console.error("❌ [downloadAndUpload] Error descargando archivo:", downloadResponse.status, downloadResponse.statusText);
            return res.status(400).json({ 
                message: `Error descargando archivo: ${downloadResponse.status} ${downloadResponse.statusText}` 
            });
        }

        const fileBuffer = await downloadResponse.arrayBuffer();
        const contentType = downloadResponse.headers.get('content-type') || 'application/octet-stream';
        
        console.log("📦 [downloadAndUpload] Archivo descargado:", {
            size: fileBuffer.byteLength,
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

        // ✅ 3️⃣ Generar nombre único y path en Firebase Storage
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `races/${raceId}/events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

        console.log("📄 [downloadAndUpload] Archivo generado:", {
            originalFileName,
            uniqueFileName,
            filePath,
            mediaType
        });

        // ✅ 4️⃣ Subir archivo a Firebase Storage
        console.log("📤 [downloadAndUpload] Subiendo archivo a Firebase Storage...");
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(Buffer.from(fileBuffer), {
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

        console.log("✅ [downloadAndUpload] Archivo subido a Firebase Storage:", publicUrl);

        // ✅ 5️⃣ Registrar metadata en Firestore
        console.log("📝 [downloadAndUpload] Registrando metadata en Firestore...");

        // ✅ CORREGIDO: Usar 'stories' en lugar de 'media' y agregar campos faltantes
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
                fileSize: fileBuffer.byteLength,
                sourceUrl: fileUrl,
                description: description || null,
                moderationStatus: "approved",
                originType: originType,
                date: recordingTimestamp,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                // ✅ AGREGADO: Campos faltantes para completar estructura
                duration: null, // Se puede calcular después si es video
                generationInfo: {
                    source: "download_upload_api",
                    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    downloadMethod: "url_download"
                }
            });

        console.log("✅ [downloadAndUpload] Archivo registrado en Firestore con ID:", docRef.id);

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
        console.error("❌ [downloadAndUpload] Error en el proceso:", error);
        return res.status(500).json({ 
            message: "Error interno del servidor", 
            error: error.message 
        });
    }
});

export default router;
