const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

admin.initializeApp();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Configuración de Twilio desde las variables de entorno
const accountSid = functions.config().twilio.account_sid;
const authToken = functions.config().twilio.auth_token;
const twilioPhoneNumber = functions.config().twilio.phone_number;

// Inicializa el cliente de Twilio
const client = twilio(accountSid, authToken);

/**
 * 📩 Endpoint para enviar mensajes por Twilio (SMS o WhatsApp)
 */
app.post('/sendMessage', async (req, res) => {
    const { to, message, method } = req.body;

    if (!to || !message || !method) {
        return res.status(400).json({ message: "Número de teléfono, mensaje y método son obligatorios." });
    }

    try {
        let twilioMessage;

        if (method === "whatsapp") {
            // Enviar mensaje por WhatsApp
            twilioMessage = await client.messages.create({
                from: `whatsapp:${twilioPhoneNumber}`,
                to: `whatsapp:${to}`,
                body: message
            });
        } else if (method === "sms") {
            // Enviar mensaje por SMS
            twilioMessage = await client.messages.create({
                from: twilioPhoneNumber,
                to: to,
                body: message
            });
        } else {
            return res.status(400).json({ message: "Método inválido. Usa 'whatsapp' o 'sms'." });
        }

        return res.status(200).json({ message: "Mensaje enviado correctamente.", sid: twilioMessage.sid });

    } catch (error) {
        console.error("Error enviando mensaje:", error);
        return res.status(500).json({ message: "Error al enviar mensaje.", error: error.message });
    }
});

// Exportar la Cloud Function con Express y CORS
exports.liveApiGateway = functions.https.onRequest(app);