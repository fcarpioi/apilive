import express from "express";
import { v4 as uuidv4 } from "uuid";
import { admin, firestore, bucket } from "./config/firebaseConfig.mjs";
import fetch from "node-fetch";
import path from "path";
import cors from "cors";

// Crear una aplicación Express completamente independiente
const app = express();

// Solo los middlewares que necesitamos
app.use(cors({ origin: true }));

// Middleware para capturar raw data
app.use(express.raw({ type: '*/*', limit: '10mb' }));

/**
 * Endpoint para descargar archivo desde URL y subirlo a Firebase Storage
 */
app.post("/", async (req, res) => {
    try {
        console.log("🚀 [downloadUpload] Iniciando proceso...");
        console.log("📡 [downloadUpload] Body recibido (tipo):", typeof req.body);
        console.log("📡 [downloadUpload] Body recibido (es Buffer):", Buffer.isBuffer(req.body));

        // ✅ Parsear JSON manualmente si es necesario
        let bodyData;
        if (Buffer.isBuffer(req.body)) {
            try {
                const bodyString = req.body.toString('utf8');
                console.log("📡 [downloadUpload] Body como string (primeros 200 chars):", bodyString.substring(0, 200));

                // Si el string contiene multipart, extraer el JSON
                if (bodyString.includes('Content-Type: application/json')) {
                    // Es multipart, extraer la parte JSON
                    const jsonMatch = bodyString.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        bodyData = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error("No se encontró JSON en multipart");
                    }
                } else {
                    // Intentar parsear directamente como JSON
                    bodyData = JSON.parse(bodyString);
                }
            } catch (parseError) {
                console.error("❌ [downloadUpload] Error parseando JSON:", parseError);
                console.error("❌ [downloadUpload] Body string:", req.body.toString('utf8').substring(0, 500));
                return res.status(400).json({ message: "Body debe ser JSON válido" });
            }
        } else if (typeof req.body === 'object' && req.body !== null) {
            bodyData = req.body;
        } else {
            console.error("❌ [downloadUpload] Body no es válido:", req.body);
            return res.status(400).json({ message: "Body debe ser JSON" });
        }

        console.log("📡 [downloadUpload] Body parseado:", bodyData);

        // ✅ Extraer parámetros del body JSON
        const { apiKey, eventId, participantId, fileUrl, description, originType, date } = bodyData;

        // 🔐 Verificación de autenticación
        const expectedApiKey = process.env.WEBHOOK_API_KEY;

        if (!expectedApiKey) {
            console.error("❌ [downloadUpload] API Key no configurada en el servidor");
            return res.status(500).json({ message: "Error de configuración del servidor" });
        }

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error("❌ [downloadUpload] API Key inválida o faltante");
            return res.status(401).json({ message: "No autorizado - API Key inválida" });
        }

        console.log("✅ [downloadUpload] API Key válida");

        // Validar parámetros requeridos
        if (!eventId || !participantId || !fileUrl || !originType) {
            console.error("❌ [downloadUpload] Parámetros faltantes:", {
                eventId: !!eventId,
                participantId: !!participantId,
                fileUrl: !!fileUrl,
                originType: !!originType
            });
            return res.status(400).json({ 
                message: "eventId, participantId, fileUrl y originType son requeridos" 
            });
        }

        // Usar fecha proporcionada o fecha actual
        const recordingDate = date || new Date().toISOString();
        const recordingTimestamp = admin.firestore.Timestamp.fromDate(new Date(recordingDate));
        
        console.log("📡 [downloadUpload] Parámetros recibidos:", {
            eventId,
            participantId,
            fileUrl,
            description,
            originType,
            recordingDate
        });

        // ✅ 1️⃣ Descargar archivo desde la URL
        console.log("📥 [downloadUpload] Descargando archivo desde URL:", fileUrl);
        
        const downloadResponse = await fetch(fileUrl);
        if (!downloadResponse.ok) {
            console.error("❌ [downloadUpload] Error descargando archivo:", downloadResponse.status, downloadResponse.statusText);
            return res.status(400).json({ 
                message: `Error descargando archivo: ${downloadResponse.status} ${downloadResponse.statusText}` 
            });
        }

        const fileBuffer = await downloadResponse.arrayBuffer();
        const contentType = downloadResponse.headers.get('content-type') || 'application/octet-stream';
        
        console.log("📦 [downloadUpload] Archivo descargado:", {
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
        const filePath = `events/${eventId}/participants/${participantId}/media/${uniqueFileName}`;

        console.log("📄 [downloadUpload] Archivo generado:", {
            originalFileName,
            uniqueFileName,
            filePath,
            mediaType
        });

        // ✅ 4️⃣ Subir archivo a Firebase Storage
        console.log("📤 [downloadUpload] Subiendo archivo a Firebase Storage...");
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(Buffer.from(fileBuffer), {
            metadata: {
                contentType: contentType,
                metadata: {
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

        console.log("✅ [downloadUpload] Archivo subido a Firebase Storage:", publicUrl);

        // ✅ 5️⃣ Registrar metadata en Firestore
        console.log("📝 [downloadUpload] Registrando metadata en Firestore...");

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
                originalName: originalFileName,
                fileSize: fileBuffer.byteLength,
                sourceUrl: fileUrl,
                description: description || null,
                moderationStatus: "approved",
                originType: originType,
                date: recordingTimestamp,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        console.log("✅ [downloadUpload] Archivo registrado en Firestore con ID:", docRef.id);

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
        console.error("❌ [downloadUpload] Error en el proceso:", error);
        return res.status(500).json({ 
            message: "Error interno del servidor", 
            error: error.message 
        });
    }
});

export default app;
