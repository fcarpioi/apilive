/**
 * Script para debuggear la búsqueda de eventos específicos
 */

const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

const db = admin.firestore();

async function debugEventSearch() {
  try {
    console.log("🔍 Debuggeando búsqueda de eventos...");
    
    const competitionId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
    const eventName = "Media";
    
    console.log(`📊 Buscando evento "${eventName}" en competitionId: ${competitionId}`);
    
    // Obtener todas las races
    const racesSnapshot = await db.collection('races').get();
    console.log(`📋 Total races encontradas: ${racesSnapshot.size}`);
    
    for (const raceDoc of racesSnapshot.docs) {
      const raceId = raceDoc.id;
      const raceData = raceDoc.data();
      
      console.log(`\n🏁 Revisando race: ${raceId}`);
      console.log(`   - name: ${raceData.name || 'Sin nombre'}`);
      console.log(`   - competitionId match: ${raceId === competitionId}`);
      
      if (raceId === competitionId) {
        console.log(`✅ RACE ENCONTRADA: ${raceId}`);
        
        // Obtener todas las apps en esta race
        const appsSnapshot = await db.collection('races').doc(raceId).collection('apps').get();
        console.log(`   📱 Apps encontradas: ${appsSnapshot.size}`);
        
        for (const appDoc of appsSnapshot.docs) {
          const appId = appDoc.id;
          const appData = appDoc.data();
          
          console.log(`\n   📱 App: ${appId}`);
          console.log(`      - name: ${appData.name || 'Sin nombre'}`);
          
          // Obtener todos los eventos en esta app
          const eventsSnapshot = await db.collection('races').doc(raceId)
            .collection('apps').doc(appId)
            .collection('events').get();
          
          console.log(`      🎯 Eventos encontrados: ${eventsSnapshot.size}`);
          
          for (const eventDoc of eventsSnapshot.docs) {
            const eventId = eventDoc.id;
            const eventData = eventDoc.data();
            
            console.log(`\n      🎯 Evento: ${eventId}`);
            console.log(`         - name: ${eventData.name || 'Sin nombre'}`);
            console.log(`         - eventName: ${eventData.eventName || 'Sin eventName'}`);
            console.log(`         - competitionId: ${eventData.competitionId || 'Sin competitionId'}`);
            console.log(`         - raceId: ${eventData.raceId || 'Sin raceId'}`);
            console.log(`         - externalId: ${eventData.externalId || 'Sin externalId'}`);
            
            // Verificar coincidencias
            const belongsToCompetition =
              eventId === competitionId ||
              eventData.competitionId === competitionId ||
              eventData.raceId === competitionId ||
              eventData.externalId === competitionId ||
              raceId === competitionId;
            
            const eventNameMatches =
              eventId === eventName ||
              eventData.name === eventName ||
              eventData.eventName === eventName;
            
            console.log(`         - belongsToCompetition: ${belongsToCompetition}`);
            console.log(`         - eventNameMatches: ${eventNameMatches}`);
            
            if (belongsToCompetition && eventNameMatches) {
              console.log(`         ✅ EVENTO ENCONTRADO: ${raceId}/${appId}/${eventId}`);
              
              // Verificar si tiene participantes
              const participantsSnapshot = await db.collection('races').doc(raceId)
                .collection('apps').doc(appId)
                .collection('events').doc(eventId)
                .collection('participants').limit(5).get();
              
              console.log(`         👥 Participantes: ${participantsSnapshot.size}`);
              
              if (!participantsSnapshot.empty) {
                console.log(`         📋 Primeros participantes:`);
                participantsSnapshot.docs.forEach((doc, index) => {
                  const data = doc.data();
                  console.log(`            ${index + 1}. ${doc.id} - ${data.name || 'Sin nombre'} (${data.dorsal || 'Sin dorsal'})`);
                });
              }
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Ejecutar debug
debugEventSearch();
