# Project Telos — Hackathon pitch deck


*Slide-ready content for the submission deck. Each top-level section is one
slide. Replace the clearly marked deployment, screenshot, and demo-link
placeholders with the team's actual assets before submission.*


## 1. Brief about the idea


### Project Telos: Your attention, on your terms


- **The problem:** A title or thumbnail can promise one experience while the
  content delivers another. A click does not prove that the viewer wanted what
  followed.
- **The idea:** Let people declare what they want, then check content against
  that intent before it is experienced.
- **Two connected experiences:**
  - **Creator Studio:** checks whether a title and thumbnail match the video,
    explains available evidence, and suggests a more honest presentation.
  - **Viewer Feed:** applies a viewer's declared interests and boundaries, can
    hold a mismatch in the controlled demo, and records the outcome.
- **Why it matters:** Make content promises more transparent and give viewers
  meaningful control—without treating a model score as proof of intent.
- **Hackathon category:** **Social Good** — healthier, more transparent digital
  content experiences.
- **One-line pitch:** *A thumbnail is a promise. Telos checks that promise
  before your attention pays for it.*


## 2. Opportunities


### A new layer of choice and accountability


1. **How is it different?**
   - Most feeds optimize selection or ranking. Telos starts with a viewer's
     explicit goal, topics, and boundaries.
   - It connects viewer protection with a creator-facing check of the
     title/thumbnail promise—rather than acting as only a generic content
     filter.
   - It keeps the decision visible: allow, filter, hold, or reframe.
2. **How does it solve the problem?**
   - Interpret a short declaration into an editable profile.
   - Compare available content evidence with that profile and the content's
     advertised promise.
   - In the controlled experience, stop at a reviewed mismatch and offer a
     grounded summary instead of silently continuing.
3. **Unique value proposition**
   - **Viewer control + creator accountability + an inspectable receipt** in one
     prototype.
   - The score is a transparency signal, not a probability of deception, proof
     of creator intent, legal judgment, or platform penalty.


## 3. List of features offered by the solution


### A practical, consent-led prototype


- **Creator Studio:** review sample cases or submit a draft thumbnail, title,
  and supporting video/text; see promise-versus-content evidence and a
  Deception Risk band.
- **Revision loop:** request an honest thumbnail suggestion when Imagen is
  configured; revise and explicitly recheck rather than assuming the score
  improved.
- **Intent declaration:** choose a goal, add topics, describe boundaries, and
  review the interpreted profile before starting.
- **Controlled Viewer Feed:** compare a “Before” simulation with the Telos
  experience; relevant items can play and an authored bait-switch is held
  before its mismatch.
- **Summarize & Reframe:** offer a concise, grounded text alternative for a
  held item.
- **Session receipt:** summarize items pushed, reported holds, and successful
  reframes from the session.
- **Optional discovery:** search YouTube from declared positive interests and
  request an explicitly approved audit of a selected public video.
- **Clear status and errors:** distinguish reviewed offline examples from live
  AI results; insufficient evidence stays unverified.


*Prototype boundary: the controlled demo is not a browser extension or a
frame-perfect safety layer for external YouTube playback.*


## 4. Process flow diagram or Use-case diagram


### Two user journeys, one principle: understand before experience


```text
CREATOR
Draft thumbnail + title + video evidence
                 |
                 v
      Compare promise with evidence
                 |
                 v
   Inspect explanation and risk band
                 |
       Revise / request suggestion
                 |
                 v
        Approve a fresh recheck


VIEWER
 Declare goal + topics + boundaries
                 |
                 v
       Review editable intent profile
                 |
                 v
     Analyse each controlled item
                 |
       +---------+----------+
       |                    |
    Matches             Mismatch /
       |                boundary hit
       v                    v
     Allow           Hold before reveal
                            |
                 Summarize & Reframe
                            |
                            v
                  Review session receipt
```


*The optional YouTube path is separate: search candidates → choose a video →
approve analysis → review status → separately choose whether to open playback.*


## 5. Wireframes/Mock diagrams of the proposed solution (optional)


### The key screens at a glance


