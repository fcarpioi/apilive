import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "../config/firebaseConfig.mjs";
import path from "path";

const router = express.Router();

// 📌 Deshabilitar otros middlewares para esta ruta específica
router.use('/uploadMedia', (req, res, next) => {
    // Saltarse otros middlewares de parsing para evitar conflictos
    next();
});

// 📌 Configurar multer para manejar archivos en memoria
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB máximo
        fieldSize: 25 * 1024 * 1024, // Límite para campos de texto
        fields: 10, // Máximo número de campos
        files: 1 // Máximo 1 archivo
    },
    fileFilter: (req, file, cb) => {
        console.log("🔍 [uploadMedia] Archivo recibido:", {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype
        });

        // Aceptar solo imágenes y videos
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (jpg, png, gif, webp) y video (mp4, mov, avi, mkv, webm)'));
        }
    }
});

/**
 * @openapi
 * /api/uploadMedia:
 *   post:
 *     summary: Subir imagen o video a Firebase Storage
 *     description: >
 *       Sube archivos de imagen o video a Firebase Storage y registra la metadata en Firestore.
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
router.post("/uploadMedia", (req, res) => {
    // Manejar errores de multer
    upload.single('file')(req, res, async (err) => {
        try {
            console.log("🚀 [uploadMedia] Iniciando proceso...");

            // Verificar errores de multer
            if (err) {
                console.error("❌ [uploadMedia] Error de multer:", err.message);
                return res.status(400).json({
                    message: "Error procesando el archivo: " + err.message
                });
            }

            console.log("📡 [uploadMedia] Body recibido:", req.body);
            console.log("📁 [uploadMedia] Archivo recibido:", req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : "No file");

            // ✅ Extraer parámetros del body (MIGRADO: Agregado raceId y appId)
            const { raceId, appId, eventId, participantId, description } = req.body;
            const file = req.file;

            // Validar parámetros requeridos (MIGRADO: Agregado raceId y appId)
            if (!raceId || !appId || !eventId || !participantId || !file) {
                console.error("❌ [uploadMedia] Parámetros faltantes:", {
                    raceId: !!raceId,
                    appId: !!appId,
                    eventId: !!eventId,
                    participantId: !!participantId,
                    file: !!file
                });
                return res.status(400).json({
                    message: "raceId, appId, eventId, participantId y file son requeridos"
                });
            }

        console.log("📡 [uploadMedia] Parámetros recibidos:", { 
            eventId, 
            participantId, 
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            description: description || "Sin descripción"
        });

        // ✅ Determinar tipo de media (imagen o video)
        const isVideo = file.mimetype.startsWith('video/');
        const isImage = file.mimetype.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        if (mediaType === 'unknown') {
            return res.status(400).json({ 
                message: "Tipo de archivo no soportado. Solo imágenes y videos." 
            });
        }

        // ✅ Generar nombre único del archivo (MIGRADO: Nueva estructura con races/apps)
        const fileExtension = path.extname(file.originalname);
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

        console.log("📄 [uploadMedia] Archivo generado:", {
            fileName: uniqueFileName,
            path: filePath,
            mediaType
        });

        // ✅ Subir archivo a Firebase Storage
        const fileUpload = bucket.file(filePath);
        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    raceId,
                    appId,
                    eventId,
                    participantId,
                    mediaType,
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        // Promesa para manejar la subida
        const uploadPromise = new Promise((resolve, reject) => {
            stream.on('error', (error) => {
                console.error("❌ [uploadMedia] Error subiendo archivo:", error);
                reject(error);
            });

            stream.on('finish', async () => {
                try {
                    // Hacer el archivo público y obtener URL
                    await fileUpload.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
        });

        // Escribir el buffer al stream
        stream.end(file.buffer);

        // Esperar a que termine la subida
        const fileUrl = await uploadPromise;
        console.log("✅ [uploadMedia] Archivo subido a Storage:", fileUrl);

        // ✅ Registrar metadata en Firestore
        console.log("📝 [uploadMedia] Registrando metadata en Firestore...");
        
        const docRef = await firestore
            .collection("races")
            .doc(raceId)
            .collection("apps")
            .doc(appId)
            .collection("events")
            .doc(eventId)
            .collection("participants")
            .doc(participantId)
            .collection("media")
            .add({
                raceId,
                appId,
                eventId,
                participantId,
                fileName: uniqueFileName,
                filePath,
                fileUrl,
                mediaType,
                contentType: file.mimetype,
                originalName: file.originalname,
                fileSize: file.size,
                description: description || null,
                moderationStatus: "approved",
                originType: "upload-api",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [uploadMedia] Metadata registrada con ID:", docRef.id);

        return res.status(200).json({
            message: "✅ Archivo subido exitosamente",
            fileUrl,
            fileName: uniqueFileName,
            mediaType,
            documentId: docRef.id,
        });

        } catch (error) {
            console.error("❌ [uploadMedia] Error en el proceso:", error);
            return res.status(500).json({
                message: "Error interno del servidor",
                error: error.message
            });
        }
    });
});

export default router;
