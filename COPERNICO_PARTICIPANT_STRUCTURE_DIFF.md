# Resumen de diferencias de estructura (Copernico demo vs prod)

API utilizada para obtener datos del atleta:
`GET https://{baseUrl}/api/races/{raceId}/athlete/{participantId}`

- Demo (baseUrl): `https://demo-api.copernico.cloud`
- Produccion (baseUrl): `https://api.copernico.cloud`

API utilizada para obtener datos completos del atleta:
`GET https://{baseUrl}/api/races/{raceId}/athlete/{participantId}/full`

- Demo (baseUrl): `https://demo-api.copernico.cloud`
- Produccion (baseUrl): `https://public-api.copernico.cloud`

## Diferencias principales

- Demo no incluye `data.events`. Los campos "de atleta" llegan en la raiz de `data`.
- Produccion incluye `data.events[]`. Los campos "de atleta" aparecen dentro de `data.events[0]` y la raiz contiene campos de inscripcion extra.

## Diferencias principales (endpoint `/full`)

- En `/full` ambos entornos incluyen `data.events[]`.
- En produccion `/full` aparecen campos extra de inscripcion en la raiz de `data`.
- En demo `/full` esos campos no aparecen en la raiz.

## Campos presentes solo en demo (en `data`)

- `event`
- `dorsal`
- `chip`
- `team`
- `team_type`
- `category`
- `attributes`
- `gunTime`
- `gunTimeMode`
- `gunTimeModeConfig`
- `auto_category`
- `auto_chip`
- `status`
- `realStatus`
- `startTime`
- `startRawTime`
- `startNetTime`
- `distance`
- `leader_weight`
- `maxConsecutiveSplitsMissing`
- `splitsMissing`
- `issuesCount`
- `splitsSeen`
- `last_split_seen`
- `times`
- `rankings`
- `leader`
- `predictive`
- `backups`
- `mst`
- `custom-rankings`
- `commentator`
- `penalties`
- `waveTime`
- `teamsIds`

## Campos presentes solo en produccion (en `data`)

- `e-mail`
- `NOMBRE QUE QUIERES QUE APAREZCA EN EL DORSAL`
- `document`
- `birthdate`
- `phone`
- `TELÉFONO EN CASO DE EMERGENCIA`
- `PAÍS`
- `PROVINCIA`
- `club`
- `PAIS NOMBRE`
- `nationality`
- `Discapacitado`
- `discapacidad`
- `Sillas`
- `events`
- `box`

## Campos presentes solo en produccion (en `data`) con `/full`

- `e-mail`
- `NOMBRE QUE QUIERES QUE APAREZCA EN EL DORSAL`
- `document`
- `birthdate`
- `phone`
- `TELÉFONO EN CASO DE EMERGENCIA`
- `PAÍS`
- `PROVINCIA`
- `club`
- `PAIS NOMBRE`
- `nationality`
- `Discapacitado`
- `discapacidad`
- `Sillas`
- `box`
