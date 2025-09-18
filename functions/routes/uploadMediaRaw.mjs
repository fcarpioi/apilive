import express from "express";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import path from "path";
import busboy from "busboy";

const router = express.Router();

/**
 * @openapi
 * /api/uploadMediaRaw:
 *   post:
 *     summary: Subir imagen o video a Firebase Storage (versión raw)
 *     description: >
 *       Sube archivos de imagen o video a Firebase Storage usando busboy directamente.
 *       Evita conflictos con otros middlewares.
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
router.post("/uploadMediaRaw", (req, res) => {
    console.log("🚀 [uploadMediaRaw] Iniciando proceso...");
    
    // Verificar content-type
    if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
        return res.status(400).json({
            message: "Content-Type debe ser multipart/form-data"
        });
    }

    const bb = busboy({ 
        headers: req.headers,
        limits: {
            fileSize: 100 * 1024 * 1024, // 100MB
            files: 1,
            fields: 10
        }
    });

    const fields = {};
    let fileData = null;
    let fileInfo = null;

    // Manejar campos de texto
    bb.on('field', (fieldname, val) => {
        console.log(`📝 [uploadMediaRaw] Campo: ${fieldname} = ${val}`);
        fields[fieldname] = val;
    });

    // Manejar archivos
    bb.on('file', (fieldname, file, info) => {
        console.log(`📁 [uploadMediaRaw] Archivo: ${fieldname}`, info);
        
        fileInfo = {
            fieldname,
            filename: info.filename,
            mimetype: info.mimeType
        };

        const chunks = [];
        
        file.on('data', (chunk) => {
            chunks.push(chunk);
        });

        file.on('end', () => {
            fileData = Buffer.concat(chunks);
            console.log(`✅ [uploadMediaRaw] Archivo recibido: ${fileData.length} bytes`);
        });
    });

    // Manejar errores
    bb.on('error', (err) => {
        console.error("❌ [uploadMediaRaw] Error de busboy:", err);
        return res.status(400).json({
            message: "Error procesando el formulario: " + err.message
        });
    });

    // Cuando termine el parsing
    bb.on('finish', async () => {
        try {
            console.log("🔍 [uploadMediaRaw] Procesamiento completado");
            console.log("📡 [uploadMediaRaw] Campos:", fields);
            console.log("📁 [uploadMediaRaw] Archivo info:", fileInfo);

            // Validar parámetros requeridos
            const { eventId, participantId, description } = fields;

            if (!eventId || !participantId || !fileData || !fileInfo) {
                console.error("❌ [uploadMediaRaw] Parámetros faltantes:", {
                    eventId: !!eventId,
                    participantId: !!participantId,
                    fileData: !!fileData,
                    fileInfo: !!fileInfo
                });
                return res.status(400).json({
                    message: "eventId, participantId y file son requeridos"
                });
            }

            // Validar tipo de archivo
            const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
            const extname = allowedTypes.test(path.extname(fileInfo.filename).toLowerCase());
            const mimetype = allowedTypes.test(fileInfo.mimetype);

            if (!mimetype || !extname) {
                return res.status(400).json({
                    message: "Tipo de archivo no soportado. Solo imágenes (jpg, png, gif, webp) y videos (mp4, mov, avi, mkv, webm)."
                });
            }

            // Determinar tipo de media
            const isVideo = fileInfo.mimetype.startsWith('video/');
            const isImage = fileInfo.mimetype.startsWith('image/');
            const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

            // Generar nombre único del archivo
            const fileExtension = path.extname(fileInfo.filename);
            const uniqueFileName = `${uuidv4()}${fileExtension}`;
            const filePath = `events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

            console.log("📄 [uploadMediaRaw] Archivo generado:", {
                fileName: uniqueFileName,
                path: filePath,
                mediaType,
                size: fileData.length
            });

            // Subir archivo a Firebase Storage
            const fileUpload = bucket.file(filePath);

            await fileUpload.save(fileData, {
                metadata: {
                    contentType: fileInfo.mimetype,
                    metadata: {
                        eventId,
                        participantId,
                        mediaType,
                        originalName: fileInfo.filename,
                        uploadedAt: new Date().toISOString()
                    }
                }
            });

            // Hacer el archivo público y obtener URL
            await fileUpload.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

            console.log("✅ [uploadMediaRaw] Archivo subido a Storage:", publicUrl);

            // Registrar metadata en Firestore
            console.log("📝 [uploadMediaRaw] Registrando metadata en Firestore...");

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
                    contentType: fileInfo.mimetype,
                    originalName: fileInfo.filename,
                    fileSize: fileData.length,
                    description: description || null,
                    moderationStatus: "approved",
                    originType: "upload-api-raw",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

            console.log("✅ [uploadMediaRaw] Metadata registrada con ID:", docRef.id);

            return res.status(200).json({
                message: "✅ Archivo subido exitosamente",
                fileUrl: publicUrl,
                fileName: uniqueFileName,
                mediaType,
                documentId: docRef.id,
            });

        } catch (error) {
            console.error("❌ [uploadMediaRaw] Error en el proceso:", error);
            return res.status(500).json({
                message: "Error interno del servidor",
                error: error.message
            });
        }
    });

    // Pipe la request a busboy
    req.pipe(bb);
});

export default router;
