// alerts.js
//
// Red flag -> immediate simulated SMS to the on-call health worker.
// Yellow flag -> logged for the daily digest instead of an urgent ping,
// exactly as the workflow doc splits urgency by severity.
//
// In production this reuses whichever provider is chosen for voice
// (Africa's Talking / Termii / MTN) since SMS is far cheaper than voice
// and the doc calls for reusing the same vendor relationship.

import { nanoid } from "nanoid";
import { db } from "./db.js";

const ON_CALL_HEALTH_WORKER = {
  name: "Nurse Uduak Ekpo",
  phone: "+2348031234567",
  role: "Facility in-charge",
};

export async function sendAlert({ callId, mother, flag, triggers }) {
  const alertId = nanoid(10);
  const level = flag; // "red" | "yellow"
  const channel = level === "red" ? "sms" : "dashboard_digest";

  const reasonList = triggers.map((t) => t.reason).join("; ");
  const message =
    level === "red"
      ? `URGENT: ${mother.name} (${mother.phone}, ${mother.facility_id}) flagged RED after screening call. Reasons: ${reasonList}. Please contact immediately.`
      : `Review within 48h: ${mother.name} (${mother.facility_id}) flagged YELLOW. Reasons: ${reasonList}.`;

  // Simulated send latency for realism in the demo.
  await new Promise((r) => setTimeout(r, 150));

  db.prepare(
    `INSERT INTO alerts (id, call_id, mother_id, level, message, sent_at, recipient, channel)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    alertId,
    callId,
    mother.id,
    level,
    message,
    new Date().toISOString(),
    ON_CALL_HEALTH_WORKER.phone,
    channel
  );

  return {
    alertId,
    level,
    channel,
    recipient: ON_CALL_HEALTH_WORKER,
    message,
  };
}
