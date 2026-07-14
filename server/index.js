// index.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import {
  runFacilityRound,
  runAllFacilitiesRound,
  registerDailyCronJobs,
  updateFacilitySchedule,
} from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function broadcast(event) {
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

app.get("/api/facilities", (req, res) => {
  res.json(db.prepare("SELECT * FROM facilities").all());
});
app.post("/api/mothers", (req, res) => {
  const { name, phone, gestational_age, language, facility_id } = req.body;
  if (!name || !phone || !gestational_age || !language || !facility_id) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const id = "m" + Date.now() + Math.floor(Math.random() * 1000);
  db.prepare(
    `INSERT INTO mothers (id, name, phone, gestational_age, language, facility_id, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, phone, gestational_age, language, facility_id, new Date().toISOString());

  const mother = db.prepare("SELECT * FROM mothers WHERE id = ?").get(id);
  broadcast({ type: "mother_registered", mother });
  res.json({ ok: true, mother });
});

app.get("/api/mothers", (req, res) => {
  res.json(db.prepare("SELECT * FROM mothers").all());
});

app.get("/api/calls", (req, res) => {
  const calls = db
    .prepare(
      `SELECT calls.*, mothers.name as mother_name, mothers.facility_id
       FROM calls JOIN mothers ON calls.mother_id = mothers.id
       ORDER BY calls.timestamp DESC`
    )
    .all();
  res.json(calls);
});

app.get("/api/alerts", (req, res) => {
  const alerts = db
    .prepare(
      `SELECT alerts.*, mothers.name as mother_name, mothers.facility_id
       FROM alerts JOIN mothers ON alerts.mother_id = mothers.id
       ORDER BY alerts.sent_at DESC`
    )
    .all();
  res.json(alerts);
});

app.post("/api/alerts/:id/acknowledge", (req, res) => {
  db.prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(req.params.id);
  broadcast({ type: "alert_acknowledged", alertId: req.params.id });
  res.json({ ok: true });
});

app.post("/api/rounds/run/:facilityId", async (req, res) => {
  res.json({ started: true });
  await runFacilityRound(req.params.facilityId, broadcast);
});

app.post("/api/rounds/run-all", async (req, res) => {
  res.json({ started: true });
  await runAllFacilitiesRound(broadcast);
});

app.post("/api/facilities/:id/schedule", (req, res) => {
  const { call_time } = req.body;
  if (!/^\d{2}:\d{2}$/.test(call_time || "")) {
    return res.status(400).json({ error: "call_time must be in HH:MM format" });
  }
  const { facility, expression } = updateFacilitySchedule(req.params.id, call_time, broadcast);
  broadcast({ type: "schedule_updated", facilityId: facility.id, callTime: facility.call_time });
  res.json({ ok: true, facility, cronExpression: expression });
});

app.post("/api/reset", async (req, res) => {
  db.exec("DELETE FROM alerts; DELETE FROM calls;");
  broadcast({ type: "reset" });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MamaAlert demo running at http://localhost:${PORT}`);
  registerDailyCronJobs(broadcast);
});
