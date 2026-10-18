# Project Telos

### A thumbnail is a promise. Project Telos checks that the video keeps it.

Built for the AI Builder Cup. Project Telos helps creators earn trust and helps viewers avoid clickbait.

- **Live demo:** <https://project-telos-hget6gf4qq-ue.a.run.app> (open for judging, no access code)
- **Demo video (2:39):** <https://www.youtube.com/watch?v=b8YuM-SNoJo>
- **Pitch deck (PDF):** [Project Telos - AI Builder Cup.pdf](docs/Project%20Telos%20-%20AI%20Builder%20Cup.pdf)

## Why it exists

- **For creators:** thumbnail tools today help you win the click. They score the thumbnail, not whether the
  video delivers it. When a thumbnail oversells (a fake explosion, staged panic, an object that never
  appears), viewers feel tricked and stop trusting the channel.
- **For viewers:** Reels, Shorts, and feeds start playing before you decide, chosen by watch history and
  dwell time. You can only swipe away after you have already seen it.

## What it does

**Creator Studio (before you publish).** Gemini on Vertex AI compares the thumbnail with the draft or
published video, checking both what it shows and the emotion it promises. Each result reads
**Promise → Proof → Fix**: what the thumbnail promised, the evidence in the video with timestamps, and a
concrete fix. Creators revise and recheck to see what changed, and Imagen can suggest an honest thumbnail.
It works on a draft upload (thumbnail plus video or transcript) or any public YouTube link.

**Viewer feed (before you watch).** Viewers declare what they are here for in their own words. Every
video is checked against that intent before playback: off-topic content is filtered, and a
bait-and-switch is paused before the switch. Viewers choose to watch, read a clean summary, or skip.

## What is unique

1. **Sentiment contradiction.** It catches a fake emotion even when the topic matches, which keyword
   filters miss.
2. **Promise → Proof → Fix.** Evidence with timestamps and a concrete fix, not just a score.
3. **Checked before it plays.** It stops before the unwanted part, instead of filtering after you have
   seen it.

## Built on Google Cloud

| Service | Role |
| --- | --- |
| Gemini on Vertex AI | Thumbnail and video analysis (two parallel scans with structured output), intent parsing, clean summaries |
| Imagen | Honest replacement-thumbnail suggestions |
| Cloud Run | Hosts the web app and API as one container, deployed from GitHub through Cloud Build |
| Cloud Firestore | Viewer profiles, sessions, analyses, and each creator's check history |
| YouTube Data API | Interest-based discovery and official video metadata |

## Open for judging, safe by design

The deployed site needs no access code. Its first screen explains the safeguards:

- **Every visitor is rate limited:** 30 requests a minute that can call Gemini, Imagen, or YouTube.
- **No Gemini key to leak:** Gemini runs on Vertex AI under the service's own identity; other secrets
  live in Secret Manager.
- **Spend is capped:** at most 3 Cloud Run instances, plus a monthly billing budget alert.
- **Consent before any AI call,** and uploaded files are not stored.
- **Content is data, not instructions:** thumbnail text, titles, and transcripts are treated as evidence,
  never as commands to the model.

An optional access code can still lock the site; see [Deployment](docs/DEPLOYMENT.md#optional-access-code).

## Quick start

The offline demo needs no credentials. Prerequisites: Node.js 20+ and Python
3.11+. Open a terminal in the cloned repository root (the folder containing
this README and `package.json`).

### Install

```powershell
Copy-Item .env.example .env
npm install
npm run build
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "services/api[dev]"
```

### Run locally

Start the API in one terminal:

```powershell
.\.venv\Scripts\uvicorn.exe project_telos_api.main:create_app --factory --reload --app-dir services\api\src
```

Start the web app in another terminal:

```powershell
npm run dev
```

Open <http://localhost:5173>. The API is at <http://localhost:8000> and its
interactive docs are at <http://localhost:8000/docs>. The Vite dev server
proxies `/api` to the local API.

### Try the demo

1. The first screen lists the safeguards; select **Enter Project Telos**. Creator Studio opens.
   Choose a reviewed example or check a draft. Draft checks need a thumbnail, title, and either a video or transcript.
2. Switch to **Viewer feed**, choose a goal, edit topics and boundaries, and confirm
   the interpreted profile. The default aviation/cooking/DIY topics show the full
   controlled story. Aviation-only intent filters the unrelated clips at the start.
3. Explore the controlled feed. At the bait moment, inspect the hold, evidence,
   and reframe. Complete the four pushes and inspect the receipt.
4. In the live YouTube section, search needs a configured YouTube Data API key.
   Pasted public links and sample links can be added as candidates without one.
   Analysis needs explicit consent and a configured Gemini provider.

Detailed bait diagnosis stays in Creator Studio. The viewer gets topic-match,
filtered, or held states instead. Goals are saved separately from the shared
consent profile, and topic matching is a simple phrase check, not learned ranking.

## Verify changes

From the repository root:

```powershell
npm test
npm run build
.\.venv\Scripts\python.exe -m pytest services\api\tests jobs\precompute\tests -q
```

## Documentation

- [Deployment and Google integrations](docs/DEPLOYMENT.md) — one-service
  Cloud Run deployment, continuous deployment from GitHub, secrets, optional Google
  services, verification, rollback.
- [Architecture and development reference](docs/ARCHITECTURE.md) — repository
  map, policy, media pipeline, tests, and limitations.
- [Prototype blueprint](docs/PROJECT_TELOS_PROTOTYPE_IDEA.md) — product scope,
  acceptance criteria, demo narrative, and research notes.
- [Pitch deck (PDF)](docs/Project%20Telos%20-%20AI%20Builder%20Cup.pdf), its [slide content](docs/Submission.md), and the [demo video outline](docs/DEMO_VIDEO_SCRIPT.md).
- [Hackathon problem statement](docs/Problem%20Statement.md).

## Project name

*Telos* is Greek for purpose: the end a thing is for. Project Telos makes a
feed's purpose the viewer's declared intent and holds creators to the promise
their thumbnail makes.
