// scheduler.js
import cron from "node-cron";
import { db } from "./db.js";
import { runCall } from "./callEngine.js";

const CONCURRENCY = 4;
const activeCronJobs = {}; // facilityId -> node-cron task

export async function runFacilityRound(facilityId, onEvent = () => {}) {
  const facility = db.prepare("SELECT * FROM facilities WHERE id = ?").get(facilityId);
  const mothers = db.prepare("SELECT * FROM mothers WHERE facility_id = ?").all(facilityId);

  onEvent({
    type: "round_started",
    facilityId,
    facilityName: facility.name,
    callTime: facility.call_time,
    motherCount: mothers.length,
  });

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
    type: "round_complete",
    facilityId,
    facilityName: facility.name,
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
  const summaries = await Promise.all(
    facilities.map((f) => runFacilityRound(f.id, onEvent))
  );
  return summaries;
}

function scheduleFacilityCron(facility, onEvent) {
  if (activeCronJobs[facility.id]) {
    activeCronJobs[facility.id].stop();
  }
  const [hour, minute] = facility.call_time.split(":").map(Number);
  const expression = `${minute} ${hour} * * *`;
  const task = cron.schedule(expression, () => {
    runFacilityRound(facility.id, onEvent);
  });
  activeCronJobs[facility.id] = task;
  return expression;
}

export function registerDailyCronJobs(onEvent) {
  const facilities = db.prepare("SELECT * FROM facilities").all();
  return facilities.map((facility) => ({
    facilityId: facility.id,
    expression: scheduleFacilityCron(facility, onEvent),
  }));
}

/**
 * Updates a facility's daily call time in the database and immediately
 * reschedules its cron job to the new time - no server restart needed.
 */
export function updateFacilitySchedule(facilityId, newCallTime, onEvent) {
  db.prepare("UPDATE facilities SET call_time = ? WHERE id = ?").run(newCallTime, facilityId);
  const facility = db.prepare("SELECT * FROM facilities WHERE id = ?").get(facilityId);
  const expression = scheduleFacilityCron(facility, onEvent);
  return { facility, expression };
}
