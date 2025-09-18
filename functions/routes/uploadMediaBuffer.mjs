import express from "express";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import path from "path";

const router = express.Router();

// Middleware específico para este endpoint que maneja raw data
router.use('/uploadMediaBuffer', express.raw({ 
    type: 'multipart/form-data', 
    limit: '100mb' 
}));

/**
 * @openapi
 * /api/uploadMediaBuffer:
 *   post:
 *     summary: Subir imagen o video usando raw buffer
 *     description: >
 *       Endpoint simplificado que recibe archivos como raw buffer.
 *       Requiere que el archivo se envíe como binary data con parámetros en query string.
 *     parameters:
 *       - in: query
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del evento
 *         example: "EHBvfwgOYBptYjXHOJK3"
 *       - in: query
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del participante
 *         example: "CZefBK0s01UlbOTX4yqH"
 *       - in: query
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre del archivo
 *         example: "image.jpg"
 *       - in: query
 *         name: contentType
 *         required: true
 *         schema:
 *           type: string
 *         description: Tipo MIME del archivo
 *         example: "image/jpeg"
 *       - in: query
 *         name: description
 *         required: false
 *         schema:
 *           type: string
 *         description: Descripción opcional
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       '200':
 *         description: Archivo subido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "✅ Archivo subido exitosamente"
 *                 fileUrl:
 *                   type: string
 *                   example: "https://firebasestorage.googleapis.com/..."
 *                 fileName:
 *                   type: string
 *                   example: "abc123-image.jpg"
 *                 mediaType:
 *                   type: string
 *                   enum: [image, video]
 *                 documentId:
 *                   type: string
 *                   example: "doc123abc"
 *       '400':
 *         description: Parámetros faltantes o archivo inválido
 *       '500':
 *         description: Error interno del servidor
 */
router.post("/uploadMediaBuffer", async (req, res) => {
    try {
        console.log("🚀 [uploadMediaBuffer] Iniciando proceso...");
        console.log("📡 [uploadMediaBuffer] Query params:", req.query);
        console.log("📁 [uploadMediaBuffer] Content-Type:", req.headers['content-type']);
        console.log("📦 [uploadMediaBuffer] Body size:", req.body ? req.body.length : 0);

        // Extraer parámetros de query string
        const { eventId, participantId, fileName, contentType, description } = req.query;

        // Validar parámetros requeridos
        if (!eventId || !participantId || !fileName || !contentType) {
            console.error("❌ [uploadMediaBuffer] Parámetros faltantes:", {
                eventId: !!eventId,
                participantId: !!participantId,
                fileName: !!fileName,
                contentType: !!contentType
            });
            return res.status(400).json({
                message: "eventId, participantId, fileName y contentType son requeridos en query params"
            });
        }

        // Verificar que se recibió el archivo
        if (!req.body || req.body.length === 0) {
            console.error("❌ [uploadMediaBuffer] No se recibió archivo");
            return res.status(400).json({
                message: "No se recibió archivo en el body"
            });
        }

        console.log("📡 [uploadMediaBuffer] Parámetros recibidos:", {
            eventId,
            participantId,
            fileName,
            contentType,
            fileSize: req.body.length,
            description: description || "Sin descripción"
        });

        // Validar tipo de archivo
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
        const extname = allowedTypes.test(path.extname(fileName).toLowerCase());
        const mimetype = allowedTypes.test(contentType);

        if (!mimetype || !extname) {
            return res.status(400).json({
                message: "Tipo de archivo no soportado. Solo imágenes (jpg, png, gif, webp) y videos (mp4, mov, avi, mkv, webm)."
            });
        }

        // Determinar tipo de media
        const isVideo = contentType.startsWith('video/');
        const isImage = contentType.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        // Generar nombre único del archivo
        const fileExtension = path.extname(fileName);
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

        console.log("📄 [uploadMediaBuffer] Archivo generado:", {
            fileName: uniqueFileName,
            path: filePath,
            mediaType,
            size: req.body.length
        });

        // Subir archivo a Firebase Storage
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(req.body, {
            metadata: {
                contentType: contentType,
                metadata: {
                    eventId,
                    participantId,
                    mediaType,
                    originalName: fileName,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        // Hacer el archivo público y obtener URL
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        console.log("✅ [uploadMediaBuffer] Archivo subido a Storage:", publicUrl);

        // Registrar metadata en Firestore
        console.log("📝 [uploadMediaBuffer] Registrando metadata en Firestore...");

        const docRef = await firestore
            .collection("events")
            .doc(eventId)
            .collection("participants")
            .doc(participantId)
            .collection("media")
            .add({
                eventId,
                participantId,
                fileName: uniqueFileName,
                filePath,
                fileUrl: publicUrl,
                mediaType,
                contentType: contentType,
                originalName: fileName,
                fileSize: req.body.length,
                description: description || null,
                moderationStatus: "approved",
                originType: "upload-api-buffer",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [uploadMediaBuffer] Metadata registrada con ID:", docRef.id);

        return res.status(200).json({
            message: "✅ Archivo subido exitosamente",
            fileUrl: publicUrl,
            fileName: uniqueFileName,
            mediaType,
            documentId: docRef.id,
        });

    } catch (error) {
        console.error("❌ [uploadMediaBuffer] Error en el proceso:", error);
        return res.status(500).json({
            message: "Error interno del servidor",
            error: error.message
        });
    }
});

export default router;
