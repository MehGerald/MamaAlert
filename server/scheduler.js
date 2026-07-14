// scheduler.js
//
// Decides who gets called and when - no AI, just backend logic, as the
// doc specifies. In production this is a daily cron (node-cron) that
// checks the mothers table for anyone due a call. For the demo, the same
// function is exposed so a "Run tonight's 7 PM round" button can trigger
// it on demand for judges, plus a real cron registration for the actual
// scheduled time.

import cron from "node-cron";
import { db } from "./db.js";
import { runCall } from "./callEngine.js";

const CONCURRENCY = 4; // simultaneous outbound calls per facility round

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
  // Facilities are called concurrently, each internally fanning out to its
  // own mothers - this is what makes "all 10 women in PHC A called by 7pm,
  // Clinic B called at the same time in their preferred language" true
  // simultaneously rather than one facility waiting on the other.
  const summaries = await Promise.all(
    facilities.map((f) => runFacilityRound(f.id, onEvent))
  );
  return summaries;
}

/**
 * Registers the real daily cron jobs, one per facility, at its configured
 * call_time. Call this once at server startup for "actually automated"
 * behavior (no button press needed) - matches the doc's cron/queue-worker
 * design.
 */
export function registerDailyCronJobs(onEvent) {
  const facilities = db.prepare("SELECT * FROM facilities").all();
  const jobs = [];
  for (const facility of facilities) {
    const [hour, minute] = facility.call_time.split(":").map(Number);
    const expression = `${minute} ${hour} * * *`; // every day at HH:MM
    const job = cron.schedule(expression, () => {
      runFacilityRound(facility.id, onEvent);
    });
    jobs.push({ facilityId: facility.id, expression, job });
  }
  return jobs;
}
