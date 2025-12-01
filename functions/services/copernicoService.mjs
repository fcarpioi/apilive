// copernicoService.mjs
import fetch from 'node-fetch';
import copernicoConfig from '../config/copernicoConfig.mjs';

class CopernicoService {
  constructor() {
    this.config = copernicoConfig;
    this.cache = new Map(); // Cache simple en memoria
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
      if (!data.result || !data.data) {
        throw new Error('Estructura de respuesta inválida de Copernico API');
      }

      if (data.result.code !== 0) {
        throw new Error(`Error de Copernico API: ${data.result.message}`);
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
    const participant = {
      // Datos básicos del participante
      externalId: copernicoData.id,
      name: copernicoData.name,
      lastName: copernicoData.surname,
      fullName: `${copernicoData.name} ${copernicoData.surname}`,
      birthdate: copernicoData.birthdate,
      gender: copernicoData.gender,
      
      // Datos del evento
      eventId: copernicoData.event,
      dorsal: copernicoData.dorsal,
      category: copernicoData.category,
      wave: copernicoData.wave,
      team: copernicoData.team,
      club: copernicoData.club,
      featured: copernicoData.featured || false,
      
      // Estado del participante
      status: copernicoData.status,
      realStatus: copernicoData.realStatus,
      
      // Datos adicionales
      attributes: copernicoData.attributes || {},
      chip: copernicoData.chip || [],
      locations: copernicoData.locations || [],
      
      // Tiempos y estadísticas
      startRawTime: copernicoData.startRawTime,
      startNetTime: copernicoData.startNetTime,
      splitsMissing: copernicoData.splitsMissing,
      maxConsecutiveSplitsMissing: copernicoData.maxConsecutiveSplitsMissing,
      splitsSeen: copernicoData.splitsSeen,
      lastSplitSeen: copernicoData.last_split_seen,
      
      // Metadatos
      updatedAt: new Date().toISOString(),
      source: 'copernico_api'
    };

    // Transformar times y rankings si existen
    const times = this.transformTimes(copernicoData.times || {});
    const rankings = this.transformRankings(copernicoData.rankings || {});

    return {
      participant,
      times,
      rankings,
      rawData: copernicoData // Mantener datos originales para referencia
    };
  }

  /**
   * Transformar datos de times
   */
  transformTimes(copernicoTimes) {
    const times = {};
    
    for (const [pointName, timeData] of Object.entries(copernicoTimes)) {
      times[pointName] = {
        split: timeData.split,
        order: timeData.order,
        distance: timeData.distance,
        time: timeData.time,
        netTime: timeData.netTime,
        average: timeData.average,
        averageNet: timeData.averageNet,
        raw: timeData.raw || {}
      };
    }
    
    return times;
  }

  /**
   * Transformar datos de rankings
   */
  transformRankings(copernicoRankings) {
    const rankings = {};
    
    for (const [splitName, rankingData] of Object.entries(copernicoRankings)) {
      rankings[splitName] = {
        id: rankingData.id,
        time: rankingData.time,
        net: rankingData.net,
        average: rankingData.average,
        averageNet: rankingData.averageNet,
        location: rankingData.location,
        rawTime: rankingData.rawTime,
        new: rankingData.new,
        positions: {
          overall: rankingData.pos,
          gender: rankingData.posGen,
          category: rankingData.posCat,
          overallNet: rankingData.posNet,
          genderNet: rankingData.posGenNet,
          categoryNet: rankingData.posCatNet
        }
      };
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
}

// Exportar instancia singleton
const copernicoService = new CopernicoService();
export default copernicoService;
