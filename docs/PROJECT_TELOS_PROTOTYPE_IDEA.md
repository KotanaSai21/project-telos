# Project Telos: Intent-First Content & Bait Detection

**Track:** Media, Content & Digital Experiences

**Hackathon scope:** Phase 0, plus bounded official YouTube discovery and selected-video auditing

**Project name:** Project Telos. Package names, Python modules, environment variables,
documentation filenames, and submission assets use the same name.

## 1. One-line pitch

**A thumbnail is a promise. Project Telos checks the promise before your attention pays for it.**

Project Telos is an intent-first content experience: declare your boundaries, inspect
incoming content, intercept bait-and-switch presentation, request a clean reframe,
and see what happened in a Content Receipt.

The differentiator is **creator accountability through visible promise/body
mismatch**, not another generic harmful-content filter.

## 2. The problem: the bait-and-switch accountability gap

Attention-oriented feeds can reward an innocent thumbnail or misleading hook
even when the actual video delivers something different. An initial click or
dwell does not prove that the viewer wanted the eventual experience.

Project Telos exposes the mismatch with a **Bait Index** and prevents the mismatched
segment from continuing in its controlled demo. It withholds the engagement
opportunity rather than silently counting a baited view as satisfaction.

For Phase 0, this is a per-item transparency signal. It is **not proof that a
creator intentionally lied**, a legal judgment, a platform penalty system, or
an established measure of how often a creator deceives viewers. Aggregated
creator histories, appeals, and platform enforcement are later work.

## 3. Locked MVP: two distinct experiences, one shared analysis capability

The product has two separate user experiences. **Creator Studio is the primary
landing screen**: creators check whether a thumbnail/title promise matches the
video and receive an evidence-based explanation and improvement suggestion.
**Viewer Feed is a separate mode**: viewers declare what they want, and the feed
is filtered to fit that intent. The viewer does not see the creator-facing bait
diagnosis. Both experiences can use Google's video and generative AI services,
but apply different inputs, policies, and outputs.

Creator loop: **Add draft -> analyze promise vs. video -> inspect evidence -> improve and recheck.**

Viewer loop: **Declare intent -> review preferences -> filter feed -> inspect session receipt.**

### In scope

- A responsive Creator Studio as the default screen, with a separate Viewer Feed
  mode and clear navigation between them.
- Creator journey: provide a thumbnail and title plus video evidence, inspect the
  promised subject against the video's topics/timeline, and get a constructive
  thumbnail/title improvement suggestion.
- Viewer journey: declare intent, review the interpreted profile, experience
  the paired Before / Project Telos feeds, and finish with a session receipt.
- The same item, title, hook, order, and initial playhead on both sides.
- A scrollable protected feed with optional Before/Project Telos comparison. Visible cards
  play; off-screen cards pause. Scroll-triggered loading and accessible next-item
  controls apply the same profile to each item. Skips leave unresolved outcomes pending.
- A short, editable viewer intent profile with a goal, topics, and boundaries.
  Example: **"I'm here to learn about aviation. Keep it clean; avoid graphic content."**
- Viewer setup asks **"What are you here for?"** rather than asking for a broad
  theme. Initial goals: learn, be entertained, get inspired, or stay informed.
  Topics and boundaries refine the goal; format and tone are optional future refinements.
- Three harmless, reviewed fixtures. Four pushes reuse one safe fixture.
- An allowed educational/cooking item, a bait trap at **0:14**, and a protected
  playhead held at **0:13** when its promised DIY topic matches the selected topics.
- Creator-facing promise/content observations and available timestamps. The viewer
  does not display bait scores or detailed creator diagnosis.
- **Summarize & Reframe**, replacing the trap with grounded text and a neutral
  illustration.
- A designed receipt screen computed from persisted session items and actual reported holds.
- Explicit provider, analysis, playback, and persistence labels. Creator-facing
  bait evidence stays in Creator Studio; Viewer Feed uses intent matching and
  simple filtered/allowed states.
- An official YouTube search from declared positive interests, followed by an
  explicitly approved Gemini audit of one selected short public video.
- YouTube discovery is an optional branch in the experience step, so the
  controlled fixture story remains the default judge-facing path.
