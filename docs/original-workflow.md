# MamaAlert — Technical Workflow
### Notes for discussion with Victor

This is the working plan for how MamaAlert actually gets built, aligning on the pieces, the order, and the parts still uncertain before writing production code.

## 1. Overview

There are five main parts to this system. None of them need a paid AI vendor — everything AI-related can run on open-source models, self-hosted. The one cost that can't be avoided is the actual phone connection to each mother's number.

**Rough flow:** Registration → Scheduler → Call Engine → Danger-Sign Scorer → Alert and Dashboard. The Call Engine is the piece that talks to a mother on each call — it uses a text-to-speech component to speak and a speech-to-text component to listen.

## 2. The five components

### A. Registration
The sign-up step at the first antenatal visit.
- A simple form: name, phone number, gestational age, preferred language, consent.
- Goes into a Postgres database. Supabase's free tier should be enough while piloting.
- Two tables: `mothers` (id, name, phone, gestational_age, language, registered_at) and `calls` (id, mother_id, timestamp, answers_json, flag, transcript).

### B. Scheduler
Decides who gets called and when. No AI here, just backend logic.
- A cron job or queue worker checks the mothers table every day for anyone due a call.
- Node.js with `node-cron` works fine, or Python if easier.

### C. Speaking to the mother (text-to-speech)
YarnGPT — open-source, built by a Nigerian developer, speaks Yoruba, Igbo, Hausa, and Nigerian English.

Key decision: don't generate speech live on every call. The questions don't change — one opening line, six danger-sign questions, one closing line. Generate all eight clips per language once, ahead of time, and play the saved audio files during calls.
- This means there's basically no AI cost per call, since the model isn't run live each time.
- For the one-time generation step, Hugging Face Spaces has a free CPU tier, or a rented GPU for an hour or two if too slow — should only cost a few dollars total.

### D. Listening to the mother's answer (speech-to-text)
Faster-Whisper, ideally checked against real Nigerian-language audio, not just tested on English. NaijaVoices is a dataset with over 1,800 hours of Igbo, Hausa, and Yoruba recordings that could help here.
- After each question, capture what she says, transcribe it, and check if it sounds like yes or no.
- Need a backup for when the transcription isn't confident — pressing 1 for yes and 2 for no on the keypad. That way a bad transcription never gets a call stuck.
- Can run on the same server as the text-to-speech piece, or a separate one if easier to manage.

### E. The phone call itself
The one part of the system that will always cost real money, no matter how much is self-hosted. Twilio's normal voice pricing was already ruled out — about $0.2349 per minute to Nigerian mobile numbers, too expensive at any real scale.

Options, roughly in order of what seems cheapest:
1. A Nigerian VoIP or SIP provider — Africa's Talking or Termii are two names seen, but actual quotes are needed before deciding.
2. Going directly to MTN, Airtel, or Glo for a bulk voice deal. Probably the best rate long term, but slower to set up since it likely needs a registered company and negotiation.
3. OpenMic or VoiceAgents — Nigeria-specific voice AI platforms. Might bundle the phone connection and the AI together, simplifying things, but real pricing is needed.

Whatever is picked, the call engine's job stays simple: dial the number, play the right audio clip, listen for the answer (or wait for a keypress), move to the next question, then hang up and save the result.

### F. Scoring danger signs
Just logic, no AI needed. Each answer maps to a WHO-based severity level — red, yellow, or green — and whichever is worst across all the answers becomes the call's overall flag.
- This piece actually needs a clinician to check it, not a developer. Sign-off is needed on the six questions and the flagging rules before wiring this up to real calls.

### G. Alerts and the dashboard
- A red flag should trigger an immediate SMS or notification to a health worker. SMS is much cheaper than voice, so whichever provider is picked for calls would also send this.
- A yellow flag can just go into a daily summary instead of an urgent alert.
- The dashboard itself can be simple at first — just a page that reads from the calls table and shows flag status, call history, and a button to start a teleconsult on red flags.

## 3. Build order

Each piece should be built and tested on its own before connecting everything together.

1. Database schema and the registration form first — no dependencies, fastest to get working.
2. The danger-sign scoring logic as its own function, testable with made-up data. Clinician sign-off needed before anything else touches it.
3. Generate the YarnGPT audio clips and listen to them in each language to judge quality.
4. Test the speech-to-text piece against real sample recordings in Igbo, Yoruba, and Hausa to see real accuracy.
5. Build the call engine once a telephony provider is picked. Don't build this deeply until there's real pricing.
6. Add the scheduler — should be straightforward once the rest works.
7. Dashboard and alerts last, since they just read data the rest of the system is already producing.

## 4. Still unsure about

Things without answers yet, to sort out before taking this past a small pilot.

- No confirmed telephony provider or rate yet, so real cost numbers can't be locked in.
- No confirmed real accuracy on Igbo, Yoruba, and Hausa yes/no answers — needs actual testing, not just assuming the models will work.
- No clinician has signed off on the six questions or the flagging logic yet.
- NDPR compliance for storing health data on pregnant women hasn't been figured out. A legal question as much as a technical one, needing resolution before any real pilot.
