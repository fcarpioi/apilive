/**
 * 🏁 EJEMPLOS DE API PARA CONSULTAR CLIPS POR SPLITS
 * 
 * Estos son ejemplos de cómo implementar endpoints para consultar clips por splits
 */

// ========================================
// 📱 EJEMPLO 1: ENDPOINT PARA APP MÓVIL
// ========================================

/**
 * GET /api/races/{raceId}/events/{eventId}/splits/{splitName}/clips
 * Obtener todos los clips de un split específico
 */
async function getSplitClips(req, res) {
  const { raceId, eventId, splitName } = req.params;
  const { appId } = req.query; // Opcional para estructura nueva
  
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
      .where("splitName", "==", splitName)
      .orderBy("generatedAt", "desc")
      .limit(50) // Limitar resultados
      .get();
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    res.json({
      success: true,
      splitName: splitName,
      totalClips: clips.length,
      clips: clips
    });
    
  } catch (error) {
    console.error("Error obteniendo clips del split:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

// ========================================
// 📊 EJEMPLO 2: DASHBOARD DE ANALYTICS
// ========================================

/**
 * GET /api/races/{raceId}/events/{eventId}/splits/analytics
 * Obtener estadísticas de clips por splits
 */
async function getSplitsAnalytics(req, res) {
  const { raceId, eventId } = req.params;
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
    
    const snapshot = await splitClipsRef.get();
    
    const analytics = {};
    let totalClips = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const splitName = data.splitName;
      
      if (!analytics[splitName]) {
        analytics[splitName] = {
          splitName: splitName,
          splitIndex: data.splitIndex,
          clipCount: 0,
          participants: new Set()
        };
      }
      
      analytics[splitName].clipCount++;
      analytics[splitName].participants.add(data.participantId);
      totalClips++;
    });
    
    // Convertir Set a array y agregar estadísticas
    const result = Object.values(analytics).map(split => ({
      splitName: split.splitName,
      splitIndex: split.splitIndex,
      clipCount: split.clipCount,
      participantCount: split.participants.size,
      avgClipsPerParticipant: (split.clipCount / split.participants.size).toFixed(2)
    })).sort((a, b) => a.splitIndex - b.splitIndex);
    
    res.json({
      success: true,
      totalClips: totalClips,
      totalSplits: result.length,
      splitAnalytics: result
    });
    
  } catch (error) {
    console.error("Error obteniendo analytics de splits:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

// ========================================
// 👤 EJEMPLO 3: PERFIL DE PARTICIPANTE
// ========================================

/**
 * GET /api/races/{raceId}/events/{eventId}/participants/{participantId}/split-clips
 * Obtener todos los clips de un participante organizados por splits
 */
async function getParticipantSplitClips(req, res) {
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
      .orderBy("splitIndex", "asc")
      .get();
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        splitName: data.splitName,
        splitIndex: data.splitIndex,
        clipUrl: data.clipUrl,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    res.json({
      success: true,
      participantId: participantId,
      totalClips: clips.length,
      splitClips: clips
    });
    
  } catch (error) {
    console.error("Error obteniendo clips del participante:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

// ========================================
// 🔍 EJEMPLO 4: BÚSQUEDA AVANZADA
// ========================================

/**
 * POST /api/races/{raceId}/events/{eventId}/splits/search
 * Búsqueda avanzada de clips por múltiples criterios
 */
async function searchSplitClips(req, res) {
  const { raceId, eventId } = req.params;
  const { 
    splitNames = [], 
    participantIds = [], 
    startDate, 
    endDate, 
    limit = 50,
    appId 
  } = req.body;
  
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
    
    let query = splitClipsRef;
    
    // Filtrar por splits específicos
    if (splitNames.length > 0) {
      query = query.where("splitName", "in", splitNames);
    }
    
    // Filtrar por participantes específicos
    if (participantIds.length > 0) {
      query = query.where("participantId", "in", participantIds);
    }
    
    // Filtrar por fecha
    if (startDate) {
      query = query.where("generatedAt", ">=", new Date(startDate));
    }
    
    if (endDate) {
      query = query.where("generatedAt", "<=", new Date(endDate));
    }
    
    // Ordenar y limitar
    query = query.orderBy("generatedAt", "desc").limit(limit);
    
    const snapshot = await query.get();
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        splitName: data.splitName,
        splitIndex: data.splitIndex,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate()
      });
    });
    
    res.json({
      success: true,
      searchCriteria: {
        splitNames,
        participantIds,
        startDate,
        endDate,
        limit
      },
      totalResults: clips.length,
      clips: clips
    });
    
  } catch (error) {
    console.error("Error en búsqueda de clips:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}

// ========================================
// 📈 EJEMPLO 5: TIEMPO REAL
// ========================================

/**
 * GET /api/races/{raceId}/events/{eventId}/splits/{splitName}/clips/recent
 * Obtener clips recientes de un split (últimos 5 minutos)
 */
async function getRecentSplitClips(req, res) {
  const { raceId, eventId, splitName } = req.params;
  const { appId } = req.query;
  
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
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
      .where("splitName", "==", splitName)
      .where("generatedAt", ">=", fiveMinutesAgo)
      .orderBy("generatedAt", "desc")
      .get();
    
    const clips = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      clips.push({
        id: doc.id,
        clipUrl: data.clipUrl,
        participantId: data.participantId,
        timestamp: data.timestamp,
        generatedAt: data.generatedAt?.toDate(),
        isRecent: true
      });
    });
    
    res.json({
      success: true,
      splitName: splitName,
      timeWindow: "últimos 5 minutos",
      recentClips: clips.length,
      clips: clips
    });
    
  } catch (error) {
    console.error("Error obteniendo clips recientes:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
}
