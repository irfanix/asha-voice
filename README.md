# 🎤 ASHA Voice

**Speak a home visit in Telugu, Hindi or English. AI structures the record. A rule engine flags danger signs. The app plans who's next.**

Built for **ForgeHacks Online 2026**, track: **AI + Healthcare**.

**Live demo:** https://asha-voice-phi.vercel.app

> ⚠️ **ASHA Voice is a prototype. It is not a medical device.** The AI never diagnoses and never prescribes. Danger signs come from a deterministic rule engine based on official Indian guidance. The ASHA always reviews and confirms before saving.

---

## 📖 Table of contents

1. [The problem](#the-problem)
2. [What ASHA Voice does](#what-asha-voice-does)
3. [Try it in 60 seconds](#try-it-in-60-seconds)
4. [Feature tour](#feature-tour)
5. [Architecture](#architecture)
6. [How AI is used (and why the rule engine is separate)](#how-ai-is-used-and-why-the-rule-engine-is-separate)
7. [Evaluation results](#evaluation-results)
8. [Privacy & safety design](#privacy--safety-design)
9. [Run locally](#run-locally)
10. [Deploy to Vercel](#deploy-to-vercel)
11. [Environment variables](#environment-variables)
12. [Demo instructions](#demo-instructions)
13. [Limitations](#limitations)
14. [Credits & sources](#credits--sources)
15. [AI usage disclosure](#ai-usage-disclosure)

---

## The problem

- India has **~1.04 million ASHAs** (Accredited Social Health Activists), roughly one per 1,000 people.
- An ASHA does many home visits a day. She has to **write everything by hand** in registers, **remember long lists of danger signs** for each type of visit, and **track who is due** for the next visit or vaccine.
- When she is busy, danger signs get missed, records are late, and follow-ups are forgotten. In rural areas this can cost lives.
- The app must work in **Telugu, Hindi and English**, on a low-cost Android phone, **offline**.

---

## What ASHA Voice does

| Step | What happens |
|---|---|
| 🎤 **Speak** | The ASHA taps the mic and describes the visit in her own language. |
| 🧠 **Extract** | A serverless LLM call turns her words into a structured record (BP, symptoms, services). Names and phone numbers are redacted before the call. |
| 🚨 **Flag** | A deterministic **rule engine** runs in the browser and flags RED / AMBER / GREEN danger signs with plain-language reasons and official sources. This works **offline**, without the LLM. |
| 📅 **Plan** | The visit planner tells her who to visit next and **why** ("Day 7 newborn visit due", "Referred 3 days ago, not yet seen at PHC"). |
| 💬 **Message** | A short, warm family message is generated in the family's language and can be **played aloud** for families who cannot read. |
| 🤖 **Ask** | "Ask ASHA Didi" answers guideline questions from a curated knowledge base, always with sources, and politely refuses dose / medicine questions. |
| 📊 **Report** | One-tap monthly summary with visits, danger signs, referrals and an incentive tracker (example values, clearly labelled). |

---

## Try it in 60 seconds

1. Open the deployed app (Vercel link in the Devpost submission).
2. Choose **Telugu / हिंदी / English**.
3. Tap **Load demo village** — 12 fictional households appear.
4. Tap the big **🎤 Record a visit** button.
5. Pick **Lakshmi Devi** → **Pregnancy (ANC)**.
6. Under **Demo transcripts**, pick *"తెలుగు — Pre-eclampsia (RED)"*.
7. Tap **Review** → see **🚨 RED: Refer today** with reasons and sources.
8. Tap **Save and message family** → hear the message read aloud in Telugu.

**No microphone, no internet? Every part of the demo still works.**

---

## Feature tour

### Onboarding
![onboarding]
Language picker → name & village → 3-slide intro → **Start** or **Load demo village**.

### Today (home)
- Greeting + village
- 3 stats: visits this month, danger signs caught, pending referrals
- Prioritised visit plan, each card with a **colour, icon, name, and a "why is this first?" reason**
- Floating 🎤 Record button (always reachable)

### Record a visit (the hero flow)
1. Pick or add the person
2. Pick the visit type (ANC / Postnatal / Newborn / Child / Other)
3. Speak, type, or choose a **demo transcript**. Voice is turned into text by **Whisper speech AI** (`/api/transcribe`), which is far more accurate for Telugu and Hindi than browser voice typing. If the AI voice is unavailable the app falls back to the phone's own speech recognition.
4. Tap Review

### Review + Safety check
- Every extracted field is editable; missing ones are highlighted **amber** with tap-to-fix.
- Missing critical checks appear as a gentle prompt: *"Please also check: BP, weight."*
- The safety engine fires with **plain-language reasons** and the **official source** of each rule.
- On RED: **Call 108**, **Call PHC**, **Create referral slip**.
- On save: family message is generated, spoken aloud and shareable via WhatsApp.

### People & Person detail
- **Add person** form: full name, type, date of birth (age is calculated), phone, address, and for pregnant women LMP (EDD calculated) and obstetric history **G P A**. Details can be edited later on the person page.
- Filter by: All · Pregnant · Newborns · Under 5 · Overdue
- Per-person timeline of visits, alerts, referrals, immunisations.

### Ask ASHA Didi
- Questions answered **only** from curated guideline snippets in `src/knowledge/*.md`
- Every answer shows its sources and ends with *"If in doubt, refer to the PHC."*
- Dose and medicine questions are politely refused.

### Monthly report
- Visits by type, red/amber counts, referrals completed, vaccines due vs given
- Incentive tracker (example values, labelled as such)
- **Export CSV** and **Print / PDF**

### Supervisor view
- One screen to check everyone recorded on the phone: RED / AMBER / overdue counts, a **Needs action** list (red alerts, open referrals, overdue routine visits) and the full register with DOB, age, phone, address, G P A and last visit.
- **Remind** opens WhatsApp with a ready reminder for that family.
- **Export all data (CSV)** and **Share summary on WhatsApp** for the ANM / supervisor.

### Settings
- Language, voice speed, demo mode, data export/backup, delete all data, privacy notice.

---

## Architecture

```
        ┌───────────────────┐
        │  Voice / typed    │
        └─────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  redact()        │  ← names, phones, IDs → tokens
         │  src/ai/redact   │    (map stays on-device)
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  /api/extract    │  ← Vercel serverless
         │  (LLM + Zod)     │    retry once on bad JSON
         └────────┬─────────┘
                  │ (restored locally)
                  ▼
    ┌─────────────────────────────────┐
    │  RULE ENGINE (browser)          │  ← ALWAYS runs, offline
    │  src/rules/engine.ts            │
    │  ─ 20+ danger sign rules        │
    │  ─ keyword fallback (te/hi/en)  │
    └────────┬────────────────────────┘
             │
             ▼
    RED / AMBER / GREEN  +  reasons  +  sources
             │
             ▼
    ┌──────────────────────┐
    │  PLANNER (browser)   │  ← ANC, HBNC, UIP, referrals
    │  src/planner         │
    └────────┬─────────────┘
             │
             ▼
    Today screen → "why is this first?"
             │
             ▼
    Family message (LLM) → TTS aloud → WhatsApp share
```

### Offline queue

When the ASHA is offline (or the network drops), the visit is read on the phone by a simple pattern-based **offline reader** (`src/rules/offlineExtract.ts`), so the rule engine can still raise RED alerts, and the screen shows an AMBER "AI could not read this visit" notice so the ASHA checks every field. The AI task is also written to an IndexedDB `queue` store, and the **OfflineBadge** shows how many tasks are waiting; the queue is retried when the browser fires the `online` event.

**Current limitation:** retried AI results are not yet merged back into the saved visit. The ASHA's confirmed record is what is stored.

**Crucially: the rules engine and the planner never touch the queue — they run entirely offline in the browser.**

---

## How AI is used (and why the rule engine is separate)

| Concern | Who handles it |
|---|---|
| Turn the ASHA's voice into text (Telugu / Hindi / English) | **Whisper speech AI** (`/api/transcribe`) |
| Understand spoken language and fill the record | **LLM** (`/api/extract`) |
| Map symptoms to a fixed vocabulary | **LLM**, guided by the system prompt + controlled vocab in `src/rules/vocabulary.ts` |
| Decide whether a symptom is a danger sign | **Deterministic rule engine** (`src/rules/engine.ts`) |
| Explain a danger sign in plain language | Rules carry the reason strings; the LLM is **not** required |
| Plan who to visit next | **Deterministic planner** (`src/planner/planner.ts`) |
| Write a warm family message | **LLM** (`/api/message`) |
| Answer guideline questions | **LLM + retrieval over curated snippets** (`/api/ask`) |

**Why the separation matters:** an LLM can hallucinate, run out of tokens, or be unreachable. If the safety alert depended on the LLM, a phone with no internet would silently miss a haemorrhage. It doesn't. The rule engine is a pure function over the extraction and person context; if the LLM is off, an offline pattern reader still extracts danger words and BP numbers in en/hi/te so the same rules can raise RED alerts, a keyword scan adds AMBER warnings, and the record is never shown as GREEN without the AI having read it.

---

## Evaluation results

Run: `npm run eval`

The script in `eval/run-eval.mjs` runs the **offline rule engine with the LLM switched off**, over 30 fictional transcripts in English, Hindi and Telugu (`eval/transcripts.json`). It uses a deliberately crude keyword extractor to represent the worst case, then measures how well the rules catch danger signs.

**Sample output** (regenerated on every run):

```
═══════════════════════════════════════════════════════════════
  ASHA Voice — Offline Rule Engine Evaluation (LLM OFF)
═══════════════════════════════════════════════════════════════

  Transcripts evaluated:   30
  Level accuracy:          100.0 %  (30/30)
  Danger sign recall:      100.0 %  (18/18 red alerts caught)
  False alarm rate:        0.0 %  (0/10 greens misclassified)
  Average latency:         < 1 ms per transcript
```

### Honest reading of these numbers

| Metric | What it means | Weakness |
|---|---|---|
| **Danger sign recall** | All 18 RED cases are caught with the LLM off. An earlier run missed one case (mild fever plus breast pain after delivery); we changed the rule so that **any fever after delivery is RED**, because it can be a sign of puerperal sepsis. | The test set is small (30 cases) and written by us, and the rules were adjusted while looking at it, so 100% here does not mean 100% in the field. Real-world recall will be lower. |
| **Level accuracy** | Most cases land on the right level. | Depends on the naive extractor finding the right keyword — real LLM extraction improves this a lot. |
| **False alarm rate** | No GREEN case in the test set was over-flagged. In the app, whenever the AI is unavailable the screen shows an AMBER "AI could not read this visit" notice, so an offline record is never shown as GREEN. | Over-alerting is a **deliberate design choice**: it's better for the ASHA to re-check a healthy mother than to miss a sick one. |
| **Latency** | The rule engine is essentially instant. | The LLM call adds 1–3 s in production. |

**The rule engine is a safety floor, not the primary extractor.** LLM extraction improves field accuracy substantially, but the safety check never depends on it.

---

## Privacy & safety design

### Privacy
- 🔒 **Records stay on the device** (IndexedDB). The app never sends records to a server it doesn't own.
- 🔒 **Redaction before AI**: `src/ai/redact.ts` replaces names, phone numbers and ID-like numbers with tokens (`[NAME_1]`, `[PHONE_1]`) before any request to `/api/extract` or `/api/message`. The map of tokens to real values **never leaves the browser**. The response is restored locally.
- 🎙️ **Voice note:** to turn speech into text, the audio recording is sent to the speech provider (Whisper on Groq, or Google when the browser's own voice typing is used). Redaction applies to the text before the language model reads it. In a real deployment this should run on a government-approved or on-device speech model.
- 🔒 The **API key lives only on the server** (Vercel env vars). It is never bundled into the frontend.
- 🔒 **No analytics, no tracking, no third-party cookies.**
- 🔒 **Demo data is 100 % fictional.**

### Safety
- 🚫 The LLM **never diagnoses** and **never prescribes**.
- 🚫 The **Ask Didi** endpoint refuses questions about doses, medicines and antibiotics, up front, with a hard regex.
- ✅ Every danger sign shows its **source** (MCP card, HBNC, IMNCI, NHM).
- ✅ Every AI field shows whether it has been **confirmed by the ASHA** before save.
- ✅ The rule engine runs **before** the family message, so if the network is down the alert is still shown.

---

## Run locally

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and add your LLM key
cp .env.example .env
# Edit .env and set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

# 3. Start the dev server
npm run dev
# → http://localhost:5173
```

> ⚠️ **In `npm run dev`, the `/api/*` routes do not run.** Vite serves the frontend only. To test the AI endpoints locally, use `vercel dev` (see below) or deploy to Vercel.

```bash
# Full local stack, including serverless functions:
npx vercel dev
```

### Tests

```bash
npm run test    # Vitest — unit tests for the rule engine
npm run eval    # Node — offline evaluation over 30 transcripts
npm run check:live -- https://your-app.vercel.app   # after deploy: test the real AI on 5 demo transcripts
```

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Then in the **Vercel dashboard** → your project → **Settings** → **Environment Variables**, add:

| Name | Value |
|---|---|
| `LLM_BASE_URL` | `https://api.featherless.ai/v1` (or any OpenAI-compatible endpoint) |
| `LLM_API_KEY` | your API key |
| `LLM_MODEL` | e.g. `meta-llama/Meta-Llama-3.1-8B-Instruct` |

Redeploy. Done.

---

## Environment variables

| Variable | Purpose | Where it lives |
|---|---|---|
| `LLM_BASE_URL` | OpenAI-compatible chat completions base URL | Server only |
| `LLM_API_KEY` | API key for the LLM provider | Server only |
| `LLM_MODEL` | Model name as the provider expects it (we use `openai/gpt-oss-120b` on Groq) | Server only |
| `STT_MODEL` | Optional. Speech-to-text model, default `whisper-large-v3` | Server only |

Never commit your real `.env`. The `.env.example` file has placeholders.

---

## Demo instructions

### For judges
1. Open the deployed app.
2. Tap **Load demo village** on the last onboarding slide.
3. Follow the flow in [Try it in 60 seconds](#try-it-in-60-seconds).
4. In the **Record a visit** screen, use the **Demo transcripts** dropdown. This works with the microphone blocked, and even in airplane mode.

### For the video
- The Telugu pre-eclampsia transcript is the hero moment. It produces a RED alert based on headache + blurred vision + BP 150/100.
- The newborn day-7 transcript produces a RED alert with "not feeding" + "fast breathing".
- The English normal-ANC transcript produces a GREEN alert, showing the app doesn't over-alert.

### Offline test
1. Load the demo village.
2. Turn on **Airplane mode**.
3. Record any visit — the app still works. The review screen shows a RED/AMBER/GREEN alert from the rule engine.
4. Notice the badge at the top: "🔒 Names removed before AI" and "N AI task(s) waiting for internet".
5. Turn airplane mode off. The badge drains the queue automatically.

---

## Limitations

- **Prototype, not a medical device.** The rule set is a starting point, not a validated clinical tool.
- **The rules are from official documents but should be re-verified** against the current MoHFW / NHM / IMNCI / UIP guidelines before any real deployment. Each rule carries its source string for exactly this reason.
- **Web Speech API** works best in Chrome on Android and desktop Chrome. iOS Safari support is partial. The type-in and demo transcript fallbacks exist because of this.
- **No supervisor dashboard yet.** It's in the design but not implemented.
- **The evaluation set is small** (30 transcripts). Real-world accuracy will be lower. The value of the harness is that it's runnable and repeatable — a real deployment would grow this set with ASHA input.
- **Only three languages** (te, hi, en). Adding a language means adding one `src/i18n/*.json` file and one entry in `src/i18n/index.ts`.
- **IndexedDB is per-browser.** No sync between devices in this version.

---

## Credits & sources

### Guideline sources (used in `src/rules/dangerSigns.ts` and `src/knowledge/*.md`)
- **MoHFW Mother and Child Protection (MCP) card** — ANC danger signs, BP thresholds, ANC visit schedule
- **Home Based Newborn Care (HBNC) guidelines** — newborn danger signs, HBNC visit days, postnatal mother danger signs
- **IMNCI chart booklet** — child under 5 general danger signs, fast breathing thresholds, severe dehydration
- **National Health Mission (NHM)** — ASHA role, referral follow-up
- **Universal Immunisation Programme (UIP)** — immunisation schedule

### Software
- React, Vite, Tailwind CSS, TypeScript
- `idb` (IndexedDB wrapper)
- `react-router-dom`, `react-i18next`, `i18next`
- `zod` (validation)
- `vite-plugin-pwa` (installable PWA)
- `vitest` (unit tests)

### Fonts
- **Inter** (Latin)
- **Noto Sans Telugu**, **Noto Sans Devanagari** — served from Google Fonts with `font-display: swap`

---

## AI usage disclosure

This is a student hackathon project, and we want to be fully transparent about how AI was used.

**AI coding assistants:** most of the code in this repository was generated with AI coding assistants (Claude) from a detailed written specification (problem, users, safety principles, features, data model and test plan). An AI code review was also used before submission; it found and fixed a safety bug (with the AI switched off, the offline path showed GREEN for a pre-eclampsia case), which led to the offline reader, the "AI could not read this visit" notice and the extra tests in `src/rules/offlineExtract.test.ts`.

**What I did myself:**
- Chose to build for ASHAs and set the requirements, especially the safety-first rule: the AI never diagnoses, and danger signs come from a separate rule engine.
- Ran, tested and debugged the app, including the demo transcripts in Telugu, Hindi and English and the offline mode.
- Deployed the app and recorded the demo video.
- Reviewed the code before committing, and I can explain how each part works.

**AI at runtime:** the deployed app calls an OpenAI-compatible chat endpoint (Featherless.ai / OpenAI / Gemini) for extraction, family messages and Ask ASHA Didi. The LLM is deliberately **not** in the safety path.

**Clinical content:** the danger-sign list and schedules are based on publicly available Government of India guidance (MCP card, HBNC, IMNCI, UIP). They have not been validated by a clinical body and must be checked against the current official documents before any real use.

---

## Statement

This project is a **prototype** created for a hackathon. It is **not a medical device**. It does not diagnose, treat, cure or prevent any disease. All medical decisions must be made by qualified health professionals following the current official guidelines of the Government of India.

If in doubt, refer to the PHC. 🏥

---

## License

MIT — see [LICENSE](./LICENSE).

---

**Built with 💚 for the 1.04 million ASHAs of India.**