# Project Telos — Hackathon pitch deck

*Slide-ready content for the submission deck, in the order of the prescribed template.
Each top-level section is one slide. The demo video script is in
[DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md).*

**Category:** Social Good · **Problem statement:** AI that transforms how content is
created, discovered, and experienced.

---

## 1. Brief about the idea

### A thumbnail is a promise. Project Telos checks that it is kept.

**The intention:** online video runs on a broken promise. Thumbnails win the click with
a feeling (panic, tears, shock) or an object (an explosion, a celebrity) that the video
never delivers. Viewers feel tricked, and the feed has already played it before they
could say no.

Project Telos fixes the promise from both sides, with Gemini doing the understanding:

- **Creator Studio (before publishing):** Gemini watches the video, reads the thumbnail,
  and lays out each promise beside its proof and a fix. It catches what keyword tools
  miss: **sentiment contradiction**, where the topic matches but the emotion is fake.
- **Viewer feed (before watching):** the viewer says what they are here for. Every video is
  understood against that intent *before* it is shown, and nothing plays until they choose.

**One line:** *Today's tools help you win the click. Project Telos helps you keep the promise.*

---

## 2. Opportunities

### How it is different

| Today | Project Telos |
|---|---|
| Thumbnail tools (A/B tests, click-through predictions) optimise the click | Checks whether the **video delivers** what the thumbnail promises |
| Clickbait detectors give a label or a score | Shows **Promise → Proof → Fix** per promise, with timestamps and a concrete edit |
| Content filters match keywords and topics | Detects **sentiment contradiction**: terror on the thumbnail, a calm tutorial inside |
| Feeds rank by watch history, dwell time, and trends, and autoplay | Feeds start from **declared intent** and check every video **before** it plays |

### How it solves the problem

- **For creators:** catch an oversold thumbnail before upload, see exactly which promise
  breaks, fix it, and recheck. Honest thumbnails protect the channel's trust.
- **For viewers:** attention is spent only on what they asked for. A bait-and-switch is
  paused one second before the switch, with a clean summary or a skip instead.

### Unique value

**Promise → Proof → Fix**, grounded in multimodal Gemini analysis of the actual video, with
the emotional promise measured as an *emotion gap*, then closed with a before/after recheck.

---

## 3. Features

**Creator Studio**

- **Three ways to check:** upload a draft (thumbnail + video or transcript), paste a public
  YouTube link or Short, or open a reviewed example with no upload.
- **Promise → Proof → Fix table:** one row per promise: what the thumbnail promises, what the
  video shows (with a timestamp that jumps the player), and a concrete fix or "✓ Promise kept".
- **Sentiment contradiction:** what viewers will expect vs. what the video delivers, each
  rated 0–100 for emotional intensity, shown as an emotion gap.
- **Ghost entities and visual exaggeration:** objects on the thumbnail that never appear;
  fake arrows, circles, and explosions.
