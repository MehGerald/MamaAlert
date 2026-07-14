// scripts/generateAudioClips.js
//
// STUBBED FOR DEMO. This is where the one-time YarnGPT generation step
// described in the workflow doc actually happens in production:
//
//   1. Render the 8 fixed clips (opening, 6 questions, closing) once per
//      supported language (english, yoruba, igbo, hausa) using YarnGPT
//      (https://github.com/saheedniyi02/yarnGPT), run on a Hugging Face
//      Spaces free CPU tier or a rented GPU-hour.
//   2. Save each clip to /public/audio/<language>/<NN>_<id>.mp3.
//   3. The call engine (server/callEngine.js) references these file paths
//      and never calls a TTS model live during an actual call - this is
//      what keeps the per-call AI cost at zero, per the doc's design.
//
// This script only prints the manifest of clips that WOULD be generated,
// so the repo is runnable without any GPU/model dependency for judging.
// Swap the body of generateClip() for a real YarnGPT call to go live.

import { QUESTIONS } from "../server/scorer.js";

const LANGUAGES = ["english", "yoruba", "igbo", "hausa"];

function manifest() {
  const clips = [];
  for (const lang of LANGUAGES) {
    clips.push({ lang, file: `${lang}/00_opening.mp3`, label: "Opening line" });
    QUESTIONS.forEach((q, i) => {
      clips.push({
        lang,
        file: `${lang}/${String(i + 1).padStart(2, "0")}_${q.id}.mp3`,
        label: q.text,
      });
    });
    clips.push({ lang, file: `${lang}/07_closing.mp3`, label: "Closing line" });
  }
  return clips;
}

async function generateClip(clip) {
  // Real implementation:
  // const audio = await yarnGPT.synthesize({ text: clip.label, language: clip.lang });
  // fs.writeFileSync(`public/audio/${clip.file}`, audio);
  console.log(`[stub] would generate: public/audio/${clip.file}  ("${clip.label}")`);
}

const clips = manifest();
console.log(`${clips.length} clips to generate across ${LANGUAGES.length} languages (8 per language).`);
console.log("Running as a stub - no model call is made. See file header for the real integration point.\n");

for (const clip of clips) {
  await generateClip(clip);
}
