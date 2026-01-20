#!/usr/bin/env node

/**
 * Performance tester for /api/race-events with multiple modalities.
 *
 * Usage:
 *   RACE_ID=... APP_ID=... EVENT_ID=... node test_race_events_perf.js
 *
 * Optional env:
 *   BASE_URL (default https://liveapigateway-3rt3xwiooa-uc.a.run.app)
 *   ENDPOINT_PATH (default /api/race-events)
 *   PARTICIPANT_ID
 *   LIMIT (default 20)
 *   OFFSETS (comma list, default "0,10,40")
 *   RUNS (default 5)
 *   CONCURRENCY (default 1)
 *   TIMEOUT_MS (default 15000)
 *   SLOW_MS (default 2000)
 *   TYPES (comma list, default "ATHLETE_STARTED,ATHLETE_CROSSED_TIMING_SPLIT,ATHLETE_FINISHED,SPONSOR,COMPLETE_AWARD")
 */

const { performance } = require("perf_hooks");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "https://liveapigateway-3rt3xwiooa-uc.a.run.app";
const ENDPOINT_PATH = process.env.ENDPOINT_PATH || "/api/race-events";
const RACE_ID = process.env.RACE_ID;
const APP_ID = process.env.APP_ID;
const EVENT_ID = process.env.EVENT_ID;
const PARTICIPANT_ID = process.env.PARTICIPANT_ID || "";
const LIMIT = parseInt(process.env.LIMIT || "20", 10);
const OFFSETS = (process.env.OFFSETS || "0,10,40")
  .split(",")
  .map((v) => parseInt(v.trim(), 10))
  .filter((v) => Number.isFinite(v));
const RUNS = parseInt(process.env.RUNS || "5", 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || "1", 10));
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "15000", 10);
const SLOW_MS = parseInt(process.env.SLOW_MS || "2000", 10);
const TYPES = (process.env.TYPES ||
  "ATHLETE_STARTED,ATHLETE_CROSSED_TIMING_SPLIT,ATHLETE_FINISHED,SPONSOR,COMPLETE_AWARD")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const REQUIRED = [
  ["RACE_ID", RACE_ID],
  ["APP_ID", APP_ID],
  ["EVENT_ID", EVENT_ID]
];

const missing = REQUIRED.filter(([, value]) => !value).map(([key]) => key);
if (missing.length > 0) {
  console.error("❌ Faltan variables requeridas:", missing.join(", "));
  console.error("Ejemplo:");
  console.error(
    "RACE_ID=... APP_ID=... EVENT_ID=... PARTICIPANT_ID=... node test_race_events_perf.js"
  );
  process.exit(1);
}

