# Project Telos

### Your attention, on your terms.

Project Telos is a hackathon prototype for feeds that respect declared intent
and thumbnails that keep their promise. Declare what you want, review the
profile, see a controlled feed catch a bait-and-switch, and inspect the receipt.
The creator check reviews a draft thumbnail against its title and video.

```text
Declare → Understand → Detect bait → Hold → Reframe → Receipt
```

## What this prototype does

- Opens on **Creator Studio**: review offline examples, check a draft upload, or
  check a published YouTube video. Flagged results can request an Imagen
  thumbnail suggestion when configured. Revise and explicitly recheck a new
  title/thumbnail; no improved score is assumed.
- Includes a **Viewer feed**: a four-item controlled demo and live YouTube
  discovery are shown in the same experience after intent is declared.
- Uses local fixtures by default. Live Gemini and YouTube features require
  configuration. The live YouTube player is not frame-gated.

See the [prototype blueprint](docs/PROJECT_TELOS_PROTOTYPE_IDEA.md) for scope,
acceptance criteria, research positioning, and evaluation caveats.

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

1. The landing page is Creator Studio. Choose a reviewed example or check a
   draft. Draft checks need a thumbnail, title, and either a video or transcript.
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
  Cloud Run deployment, secrets, optional Google services, verification, rollback.
- [Architecture and development reference](docs/ARCHITECTURE.md) — repository
  map, policy, media pipeline, tests, and limitations.
- [Prototype blueprint](docs/PROJECT_TELOS_PROTOTYPE_IDEA.md) — product scope,
  acceptance criteria, demo narrative, and research notes.
- [Hackathon problem statement](docs/Problem%20Statement.md).

## Project name

*Telos* is Greek for purpose: the end a thing is for. Project Telos makes a
feed's purpose the viewer's declared intent and holds creators to the promise
their thumbnail makes.
