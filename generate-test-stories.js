// Script para generar datos de prueba para stories
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Inicializar Firebase Admin
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'live-copernico',
  storageBucket: 'live-copernico'
});

const firestore = admin.firestore();

// Configuración de datos de prueba
const eventId = '683d4f02-990c-44a5-92c5-1718ac1f05f0';
const participantId = '72f4ebec-e9a0-51aa-b2f1-acbc4957af50';

// URLs de videos reales para pruebas (videos de dominio público)
const testVideoUrls = [
    'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',
    'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4',
    'https://file-examples.com/storage/fe86c86b8b66f447a9c78c7/2017/10/file_example_MP4_480_1_5MG.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4'
];

// Descripciones variadas para las stories
const descriptions = [
    'Generado automáticamente para pruebas - Paisaje montañoso',
    'Generado automáticamente para pruebas - Corredor en acción',
    'Generado automáticamente para pruebas - Vista panorámica',
    'Generado automáticamente para pruebas - Momento destacado',
    'Generado automáticamente para pruebas - Naturaleza en movimiento',
    'Generado automáticamente para pruebas - Aventura deportiva',
    'Generado automáticamente para pruebas - Escena dinámica',
    'Generado automáticamente para pruebas - Captura especial',
    'Generado automáticamente para pruebas - Momento único',
    'Generado automáticamente para pruebas - Experiencia visual'
];

async function generateTestStories() {
    console.log('🎬 Generando datos de prueba para stories...');
    console.log(`📍 EventId: ${eventId}`);
    console.log(`👤 ParticipantId: ${participantId}`);
    console.log('');

    try {
        const stories = [];
        
        for (let i = 0; i < 10; i++) {
            const storyId = uuidv4();
            const fileName = `${storyId}.mp4`;
            const filePath = `stories/${eventId}/${participantId}/${fileName}`;
            const fileUrl = `https://storage.googleapis.com/live-copernico/${filePath}`;
            
            // Crear fechas variadas (últimos 30 días)
            const daysAgo = Math.floor(Math.random() * 30);
            const hoursAgo = Math.floor(Math.random() * 24);
            const minutesAgo = Math.floor(Math.random() * 60);
            
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            date.setHours(date.getHours() - hoursAgo);
            date.setMinutes(date.getMinutes() - minutesAgo);
            
            const createdAt = new Date(date.getTime() + (Math.random() * 3600000)); // Hasta 1 hora después
            
            const storyData = {
                raceId: raceId, // ✅ AGREGADO: raceId requerido
                eventId: eventId,
                participantId: participantId,
                fileName: fileName,
                filePath: filePath,
                fileUrl: fileUrl,
                description: descriptions[i],
                moderationStatus: 'approved',
                originType: 'automatic_global',
                date: admin.firestore.Timestamp.fromDate(date),
                createdAt: admin.firestore.Timestamp.fromDate(createdAt),
                // Campos adicionales que podrían ser útiles
                contentType: 'video/mp4',
                mediaType: 'video',
                sourceUrl: testVideoUrls[i], // URL original del video de prueba
                fileSize: Math.floor(Math.random() * 5000000) + 1000000, // Entre 1MB y 6MB
                duration: Math.floor(Math.random() * 120) + 10, // Entre 10 y 130 segundos
                testData: true, // Marcar como datos de prueba
                // ✅ AGREGADO: generationInfo completo
                generationInfo: {
                    source: "test_data_generator",
                    generatedAt: admin.firestore.Timestamp.fromDate(createdAt),
                    testData: true,
                    videoSource: "external_test_url"
                }
            };
            
            stories.push(storyData);
        }
        
        // Insertar stories en Firestore
        console.log('📝 Insertando stories en Firestore...');
        
        for (let i = 0; i < stories.length; i++) {
            const story = stories[i];
            
            // ✅ CORREGIDO: Usar estructura correcta races/events/participants/stories
            const docRef = await firestore
                .collection('races')
                .doc(raceId)
                .collection('events')
                .doc(eventId)
                .collection('participants')
                .doc(participantId)
                .collection('stories')
                .add(story);
            
            console.log(`✅ Story ${i + 1}/10 creada con ID: ${docRef.id}`);
            console.log(`   📁 Archivo: ${story.fileName}`);
            console.log(`   📝 Descripción: ${story.description}`);
            console.log(`   📅 Fecha: ${story.date.toDate().toLocaleString()}`);
            console.log(`   🔗 URL: ${story.fileUrl}`);
            console.log('');
        }
        
        console.log('🎉 ¡Todas las stories de prueba han sido generadas exitosamente!');
        console.log('');
        console.log('📊 Resumen:');
        console.log(`   - Total de stories: ${stories.length}`);
        console.log(`   - EventId: ${eventId}`);
        console.log(`   - ParticipantId: ${participantId}`);
        console.log(`   - Tipo de origen: automatic_global`);
        console.log(`   - Estado de moderación: approved`);
        console.log('');
        console.log('🔍 Para verificar los datos, puedes usar:');
        console.log('   node verify-firestore.js');
        
    } catch (error) {
        console.error('❌ Error generando stories de prueba:', error);
    }
}

// Ejecutar la generación
generateTestStories();