- A simple topic/boundary result and optional user-loaded YouTube embed, clearly separate
  from the controlled playback interception demo.
- Visible errors and retryable holds. A failed model call never becomes a
  fixture answer labelled as live AI.

### Out of scope, not stretch goals

No browser extension, real-platform interception, arbitrary (non-YouTube) URL ingestion,
multi-product dashboard, creator canvas, behavioral learning, goal-ranking engine,
knowledge graph, branching stories, misinformation verification, C2PA exports,
Veo generation, voice interface, BI dashboard UI, or authentication suite.
Features outside this scope are not included in the application or API.

## 4. What is implemented versus planned

| Surface | Current prototype | Requirement before claiming more |
| --- | --- | --- |
| Intent | Existing schema-validated profile API; offline phrase matching or configured Gemini | Demonstrate an actual Gemini request when making live-AI claims |
| Understanding | Reviewed fixture timelines; selected YouTube audit sends actual title, thumbnail bytes, and public URL to Gemini | Demonstrate live execution and evaluate accuracy on permissioned media |
| Bait Index | Deterministic promise/body topic mismatch, separate from safety intensity | Validate tagging and scoring on a held-out benchmark |
| Playback | Two synthetic playheads; protected side stops at 0:13 | Verify decoded video, seeking, buffering, background-tab behavior, and audio |
| Reframe | Reviewed source summary offline; grounded Gemini summary when configured | Evaluate live output factuality and boundary compliance |
| Illustration | Local neutral abstract SVG | Do not describe it as Imagen or generated video |
| Receipt | Idempotent item identities in local JSON or Firestore (`PROJECT_TELOS_STORAGE`) | Identity and access controls |
| Hosting | One Cloud Run container (Dockerfile) serving API + web | Show a reachable, verified deployment URL |
| Creator redesign | Imagen honest-thumbnail suggestion that avoids ghost entities | Billing-enabled key; evaluate suggestions with creators |
| Analytics | Content-free verdict rows streamed to BigQuery | Dashboards only once there is real traffic |
| Languages | Cloud Translation v3 for non-English creator drafts | Evaluate regional accuracy per language |
| YouTube discovery | Official Data API search by declared interests (strict SafeSearch, short videos, five candidates) plus pasted public links and sample chips via oEmbed, shown beside the demo videos | Configure server-side API access; search results are not safety verdicts |
| YouTube playback | Optional privacy-enhanced embed after analysis and an explicit click | No verified frame/audio gating; held or unverified items require explicit override |

**The simulation proves the controlled policy loop, not zero exposure on a real
video player.** The controlled fixture demo requires no real graphic material.
Separately chosen external YouTube playback may contain unwanted material and is
not covered by that simulation guarantee.

## 5. Judge-facing user journeys

### Primary: Creator Studio

1. **Add a draft.** Start in Creator Studio and load the reviewed sample or a
   supported video/thumbnail submission.
2. **Analyze the promise.** Show the thumbnail/title promise beside the topics
   and timeline evidence found in the video. Distinguish reviewed fixture results
   from live Gemini analysis.
3. **Explain and improve.** Identify the mismatch and timestamp, show the Bait
   pattern with its limitations, and suggest an honest thumbnail/title revision.
   The creator UI uses the fused **mismatch risk** score, not the separate
   deterministic fixture Bait Index. Show timestamps only when available in the
   supplied evidence; reviewed text-only samples do not invent timestamps.
   Let the creator revise the title/thumbnail and approve a fresh live check.

### Separate mode: Viewer Feed

1. **Declare.** Choose a goal such as learning, entertainment, inspiration, or
   staying informed; add topics and boundaries.
2. **Review.** Show the interpreted intent before starting the feed. Explain
   that intent matching and safety boundaries are separate decisions.
3. **Allow and filter.** A relevant aviation lesson appears on both sides. The
   Project Telos side shows a simple match status. An unrelated or boundary-
   violating item is filtered or held according to the viewer's profile.
4. **Show the controlled demo.** For **Easy Weekend DIY**, the Before simulation
   continues into a harmless incident placeholder while Project Telos holds at
   0:13, one second before the reviewed mismatch at 0:14.
