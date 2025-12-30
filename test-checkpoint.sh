#!/bin/bash

echo "🏃‍♂️ Enviando checkpoint para participante..."

curl -X POST \
  https://us-central1-live-copernico.cloudfunctions.net/liveApiGateway/api/checkpoint-participant \
  -H "Content-Type: application/json" \
  -d @checkpoint-test.json

echo ""
echo "✅ Checkpoint enviado"
