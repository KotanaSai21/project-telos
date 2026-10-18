# Project Telos — demo video script (3:40)

Two parts: a **35-second AI-generated intro** that makes the problem felt, then a
**live walkthrough** of the deployed prototype. The rules allow 3–4 minutes; this script
runs about 3:40, so there is room to breathe without going over.

**The one idea every scene serves:** *a thumbnail is a promise; Project Telos checks it is kept,
before publishing for creators and before watching for viewers.*

---

## Part A — AI intro (0:00–0:35)

Make four stills with **Nano Banana** (Gemini image generation), then either animate each
for 6–8 seconds with **Veo**, or use a slow zoom in your editor. Using Google's own
generative tools for the intro is a small extra for the "Gen AI" judging criterion.

Keep the same character in every image: after the first image, attach it and ask Nano Banana
to "keep the same person, same clothes".

Add a small caption in a corner for the whole intro: **"Intro visuals generated with Nano Banana"**.

| Time | Visual | Voice-over |
|---|---|---|
| 0:00–0:08 | **Shot 1.** A phone feed; one thumbnail stands out: "IT EXPLODED?!" | "Every thumbnail makes a promise." |
| 0:08–0:16 | **Shot 2.** The video plays: a calm car-wash tutorial. The viewer looks let down. | "Too often, the video breaks it. The click was won with a feeling that never shows up." |
| 0:16–0:26 | **Shot 3.** A feed autoplaying video after video; the viewer reaches for the screen too late. | "And today's feeds play it before you can say no, chosen by watch history, dwell time, and trends you never picked." |
| 0:26–0:35 | **Shot 4.** Title card on a dark background. | "This is Project Telos. A thumbnail is a promise. We check that it's kept: before creators publish, and before viewers watch." |

### Nano Banana prompts

**Shot 1**

```text
A young person on a sofa at night holding a smartphone, screen glowing. Close-up over
the shoulder: a vertical video feed where one thumbnail shows a burning red sports car,
a shocked face, and bold yellow text "IT EXPLODED?!" with a red circle. Cinematic, soft
blue room light, warm screen glow, shallow depth of field, 16:9.
```

**Shot 2**

```text
Same person, same clothes and room. The phone screen now shows a calm, ordinary video of
someone washing a small family hatchback with foam in a driveway. The person's face shows
mild disappointment, one eyebrow raised. Cinematic, same lighting as before, 16:9.
```

**Shot 3**

```text
Same person, same room. Their phone screen shows a fast-scrolling feed of many video
thumbnails blurring past, each with loud text and shocked faces. Their thumb is reaching
toward the screen, slightly too late. Subtle motion blur, tense mood, cinematic, 16:9.
```

**Shot 4 (title card)**

```text
Minimal title card, near-black background with a soft lime-green glow. Large clean white
sans-serif text "Project Telos" and below it "A thumbnail is a promise. We check that it's
kept." Modern, calm, lots of empty space, 16:9.
```

*Generated text in images can come out misspelled. If shot 4's lettering is off, generate only
the background and add the text in your editor.*

### Optional Veo motion prompts

- Shot 1: "Slow push-in toward the phone screen; the thumbnail glows slightly brighter."
- Shot 2: "The person lowers the phone slowly and exhales; subtle, natural motion."
- Shot 3: "Thumbnails scroll upward quickly on the phone; the thumb moves toward the screen."

---

## Part B — live walkthrough (0:35–3:40)

Record the deployed site: <https://project-telos-hget6gf4qq-ue.a.run.app>