5. **Explain the choice.** The viewer gets a concise status such as **"Filtered
   from your feed"**; the detailed promise/body bait diagnosis remains in Creator
   Studio.
6. **Act and recap.** The viewer may request **Summarize & Reframe** for a held
   item. The session receipt reports actual pushes and outcomes.

For the full four-item demonstration, the default topics are **aviation, cooking,
and DIY** with graphic-content boundaries. Selecting only aviation intentionally
filters cooking and DIY at 0:00 instead of playing the DIY preview until 0:13.
These are deterministic, case-insensitive topic-phrase matches, not semantic
recommendations. Empty topics mean unrestricted topics. Missing observed topics
in a live audit remain unverified.

Viewer goals (learn, entertainment, inspiration, informed) and the editable
declaration are persisted in `viewer_preferences` alongside the profile.
`ConsentProfile` remains unchanged; its canonical `interests` are the explicitly
entered topics. Goals describe the session, not a new learned ranking model.

The four-item receipt values documented below describe the exact completed
Viewer Feed fixture session, **not hardcoded counters**. Before the trap's hold
is recorded, it remains pending. Retries reuse the same item ID and do not
inflate the totals.

## 6. Bait Index: simple, inspectable, and honest

Each fixture has independently reviewed:

- `promiseTopics`: the thumbnail/title/hook's advertised subject.
- Timeline segments with `topics`, safety category, intensity, and start/end times.
- Approved source text for the reframe.

For each segment:

```text
mismatch = count(body topics not in promise topics) / count(body topics)
Bait Index = round(100 * maximum segment mismatch)
mismatch share = total mismatched seconds / full duration
```

Use a **50/100** threshold in the controlled demo. Hold one second before the
first mismatched segment. Safety policy can also hold an item without bait.
The index does not depend on the user's boundaries: content mismatch and
personal consent are distinct inputs.

The DIY fixture scores 100 because its incident segment has no promised topic.
Seven of its 28 seconds mismatch: **25% timeline share**. Neither figure means
"100% probability of lying." Honest topic drift, broad promises, inaccurate tags,
and missing modality evidence are known limitations of this simple metric.

Do not substitute an intensity jump for thumbnail/body mismatch. A clearly
advertised serious documentary can change intensity without being clickbait.

### Receipt definitions

- **Items pushed:** distinct session item IDs saved after analysis succeeds.
- **Bait traps neutralized:** items scoring at least 50 whose simulated hold
  was reported, including those subsequently reframed. Count each item once.
- **Consent rate:** completed policy-compliant demo outcomes (allowed, held,
  or reframed) / items pushed. Empty sessions show N/A; pending holds do not
  count as completed.
- **Reframed:** successful user-requested summary outcomes.

This narrowly defined consent rate is **not audience approval, measured
exposure safety, or the share of viewers endorsing a creator**.

## 7. Minimal architecture and Google technology mapping

### Consent-driven YouTube branch

```text
Consent -> structured positive interests
        -> YouTube Data API v3 search (five short candidates)
        -> user chooses a video and approves Google analysis
        -> refreshed official title/status/duration + thumbnail bytes + public URL
        -> Gemini Developer API structured multimodal audit
        -> validated evidence + deterministic personal boundary policy
        -> simple intent-match/held status and clean summary
        -> optional explicit YouTube embed (NOT protected playback)
```

- The search query uses positive interests only; no boundary reasons or browsing
  history are sent to YouTube. Consent Studio discloses this automatic search.
- Results are text-only until analysis and explicit playback; thumbnails/players
  are not automatically loaded into the viewer's browser.
- `safeSearch=strict` improves candidate selection but is not a safety guarantee.
- Gemini receives the actual JPEG thumbnail, official title/metadata, and canonical
  public YouTube URL. It does not receive the viewer's boundary reasons in this audit.
- Analysis requires its own affirmative approval. It supports public, embeddable,
  non-live videos up to four minutes. Project Telos does not download video or scrape captions.
- Validate the returned schema, timestamp bounds, and complete safety timeline.
  Inaccessible media or insufficient evidence yields an unverified result, not allow.
