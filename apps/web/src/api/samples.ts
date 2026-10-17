export interface SampleYouTubeLink {
  label: string;
  url: string;
}

/** Real, public, short YouTube videos (all under four minutes) for demos. */
export const SAMPLE_YOUTUBE_LINKS: readonly SampleYouTubeLink[] = [
  { label: 'Me at the zoo (19s)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { label: 'Charlie bit my finger', url: 'https://www.youtube.com/watch?v=_OBlgSz8sSM' },
  { label: 'Keyboard Cat', url: 'https://youtu.be/J---aiyznGQ' },
  { label: 'Never Gonna Give You Up', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
];
