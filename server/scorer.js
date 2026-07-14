// scorer.js
//
// Pure scoring logic. No AI, no network calls - a clinician should be able
// to read this file top to bottom and sign off on it without touching any
// other part of the system, per the workflow doc's requirement that this
// piece needs clinical sign-off before it's wired to real calls.
//
// Six WHO danger-sign questions for the third trimester screen. Each
// question maps a "yes" response to a severity level. The call's overall
// flag is the worst (most severe) level across all six answers.
//
// STATUS: DEMO LOGIC MODELLED ON WHO DANGER-SIGN CATEGORIES.
// Not yet reviewed or signed off by a clinician. Do not use for real triage
// decisions until that review happens - flagged explicitly in the README.

export const QUESTIONS = [
  {
    id: "bleeding",
    text: "Have you had any vaginal bleeding since your last visit?",
    ifYes: "red",
    reason: "Antepartum haemorrhage risk - WHO danger sign, requires immediate referral.",
  },
  {
    id: "severe_headache",
    text: "Have you had a severe headache that won't go away, or blurred vision?",
    ifYes: "red",
    reason: "Possible pre-eclampsia/eclampsia warning sign.",
  },
  {
    id: "reduced_movement",
    text: "Has the baby's movement reduced or stopped in the last day?",
    ifYes: "red",
    reason: "Possible fetal distress - requires same-day assessment.",
  },
  {
    id: "fever",
    text: "Do you have a fever or feel unusually hot?",
    ifYes: "yellow",
    reason: "Possible infection - monitor and review within 48 hours.",
  },
  {
    id: "swelling",
    text: "Do you have new swelling in your face or hands?",
    ifYes: "yellow",
    reason: "Possible early pre-eclampsia sign - monitor and review within 48 hours.",
  },
  {
    id: "abdominal_pain",
    text: "Do you have abdominal pain that is different or worse than usual?",
    ifYes: "yellow",
    reason: "Nonspecific but warrants a follow-up call or visit.",
  },
];

const SEVERITY_RANK = { green: 0, yellow: 1, red: 2 };

/**
 * @param {Object} answers - { [questionId]: boolean }  true = "yes"
 * @returns {{ flag: 'red'|'yellow'|'green', triggers: Array }}
 */
export function scoreCall(answers) {
  let worst = "green";
  const triggers = [];

  for (const q of QUESTIONS) {
    const answeredYes = answers[q.id] === true;
    if (answeredYes) {
      triggers.push({ question: q.text, level: q.ifYes, reason: q.reason });
      if (SEVERITY_RANK[q.ifYes] > SEVERITY_RANK[worst]) {
        worst = q.ifYes;
      }
    }
  }

  return { flag: worst, triggers };
}
