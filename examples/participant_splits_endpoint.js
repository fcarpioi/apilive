/**
 * 🎯 ENDPOINT API: CONSULTAR SPLITS CON CLIPS DE UN PARTICIPANTE
 * 
 * Este archivo muestra cómo implementar endpoints para consultar
 * los splits que tienen clips de un participante específico
 */

import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();
const db = admin.firestore();

/**
 * 🎯 GET /api/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips
 * 
 * Obtiene todos los splits donde el participante tiene clips
 * 
 * Query params:
 * - appId: ID de la app (opcional, para estructura nueva)
 * - detailed: true/false (incluir detalles de clips o solo nombres)
 */
router.get('/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips', async (req, res) => {
  const { raceId, eventId, participantId } = req.params;
  const { appId, detailed = 'false' } = req.query;
  
  try {
    console.log(`🎯 Consultando splits con clips para participante: ${participantId}`);
    
    // Construir referencia según estructura
    let splitClipsRef;
    
    if (appId) {
      // Estructura nueva: /races/{raceId}/apps/{appId}/events/{eventId}/split-clips
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      // Estructura antigua: /races/{raceId}/events/{eventId}/split-clips
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    // Consultar clips del participante
    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .orderBy("splitIndex", "asc")
      .get();
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        participantId: participantId,
        totalSplits: 0,
        totalClips: 0,
        splitsWithClips: [],
        message: "No se encontraron clips para este participante"
      });
    }
    
    // Procesar resultados
    const splitsMap = new Map();
    let totalClips = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      totalClips++;
      
      if (!splitsMap.has(splitName)) {
        splitsMap.set(splitName, {
          splitName: splitName,
          splitIndex: data.splitIndex,
          clipCount: 1,
          clips: [{
            id: doc.id,
            clipUrl: data.clipUrl,
            timestamp: data.timestamp,
            generatedAt: data.generatedAt?.toDate()
          }]
        });
      } else {
        const existingSplit = splitsMap.get(splitName);
        existingSplit.clipCount++;
        existingSplit.clips.push({
          id: doc.id,
          clipUrl: data.clipUrl,
          timestamp: data.timestamp,
          generatedAt: data.generatedAt?.toDate()
        });
      }
    });
    
    // Convertir a array y ordenar
    const splits = Array.from(splitsMap.values())
      .sort((a, b) => a.splitIndex - b.splitIndex);
    
    // Respuesta según el nivel de detalle solicitado
    if (detailed === 'true') {
      // Respuesta detallada con todos los clips
      res.json({
        success: true,
        participantId: participantId,
        totalSplits: splits.length,
        totalClips: totalClips,
        splitsWithClips: splits.map(split => split.splitName),
        detailedSplits: splits
      });
    } else {
      // Respuesta simple solo con nombres de splits
      res.json({
        success: true,
        participantId: participantId,
        totalSplits: splits.length,
        totalClips: totalClips,
        splitsWithClips: splits.map(split => split.splitName)
      });
    }
    
  } catch (error) {
    console.error("Error consultando splits del participante:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
      message: error.message
    });
  }
});

/**
 * 🎯 GET /api/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips/summary
 * 
 * Versión simplificada que solo devuelve nombres de splits
 */
router.get('/races/:raceId/events/:eventId/participants/:participantId/splits-with-clips/summary', async (req, res) => {
  const { raceId, eventId, participantId } = req.params;
  const { appId } = req.query;
  
  try {
    let splitClipsRef;
    
    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    const snapshot = await splitClipsRef
      .where("participantId", "==", participantId)
      .get();
    
    const splitNames = new Set();
    snapshot.forEach(doc => {
      splitNames.add(doc.data().splitName);
    });
    
    const splitsArray = Array.from(splitNames).sort();
    
    res.json({
      success: true,
      participantId: participantId,
      totalSplits: splitsArray.length,
      splitsWithClips: splitsArray
    });
    
  } catch (error) {
    console.error("Error obteniendo resumen de splits:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

/**
 * 🎯 POST /api/races/:raceId/events/:eventId/participants/bulk-splits-with-clips
 * 
 * Consulta masiva para múltiples participantes
 */
router.post('/races/:raceId/events/:eventId/participants/bulk-splits-with-clips', async (req, res) => {
  const { raceId, eventId } = req.params;
  const { participantIds, appId } = req.body;
  
  if (!participantIds || !Array.isArray(participantIds)) {
    return res.status(400).json({
      success: false,
      error: "Se requiere un array de participantIds"
    });
  }
  
  try {
    let splitClipsRef;
    
    if (appId) {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("apps").doc(appId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    } else {
      splitClipsRef = db.collection("races").doc(raceId)
        .collection("events").doc(eventId)
        .collection("split-clips");
    }
    
    // Firestore permite máximo 10 elementos en "in"
    const batchSize = 10;
    const results = {};
    
    for (let i = 0; i < participantIds.length; i += batchSize) {
      const batch = participantIds.slice(i, i + batchSize);
      
      const snapshot = await splitClipsRef
        .where("participantId", "in", batch)
        .get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const participantId = data.participantId;
        const splitName = data.splitName;
        
        if (!results[participantId]) {
          results[participantId] = new Set();
        }
        
        results[participantId].add(splitName);
      });
    }
    
    // Convertir Sets a arrays
    const finalResults = {};
    Object.keys(results).forEach(participantId => {
      finalResults[participantId] = Array.from(results[participantId]).sort();
    });
    
    res.json({
      success: true,
      totalParticipants: participantIds.length,
      participantsWithClips: Object.keys(finalResults).length,
      results: finalResults
    });
    
  } catch (error) {
    console.error("Error en consulta masiva:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

export default router;
