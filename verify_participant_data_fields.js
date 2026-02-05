#!/usr/bin/env node

/**
 * Script para verificar específicamente los campos country y category del participante
 */

const PRODUCTION_CONFIG = {
  baseUrl: 'https://api.copernico.cloud/api/races',
  apiKey: 'MISSING_COPERNICO_API_KEY',
  raceId: 'generali-maraton-malaga-2025',
  participantId: '64D271D9'
};

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': PRODUCTION_CONFIG.apiKey,
  'User-Agent': 'LiveCopernico-API/1.0',
  'Accept': 'application/json'
};

async function verifyParticipantFields() {
  console.log("🔍 VERIFICANDO CAMPOS COUNTRY Y CATEGORY");
  console.log("=" * 60);
  console.log(`👤 Participante: ${PRODUCTION_CONFIG.participantId}`);
  console.log(`🏁 Carrera: ${PRODUCTION_CONFIG.raceId}`);
  
  try {
    const url = `${PRODUCTION_CONFIG.baseUrl}/${PRODUCTION_CONFIG.raceId}/athlete/${PRODUCTION_CONFIG.participantId}`;
    console.log(`🌐 URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const participant = data.data;
    
    console.log("\n📋 ANÁLISIS DE CAMPOS REQUERIDOS:");
    console.log("=" * 60);
    
    // Verificar country/nationality
    console.log("🌍 COUNTRY/NATIONALITY:");
    console.log(`   nationality: "${participant.nationality || 'N/A'}"`);
    console.log(`   PAÍS: "${participant.PAÍS || 'N/A'}"`);
    console.log(`   PAIS NOMBRE: "${participant['PAIS NOMBRE'] || 'N/A'}"`);
    console.log(`   country: "${participant.country || 'N/A'}"`);
    
    // Verificar category
    console.log("\n🏷️ CATEGORY:");
    if (participant.events && participant.events.length > 0) {
      const event = participant.events[0];
      console.log(`   event.category: "${event.category || 'N/A'}"`);
      console.log(`   event.attributes: ${JSON.stringify(event.attributes || {}, null, 2)}`);
    } else {
      console.log("   ❌ No hay eventos disponibles");
    }
    
    // Verificar otros campos importantes
    console.log("\n📊 OTROS CAMPOS IMPORTANTES:");
    console.log(`   name: "${participant.name || 'N/A'}"`);
    console.log(`   surname: "${participant.surname || 'N/A'}"`);
    console.log(`   gender: "${participant.gender || 'N/A'}"`);
    console.log(`   birthdate: "${participant.birthdate || 'N/A'}"`);
    console.log(`   club: "${participant.club || 'N/A'}"`);
    
    if (participant.events && participant.events.length > 0) {
      const event = participant.events[0];
      console.log(`   dorsal: "${event.dorsal || 'N/A'}"`);
      console.log(`   team: "${event.team || 'N/A'}"`);
      console.log(`   status: "${event.status || 'N/A'}"`);
      console.log(`   realStatus: "${event.realStatus || 'N/A'}"`);
    }
    
    // Mapeo sugerido para el sistema
    console.log("\n🔧 MAPEO SUGERIDO PARA EL SISTEMA:");
    console.log("=" * 60);
    
    const mappedData = {
      // Datos básicos
      externalId: participant.id,
      name: participant.name,
      lastName: participant.surname,
      fullName: `${participant.name} ${participant.surname}`,
      gender: participant.gender,
      birthdate: participant.birthdate,
      
      // Country - usar el campo más completo disponible
      country: participant.nationality || participant.PAÍS || participant['PAIS NOMBRE'] || 'Unknown',
      nationality: participant.nationality,
      
      // Category - del evento
      category: participant.events?.[0]?.category || 'Unknown',
      
      // Datos del evento
      eventId: participant.events?.[0]?.event,
      dorsal: participant.events?.[0]?.dorsal,
      team: participant.events?.[0]?.team || '',
      club: participant.club || '',
      
      // Estado
      status: participant.events?.[0]?.status,
      realStatus: participant.events?.[0]?.realStatus,
      
      // Metadatos
      updatedAt: new Date().toISOString(),
      source: 'copernico_api'
    };
    
    console.log("📋 Datos mapeados:");
    console.log(JSON.stringify(mappedData, null, 2));
    
    // Verificar si faltan campos críticos
    console.log("\n⚠️ VERIFICACIÓN DE CAMPOS CRÍTICOS:");
    const missingFields = [];
    
    if (!mappedData.country || mappedData.country === 'Unknown') {
      missingFields.push('country');
    }
    
    if (!mappedData.category || mappedData.category === 'Unknown') {
      missingFields.push('category');
    }
    
    if (!mappedData.name) {
      missingFields.push('name');
    }
    
    if (!mappedData.lastName) {
      missingFields.push('lastName');
    }
    
    if (missingFields.length > 0) {
      console.log(`❌ Campos faltantes: ${missingFields.join(', ')}`);
      
      console.log("\n💡 SOLUCIONES SUGERIDAS:");
      if (missingFields.includes('country')) {
        console.log("   🌍 Country: Usar 'ESP' como default o mapear desde nationality");
      }
      if (missingFields.includes('category')) {
        console.log("   🏷️ Category: Verificar estructura de eventos en Copernico");
      }
    } else {
      console.log("✅ Todos los campos críticos están disponibles");
    }
    
    // Mostrar estructura completa para debugging
    console.log("\n📄 ESTRUCTURA COMPLETA DEL PARTICIPANTE:");
    console.log("=" * 60);
    console.log(JSON.stringify(participant, null, 2));
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Ejecutar
verifyParticipantFields().catch(console.error);
