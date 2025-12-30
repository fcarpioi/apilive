#!/usr/bin/env node

/**
 * Script para probar la lógica de búsqueda de splits
 * Simula exactamente lo que hace la función createSplitClipsFromStory()
 */

// Simular la estructura de splits que vimos en Firebase
const eventData = {
  splits: [
    {
      "distance": 0,
      "name": "Salida",
      "order": 1,
      "physicalLocation": "Meta",
      "type": "start"
    },
    {
      "distance": 10000,
      "name": "10K",
      "order": 2,
      "physicalLocation": "10K",
      "type": "standard"
    },
    {
      "distance": 15000,
      "name": "15K",
      "order": 3,
      "physicalLocation": "15K",
      "type": "standard"
    },
    {
      "distance": 21097,
      "name": "Media",
      "order": 4,
      "physicalLocation": "META 21K",
      "type": "finish"
    }
  ]
};

const checkpointId = "Media";

console.log('🧪 Probando lógica de búsqueda de splits...');
console.log(`🎯 Buscando checkpoint: "${checkpointId}"`);
console.log(`📊 Total splits: ${eventData.splits.length}`);

// Mostrar todos los splits
console.log('\n📋 Splits disponibles:');
eventData.splits.forEach((split, index) => {
  const splitName = typeof split === 'string' ? split : (split?.name || split?.id || 'unknown');
  console.log(`  ${index}: "${splitName}" (type: ${typeof split})`);
});

// LÓGICA ANTERIOR (que no funcionaba)
console.log('\n❌ Lógica ANTERIOR:');
const oldSplitIndex = eventData.splits.findIndex(split =>
  split === checkpointId ||
  split.name === checkpointId ||
  split.id === checkpointId
);
console.log(`Resultado: ${oldSplitIndex} (${oldSplitIndex !== -1 ? 'ENCONTRADO' : 'NO ENCONTRADO'})`);

// LÓGICA NUEVA (corregida)
console.log('\n✅ Lógica NUEVA:');
const newSplitIndex = eventData.splits.findIndex(split => {
  if (typeof split === 'string') {
    console.log(`  Comparando string: "${split}" === "${checkpointId}" = ${split === checkpointId}`);
    return split === checkpointId;
  } else if (typeof split === 'object' && split !== null) {
    const nameMatch = split.name === checkpointId;
    const idMatch = split.id === checkpointId;
    console.log(`  Comparando object: name="${split.name}" === "${checkpointId}" = ${nameMatch}, id="${split.id}" === "${checkpointId}" = ${idMatch}`);
    return nameMatch || idMatch;
  }
  return false;
});

console.log(`Resultado: ${newSplitIndex} (${newSplitIndex !== -1 ? 'ENCONTRADO' : 'NO ENCONTRADO'})`);

if (newSplitIndex !== -1) {
  const foundSplit = eventData.splits[newSplitIndex];
  console.log('\n🎉 Split encontrado:');
  console.log(`  📍 Índice: ${newSplitIndex}`);
  console.log(`  📝 Nombre: ${foundSplit.name}`);
  console.log(`  📏 Distancia: ${foundSplit.distance}m`);
  console.log(`  🏃 Tipo: ${foundSplit.type}`);
  console.log('\n✅ La función createSplitClipsFromStory() DEBERÍA funcionar ahora');
} else {
  console.log('\n❌ Split NO encontrado - hay un problema en la lógica');
}

// Probar con otros checkpoints
console.log('\n🧪 Probando otros checkpoints:');
const testCheckpoints = ['Salida', '10K', '15K', 'Meta', 'NoExiste'];

testCheckpoints.forEach(testCheckpoint => {
  const testIndex = eventData.splits.findIndex(split => {
    if (typeof split === 'string') {
      return split === testCheckpoint;
    } else if (typeof split === 'object' && split !== null) {
      return split.name === testCheckpoint || split.id === testCheckpoint;
    }
    return false;
  });
  
  console.log(`  "${testCheckpoint}": ${testIndex !== -1 ? '✅ ENCONTRADO' : '❌ NO ENCONTRADO'} (índice: ${testIndex})`);
});