- Internally compute a **Gemini bait estimate**: 0-20 low, 21-60 moderate, 61-100
  high mismatch. Do not display this creator-facing diagnosis in Viewer Feed.
  High mismatch, unrelated topics, or a non-allow boundary decision recommends
  hold; missing topic evidence is unverified when interests were declared.
- External playback requires a separate click. Held/unverified content additionally
  requires a deliberate override. No autoplay or claim of frame-perfect interception.
- Save audits in the configured local or Firestore store by profile/video. Keep them separate from the four-item
  demo receipt: an analysis is not a neutralized playback trap.
- The public-URL branch uses the **Gemini Developer API**. Vertex AI direct YouTube
  input is not enabled here; do not claim that switching provider makes it equivalent.

```text
React / TypeScript / Tailwind
          |
       REST / JSON
          |
FastAPI on Google Cloud Run (one container, also serves the web app)
          |
          +-- Gemini API / Vertex AI: profile parsing and grounded summaries
          +-- YouTube Data API: consent-interest discovery and official metadata
          +-- Gemini Developer API: selected public-video + thumbnail audit
          +-- Reviewed fixture topics + deterministic bait/safety policy
          +-- Imagen: honest thumbnail redesign; Cloud Translation: non-English drafts
          +-- Local JSON or Firestore persistence; BigQuery verdict analytics
          +-- Synthetic scenes now -> Cloud Storage permissioned media later
```

| Google technology | Bounded responsibility | Status / why it matters |
| --- | --- | --- |
| Gemini API / Vertex AI | Parse intent and generate grounded clean summaries | Existing configurable provider; live execution must be demonstrated |
| YouTube Data API v3 | Search from declared interests, retrieve official video metadata | Server-side YOUTUBE_API_KEY; no fabricated results when unavailable |
| Gemini Developer API | Audit a selected public URL against actual thumbnail/title with timestamped evidence | Requires live Gemini configuration and SDK; separate from Vertex public-URL support |
| Cloud Run | Host the API and compiled frontend in one container | Dockerfile + deployment guide; claim it only with a live URL |
| Firestore | Profiles, sessions, receipts, analyses | Opt-in with `PROJECT_TELOS_STORAGE=firestore`; local JSON remains the default |
| BigQuery | Content-free verdict trends (band, score, region, language) | Opt-in; failures never fail a request |
| Cloud Translation v3 | Translate non-English ThumbnailTruth drafts before scanning | Opt-in; originals still sent to Gemini |
| Imagen | Generate an honest replacement thumbnail | Needs a billing-enabled key; SynthID-watermarked |
| Cloud Storage | Permissioned fixture videos, metadata, and thumbnail assets | Planned media registry; current UI uses synthetic scenes |

Do not add more services merely to fill a technology checklist. No claim of
multimodal AI performance follows from manually reviewed fixture timelines.

### API contract for the new flow

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Accurate active provider status |
| `POST /profiles` | Existing strict consent profile extraction and persistence |
| `GET /profiles/{profileId}/preferences` | Saved viewer goal and editable declaration, outside the shared profile schema |
| `GET /project-telos/fixtures` | Three public titles/hooks/promised topics |
| `POST /project-telos/push` | Analyse a fixture and persist an idempotent session item |
| `POST /project-telos/outcome` | Record an observed hold or request a clean reframe |
| `GET /project-telos/receipt/{sessionId}` | Actual session counts and definitions |
| `GET /project-telos/youtube/status` | Capability/configuration status without exposing credentials |
| `POST /project-telos/youtube/search` | Fetch five short candidates for the declared profile |
| `POST /project-telos/youtube/analyse` | Explicitly approved audit of a video in that profile's search results |
| `GET /project-telos/thumbnail-truth/status` | Whether live creator checks are configured |
| `GET /project-telos/thumbnail-truth/samples` | Three reviewed, labelled creator submissions for offline demos |
| `POST /project-telos/thumbnail-truth/analyse` | Consented pre-upload check of a draft thumbnail against its video |
| `POST /project-telos/thumbnail-truth/analyse-youtube` | Consented check of a published video's actual thumbnail and public URL |
| `POST /project-telos/thumbnail-truth/redesign` | Imagen thumbnail suggestion; explicitly rechecked before claiming improvement |
| `GET/DELETE /project-telos/thumbnail-truth/history/{creatorId}` | A creator's last ten check summaries (title, band, score, emotion gap), keyed by an anonymous browser id |

