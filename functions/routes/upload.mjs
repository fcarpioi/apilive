import express from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { admin, firestore } from "../config/firebaseConfig.mjs";

// 🔹 Inicializa el router
const router = express.Router();

// 🔥 Configuración de Firebase Storage
const bucket = admin.storage().bucket();

console.log("🔍 Configuración Firebase Storage cargada");

/**
 * @openapi
 * /api/generateUploadUrl:
 *   post:
 *     summary: Generar URL prefirmada para subir archivos a Firebase Storage
 *     description: Genera una URL de subida prefirmada para Firebase Storage. MIGRADO para nueva estructura.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido).
 *               eventId:
 *                 type: string
 *                 description: Identificador del evento.
 *               participantId:
 *                 type: string
 *                 description: Identificador del participante.
 *               fileName:
 *                 type: string
 *                 description: Nombre del archivo.
 *               contentType:
 *                 type: string
 *                 description: Tipo MIME del archivo (opcional).
 *             required:
 *               - raceId
 *               - eventId
 *               - participantId
 *               - fileName
 *     responses:
 *       '200':
 *         description: URL de subida generada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uploadUrl:
 *                   type: string
 *                   description: URL prefirmada para subida a Firebase Storage
 *                 filePath:
 *                   type: string
 *                   description: Ruta del archivo en Firebase Storage
 *                 fileName:
 *                   type: string
 *                   description: Nombre único generado para el archivo
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   description: Fecha de expiración de la URL
 *       '400':
 *         description: Falta algún campo obligatorio.
 *       '500':
 *         description: Error al generar la URL de subida.
 */
