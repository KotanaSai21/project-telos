export interface SampleYouTubeLink {
  label: string;
  url: string;
}

/**
 * Creator Studio samples: real, public YouTube videos. All but the last are about a minute or
 * less so a live check finishes quickly; the long one shows the "analyse the opening minute" path.
 */
export const SAMPLE_YOUTUBE_LINKS: readonly SampleYouTubeLink[] = [
  { label: 'Me at the zoo (0:19)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { label: 'Surprised Kitty (0:17)', url: 'https://www.youtube.com/watch?v=0Bmhjf0rKe8' },
  { label: 'Keyboard Cat (0:55)', url: 'https://youtu.be/J---aiyznGQ' },
  { label: 'Charlie bit my finger (0:56)', url: 'https://www.youtube.com/watch?v=_OBlgSz8sSM' },
  { label: 'Squirrel Maze (21:40, long)', url: 'https://www.youtube.com/watch?v=hFZFjoX2cGg' },
];

export interface SampleGroup {
  title: string;
  /** What the sample is meant to show. The verdict still comes from the live analysis. */
  expectation: string;
  links: readonly SampleYouTubeLink[];
}

interface ViewerSample extends SampleYouTubeLink {
  /** The video's main subject, compared with the viewer's own topics. */
  topic: string;
  kind: 'topic' | 'title-check' | 'sensitive';
}

/** Public, embeddable, landscape, and under the four-minute viewer limit. */
const VIEWER_SAMPLES: readonly ViewerSample[] = [
  { label: 'Crosswind landings · aviation (1:52)', url: 'https://www.youtube.com/watch?v=QFLwajrLEmI', topic: 'aviation', kind: 'topic' },
  { label: 'Butter garlic noodles · cooking (2:43)', url: 'https://www.youtube.com/watch?v=KLdZ8FyZ8Ho', topic: 'cooking', kind: 'topic' },
  { label: 'Build garage shelving · DIY (2:47)', url: 'https://www.youtube.com/watch?v=cTxRBckenI4', topic: 'DIY', kind: 'topic' },
  { label: 'Me at the zoo (0:19)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', topic: 'animals', kind: 'topic' },
  { label: 'Surprised Kitty (0:17)', url: 'https://www.youtube.com/watch?v=0Bmhjf0rKe8', topic: 'animals', kind: 'topic' },
  { label: 'Keyboard Cat (0:55)', url: 'https://youtu.be/J---aiyznGQ', topic: 'comedy', kind: 'topic' },
  { label: 'Charlie bit my finger (0:56)', url: 'https://www.youtube.com/watch?v=_OBlgSz8sSM', topic: 'family', kind: 'topic' },
  { label: '"How To Fix a Squeaky Door" · HowToBasic (1:54)', url: 'https://www.youtube.com/watch?v=7esvfn8HyHM', topic: 'DIY', kind: 'title-check' },
  { label: 'Cargo plane accident report · ABC News (2:12)', url: 'https://www.youtube.com/watch?v=5yW9h2zv5IA', topic: 'aviation', kind: 'sensitive' },
];

const normalize = (value: string) => (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');

/** Same rule as the API's phrase match: either phrase contains the other as whole words. */
function onTopic(topic: string, interests: readonly string[]): boolean {
  const phrase = ` ${normalize(topic)} `;
  return interests.some((interest) => {
    const wanted = normalize(interest);
    return wanted !== '' && (phrase.includes(` ${wanted} `) || ` ${wanted} `.includes(phrase));
  });
}

/**
 * Viewer samples grouped against this viewer's own topics and boundaries, so the labels stay
 * right when the intent changes. Groups only state an expectation; the analysis decides.
 */
export function viewerSampleGroups(profile: {
  interests: readonly string[];
  avoid: readonly { category: string }[];
  allowContextually: readonly string[];
}): SampleGroup[] {
  const interests = profile.interests.filter((value) => normalize(value) !== '');
  const regular = VIEWER_SAMPLES.filter((sample) => sample.kind === 'topic');
  const groups: SampleGroup[] = [];
  if (interests.length === 0) {
    groups.push({
      title: 'Everyday videos', links: regular,
      expectation: 'You have not chosen topics, so none are filtered by topic; only your boundaries apply.',
    });
  } else {
    const yours = regular.filter((sample) => onTopic(sample.topic, interests));
    const others = regular.filter((sample) => !onTopic(sample.topic, interests));
    if (yours.length) groups.push({ title: 'On your topics', links: yours, expectation: 'Should match your intent.' });
    if (others.length) groups.push({ title: 'Off your topics', links: others, expectation: 'Should be filtered from your feed.' });
  }
  groups.push({
    title: 'Title vs. content',
    links: VIEWER_SAMPLES.filter((sample) => sample.kind === 'title-check'),
    expectation: 'The title promises a DIY fix; the analysis checks whether the video delivers it.',
  });
  const newsAvoided = profile.avoid.some((rule) => rule.category === 'news_reporting')
    && !profile.allowContextually.includes('news_reporting');
  groups.push({
    title: 'Sensitive news',
    links: VIEWER_SAMPLES.filter((sample) => sample.kind === 'sensitive'),
    expectation: newsAvoided
      ? 'Aviation news about a fatal accident: your boundaries avoid news reporting, so it should be held.'
      : 'Aviation news about a fatal accident: allowed as news reporting under your boundaries. Add "avoid news about accidents" to your intent to see it held.',
  });
  return groups;
}

export interface DemoClip {
  videoId: string;
  /** Second of the YouTube video where the demo item's 0:00 begins. */
  start: number;
  credit: string;
}

/**
 * Real public YouTube footage (landscape) for each controlled demo item, played muted inside the
 * before/after panels. The demo's switch to an "incident" is still simulated on top:
 * none of these videos contains one.
 */
export const DEMO_CLIPS: Readonly<Record<string, DemoClip>> = {
  aviation: { videoId: 'QFLwajrLEmI', start: 15, credit: 'King Schools · Crosswind Landings Made Easy' },
  cooking: { videoId: 'KLdZ8FyZ8Ho', start: 20, credit: 'Hebbars Kitchen · Butter Garlic Noodles' },
  'diy-switch': { videoId: 'F8_ME4VwTiw', start: 10, credit: 'The Wall Street Journal · How to Set Up Your Desk' },
};
