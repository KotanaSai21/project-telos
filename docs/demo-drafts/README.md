# Creator Studio test drafts

Two drafts of the **same** cooking video for testing **Creator Studio → Draft upload**
with a live Gemini check. Upload the thumbnail, paste the title, description, and transcript,
tick the consent box, and select **Check my thumbnail**. No video file is needed: the
transcript is the evidence.

The transcript is identical in both tests. Only the thumbnail and title change, so any
difference in the result comes from the promise, not the video.

## Test 1: misleading draft (expect a high mismatch)

**Thumbnail:** [thumbnail-bait.png](thumbnail-bait.png) (a screaming face, flames, a red circle, and "KITCHEN ON FIRE?!")

**Title**

```text
My kitchen CAUGHT FIRE making dinner?!
```

**Description**

```text
A one-pan spaghetti and meatballs recipe for busy weeknights. Ready in about 30 minutes.
```

**Audience region (optional):** `India`

**Transcript** (paste the same text in both tests)

```text
0:00 Hi everyone, welcome back to the kitchen. Today we're making one-pan spaghetti and meatballs.
0:08 You'll need minced beef, breadcrumbs, one egg, garlic, a tin of tomatoes, and dried spaghetti.
0:20 Mix the beef, breadcrumbs, egg, and a pinch of salt, then roll about twelve small meatballs.
0:41 Brown them in a little olive oil over medium heat, turning every minute or so.
1:05 Add the chopped garlic for thirty seconds, then the tomatoes and a cup of water.
1:22 Break the spaghetti in half and push it under the sauce. Cover and simmer for twelve minutes.
1:48 Stir now and then so nothing sticks. If it gets dry, add a splash more water.
2:10 Finish with grated parmesan and a few basil leaves.
2:22 That's it: one pan, about thirty minutes, and very little washing up. See you next week!
```

**What to look for**

- **Mismatch band:** a high score with "Strong mismatch: review before publishing".
- **Promise → Proof → Fix:** rows such as *the kitchen catching fire* and *flames* marked not
  kept (the transcript is a calm recipe with no fire), each with a fix. *A cooking video* or
  *dinner* should be marked as a kept promise. Timestamps come from the transcript.
- **Sentiment contradiction:** "Viewers will expect" panic or alarm; "Video delivers" calm, friendly
  instruction, with a large emotion gap.
- **Ghost entity tracker:** fire or flames listed as a ghost entity. The red circle and arrow should
  count as visual exaggeration.
- **Next step:** a suggested honest title.

## Test 2: honest revision (expect a low mismatch)

Select **Revise draft and recheck** on the Test 1 result so the before/after banner appears,
then replace the thumbnail and title:

**Thumbnail:** [thumbnail-honest.png](thumbnail-honest.png) ("ONE-PAN SPAGHETTI & MEATBALLS", a bowl of spaghetti with meatballs, "30 minutes · one pan")

**Title**

```text
One-pan spaghetti and meatballs in 30 minutes
```

Keep the same description and transcript, tick the consent box again, and check.

**What to look for**

- A low score with "Thumbnail matches the video".
- Promise → Proof → Fix rows marked **✓ Promise kept** (spaghetti and meatballs, one pan, 30 minutes).
- Sentiment contradiction **Not detected**.
- The **before/after banner** above the result: the score drop, plus lines such as "Removed what the
  video never showed" and "Mood now matches".

## Notes

- These are live checks, so exact scores and wording vary from run to run. The bands above are the
  expected direction, not fixed values.
- The thumbnails were made for this test (rendered with emoji artwork); they are not taken from any
  real channel.
- A draft check needs the live Gemini configuration. With it off, use the reviewed examples instead.