```text
CREATOR STUDIO
+----------------------+--------------------------------+
| Draft / sample       | Promise vs. video evidence     |
| Thumbnail + title    | Risk band   | Topics/timestamps |
| [Check this draft]   | Ghost entities / explanation  |
|                      | [Suggest revision] [Recheck]  |
+----------------------+--------------------------------+


VIEWER FEED
+----------------------+--------------------------------+
| Your intent          | Before       | Project Telos   |
| Goal / topics        | Same item    | Match / status  |
| Boundaries           | Same start   | Hold / reframe  |
| [Confirm intent]     |              | [Continue]      |
+----------------------+--------------------------------+


SESSION RECEIPT
Items pushed | Holds reported | Reframes completed
What happened this session • What each measure means
```


- Both comparison sides use the same item and starting point in the controlled
  demo.
- Creator-facing diagnosis is kept separate from the viewer's simple status.
- Replace this schematic with actual product screenshots if a visual slide is
  preferred.


## 6. Architecture diagram of the proposed solution


### A small web app with explicit AI and policy boundaries


```text
React + TypeScript web app
          |
          | REST / JSON
          v
FastAPI service
  |           |                 |
  |           |                 +--> Optional YouTube Data API
  |           +--> Gemini / Vertex AI (configured, consented requests)
  |
  +--> Reviewed fixture evidence + deterministic policy
  |
  +--> Local JSON storage (default) / optional Firestore
  +--> Optional BigQuery verdict analytics
          |
          v
One Cloud Run container can serve the API and built web app
```


- **Default demo:** reviewed fixtures and deterministic rules; no live model
  call is required.
- **Live AI:** configured Gemini or Vertex provider for supported analysis;
  results are validated, and failed calls do not become fixture answers.
- **Optional integrations:** Firestore, BigQuery, Translation, Imagen, and
  YouTube APIs require configuration. Their presence in the architecture does
  not mean they are enabled in the demo.
- **Trust boundary:** an external YouTube embed is not protected playback.
  The hold-before-reveal behavior applies to the controlled simulation.


## 7. Technologies to be used in the solution


### Built with a lightweight, Google Cloud-ready stack


| Layer | Technology | Role |
|---|---|---|
| Web experience | React, TypeScript, Vite, Tailwind CSS | Creator Studio, intent setup, feed, and receipt |
| API | Python, FastAPI, Pydantic | Analysis endpoints, validation, policy, and storage |
| Shared contracts | JSON Schema; generated TypeScript types | Keep web and API data shapes aligned |
| AI (optional/configured) | Gemini API or Vertex AI | Intent understanding, supported media analysis, and grounded reframing |
| Discovery (optional) | YouTube Data API v3 | Search by declared interests and retrieve official metadata |
| Hosting target | Google Cloud Run | One container can serve both the API and web app |
| Persistence (optional) | Firestore | Store profiles, sessions, receipts, and analyses |
| Analytics (optional) | BigQuery | Content-free verdict statistics |
| Other optional services | Imagen; Cloud Translation v3 | Thumbnail suggestion; translation of supported creator drafts |


The offline prototype is usable without cloud credentials. Cloud integrations
must only be claimed as live when configured and demonstrated.


## 8. Estimated implementation cost (optional)


### Cost depends on live usage; the offline demo can run locally


- **Local fixture demo:** no Google Cloud or model API spend is required;
  developer time and local compute are excluded.
- **Live deployment:** costs depend on region, traffic, Cloud Run resources,
  Gemini/Imagen usage, YouTube API quota, storage, and optional analytics or
  translation.
- **No verified monthly estimate is available yet.** Avoid presenting a
  fabricated dollar figure.
- **Before launch:** select a deployment region and expected usage; check
  current provider pricing and quotas; set billing budgets, usage limits, and
  alerts; then measure actual requests and cost per session.


## 9. Snapshots of the prototype


### Show the real working journey


Add current screenshots from the running prototype:


1. **Creator Studio:** sample or draft input and the promise-versus-content
   result.
2. **Evidence view:** risk band, explanation, and any available timestamps.
3. **Intent setup:** goal, topics, boundaries, and interpreted profile.
4. **Controlled hold:** Before versus Project Telos at the bait-switch moment.
5. **Receipt:** completed session totals and outcome definitions.


