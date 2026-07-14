# MamaAlert

**Automated maternal danger-sign screening, triage, and health-worker alerting for antenatal patients without smartphone access.**

MamaAlert calls registered pregnant women on a schedule, asks six WHO-based danger-sign questions in their preferred language, scores each response, and immediately alerts a health worker when a response is dangerous — no smartphone, app, or literacy required on the patient's side.

This repository is a **working, end-to-end simulation** of the full system: real scheduling logic, a real scoring engine, a real event pipeline, and a live console — with the telephony, text-to-speech, and speech-to-text layers mocked so it runs anywhere with zero cost and no API keys. Every mocked component is built behind the exact interface its real counterpart would use, documented inline, so moving to production is a matter of swapping implementations, not redesigning the system.

---

## What this demonstrates

Press one button and watch it happen in real time:

- **7:00 PM, both facilities, automatically.** Primary Health Center A and Clinic B each have 10 registered mothers. At their scheduled call time, every mother is called — no one dials a number by hand.
- **Concurrent, not sequential.** Both facilities' rounds run at the same time, and each facility dials multiple mothers in parallel, the way a real call round would.
- **Per-mother language and routing.** Each mother is called in her own preferred language (English, Yoruba, Igbo, or Hausa). Clinic B's local-language calls route over an MTN SIP trunk; PHC A's routes over Africa's Talking's Voice API — modeled as two live options from the workflow doc, selectable per facility.
- **Real IVR flow.** Opening line → six danger-sign questions → closing line, with a simulated spoken response, a transcription confidence score, and a DTMF (keypad) fallback when confidence is low — mirroring exactly how the real call needs to behave for a rural network connection.
- **Live WHO-based scoring.** Each answer is scored red / yellow / green using isolated, clinician-reviewable logic — no AI in the scoring path at all.
- **Immediate alerting.** A red flag fires an SMS-style alert to the on-call health worker the moment the call ends. A yellow flag queues into a daily digest instead of interrupting anyone. Both show up on the console's alert feed live.

---

## Why it's built this way

This system is designed from a real technical planning document (included as `docs/original-workflow.md`) written before any code was built, which made a few decisions worth calling out because they're the reasons this is affordable at real scale in Nigeria:

- **Zero AI cost per call.** Text-to-speech isn't generated live — the questions never change, so all audio clips are generated **once per language**, ahead of time, and just played back. The only thing that runs per call is playback and transcription.
- **Telephony is the one unavoidable cost**, and the doc explicitly ruled out standard voice APIs (Twilio-class pricing runs ~$0.23/minute to Nigerian mobiles) in favor of Nigeria-specific SIP/VoIP options — Africa's Talking, Termii, or a direct MTN/Airtel/Glo bulk deal.
- **A DTMF fallback is mandatory, not optional.** Speech-to-text accuracy on Nigerian-language yes/no answers isn't proven yet, so a bad transcription should never strand a call — this repo's call engine always offers a keypad fallback path when confidence drops.
- **Scoring is isolated on purpose.** `server/scorer.js` is a single pure function with no dependencies, so a clinician can read and sign off on the six questions and their flagging rules without needing to understand — or trust — anything else in the codebase.

---

## Architecture

```
Registration (seed data)
        │
        ▼
   Scheduler ───────────────► fires each facility's round at its call_time
        │                     (real cron in production, on-demand button here)
        ▼
   Call Engine ──► Telephony Adapter (mocked: Africa's Talking / MTN SIP trunk)
        │               │
        │               ▼
        │         plays pre-generated YarnGPT audio clip per language
        │         listens for answer → STT confidence → DTMF fallback if low
        ▼
   Danger-Sign Scorer (pure WHO-based logic, red/yellow/green)
        │
        ▼
   Alerts ──► red: immediate SMS to health worker
        │     yellow: daily digest
        ▼
   Live Dashboard (WebSocket) ── calls in progress, transcripts, alert feed
```

| Component | File | Status in this repo |
|---|---|---|
| Registration | `scripts/seed.js` | Real schema, seeded demo data (20 mothers, 2 facilities) |
| Scheduler | `server/scheduler.js` | Real cron registration + on-demand trigger |
| Call Engine | `server/callEngine.js` | Real IVR script assembly and event flow |
| Telephony | `server/telephony/sipAdapter.js` | **Mocked** — real request/response shape of Africa's Talking Voice API / MTN SIP trunk |
| Text-to-speech | `scripts/generateAudioClips.js` | **Stubbed** — real YarnGPT integration point documented inline |
| Speech-to-text | simulated inside `sipAdapter.js` | **Mocked** — confidence score + DTMF fallback logic is real |
| Danger-sign scoring | `server/scorer.js` | **Real, clinically reviewable logic** — not yet signed off (see Known Limitations) |
| Alerts | `server/alerts.js` | Real routing logic, simulated SMS send |
| Dashboard | `public/index.html` | Real, live via WebSocket |

---

## Running the demo

Requires Node.js 18+.

```bash
git clone <this-repo-url>
cd mamaalert-demo
npm install
npm run seed        # creates data/mamaalert.db with 2 facilities, 20 mothers
npm start           # http://localhost:3000
```

Open `http://localhost:3000`. Click **"Run Tonight's 7:00 PM Round (All Facilities)"** to trigger both facilities' scheduled call rounds immediately and watch calls, transcripts, scoring, and alerts happen live. Use **Reset Demo Data** to clear calls/alerts and run again.

The server also registers a real daily cron job per facility at its configured `call_time` (`19:00` for both, by default) — the on-demand button exists purely so judges don't have to wait until 7 PM local time to see it work.

---

## Known limitations (by design, and stated openly)

This is a hackathon demo of the architecture and automation flow, not a validated clinical tool. Carried over directly from the original planning document:

- **No telephony provider is contracted yet.** Africa's Talking, Termii, and a direct MTN/Airtel/Glo bulk deal are all still options; real per-minute pricing isn't locked in.
- **Speech-to-text accuracy on Igbo, Yoruba, and Hausa yes/no answers hasn't been measured against real recordings** (e.g. the NaijaVoices dataset). The DTMF fallback exists specifically because this isn't proven yet.
- **The six danger-sign questions and flagging thresholds have not been signed off by a clinician.** `server/scorer.js` is written to be reviewed in isolation for exactly this reason.
- **NDPR compliance for storing health data on pregnant women has not been addressed.** This is a legal requirement before any real pilot, not just a technical one.

---

## Roadmap to a real pilot

1. Get clinician sign-off on `server/scorer.js`'s six questions and thresholds.
2. Generate and listen-test YarnGPT clips in all four languages.
3. Benchmark Faster-Whisper against real Igbo/Yoruba/Hausa recordings.
4. Get firm quotes from Africa's Talking, Termii, and MTN/Airtel/Glo; swap `server/telephony/sipAdapter.js` for the chosen provider's real client.
5. Move `server/db.js` from SQLite to Supabase Postgres (schema is already identical).
6. Complete NDPR compliance review before onboarding any real patient data.

---

## Tech stack

Node.js · Express · WebSocket (`ws`) · SQLite (`better-sqlite3`, Postgres-compatible schema) · `node-cron`

Production targets referenced in the design: YarnGPT (open-source Nigerian-language TTS), Faster-Whisper (STT), Africa's Talking / MTN SIP trunk (telephony), Supabase (Postgres hosting).
