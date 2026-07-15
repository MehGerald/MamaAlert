import cron from "node-cron";
import { db } from "./db.js";
import { runCall } from "./callEngine.js";

const CONCURRENCY = 4;
const dailyCronJobs = {};
const oneTimeTimers = {};

export async function runFacilityRound(facilityId, onEvent = () => {}) {
  const facility = db.prepare("SELECT * FROM facilities WHERE id = ?").get(facilityId);
  const mothers = db.prepare("SELECT * FROM mothers WHERE facility_id = ?").all(facilityId);

  onEvent({ type: "round_started", facilityId, facilityName: facility.name, callTime: facility.call_time, motherCount: mothers.length });

  const queue = [...mothers];
  const results = [];
  async function worker() {
    while (queue.length) {
      const mother = queue.shift();
      const result = await runCall(mother, onEvent);
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = {
    type: "round_complete", facilityId, facilityName: facility.name,
    total: results.length,
    red: results.filter((r) => r.flag === "red").length,
    yellow: results.filter((r) => r.flag === "yellow").length,
    green: results.filter((r) => r.flag === "green").length,
    noAnswer: results.filter((r) => r.status === "no_answer").length,
  };
  onEvent(summary);
  return summary;
}

export async function runAllFacilitiesRound(onEvent = () => {}) {
  const facilities = db.prepare("SELECT * FROM facilities").all();
  return Promise.all(facilities.map((f) => runFacilityRound(f.id, onEvent)));
}

function scheduleFacilityCron(facility, onEvent) {
  if (dailyCronJobs[facility.id]) dailyCronJobs[facility.id].stop();
  const [hour, minute] = facility.call_time.split(":").map(Number);
  const expression = `${minute} ${hour} * * *`;
  const task = cron.schedule(expression, () => runFacilityRound(facility.id, onEvent));
  dailyCronJobs[facility.id] = task;
  return expression;
}

export function registerDailyCronJobs(onEvent) {
  const facilities = db.prepare("SELECT * FROM facilities").all();
  return facilities.map((f) => ({ facilityId: f.id, expression: scheduleFacilityCron(f, onEvent) }));
}

export function updateFacilitySchedule(facilityId, newCallTime, onEvent) {
  db.prepare("UPDATE facilities SET call_time = ? WHERE id = ?").run(newCallTime, facilityId);
  const facility = db.prepare("SELECT * FROM facilities WHERE id = ?").get(facilityId);
  const expression = scheduleFacilityCron(facility, onEvent);
  return { facility, expression };
}

// --- One-time "fire at this exact date & time" scheduling ---

export function scheduleOneTimeRun(facilityId, runAtISO, onEvent) {
  const runAt = new Date(runAtISO);
  const delay = runAt.getTime() - Date.now();
  if (isNaN(runAt.getTime()) || delay <= 0) {
    throw new Error("run_at must be a valid future date and time");
  }
  if (oneTimeTimers[facilityId]) clearTimeout(oneTimeTimers[facilityId].timeout);
  const timeout = setTimeout(() => {
    delete oneTimeTimers[facilityId];
    onEvent({ type: "one_time_fired", facilityId });
    runFacilityRound(facilityId, onEvent);
  }, delay);
  oneTimeTimers[facilityId] = { timeout, runAt: runAt.toISOString() };
  return runAt.toISOString();
}

export function getOneTimeSchedules() {
  const out = {};
  for (const [fid, v] of Object.entries(oneTimeTimers)) out[fid] = v.runAt;
  return out;
}

export function cancelOneTimeRun(facilityId) {
  if (oneTimeTimers[facilityId]) {
    clearTimeout(oneTimeTimers[facilityId].timeout);
    delete oneTimeTimers[facilityId];
    return true;
  }
  return false;
}