- **Fix and recheck:** a suggested honest title, an optional **Imagen** honest-thumbnail
  suggestion, and a before/after banner listing what changed ("Removed what the video never
  showed: supercar, fire · Mood now matches: panic → upbeat").
- **Recent checks** saved in Firestore, so a creator can compare revisions.

**Viewer feed**

- **Declare intent:** a goal, topics, and boundaries, turned into an editable profile.
- **Understand before you watch:** each video shows its verdict first ("Matches your intent",
  "Stops at 0:13", "Filtered"); no player loads until the viewer presses Watch.
- **Bait-and-switch hold:** paused one second before the switch, with what was hidden and why,
  and a choice: read a clean summary or skip.
- **Live YouTube:** search from declared interests; Gemini analyses a chosen video before
  any player loads.
- **Session receipt:** what was allowed, held, and summarised.

---

## 4. Process flow

```text
CREATOR                                     VIEWER
Thumbnail + title + video / YouTube link    Goal + topics + boundaries
            |                                          |
     Gemini: two parallel scans               Editable intent profile
   (entities & visuals | sentiment)                    |
            |                               Each video understood first
   Promise → Proof → Fix + emotion gap                 |
            |                               +----------+-----------+
  Suggested title / Imagen thumbnail        |          |           |
            |                            Matches   Bait switch  Off-topic
     Revise → recheck                    Watch?    Pause 0:13   Filtered
            |                                      Summary/Skip  Skip
   Before → after: what changed                        |
                                                 Session receipt
```

---

## 5. Wireframes

```text
CREATOR STUDIO RESULT
+-------------------------------------------------------------+
| (100) Strong mismatch: review before publishing              |
| Promise → Proof → Fix                     1 of 3 kept        |
|  A burning supercar | Only a hatchback  | Show the hatchback |
|  Something exploded | No fire at all    | Remove the flames  |
|  A car wash         | Whole video       | ✓ Promise kept     |
| Viewers will expect: Panic 95  ≠  Video delivers: Calm 15    |
| Next step: suggested title · [Revise and recheck]            |
+-------------------------------------------------------------+

VIEWER FEED
+--------------------------------------+
| ✓ Checked before you watch           |
| The first 0:13 fits your intent      |
| [Watch the first 0:13]               |
+--------------------------------------+
| ⏸ Paused at 0:13                     |
| It promised diy. From 0:14: incident |
| [Get the clean summary] [Skip]       |
+--------------------------------------+
```

*Replace with screenshots from the deployed prototype (see slide 9).*

---

## 6. Architecture

```text
React + TypeScript (Vite)
        |  REST / JSON
        v
FastAPI on Cloud Run (one container serves the API and the web app)
  |-- Gemini on Vertex AI: thumbnail + video/YouTube analysis (structured JSON output),
  |     intent parsing, clean summaries
  |-- Imagen: honest-thumbnail suggestion
  |-- YouTube Data API v3: search by declared interests, official metadata
  |-- Firestore (Firebase): profiles, sessions, receipts, analyses, creator check history
  |-- Optional: BigQuery verdict analytics, Cloud Translation for non-English drafts
        ^
GitHub push -> Cloud Build -> Artifact Registry -> Cloud Run (continuous deployment)
```

**How Gemini is used, not just called:**

- **Two focused scans run in parallel**, with JSON-schema output at temperature 0.1: one for
  ghost entities, visual exaggeration, and per-promise evidence; one for sentiment and
  thematic contradiction. Two reference examples (one misleading, one honest) calibrate both.
- **Gemini watches the actual video:** an uploaded draft, or a public YouTube URL passed
  directly, optionally limited to the opening minutes.
- **Guardrails:** strict schema validation with one retry; untrusted text is treated as
  data, not instructions; insufficient evidence returns "unverified", never a guessed score;
  timestamps that are not in the evidence are dropped, never invented.

**Open for judging, safe by design.** The prototype needs no access code. Gemini runs on Vertex AI
under the service's own identity, so there is no Gemini key to leak; other secrets live in Secret
Manager. Each visitor is rate limited on every request that can call Gemini, Imagen, or YouTube;
Cloud Run is capped at 3 instances; and a monthly billing budget alerts at 50%, 90%, and 100%.
Nothing reaches Gemini without the user's consent, and uploaded files are not stored.

---

## 7. Technologies

| Layer | Technology | Role |
|---|---|---|
| Generative AI | **Gemini** (Vertex AI) | Multimodal thumbnail and video analysis, intent parsing, summaries |
| Image generation | **Imagen** | Honest replacement-thumbnail suggestions |
| Hosting | **Cloud Run** + Cloud Build | One container for API and web app; deploys on every push |
| Database | **Firestore** (Firebase) | Profiles, sessions, receipts, analyses, creator check history |
| Discovery | YouTube Data API v3 | Interest-based search and official metadata |
| Web | React, TypeScript, Vite, Tailwind CSS | Creator Studio and viewer feed |
| API | Python, FastAPI, Pydantic | Validation, scoring, policy, storage |
| Optional | BigQuery, Cloud Translation | Analytics, multilingual drafts |

---

## 8. Estimated implementation cost

- **Prototype:** runs on Cloud Run's request-based billing; the main variable cost is Gemini
  calls (two per creator check).
- **Scaling:** stateless containers scale horizontally; Firestore stores only short summaries,
  never uploaded files.
- *Measure cost per check on real traffic before quoting a monthly figure; set billing alerts
  and Gemini quotas first.*

---

## 9. Snapshots

Capture from the deployed prototype, in this order:

1. Creator Studio hero: "Does your thumbnail keep its promise?" with the "vs" comparison.
2. The sentiment contradiction explainer (panic 95 ≠ calm 15).
3. Promise → Proof → Fix table on a flagged result.
4. The before/after banner with "what changed".
5. Viewer intent page: today's algorithm feed vs. Project Telos.
6. A paused bait-and-switch with the summary and skip choices.

`[Insert screenshots]`

---

## 10. Prototype performance

Measured on the deployed configuration with the test drafts in
[demo-drafts](demo-drafts/README.md) (live Gemini, transcript as evidence):

| Draft | Mismatch score | Promise → Proof → Fix | Emotion gap |
|---|---|---|---|
| "KITCHEN ON FIRE?!" thumbnail on a calm recipe | **100**, strong mismatch | Fire flagged with a fix; recipe ✓ kept | 85 vs 10 |
| Honest "One-pan spaghetti & meatballs" thumbnail | **0**, matches | All 3 promises ✓ kept | 10 vs 10 |

- **Controlled viewer demo:** the bait switch happens at 0:14; playback pauses at 0:13.
- **Reliability work found by live testing:** malformed timestamps no longer discard a
  verdict; transcript times misread as plain seconds (2:22 as 222) are now converted or dropped.
- **Not yet measured:** accuracy on a labelled benchmark, latency at scale, and user studies.
  The score is a review signal, not a probability or proof of intent.

---

## 11. Future development

- **Benchmark** against a labelled set of honest and misleading thumbnails (prior work such
  as ThumbnailTruth, arXiv:2509.04714, shows multimodal fusion helps) and publish
  false-positive rates.
- **Platform integration:** a pre-publish check in upload flows; creator trend history.
- **Viewer protection beyond the demo:** a browser extension that applies declared intent
  to real feeds.
- **Languages and regions:** Cloud Translation is wired in; evaluate per language.

**Links**

- Deployed prototype: <https://project-telos-hget6gf4qq-ue.a.run.app>
- Repository: <https://github.com/KotanaSai21/project-telos>
- Demo video: `[Add public video URL]`

---

## 12. Brief description (submission form)

> **Project Telos** checks that a video keeps the promise its thumbnail makes. In
> **Creator Studio**, **Gemini** (on Vertex AI) watches the draft or published video, reads the
> thumbnail, and returns a **Promise → Proof → Fix** table: each promise, the evidence for it
> with timestamps, and a concrete fix. It also measures **sentiment contradiction**, where the
> topic matches but the emotion is fake. Creators revise, optionally get an honest
> **Imagen** thumbnail, and recheck to see what changed. In the **viewer feed**, people declare
> what they want, and every video is understood before it plays; a bait-and-switch is paused
> before the switch. The app runs as one container on **Cloud Run**, deployed from GitHub
> through Cloud Build. **Firebase** comes in through **Cloud Firestore**, which stores profiles,
> sessions, analyses, and each creator's check history so revisions can be compared.