| Time | On screen | Voice-over |
|---|---|---|
| **0:35–0:55** | Creator Studio top: headline, **Why this exists**, the **vs** cards. | "Project Telos starts with creators. Thumbnail tools today help you win the click. We check whether the video actually delivers what the thumbnail promises." |
| **0:55–1:15** | Scroll to **Sentiment contradiction**: panic 95 ≠ calm 15, then the three icon cards. | "Our core idea is sentiment contradiction. A thumbnail sells a feeling. Here it sells panic, but the video is a calm tutorial: an 80-point emotion gap. Keyword filters miss this, because the topic matches while the emotion is fake. Gemini also checks for ghost entities, exaggerated graphics, and topic mismatch." |
| **1:15–1:40** | Click **See the full check on this example**. Show the score, then the **Promise → Proof → Fix** table. | "Every result reads as Promise, Proof, Fix. The thumbnail promised a burning supercar; the video only shows a hatchback, so here's the fix. The car wash itself? Promise kept. This is a review signal, not an accusation." |
| **1:40–1:55** | Click **See the fixed version**. Show the before/after banner. | "After the fix: risk down 92 points, and it tells you exactly what changed: the supercar and fire are gone, and the mood now matches." |
| **1:55–2:30** | **Live check.** Draft upload: [thumbnail-bait.png](demo-drafts/thumbnail-bait.png), title and transcript from [demo-drafts](demo-drafts/README.md). Tick consent, **Check my thumbnail**. *Cut the wait.* Show **Live check** banner, score 100, the fire row and its fix, the 2:22 timestamp. | "That was a reviewed example; this one is live. Gemini on Vertex AI runs two scans in parallel, one for what's in the thumbnail and one for the emotion, and returns structured evidence with timestamps from the transcript." |
| **2:30–2:45** | **Revise draft and recheck** → upload [thumbnail-honest.png](demo-drafts/thumbnail-honest.png), honest title, recheck. Show **100 → 0** and the change list. | "Revise with an honest thumbnail, recheck, and the promise holds: 100 down to zero. Each check is saved to Firestore so creators can compare revisions." |
| **2:45–3:00** | Switch to **Viewer feed**. Show **Today's algorithm feed vs. Project Telos**. | "The same principle protects viewers. Today's feed plays first, and you can only avoid something after you've seen it. Project Telos starts from what you say you're here for." |
| **3:00–3:25** | Declare → Start. Show the **Checked before you watch** card (nothing playing). Go to the DIY video, **Watch the first 0:13**; it pauses with the reason. Click **Get the clean summary instead**. | "Every video is understood before it reaches you, and nothing plays until you choose. This one promised a desk tutorial, but turns into something else at 0:14. Project Telos pauses at 0:13, says why, and offers a clean summary or a skip." |
| **3:25–3:40** | Footer showing Gemini, Imagen, YouTube Data API, Cloud Run, Firestore. Then the title card from Part A. | "Built on Gemini, Imagen, Cloud Run, and Firestore. Today's tools help you win the click. Project Telos helps you keep the promise." |

---

## Recording checklist

- **Before recording:** open the site, enter the access code, and hard-refresh (Ctrl+Shift+R).
  Run one live check first so the service is warm.
- **Screen:** 1920×1080, browser zoom 90%, bookmarks bar hidden, dark theme (it reads best on video).
- **Live waits:** a check takes 15–40 seconds. Cut the wait or speed it up, and say so on screen
  ("sped up") so the demo stays honest.
- **Have ready:** the two thumbnails and the copied title and transcript from
  [demo-drafts](demo-drafts/README.md).
- **Length:** keep the final cut between 3:00 and 4:00. If you are over, shorten 2:45–3:00 first.

## Before submitting

- [ ] **Make the GitHub repository public.** It currently returns 404 to logged-out visitors,
      and the rules require an accessible repository.
- [ ] **Judges need to get in.** Either remove the access code for the evaluation period or put the
      code in the submission. The hint question alone may block judges.
- [x] **Firebase:** the brief description covers Firebase through Firestore, and says the app is
      deployed on Cloud Run. Firebase Hosting is not used.
- [ ] **Use the prescribed deck template**, filled from [Submission.md](Submission.md), exported to PDF.
- [ ] Add screenshots (slide 9) and the public video link (slide 11).
- [ ] Keep the Gemini quota and billing healthy for the whole evaluation period.
