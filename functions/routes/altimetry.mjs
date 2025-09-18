// routes/altimetry.mjs
import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";

const router = express.Router();

/**
 * @openapi
 * /api/altimetry:
 *   post:
 *     summary: Obtener altimetría con la API de Google
 *     description: Devuelve datos de elevación entre un conjunto de coordenadas.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               coordinates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *               samples:
 *                 type: integer
 *                 default: 100
 *     responses:
 *       '200':
 *         description: Datos de altimetría devueltos exitosamente.
 *       '400':
 *         description: Solicitud malformada.
 *       '500':
 *         description: Error al llamar a la API de Google.
 */
router.post("/altimetry", async (req, res) => {
  try {
    const { coordinates = [], samples = 100 } = req.body;
    if (!coordinates.length) {
      return res.status(400).json({ error: "No coordinates provided" });
    }

    const path = coordinates.map(coord => `${coord.lat},${coord.lng}`).join("|");
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || admin.app().options.apiKey;

    const url = `https://maps.googleapis.com/maps/api/elevation/json?path=${encodeURIComponent(path)}&samples=${samples}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(500).json({ error: `Google API error: ${data.status}` });
    }

    res.json(data.results);
  } catch (error) {
    console.error("Error al obtener altimetría:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;