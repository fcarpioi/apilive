const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

async function analyzeStoryTypes() {
  try {
    console.log("🔍 Analizando tipos de stories en la base de datos...");
    
    const db = admin.firestore();
    const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
    const appId = "Ryx7YFWobBfGTJqkciCV";
    const eventId = "Maratón";
    
    console.log(`📊 Consultando: races/${raceId}/apps/${appId}/events/${eventId}/participants`);
    
    // Obtener todos los participantes
    const participantsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants').get();
    
    console.log(`👥 Participantes encontrados: ${participantsSnapshot.size}`);
    
    const typeCount = {};
    let totalStories = 0;
    let participantsWithStories = 0;
    
    // Analizar stories de cada participante
    for (const participantDoc of participantsSnapshot.docs) {
      const participantId = participantDoc.id;
      const participantData = participantDoc.data();
      
      // Obtener stories del participante
      const storiesSnapshot = await db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants').doc(participantId)
        .collection('stories').get();
      
      if (storiesSnapshot.size > 0) {
        participantsWithStories++;
        console.log(`📝 ${participantData.fullName || participantData.name} (${participantId}): ${storiesSnapshot.size} stories`);
        
        storiesSnapshot.docs.forEach(storyDoc => {
          const storyData = storyDoc.data();
          const type = storyData.type || 'SIN_TIPO';
          
          typeCount[type] = (typeCount[type] || 0) + 1;
          totalStories++;
          
          console.log(`   - ${storyDoc.id}: type="${type}", description="${storyData.description || 'Sin descripción'}"`);
        });
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMEN DE ANÁLISIS:");
    console.log("=".repeat(60));
    console.log(`👥 Total participantes: ${participantsSnapshot.size}`);
    console.log(`📝 Participantes con stories: ${participantsWithStories}`);
    console.log(`📚 Total stories: ${totalStories}`);
    console.log("\n🏷️ TIPOS DE STORIES ENCONTRADOS:");
    
    Object.entries(typeCount)
      .sort(([,a], [,b]) => b - a)
      .forEach(([type, count]) => {
        const percentage = ((count / totalStories) * 100).toFixed(1);
        console.log(`   ${type}: ${count} stories (${percentage}%)`);
      });
    
    console.log("\n🎯 DIAGNÓSTICO:");
    if (typeCount['ATHLETE_FINISHED']) {
      console.log(`✅ Hay ${typeCount['ATHLETE_FINISHED']} stories de tipo ATHLETE_FINISHED`);
    } else {
      console.log(`❌ NO hay stories de tipo ATHLETE_FINISHED`);
      console.log(`💡 Tipos disponibles: ${Object.keys(typeCount).join(', ')}`);
    }
    
  } catch (error) {
    console.error("❌ Error analizando stories:", error);
  }
}

analyzeStoryTypes();
