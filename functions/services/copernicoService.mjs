// copernicoService.mjs
import fetch from 'node-fetch';
import copernicoConfig from '../config/copernicoConfig.mjs';

class CopernicoService {
  constructor() {
    this.config = copernicoConfig;
    this.cache = new Map(); // Cache simple en memoria
  }

  /**
   * Obtener configuración del entorno actual
   */
  getCurrentEnvironmentConfig() {
    return this.config.getCurrentEnvironmentConfig();
  }

  /**
   * Obtener datos de participante desde la API de Copernico
   */
  async getParticipantData(raceId, participantId) {
    try {
      // Verificar cache primero
      const cacheKey = `${raceId}_${participantId}`;
      if (this.config.get('cache.enableCache') && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        const now = Date.now();
        const ttlMs = this.config.get('cache.participantTtlMinutes') * 60 * 1000;
        
        if (now - cached.timestamp < ttlMs) {
          console.log(`📋 [CopernicoService] Datos obtenidos del cache para ${participantId}`);
          return cached.data;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      const url = this.config.getApiUrl(raceId, participantId);
      const headers = this.config.getRequestHeaders();
      const timeoutMs = this.config.get('request.timeoutMs');

      console.log(`🌐 [CopernicoService] Obteniendo datos de: ${url}`);

      if (this.config.get('logging.logRequests')) {
        console.log(`📤 [CopernicoService] Request headers:`, headers);
      }

      // Realizar request con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (this.config.get('logging.logResponses')) {
        console.log(`📥 [CopernicoService] Response:`, JSON.stringify(data, null, 2));
      }

      // Validar estructura de respuesta
      if (!data.result) {
        throw new Error('Estructura de respuesta inválida de Copernico API');
      }

      // Códigos de éxito: 0 (success) y 1 (success con datos)
      if (data.result.code !== 0 && data.result.code !== 1) {
        throw new Error(`Error de Copernico API: ${data.result.message || 'Error desconocido'}`);
      }

      // Verificar que hay datos cuando el código es 1
      if (data.result.code === 1 && (!data.data || Object.keys(data.data).length === 0)) {
        throw new Error('No hay datos disponibles para este participante');
      }

      // Guardar en cache
      if (this.config.get('cache.enableCache')) {
        this.cache.set(cacheKey, {
          data: data.data,
          timestamp: Date.now()
        });
      }

      console.log(`✅ [CopernicoService] Datos obtenidos exitosamente para ${participantId}`);
      return data.data;

    } catch (error) {
      console.error(`❌ [CopernicoService] Error obteniendo datos de ${participantId}:`, error.message);
      
      // Si es un error de timeout, intentar retry
      if (error.name === 'AbortError') {
        const retryAttempts = this.config.get('request.retryAttempts');
        if (retryAttempts > 0) {
          console.log(`🔄 [CopernicoService] Reintentando... (${retryAttempts} intentos restantes)`);
          await this.delay(this.config.get('request.retryDelayMs'));
          return this.getParticipantDataWithRetry(raceId, participantId, retryAttempts - 1);
        }
      }

      throw error;
    }
  }

  /**
   * Método auxiliar para reintentos
   */
  async getParticipantDataWithRetry(raceId, participantId, attemptsLeft) {
    if (attemptsLeft <= 0) {
      throw new Error('Se agotaron los intentos de retry');
    }

    try {
      return await this.getParticipantData(raceId, participantId);
    } catch (error) {
      if (attemptsLeft > 1) {
        console.log(`🔄 [CopernicoService] Reintentando... (${attemptsLeft - 1} intentos restantes)`);
        await this.delay(this.config.get('request.retryDelayMs'));
        return this.getParticipantDataWithRetry(raceId, participantId, attemptsLeft - 1);
      }
      throw error;
    }
  }

  /**
   * Transformar datos de Copernico al formato interno
   */
  transformCopernicoData(copernicoData) {
    // Obtener datos del primer evento (normalmente solo hay uno)
    const eventData = copernicoData.events && copernicoData.events.length > 0 ? copernicoData.events[0] : {};

    const participant = {
      // Datos básicos del participante
      externalId: copernicoData.id,
      name: copernicoData.name,
      lastName: copernicoData.surname,
      fullName: `${copernicoData.name} ${copernicoData.surname}`,
      gender: copernicoData.gender,
      birthdate: copernicoData.birthdate,

      // Country/Nationality - usar el campo más completo disponible
      country: copernicoData.nationality || copernicoData.PAÍS || copernicoData['PAIS NOMBRE'] || 'Unknown',
      nationality: copernicoData.nationality,

      // Datos del evento (desde events[0])
      eventId: eventData.event,
      dorsal: eventData.dorsal,
      category: eventData.category,
      team: eventData.team || '',
      club: copernicoData.club || '',
      featured: copernicoData.featured || false,

      // Estado del participante (desde events[0])
      status: eventData.status,
      realStatus: eventData.realStatus,

      // Datos adicionales
      attributes: eventData.attributes || {},
      chip: eventData.chip || [],
      locations: copernicoData.locations || [],

      // Tiempos y estadísticas (desde events[0])
      startRawTime: eventData.startRawTime,
      startNetTime: eventData.startNetTime,
      splitsMissing: eventData.splitsMissing,
      maxConsecutiveSplitsMissing: eventData.maxConsecutiveSplitsMissing,
      splitsSeen: eventData.splitsSeen,
      lastSplitSeen: eventData.last_split_seen,

      // Metadatos
      updatedAt: new Date().toISOString(),
      source: 'copernico_api'
    };

    // Filtrar campos undefined para evitar errores de Firestore
    const cleanParticipant = this.removeUndefinedFields(participant);

    // Transformar times y rankings si existen (desde events[0])
    const times = this.transformTimes(eventData.times || {});
    const rankings = this.transformRankings(eventData.rankings || {});

    return {
      participant: cleanParticipant,
      times,
      rankings,
      rawData: copernicoData // Mantener datos originales para referencia
    };
  }

  /**
   * Transformar datos de times - PRESERVANDO ESTRUCTURA COMPLETA
   */
  transformTimes(copernicoTimes) {
    const times = {};

    for (const [pointName, timeData] of Object.entries(copernicoTimes)) {
      // ✅ FILTRAR valores undefined para evitar errores de Firestore
      const timeEntry = {
        split: timeData.split,
        order: timeData.order,
        distance: timeData.distance,
        time: timeData.time,
        netTime: timeData.netTime,
        average: timeData.average,
        averageNet: timeData.averageNet,
        // ✅ MODIFICADO: Preservar estructura completa de raw
        raw: {
          created: timeData.raw?.created,
          time: timeData.raw?.time,
          chip: timeData.raw?.chip,
          location: timeData.raw?.location,
          device: timeData.raw?.device,           // ← CRUCIAL para streamId
          rewind: timeData.raw?.rewind,
          rewindId: timeData.raw?.rewindId,
          import: timeData.raw?.import,
          importId: timeData.raw?.importId,
          valid: timeData.raw?.valid,
          offset: timeData.raw?.offset,
          originalTime: timeData.raw?.originalTime, // ← CRUCIAL para timing
          rawTime: timeData.raw?.rawTime,          // ← CRUCIAL para timing
          times: timeData.raw?.times || {}         // ← Tiempos calculados
        }
      };

      // Filtrar undefined values recursivamente
      times[pointName] = this.removeUndefinedFields(timeEntry);
    }

    return times;
  }

  /**
   * Transformar datos de rankings - PRESERVANDO ESTRUCTURA COMPLETA
   */
  transformRankings(copernicoRankings) {
    const rankings = {};

    for (const [splitName, rankingData] of Object.entries(copernicoRankings)) {
      // ✅ FILTRAR valores undefined para evitar errores de Firestore
      const rankingEntry = {
        id: rankingData.id,
        time: rankingData.time,
        net: rankingData.net,
        average: rankingData.average,
        averageNet: rankingData.averageNet,
        location: rankingData.location,
        rawTime: rankingData.rawTime,           // ← CRUCIAL para timing
        new: rankingData.new,
        // ✅ MODIFICADO: Preservar TODAS las posiciones
        pos: rankingData.pos,                   // ← Posición general
        posGen: rankingData.posGen,             // ← Posición por género
        posCat: rankingData.posCat,             // ← Posición por categoría
        posNet: rankingData.posNet,             // ← Posición general neta
        posGenNet: rankingData.posGenNet,       // ← Posición género neta
        posCatNet: rankingData.posCatNet,       // ← Posición categoría neta
        // Mantener estructura anidada para compatibilidad
        positions: {
          overall: rankingData.pos,
          gender: rankingData.posGen,
          category: rankingData.posCat,
          overallNet: rankingData.posNet,
          genderNet: rankingData.posGenNet,
          categoryNet: rankingData.posCatNet
        }
      };

      // Filtrar undefined values recursivamente
      rankings[splitName] = this.removeUndefinedFields(rankingEntry);
    }

    return rankings;
  }

  /**
   * Delay helper para reintentos
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpiar cache manualmente
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 [CopernicoService] Cache limpiado');
  }

  /**
   * Remover campos undefined para evitar errores de Firestore - RECURSIVO
   */
  removeUndefinedFields(obj) {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedFields(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          if (typeof value === 'object' && value !== null) {
            const cleanedValue = this.removeUndefinedFields(value);
            if (cleanedValue !== null && (Array.isArray(cleanedValue) || Object.keys(cleanedValue).length > 0)) {
              cleaned[key] = cleanedValue;
            }
          } else {
            cleaned[key] = value;
          }
        }
      }
      return cleaned;
    }

    return obj;
  }
}

// Exportar instancia singleton
const copernicoService = new CopernicoService();
export default copernicoService;