### Primary creator experience: ThumbnailTruth

Creator Studio is the primary product surface. ThumbnailTruth checks the
thumbnail/title promise against video evidence before publication. It shares
Google AI capabilities with viewer analysis, while answering a distinct creator
question and keeping its evidence and suggestions out of the viewer feed:

1. The creator uploads a thumbnail and enters the title, description, transcript,
   and optional audience region; a short draft video (up to 15 MB) is optional.
2. Two Gemini scans run with JSON-schema output, temperature 0.1, the configured
   `PROJECT_TELOS_GEMINI_MODEL`, and one misleading plus one honest reference example:
   - **Ghost entity / visual exaggeration:** thumbnail entities vs. video evidence,
     alignment score 0-100.
   - **Sentiment / thematic contradiction:** projected vs. actual tone, the 0-100
     emotional intensity of each (shown to the creator as an "emotion gap"), risk 0-100,
     and a single remediation tip.
3. The API validates both outputs and fuses them into a mismatch risk score:
   `average(100 − alignment, sentiment risk)` plus fixed pattern penalties, capped at
   100. The UI shows bands of 0-30 "matches", 31-65 "worth a look", and 66-100 "strong
   mismatch", worded as review signals rather than proof of intent.
4. With insufficient evidence, the result is "unverified" with no score.
   Offline mode shows only reviewed samples.

The dashboard shows a risk gauge, a ghost entity tracker, the sentiment comparison,
the model rationale, promise/content observations, an honest title suggestion,
and a remediation tip. The bands are heuristic, not calibrated, and no platform
action is taken. A revision copies the suggested title into the draft; an Imagen
image can be used as the next thumbnail. Consent resets, and there is no new score
until a fresh live analysis succeeds. Offline samples demonstrate reviewed results
only; their illustrated thumbnail is not silently sent as a real upload.

The canonical profile retains `avoid`, `interests`, `context`, and existing
contract fields; do not introduce a competing `{ interest: [] }` shape.
OpenAPI is available at `/docs`. The unauthenticated local demo is not a
production multi-user service.

## 8. Weekend division of labor

| Track | Deliverable | Stop rule |
| --- | --- | --- |
| Frontend / UX | Creator Studio landing page (draft upload or YouTube link), creator promise/evidence/recheck loop, separate Viewer Feed mode with goal/topics/boundaries and the declare/review/feed/receipt journey | No other feature tabs |
| AI / backend | Existing profile extraction, reviewed bait evidence, summary, durable outcomes | No arbitrary media ingestion or heavy retrieval pipeline |
| Demo / verification | Timing tests, receipt reconciliation, deployment evidence, 3-4 minute presentation | Never claim fixture output is live multimodal analysis |

### Acceptance gates

- Safe fixtures score 0 and remain allowed under the default declaration.
- Topic-mismatched content is caught even when it has no safety intensity jump.
- An intensity change with the same promised topic does not become bait.
- At 0:14, the Before simulation reaches the placeholder while Project Telos remains at
  exactly 0:13; the protected side never advances into the mismatch.
- A reframe is explicitly requested, source-grounded, and labelled with its provider.
- Model failure leaves the frame held and reports a retryable error.
- Four distinct pushes yield four items; a repeated API retry yields no extra item.
- Holds/reframes do not double-count neutralizations; unrelated sessions stay separate.
- Refresh resumes the same session; deleting its profile removes related demo items.
- Build, focused tests, and the full demonstrated browser flow pass.
- Cloud deployment and genuine live Gemini evidence are separate submission gates.
- Consent triggers official discovery, not automatic analysis or playback.
- Search excludes personal boundary reasons and reports unavailable API/quota errors.
- Auditing sends actual image/video inputs; malformed coverage cannot become allow.
- Missing credentials and insufficient evidence never return fixture-shaped live success.
- Held/unverified results require explicit playback override; YouTube counts do not
  inflate the controlled demo receipt.
