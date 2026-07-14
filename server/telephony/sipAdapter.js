// telephony/sipAdapter.js
//
// This is the ONLY file that talks to the phone network. Everything else
// in the call engine is provider-agnostic. For this demo it is mocked -
// no real calls are placed and no telephony cost is incurred - but the
// method signatures mirror the real request/response shape of Africa's
// Talking's Voice API and an MTN SIP trunk (INVITE / media stream /
// DTMF collection), so moving to production is a swap of this file only.
//
// Real integration would look like:
//   - Africa's Talking: POST to /voice with a voice XML response, media
//     streamed via websocket for STT, DTMF via <GetDigits>.
//   - MTN bulk SIP trunk: SIP INVITE to MTN's border element, RTP media
//     stream carrying the YarnGPT-generated audio, DTMF via RFC 2833.
//
// Both providers are represented here as selectable "channels" so the
// dashboard can show which trunk each call actually went out on - this is
// what lets PHC A and Clinic B route over different providers/languages
// in the same scheduling round.

import { EventEmitter } from "events";

const SIMULATED_LATENCY_MS = 350;
const NO_ANSWER_RATE = 0.08; // ~8% of calls go unanswered, for realism

export const CHANNELS = {
  AFRICAS_TALKING: "africas_talking_voip",
  MTN_SIP_TRUNK: "mtn_sip_trunk",
};

function pickChannel(mother) {
  // Simple routing rule for the demo: Clinic B's local-language calls route
  // over the MTN SIP trunk (as the direct bulk-voice deal the doc names as
  // the long-term cheapest option), PHC A's English-majority calls route
  // over the Africa's Talking VoIP API (the faster-to-integrate option).
  return mother.facility_id === "clinic-b"
    ? CHANNELS.MTN_SIP_TRUNK
    : CHANNELS.AFRICAS_TALKING;
}

/**
 * Simulates placing an outbound call and running the IVR script.
 * Emits progress events so the dashboard can show live call state.
 */
export class SimulatedCall extends EventEmitter {
  constructor(mother, script) {
    super();
    this.mother = mother;
    this.script = script; // ordered list of { id, audioClip, expectDigit }
    this.channel = pickChannel(mother);
    this.answers = {};
    this.transcriptLines = [];
  }

  async place() {
    this.emit("status", { status: "dialing", channel: this.channel });
    await sleep(SIMULATED_LATENCY_MS);

    if (Math.random() < NO_ANSWER_RATE) {
      this.emit("status", { status: "no_answer", channel: this.channel });
      return { status: "no_answer", answers: {}, transcript: "", duration: 0 };
    }

    this.emit("status", { status: "in_progress", channel: this.channel });
    const start = Date.now();

    for (const step of this.script) {
      this.emit("audio_played", { clip: step.audioClipPath, text: step.text });
      await sleep(SIMULATED_LATENCY_MS);

      const response = simulateMaternalResponse(step, this.mother);
      this.answers[step.id] = response.answeredYes;
      this.transcriptLines.push(
        `IVR (${this.mother.language}): ${step.text}`
      );
      this.transcriptLines.push(
        `Mother: ${response.transcript} ${
          response.usedDtmfFallback ? "[DTMF fallback used]" : ""
        }`
      );
      this.emit("answer", {
        questionId: step.id,
        transcript: response.transcript,
        confidence: response.confidence,
        usedDtmfFallback: response.usedDtmfFallback,
      });
      await sleep(SIMULATED_LATENCY_MS);
    }

    const duration = Math.round((Date.now() - start) / 1000) + this.script.length * 2;
    this.emit("status", { status: "completed", channel: this.channel });

    return {
      status: "completed",
      answers: this.answers,
      transcript: this.transcriptLines.join("\n"),
      duration,
    };
  }
}

// --- Simulation helpers (stand in for real STT confidence + DTMF fallback) ---

function simulateMaternalResponse(step, mother) {
  // Weighted so most answers are "no" (green), with an occasional yellow/red
  // trigger so the demo reliably shows the full triage path at least once
  // per run without every mother being an emergency.
  const yesProbability = step.baseYesProbability ?? 0.12;
  const answeredYes = Math.random() < yesProbability;

  const sttConfidence = 0.55 + Math.random() * 0.44; // 0.55 - 0.99
  const usedDtmfFallback = sttConfidence < 0.65;

  const yesPhrase = LOCAL_YES[mother.language] || "Yes";
  const noPhrase = LOCAL_NO[mother.language] || "No";

  return {
    answeredYes,
    transcript: usedDtmfFallback
      ? answeredYes
        ? "(keypad: 1 — low STT confidence, DTMF used)"
        : "(keypad: 2 — low STT confidence, DTMF used)"
      : answeredYes
      ? yesPhrase
      : noPhrase,
    confidence: Number(sttConfidence.toFixed(2)),
    usedDtmfFallback,
  };
}

const LOCAL_YES = { yoruba: '"Beeni"', igbo: '"E-e"', hausa: '"I-i"', english: '"Yes"' };
const LOCAL_NO = { yoruba: '"Rara"', igbo: '"Mba"', hausa: '"A\'a"', english: '"No"' };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
