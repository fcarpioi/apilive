/**
 * Script para agregar el campo 'type' a todas las stories existentes en Firestore
 * 
 * PROBLEMA: Las stories existentes no tienen el campo 'type', causando inconsistencias
 * SOLUCIÓN: Agregar el campo 'type' con valor por defecto basado en el contexto
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

// Función para determinar el tipo basado en el contexto de la story
function determineStoryType(storyData) {
  // 1. Si tiene splitTime o split_time, probablemente es un checkpoint
  if (storyData.splitTime || storyData.split_time) {
    const splitData = storyData.splitTime || storyData.split_time;
    
    // Si el split es "START" o similar, es inicio
    if (splitData.split && splitData.split.toLowerCase().includes('start')) {
      return 'ATHLETE_STARTED';
    }

    // Si el split es "FINISH", "META" o similar, es final
    if (splitData.split && (
      splitData.split.toLowerCase().includes('finish') ||
      splitData.split.toLowerCase().includes('meta') ||
      splitData.split.toLowerCase().includes('end')
    )) {
      return 'ATHLETE_FINISHED';
    }

    // Cualquier otro split es un checkpoint intermedio
    return 'ATHLETE_CROSSED_TIMING_SPLIT';
  }
  
  // 2. Si el originType es sponsor, es contenido de sponsor
  if (storyData.originType === 'sponsor') {
    return 'SPONSOR';
  }
  
  // 3. Si la descripción menciona "award" o "premio", es ceremonia
  if (storyData.description && (
    storyData.description.toLowerCase().includes('award') ||
    storyData.description.toLowerCase().includes('premio') ||
    storyData.description.toLowerCase().includes('ceremonia')
  )) {
    return 'COMPLETE_AWARD';
  }
  
  // 4. Por defecto, asumir que es inicio
  return 'ATHLETE_STARTED';
}

async function addTypeFieldToStories() {
  console.log('🚀 Iniciando proceso para agregar campo "type" a stories...');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const batchSize = 500; // Firestore batch limit
  
  try {
    // Obtener todas las stories usando Collection Group
    console.log('📊 Obteniendo todas las stories...');
    const storiesSnapshot = await db.collectionGroup('stories').get();
    
    console.log(`📈 Total de stories encontradas: ${storiesSnapshot.size}`);
    
    // Procesar en lotes
    const storyDocs = storiesSnapshot.docs;
    
    for (let i = 0; i < storyDocs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = storyDocs.slice(i, i + batchSize);
      let batchUpdates = 0;
      
      console.log(`\n🔄 Procesando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(storyDocs.length / batchSize)}`);
      console.log(`   Documentos en este lote: ${batchDocs.length}`);
      
      for (const storyDoc of batchDocs) {
        const storyData = storyDoc.data();
        totalProcessed++;
        
        // Verificar si ya tiene el campo type
        if (!storyData.type) {
          // Determinar el tipo basado en el contexto
          const storyType = determineStoryType(storyData);
          
          // Agregar el campo type
          batch.update(storyDoc.ref, {
            type: storyType,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          batchUpdates++;
          totalUpdated++;
          
          if (totalUpdated % 100 === 0) {
            console.log(`   ✅ Procesadas ${totalUpdated} stories...`);
          }
        } else {
          totalSkipped++;
        }
      }
      
      // Ejecutar el batch si hay actualizaciones
      if (batchUpdates > 0) {
        await batch.commit();
        console.log(`   💾 Lote guardado: ${batchUpdates} actualizaciones`);
      } else {
        console.log(`   ⏭️ Lote omitido: todas las stories ya tienen campo type`);
      }
      
      // Pausa pequeña para no sobrecargar Firestore
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n🎉 ¡Proceso completado exitosamente!');
    console.log(`📊 Resumen:`);
    console.log(`   Total procesadas: ${totalProcessed}`);
    console.log(`   Total actualizadas: ${totalUpdated}`);
    console.log(`   Total omitidas (ya tenían type): ${totalSkipped}`);
    
  } catch (error) {
    console.error('❌ Error durante el proceso:', error);
    throw error;
  }
}

// Ejecutar el script
if (require.main === module) {
  addTypeFieldToStories()
    .then(() => {
      console.log('✅ Script completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en el script:', error);
      process.exit(1);
    });
}

module.exports = { addTypeFieldToStories, determineStoryType };