const buildUrl = (params) => {
  const url = new URL(`${BASE_URL}${ENDPOINT_PATH}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const fetchWithTiming = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Race-Events-Perf/1.0"
      },
      signal: controller.signal
    });
    const body = await response.arrayBuffer();
    const durationMs = performance.now() - start;
    clearTimeout(timeout);
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      bytes: body.byteLength
    };
  } catch (error) {
    const durationMs = performance.now() - start;
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      durationMs,
      bytes: 0,
      error: error && error.name ? error.name : String(error)
    };
  }
};

const percentile = (sortedValues, p) => {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(idx, 0), sortedValues.length - 1)];
};

const summarize = (samples) => {
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const bytes = samples.map((s) => s.bytes).sort((a, b) => a - b);
  const statusCounts = samples.reduce((acc, s) => {
    const key = String(s.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const okCount = samples.filter((s) => s.ok).length;
  const slowCount = samples.filter((s) => s.durationMs >= SLOW_MS).length;

  const avg = (arr) =>
    arr.length === 0 ? 0 : arr.reduce((sum, v) => sum + v, 0) / arr.length;

  return {
    count: samples.length,
    okCount,
    errorCount: samples.length - okCount,
    slowCount,
    statusCounts,
    durationMs: {
      min: durations[0] || 0,
      max: durations[durations.length - 1] || 0,
      avg: avg(durations),
      p50: percentile(durations, 50),
      p90: percentile(durations, 90),
      p95: percentile(durations, 95)
    },
    bytes: {
      min: bytes[0] || 0,
      max: bytes[bytes.length - 1] || 0,
      avg: avg(bytes)
    }
  };
};

const runScenario = async (name, params) => {
  const url = buildUrl(params);
  console.log(`\n🧪 ${name}`);
  console.log(`🌐 ${url}`);
  const samples = [];
  let inFlight = 0;
  let index = 0;

  return new Promise((resolve) => {
    const next = () => {
      if (index >= RUNS && inFlight === 0) {
        resolve({ name, url, params, samples });
        return;
      }
      while (inFlight < CONCURRENCY && index < RUNS) {
        index += 1;
        inFlight += 1;
        fetchWithTiming(url)
          .then((result) => {
            samples.push({
              ...result,
              run: index
            });
            const statusLabel = result.status ? result.status : "ERR";
            console.log(
              `  -> ${statusLabel} ${result.durationMs.toFixed(1)}ms ${result.bytes}b`
            );
          })
          .catch((error) => {
            samples.push({
              ok: false,
              status: 0,
              durationMs: 0,
              bytes: 0,
              run: index,
              error: error && error.name ? error.name : String(error)
            });
          })
          .finally(() => {
            inFlight -= 1;
            next();
          });
      }
    };
    next();
  });
};

const buildScenarios = () => {
  const scenarios = [];

  OFFSETS.forEach((offset) => {
    scenarios.push({
      name: `Base offset=${offset}`,
      params: {
        raceId: RACE_ID,
        appId: APP_ID,
        eventId: EVENT_ID,
        limit: LIMIT,
        offset
      }
    });
  });

  TYPES.forEach((type) => {
    scenarios.push({
      name: `Tipo=${type}`,
      params: {
        raceId: RACE_ID,
        appId: APP_ID,
        eventId: EVENT_ID,
        type,
        limit: LIMIT,
        offset: OFFSETS[0] || 0
      }
    });
  });

  if (PARTICIPANT_ID) {
    scenarios.push({
      name: "Participante específico",
      params: {
        raceId: RACE_ID,
        appId: APP_ID,
        eventId: EVENT_ID,
        participantId: PARTICIPANT_ID,
        limit: LIMIT,
        offset: OFFSETS[0] || 0
      }
    });

    TYPES.forEach((type) => {
      scenarios.push({
        name: `Participante + Tipo=${type}`,
        params: {
          raceId: RACE_ID,
          appId: APP_ID,
          eventId: EVENT_ID,
          participantId: PARTICIPANT_ID,
          type,
          limit: LIMIT,
          offset: OFFSETS[0] || 0
        }
      });
    });
  }

  return scenarios;
};

const main = async () => {
  console.log("🚦 /api/race-events performance test");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Race: ${RACE_ID}`);
  console.log(`App: ${APP_ID}`);
  console.log(`Event: ${EVENT_ID}`);
  console.log(`Participant: ${PARTICIPANT_ID || "N/A"}`);
  console.log(`Runs: ${RUNS}  Concurrency: ${CONCURRENCY}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms  Slow>=${SLOW_MS}ms`);

  const scenarios = buildScenarios();
  const results = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario.name, scenario.params);
    const summary = summarize(result.samples);
    results.push({
      name: result.name,
      url: result.url,
      params: result.params,
      summary
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      raceId: RACE_ID,
      appId: APP_ID,
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID || null,
      limit: LIMIT,
      offsets: OFFSETS,
      runs: RUNS,
      concurrency: CONCURRENCY,
      timeoutMs: TIMEOUT_MS,
      slowMs: SLOW_MS,
      types: TYPES
    },
    results
  };

  const fileName = `race_events_perf_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(process.cwd(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  console.log("\n✅ Reporte generado:");
  console.log(`   ${filePath}`);
};

main().catch((error) => {
  console.error("❌ Error ejecutando pruebas:", error);
  process.exit(1);
});
