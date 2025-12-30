const admin = require('firebase-admin');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'live-copernico'
  });
}

function determineTypeFromDescription(description) {
  if (!description) return 'ATHLETE_STARTED';
  
  const desc = description.toLowerCase();
  
  // Detectar finalizaciones
  if (desc.includes('cruzó la meta') || desc.includes('meta!') || desc.includes('finish')) {
    return 'ATHLETE_FINISHED';
  }
  
  // Detectar inicios
  if (desc.includes('inicia') || desc.includes('comenzó') || desc.includes('start')) {
    return 'ATHLETE_STARTED';
  }
  
  // Detectar checkpoints intermedios
  if (desc.includes('pasó por') || desc.includes('checkpoint') || desc.includes('5k') || desc.includes('10k') || desc.includes('15k') || desc.includes('25k') || desc.includes('35k')) {
    return 'ATHLETE_CROSSED_TIMING_SPLIT';
  }
  
  // Por defecto
  return 'ATHLETE_STARTED';
}

async function fixStoryTypes() {
  try {
    console.log("🔧 Corrigiendo tipos de stories...");
    
    const db = admin.firestore();
    const raceId = "69200553-464c-4bfd-9b35-4ca6ac1f17f5";
    const appId = "Ryx7YFWobBfGTJqkciCV";
    const eventId = "Maratón";
    
    // Obtener todos los participantes
    const participantsSnapshot = await db.collection('races').doc(raceId)
      .collection('apps').doc(appId)
      .collection('events').doc(eventId)
      .collection('participants').get();
    
    console.log(`👥 Procesando ${participantsSnapshot.size} participantes...`);
    
    let totalUpdated = 0;
    const typeCount = {};
    
    // Procesar cada participante
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
        console.log(`\n📝 ${participantData.fullName || participantData.name} (${storiesSnapshot.size} stories):`);
        
        for (const storyDoc of storiesSnapshot.docs) {
          const storyData = storyDoc.data();
          const currentType = storyData.type;
          const description = storyData.description || '';
          
          // Determinar el tipo correcto
          const correctType = determineTypeFromDescription(description);
          
          // Solo actualizar si es necesario
          if (currentType !== correctType) {
            await storyDoc.ref.update({
              type: correctType,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`   ✅ ${storyDoc.id}: "${currentType}" → "${correctType}" | "${description}"`);
            totalUpdated++;
          } else {
            console.log(`   ⏭️ ${storyDoc.id}: Ya tiene tipo "${correctType}" | "${description}"`);
          }
          
          // Contar tipos
          typeCount[correctType] = (typeCount[correctType] || 0) + 1;
        }
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ CORRECCIÓN COMPLETADA:");
    console.log("=".repeat(60));
    console.log(`🔄 Stories actualizadas: ${totalUpdated}`);
    console.log("\n🏷️ DISTRIBUCIÓN FINAL DE TIPOS:");
    
    Object.entries(typeCount)
      .sort(([,a], [,b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count} stories`);
      });
    
  } catch (error) {
    console.error("❌ Error corrigiendo stories:", error);
  }
}

fixStoryTypes();