Use the same session/profile across the viewer screenshots. Label any reviewed
sample as **offline sample — no model call**; label a result **Live Gemini** only
when that request actually used Gemini.


**Screenshot assets:** `[Insert links or filenames for captured screenshots]`


## 10. Prototype Performance report/Benchmarking


### What the controlled prototype demonstrates—and what remains unmeasured


- **Repeatable bait-switch case:** the authored DIY fixture changes at **0:14**;
  the controlled Telos playhead holds at **0:13**, one second before the change.
- **Reviewed mismatch example:** the DIY case has a Bait Index of **100/100**
  and **7 of 28 seconds (25%)** of mismatched timeline.
- **Decision threshold:** the controlled demo uses **50/100** as its Bait Index
  threshold. This is a fixture rule, not a calibrated deception probability.
- **False-positive challenge case:** the reviewed anatomy lesson is intended
  to remain available despite a potentially overbroad keyword filter.
- **Reporting integrity:** receipt measures are calculated from the session's
  recorded outcomes; pending holds are not counted as completed.
- **Not yet benchmarked:** real-world precision/recall, independent human
  agreement, user impact, end-to-end latency, scale, and external-video
  interception.


*The current evidence validates a controlled interaction and reviewed
fixtures—not model accuracy on the open internet or zero exposure in a real
video player.*


## 11. Additional Details/Future Development (if any)


### From a controlled prototype to a responsibly evaluated product


- Evaluate promise/body mismatch and safety decisions on a permissioned,
  diverse, independently labelled video set; publish limitations and
  false-positive/false-negative results.
- Test accessibility, language coverage, usability, latency, and real-world
  user benefit with participants.
- Add privacy, identity/access controls, retention policies, abuse protections,
  and operational monitoring before broader public use.
- If testing supports it, explore creator appeals and correction workflows,
  while keeping model signals distinct from accusations or enforcement.
- Improve external playback protections only where technically verified;
  never imply that an ordinary embedded player is frame-gated.
- **Current deployment status:** `[Add verified Cloud Run URL, or state “local
  prototype only”]`
- **Demo video:** `[Add public 3–4 minute video URL]`
- **Repository:** `[Add public repository URL, if required by the submission]`


## 12. Demo Video Transcript (3-4 minutes)


### Suggested narration and actions (approximately 3½ minutes)


**0:00–0:20 — Introduce the problem**  
“A thumbnail makes a promise. But a click does not tell us whether the video
delivered what the viewer expected. Project Telos explores a different
approach: let creators check that promise, and let viewers decide what they
want to experience.”


**0:20–1:15 — Creator Studio**  
“We start in Creator Studio. I’ll open a reviewed example. Telos compares the
title and thumbnail promise with the evidence available from the video. Here,
we can inspect the risk band, topics, and explanation. This is a transparency
signal—not proof that a creator intended to mislead anyone. In a configured
live setup, a creator can request an honest thumbnail suggestion, revise the
draft, and explicitly run a new check.”


**1:15–1:55 — Declare viewer intent**  
“Now I’ll switch to Viewer Feed. I choose a goal, enter topics, and describe
boundaries. Telos turns that into a profile I can review before starting. The
demo keeps topic matching separate from safety boundaries, so the viewer can
understand why an item is allowed, filtered, or held.”


**1:55–2:45 — Show the controlled hold**  
“Here is the same controlled item in the Before and Project Telos views. The
authored video changes at fourteen seconds. Telos stops at thirteen—before the
mismatch—and explains the viewer-facing status. I can request Summarize &
Reframe instead of continuing. This is a controlled simulation with reviewed,
synthetic demo material; it is not protection for an external video player.”


**2:45–3:15 — Inspect the receipt**  
“At the end, the receipt reports what happened in this session: items pushed,
holds that were actually reported, and successful reframes. These are
interaction measures, not audience approval or a claim of measured safety.”


**3:15–3:35 — Close and state the next step**  
“Project Telos brings viewer choice and creator accountability into one
prototype. Our next step is evaluation on permissioned, independently labelled
media, followed by usability, privacy, and reliability testing. The goal is
simple: make content promises more transparent and keep the viewer in control.”
