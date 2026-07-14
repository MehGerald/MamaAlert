// scripts/seed.js
// Seeds two facilities with 10 registered mothers each, matching the
// Registration component in the workflow doc: name, phone, gestational_age,
// preferred language, consent (implicit at registration).

import { db } from "../server/db.js";
import { nanoid } from "nanoid";

db.exec("DELETE FROM alerts; DELETE FROM calls; DELETE FROM mothers; DELETE FROM facilities;");

const facilities = [
  { id: "phc-a", name: "Primary Health Center A - Uyo", call_time: "19:00" },
  { id: "clinic-b", name: "Clinic B - Ikot Ekpene", call_time: "19:00" },
];

const insertFacility = db.prepare(
  "INSERT INTO facilities (id, name, call_time) VALUES (?, ?, ?)"
);
for (const f of facilities) insertFacility.run(f.id, f.name, f.call_time);

const firstNames = [
  "Blessing", "Grace", "Mercy", "Comfort", "Patience", "Ekaette", "Idara",
  "Ememobong", "Uduak", "Ini", "Nsikan", "Aniekan", "Chidinma", "Ngozi",
  "Amaka", "Halima", "Zainab", "Fatima", "Aisha", "Toyin",
];
const lastNames = [
  "Etim", "Umoh", "Akpan", "Udo", "Bassey", "Eze", "Okafor", "Mohammed",
  "Ibrahim", "Adewale",
];
const languages = ["english", "yoruba", "igbo", "hausa"];

const insertMother = db.prepare(`
  INSERT INTO mothers (id, name, phone, gestational_age, language, facility_id, registered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let phoneCounter = 7010000001;

facilities.forEach((facility, fIdx) => {
  for (let i = 0; i < 10; i++) {
    const name = `${firstNames[(fIdx * 10 + i) % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    // Clinic B leans toward local-language preference to demonstrate the
    // "called in preferred language" requirement distinctly from PHC A.
    const language =
      facility.id === "clinic-b"
        ? languages[(i % 3) + 1] // yoruba/igbo/hausa rotation
        : i % 4 === 0
        ? languages[(i % 3) + 1]
        : "english";

    insertMother.run(
      nanoid(10),
      name,
      `+234${phoneCounter++}`,
      20 + (i % 20), // gestational age weeks, spread 20-39
      language,
      facility.id,
      new Date(Date.now() - i * 86400000).toISOString()
    );
  }
});

console.log("Seeded 2 facilities and 20 mothers.");
console.log(db.prepare("SELECT name, call_time FROM facilities").all());
console.log(
  db
    .prepare(
      "SELECT m.name, m.language, m.facility_id FROM mothers m ORDER BY facility_id"
    )
    .all()
);
