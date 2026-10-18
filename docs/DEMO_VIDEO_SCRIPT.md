# Project Telos — demo video (2:39)

Watch it: <https://www.youtube.com/watch?v=b8YuM-SNoJo>

The submitted demo is a 2:39 cut, narrated throughout, recorded against the live site in light theme.
Waits for Gemini and typing are sped up, and each sped-up moment shows a "sped up" badge.

**The one idea every scene serves:** *a thumbnail is a promise; Project Telos checks that it is kept,
before creators publish and before viewers watch.*

## Structure

| Time | Scene | What it shows |
|---|---|---|
| 0:00–0:15 | Intro | Generated with Nano Banana (stills) and Veo (motion): a thumbnail screams "IT EXPLODED?!", the video is a calm car wash, a feed autoplays before the viewer can say no. Title card. |
| 0:15–0:26 | Safeguards screen | Open for judging with no access code: per-visitor rate limit, no Gemini key to leak, capped spend, consent before any AI call. |
| 0:26–0:33 | Creator intention card | "Keep the promise before you publish." |
| 0:33–1:38 | Creator Studio | Sentiment contradiction; Promise → Proof → Fix on a reviewed example; a live draft check (100) and an honest revision (0); a public YouTube link checked live. |
| 1:38–1:48 | Why the viewer side exists | Reels and Shorts play before you decide; you can only swipe away after you have seen it. Today's feed plays first; Project Telos checks first. |
| 1:48–1:55 | Viewer intention card | "Your attention, on your terms." Declared intent, not watch history. |
| 1:55–2:18 | Viewer feed | Declare intent, review the profile, every video checked before it plays, a bait-and-switch paused at 0:13, a clean summary. |
| 2:18–2:28 | What only Project Telos does | Sentiment contradiction; Promise → Proof → Fix; checked before it plays. |
| 2:28–2:39 | Footer and closing | Gemini, Imagen, YouTube Data API, Cloud Run, Firestore. "Today's tools help you win the click. Project Telos helps you keep the promise." |

## Production

- **Narration:** Cloud Text-to-Speech (Chirp 3 HD). The walkthrough is paced by the narration, so each
  step lasts as long as its spoken line.
- **Music:** Lyria, ducked under the narration.
- **Intro visuals:** Nano Banana stills animated with Veo 3.1 Fast; a corner credit says so.
- **Recording:** Playwright drives the deployed site at 1920×1080; the test drafts are in
  [demo-drafts](demo-drafts/README.md).

## Before submitting

- [ ] **Make the GitHub repository public.** The rules require an accessible repository.
- [x] **Judges can get in.** The site is open; the first screen explains the safeguards.
- [x] **Firebase:** the brief description covers Firebase through Cloud Firestore; the app is deployed
      on Cloud Run.
- [x] **Video uploaded:** <https://www.youtube.com/watch?v=b8YuM-SNoJo>, linked from [Submission.md](Submission.md) and the README.
- [x] **Deck exported to PDF:** [Project Telos - AI Builder Cup.pdf](Project%20Telos%20-%20AI%20Builder%20Cup.pdf).
- [ ] Keep the Gemini quota and billing healthy for the whole evaluation period.
