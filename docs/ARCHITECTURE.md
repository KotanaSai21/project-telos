# Architecture and development reference

## Repository map

| Path | Responsibility |
| --- | --- |
| `packages/contracts/` | Shared JSON Schemas and generated TypeScript types |
| `services/api/` | FastAPI configuration, providers, policy, routes, persistence |
| `apps/web/` | React UI: creator check, intent, feed, evidence, and receipt |
| `jobs/precompute/` | Offline segment-map generation and evaluation |
| `corpus/` | Reviewed profiles, fixtures, and synthetic media |
| `docs/` | Product scope, deployment, and engineering documentation |

## System design

```text
Web app → API → understanding → profile reasoning → experience transformation
                     ├─ Gemini (optional)
                     └─ reviewed fixture data (offline)
```

Key design choices:

1. **Precompute-first:** segment maps are generated offline and keyed by content
   hash; the demo does not depend on a live model call.
2. **Hold before reveal:** the controlled experience does not render through a
   flagged segment before applying its decision.
3. **Rules first:** deterministic policy handles clear cases; the model is used
   only for contextual understanding when configured.
4. **Separate understanding from decision:** segment maps do not contain user
   data; policy decisions are profile-specific.
5. **Treat media text as untrusted:** captions and model inputs are not merged
   into system instructions.

`packages/contracts/schemas/` is the source of truth for shared API concepts.
TypeScript types are generated with `npm run generate:types`, and the Python API
validates against the same schemas.

## Policy and action ladder

```text
allow → soften → summarize → reframe → replace → hold → quarantine
```

The policy engine is a pure function with no I/O or model calls. It evaluates
rules in a fixed order: quarantine suspected non-consensual synthetic imagery;
admit content under the declared threshold; allow a declared context to rescue
otherwise overbroad filtering; select an action based on affected scope; and
require a deliberate tap for a bait pattern.

A Project Telos decision governs an individual viewer's experience. It is not a
legal determination about the content or its creator.

Viewer topic relevance is a separate deterministic topic-phrase check, not part
of the safety `Decision` contract. Off-topic demo items hold at the start;
matching items retain their reviewed safety/mismatch stop times. Live audits
with no observed topics remain unverified when interests were declared.
Goals and editable declarations live in `viewer_preferences`, removed with the
profile, so the shared `ConsentProfile` schema remains unchanged.

The creator UI exposes evidence and revision tools. Viewer surfaces display only
simple matching/filtered/held states; internal bait metrics are not viewer-facing.
Creator revisions require new consent and an actual model call to get a new score.

Viewer steps include Back navigation from review, experience, and receipt.
Returning to review preserves the current feed session; resuming does not push
another item or reset progress. Submitting a revised declaration starts a new session.

## Demo corpus and media pipeline

`corpus/media/` contains locally generated synthetic color-block videos with
scripted cuts; no real explicit media is used. Ground-truth cut times let the
precompute job measure detection accuracy.

```powershell
.\.venv\Scripts\python.exe -m pip install -e "jobs/precompute[dev]"
.\.venv\Scripts\python.exe -m project_telos_precompute.cli all
```

The pipeline probes video metadata, detects shots with OpenCV histogram
differences, samples keyframes, labels them with Gemini or an offline palette
labeller, merges adjacent identical segments, and hashes the source file.
Shot detection finds hard cuts, not slow fades; periodic sampling helps cover
gradual transitions.

## Development and tests

From the repository root:

```powershell
npm test
npm run build
.\.venv\Scripts\python.exe -m pytest services\api\tests jobs\precompute\tests -q
```

The API's interactive schema is at `/docs` while running locally.

## Security and known limitations

- Never commit `.env` or API keys. Keys use secret types and are not intended to
  appear in logs.
- Treat media and captions as untrusted input.
- The prototype has no user accounts. The open site relies on a per-visitor rate limit on
  model-backed requests, capped Cloud Run instances, and a billing budget alert; an optional shared
  access code can lock it. Add real authentication and per-user quotas before a public launch.
- YouTube search filters candidates, but is not proof of safety. External YouTube
  playback is not frame-gated.
- Offline mode uses reviewed fixtures; it must not be described as live model
  analysis.
- See the [prototype blueprint](PROJECT_TELOS_PROTOTYPE_IDEA.md) for scope,
  acceptance criteria, and evaluation caveats.
