import express from "express";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import path from "path";

const router = express.Router();

/**
 * @openapi
 * /api/uploadMediaSimple:
 *   post:
 *     summary: Subir imagen o video a Firebase Storage (versión simple)
 *     description: >
 *       Sube archivos de imagen o video a Firebase Storage usando express-fileupload.
 *       Detecta automáticamente el tipo de archivo y genera nombres únicos.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               eventId:
 *                 type: string
 *                 description: ID del evento
 *                 example: "EHBvfwgOYBptYjXHOJK3"
 *               participantId:
 *                 type: string
 *                 description: ID del participante
 *                 example: "CZefBK0s01UlbOTX4yqH"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen o video
 *               description:
 *                 type: string
 *                 description: Descripción opcional del archivo
 *                 example: "Foto en la meta"
 *             required:
 *               - eventId
 *               - participantId
 *               - file
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
router.post("/uploadMediaSimple", async (req, res) => {
    try {
        console.log("🚀 [uploadMediaSimple] Iniciando proceso...");
        console.log("📡 [uploadMediaSimple] Body:", req.body);
        console.log("📁 [uploadMediaSimple] Files:", req.files);

        // ✅ Verificar que se recibieron archivos
        if (!req.files || Object.keys(req.files).length === 0) {
            console.error("❌ [uploadMediaSimple] No se recibieron archivos");
            return res.status(400).json({ 
                message: "No se recibió ningún archivo" 
            });
        }

        // ✅ Extraer parámetros del body
        const { eventId, participantId, description } = req.body;
        
        // Obtener el archivo (puede estar en diferentes campos)
        const file = req.files.file || req.files[Object.keys(req.files)[0]];

        // Validar parámetros requeridos
        if (!eventId || !participantId || !file) {
            console.error("❌ [uploadMediaSimple] Parámetros faltantes:", {
                eventId: !!eventId,
                participantId: !!participantId,
                file: !!file
            });
            return res.status(400).json({ 
                message: "eventId, participantId y file son requeridos" 
            });
        }

        console.log("📡 [uploadMediaSimple] Parámetros recibidos:", { 
            eventId, 
            participantId, 
            fileName: file.name,
            mimetype: file.mimetype,
            size: file.size,
            description: description || "Sin descripción"
        });

        // ✅ Validar tipo de archivo
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
        const extname = allowedTypes.test(path.extname(file.name).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (!mimetype || !extname) {
            return res.status(400).json({ 
                message: "Tipo de archivo no soportado. Solo imágenes (jpg, png, gif, webp) y videos (mp4, mov, avi, mkv, webm)." 
            });
        }

        // ✅ Determinar tipo de media (imagen o video)
        const isVideo = file.mimetype.startsWith('video/');
        const isImage = file.mimetype.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        // ✅ Generar nombre único del archivo
        const fileExtension = path.extname(file.name);
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

        console.log("📄 [uploadMediaSimple] Archivo generado:", {
            fileName: uniqueFileName,
            path: filePath,
            mediaType
        });

        // ✅ Subir archivo a Firebase Storage
        const fileUpload = bucket.file(filePath);
        
        await fileUpload.save(file.data, {
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    eventId,
                    participantId,
                    mediaType,
                    originalName: file.name,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        // Hacer el archivo público y obtener URL
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        
        console.log("✅ [uploadMediaSimple] Archivo subido a Storage:", publicUrl);

        // ✅ Registrar metadata en Firestore
        console.log("📝 [uploadMediaSimple] Registrando metadata en Firestore...");
        
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
                contentType: file.mimetype,
                originalName: file.name,
                fileSize: file.size,
                description: description || null,
                moderationStatus: "approved",
                originType: "upload-api-simple",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [uploadMediaSimple] Metadata registrada con ID:", docRef.id);

        return res.status(200).json({
            message: "✅ Archivo subido exitosamente",
            fileUrl: publicUrl,
            fileName: uniqueFileName,
            mediaType,
            documentId: docRef.id,
        });

    } catch (error) {
        console.error("❌ [uploadMediaSimple] Error en el proceso:", error);
        return res.status(500).json({ 
            message: "Error interno del servidor", 
            error: error.message 
        });
    }
});

export default router;
