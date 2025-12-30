#!/usr/bin/env node

/**
 * Script para probar el API de búsqueda y verificar que devuelve el campo lastName
 */

const testSearchAPI = async () => {
  console.log("🔍 PROBANDO API DE BÚSQUEDA - CAMPO LASTNAME");
  console.log("=" * 60);

  const baseUrl = "https://liveapigateway-3rt3xwiooa-uc.a.run.app";
  const searchParams = {
    raceId: "race-001-madrid-marathon",
    appId: "RtME2RACih6YxgrlmuQR", 
    eventId: "event-0",
    query: "Juan", // Buscar por nombre
    limit: 5
  };

  const url = `${baseUrl}/api/search/participants?${new URLSearchParams(searchParams)}`;
  
  console.log(`🌐 URL: ${url}`);
  console.log(`📋 Parámetros:`, searchParams);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test-LastName-Field/1.0'
      },
      timeout: 15000
    });

    console.log(`\n📡 Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      
      console.log(`\n✅ RESPUESTA EXITOSA:`);
      console.log(`   Total participantes: ${data.total}`);
      console.log(`   Query: "${data.query}"`);
      console.log(`   Método: ${data.searchMethod}`);

      if (data.participants && data.participants.length > 0) {
        console.log(`\n👥 PARTICIPANTES ENCONTRADOS (${data.participants.length}):`);
        
        data.participants.forEach((participant, index) => {
          console.log(`\n   ${index + 1}. ${participant.fullName || participant.name}`);
          console.log(`      ID: ${participant.id}`);
          console.log(`      name: "${participant.name || 'N/A'}"`);
          console.log(`      lastName: "${participant.lastName || 'N/A'}" ✅`); // Campo que queremos verificar
          console.log(`      fullName: "${participant.fullName || 'N/A'}"`);
          console.log(`      dorsal: ${participant.dorsal || 'N/A'}`);
          console.log(`      category: ${participant.category || 'N/A'}`);
          console.log(`      team: ${participant.team || 'N/A'}`);
          console.log(`      status: ${participant.status || 'N/A'}`);
        });

        // Verificar que el campo lastName está presente
        const hasLastName = data.participants.some(p => p.hasOwnProperty('lastName'));
        console.log(`\n🎯 VERIFICACIÓN CAMPO LASTNAME:`);
        console.log(`   ✅ Campo 'lastName' presente: ${hasLastName ? 'SÍ' : 'NO'}`);
        
        if (hasLastName) {
          const withLastName = data.participants.filter(p => p.lastName && p.lastName !== 'N/A').length;
          console.log(`   📊 Participantes con lastName: ${withLastName}/${data.participants.length}`);
        }

      } else {
        console.log(`\n⚠️ No se encontraron participantes`);
      }

    } else {
      const errorText = await response.text();
      console.log(`\n❌ ERROR EN LA RESPUESTA:`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${errorText}`);
    }

  } catch (error) {
    console.error(`\n💥 ERROR EN LA PETICIÓN:`, error.message);
  }
};

// Ejecutar el test
testSearchAPI().catch(console.error);