- Creator Studio remains the landing screen. Scores, promise/body evidence, and
  improvement controls stay on the creator side.
- Goals and explicit topics persist without changing the shared profile contract.
  Unrelated items are filtered independently of safety, and no-topic-evidence live
  audits are not marked eligible.
- Revisions reset consent and never imply an improved score before reanalysis.

### Research positioning: feasibility, not borrowed performance

The supplied ResearchGate paper corresponds to Mowar, Jain, Goel, and Vishwakarma,
**"Clickbait in YouTube Prevention, Detection and Analysis of the Bait using
Ensemble Learning"**, submitted December 16, 2021:
[arXiv:2112.08611](https://arxiv.org/abs/2112.08611);
[ResearchGate listing](https://www.researchgate.net/publication/357114992_Clickbait_in_YouTube_Prevention_Detection_and_Analysis_of_the_Bait_using_Ensemble_Learning).

Its abstract describes a stacking ensemble linking content with titles/thumbnails,
and reports **92.89% on BollyBAIT** and **95.38% on the Misleading Video Dataset**.
Those are the paper's dataset-specific results, not Project Telos's results or a prediction
of Gemini accuracy. Project Telos does not reproduce or implement that trained ensemble.

Pitch: **"Prior research supports thumbnail/content mismatch detection. Project Telos uses
multimodal AI to connect that signal to declared boundaries, inspectable evidence,
an actionable hold/reframe experience, and transparent outcome logging."**
Do not claim to have invented clickbait detection or established a globally novel
system. Evaluate Project Telos independently, including false positives and insufficient evidence.

**ThumbnailTruth** ([arXiv:2509.04714](https://arxiv.org/abs/2509.04714)) builds a
dataset of 2,843 videos from 8 countries, 1,359 of them misleading with more than
7.6 billion combined views. It reports that fusing thumbnails, subtitles, and
video-to-text descriptions helps LLMs detect misleading thumbnails; Claude 3.5 Sonnet
reached 93.8% accuracy in its best configuration. The Project Telos creator check borrows the
multi-modal fusion idea, not those numbers. Verify any further paper metrics against
the full text before putting them in the pitch.

Google input references:
[YouTube search API](https://developers.google.com/youtube/v3/docs/search/list);
[Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding).

## 9. Three-to-four-minute presentation

| Time | Narrative / action |
| --- | --- |
| 0:00-0:25 | Problem: a thumbnail promise can differ from the video, and viewers need feeds shaped by their intent |
| 0:25-1:25 | Start in Creator Studio; analyze the sample, inspect promised vs. actual topics and timestamp evidence, improve and recheck |
| 1:25-1:45 | Explain the creator risk score and its limits; distinguish the internal fixture Bait Index and never claim proof of intent to deceive |
| 1:45-2:35 | Switch to Viewer Feed; declare a goal, topics, and boundaries; show a relevant item and the 0:14 vs. 0:13 controlled hold |
| 2:35-2:55 | Show a concise filtered status and optional Summarize & Reframe; keep creator diagnosis on the creator side |
| 2:55-3:15 | Show the session receipt and explain the distinct creator and viewer outcomes |
| 3:15-3:35 | Name the demonstrated Google services and close: "Your intent is the goal. Your attention is not the product." |

## 10. Deferred roadmap

- **Phase 1: real-media validation and cloud readiness.** Permissioned thumbnails,
  Gemini multimodal topic extraction, decoded-player gating, seeking/audio tests,
  held-out mismatch benchmark, Cloud Storage,
  consent retention and access controls.
- **Phase 2: creator accountability.** Creator-level trends with sample counts,
  evidence review, correction/appeals, and opt-in ranking penalties only after
  calibration. No public "liar score" based on a single fixture. Extend the
  ThumbnailTruth check with Cloud Storage uploads for full-length drafts, Vertex AI
  Vector Search retrieval of region- and topic-matched examples.
- **Phase 3: broader platform.** Extensions and platform integrations, diversified
  ranking, creator tools, storytelling, provenance, and opt-in analytics only when
  their own requirements and evaluation justify them.

This blueprint is the active hackathon scope; deferred product-vision material
has been removed to keep the working repository focused.