router.post("/generateUploadUrl", async (req, res) => {
    try {
        console.log("🚀 [generateUploadUrl] Generando URL de subida para Firebase Storage...");

        const { raceId, appId, eventId, participantId, fileName, contentType } = req.body;

        if (!raceId || !appId || !eventId || !participantId || !fileName) {
            return res.status(400).json({
                message: "raceId, appId, eventId, participantId y fileName son obligatorios"
            });
        }

        console.log("📡 [generateUploadUrl] Parámetros recibidos:", {
            raceId,
            eventId,
            participantId,
            fileName,
            contentType
        });

        // ✅ Generar nombre único del archivo (MIGRADO: Nueva estructura con apps)
        const fileExtension = path.extname(fileName);
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`;

        console.log("📄 [generateUploadUrl] Archivo generado:", {
            originalFileName: fileName,
            uniqueFileName,
            filePath
        });

        // ✅ Generar URL prefirmada para Firebase Storage
        const file = bucket.file(filePath);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Expira en 15 minutos

        const [uploadUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: expiresAt,
            contentType: contentType || 'application/octet-stream'
        });

        console.log("✅ [generateUploadUrl] URL prefirmada generada exitosamente");

        return res.status(200).json({
            uploadUrl,
            filePath,
            fileName: uniqueFileName,
            expiresAt: expiresAt.toISOString()
        });
    } catch (error) {
        console.error("❌ [generateUploadUrl] Error:", error);
        return res.status(500).json({
            error: "Error al generar la URL de subida",
            details: error.message
        });
    }
});

// Función obsoleta eliminada - ahora usamos Firebase Storage directamente

/**
 * @openapi
 * /api/uploadToFirebase:
 *   post:
 *     summary: Subir archivo directamente a Firebase Storage
 *     description: Recibe un archivo en formato binario y lo sube directamente a Firebase Storage. MIGRADO para nueva estructura.
 *     parameters:
 *       - in: header
 *         name: x-race-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador de la carrera (NUEVO - requerido).
 *       - in: header
 *         name: x-event-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del evento.
 *       - in: header
 *         name: x-participant-id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador del participante.
 *       - in: header
 *         name: x-file-name
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre del archivo.
 *       - in: header
 *         name: x-content-type
 *         required: true
 *         schema:
 *           type: string
 *         description: Tipo MIME del archivo.
 *       - in: header
 *         name: x-description
 *         required: false
 *         schema:
 *           type: string
 *         description: Descripción opcional del archivo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       '200':
 *         description: Archivo subido a Firebase Storage exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fileName:
 *                   type: string
 *                 filePath:
 *                   type: string
 *                 fileUrl:
 *                   type: string
 *                 documentId:
 *                   type: string
 *                 mediaType:
 *                   type: string
 *       '400':
 *         description: Parámetros faltantes o archivo vacío.
 *       '500':
 *         description: Error al subir el archivo.
 */
router.post("/uploadToFirebase", async (req, res) => {
    try {
        console.log("🚀 [uploadToFirebase] Iniciando subida directa a Firebase Storage...");

        const raceId = req.headers["x-race-id"];
        const eventId = req.headers["x-event-id"];
        const participantId = req.headers["x-participant-id"];
        const fileName = req.headers["x-file-name"];
        const contentType = req.headers["x-content-type"];
        const description = req.headers["x-description"] || null;

        if (!raceId || !eventId || !participantId || !fileName || !contentType) {
            console.error("❌ [uploadToFirebase] Parámetros faltantes:", req.headers);
            return res.status(400).json({
                message: "Faltan parámetros en headers: x-race-id, x-event-id, x-participant-id, x-file-name, x-content-type"
            });
        }

        console.log("📡 [uploadToFirebase] Parámetros recibidos:", {
            raceId,
            eventId,
            participantId,
            fileName,
            contentType,
            description
        });

        const fileBuffer = req.body;
        console.log("📦 [uploadToFirebase] Tamaño del archivo recibido:", fileBuffer.length);

        if (!fileBuffer || fileBuffer.length === 0) {
            console.error("❌ [uploadToFirebase] El archivo recibido está vacío.");
            return res.status(400).json({ message: "Archivo vacío" });
        }

        // ✅ Generar nombre único y path (MIGRADO: Nueva estructura con apps)
        const fileExtension = path.extname(fileName);
        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const filePath = `races/${raceId}/apps/${appId}/events/${eventId}/participants/${participantId}/stories/${uniqueFileName}`;

        // Determinar tipo de media
        const isVideo = contentType.startsWith('video/');
        const isImage = contentType.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        console.log("📄 [uploadToFirebase] Archivo generado:", {
            originalFileName: fileName,
            uniqueFileName,
            filePath,
            mediaType
        });

        // ✅ Subir archivo a Firebase Storage
        const fileUpload = bucket.file(filePath);
        await fileUpload.save(Buffer.from(fileBuffer), {
            metadata: {
                contentType: contentType,
                metadata: {
                    raceId,
                    appId,
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

        console.log("✅ [uploadToFirebase] Archivo subido a Firebase Storage:", publicUrl);

        // ✅ Registrar metadata en Firestore (MIGRADO: Nueva estructura con apps)
        const docRef = await firestore
            .collection("races")
            .doc(raceId)
            .collection("apps")
            .doc(appId)
            .collection("events")
            .doc(eventId)
            .collection("participants")
            .doc(participantId)
            .collection("stories")
            .add({
                raceId,
                appId,
                eventId,
                participantId,
                fileName: uniqueFileName,
                filePath,
                fileUrl: publicUrl,
                mediaType,
                contentType: contentType,
                originalName: fileName,
                fileSize: fileBuffer.length,
                description: description,
                moderationStatus: "approved",
                originType: "upload-api-direct",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [uploadToFirebase] Metadata registrada con ID:", docRef.id);

        return res.status(200).json({
            message: "✅ Archivo subido a Firebase Storage",
            fileName: uniqueFileName,
            filePath,
            fileUrl: publicUrl,
            documentId: docRef.id,
            mediaType
        });
    } catch (error) {
        console.error("❌ [uploadToFirebase] Error:", error);
        return res.status(500).json({
            message: "Error al subir el archivo",
            error: error.message
        });
    }
});

/**
 * @openapi
 * /api/confirmUpload:
 *   post:
 *     summary: Confirmar subida y guardar metadata
 *     description: Confirma la subida de un archivo a Firebase Storage y guarda su metadata en Firestore. MIGRADO para nueva estructura.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               raceId:
 *                 type: string
 *                 description: Identificador de la carrera (NUEVO - requerido).
 *               eventId:
 *                 type: string
 *               participantId:
 *                 type: string
 *               filePath:
 *                 type: string
 *                 description: Ruta del archivo en Firebase Storage.
 *               fileType:
 *                 type: string
 *                 description: Tipo MIME del archivo.
 *               description:
 *                 type: string
 *               fileName:
 *                 type: string
 *                 description: Nombre original del archivo (opcional).
 *             required:
 *               - raceId
 *               - eventId
 *               - participantId
 *               - filePath
 *               - fileType
 *               - description
 *     responses:
 *       '200':
 *         description: Metadata registrada en Firestore exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fileUrl:
 *                   type: string
 *                 documentId:
 *                   type: string
 *                 filePath:
 *                   type: string
 *                 mediaType:
 *                   type: string
 *       '400':
 *         description: Algún campo obligatorio falta.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post("/confirmUpload", async (req, res) => {
    try {
        console.log("🚀 [confirmUpload] Confirmando subida y registrando metadata...");

        const { raceId, appId, eventId, participantId, filePath, fileType, description, fileName } = req.body;

        if (!raceId || !appId || !eventId || !participantId || !filePath || !fileType || !description) {
            return res.status(400).json({
                message: "raceId, appId, eventId, participantId, filePath, fileType y description son obligatorios"
            });
        }

        console.log("📡 [confirmUpload] Parámetros recibidos:", {
            raceId,
            appId,
            eventId,
            participantId,
            filePath,
            fileType,
            description,
            fileName
        });

        // ✅ Construir URL de Firebase Storage
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        // Determinar tipo de media
        const isVideo = fileType.startsWith('video/');
        const isImage = fileType.startsWith('image/');
        const mediaType = isVideo ? 'video' : isImage ? 'image' : 'unknown';

        // ✅ Registrar metadata en Firestore (MIGRADO: Nueva estructura con apps)
        const docRef = await firestore
            .collection("races")
            .doc(raceId)
            .collection("apps")
            .doc(appId)
            .collection("events")
            .doc(eventId)
            .collection("participants")
            .doc(participantId)
            .collection("stories")
            .add({
                raceId,
                appId,
                eventId,
                participantId,
                filePath,
                fileUrl,
                fileName: fileName || path.basename(filePath),
                mediaType,
                contentType: fileType,
                description,
                moderationStatus: "approved",
                originType: "upload-api-confirm",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [confirmUpload] Metadata registrada con ID:", docRef.id);

        return res.json({
            message: "✅ Archivo registrado en Firestore",
            fileUrl,
            documentId: docRef.id,
            filePath,
            mediaType
        });

    } catch (error) {
        console.error("❌ [confirmUpload] Error:", error);
        return res.status(500).json({
            message: "Error interno del servidor",
            error: error.message
        });
    }
});

export default router;