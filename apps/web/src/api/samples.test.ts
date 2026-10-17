import { describe, expect, it } from 'vitest';

import { viewerSampleGroups } from './samples';

const labels = (groups: ReturnType<typeof viewerSampleGroups>, title: string) =>
  groups.find((group) => group.title === title)?.links.map((link) => link.label) ?? [];

describe('viewerSampleGroups', () => {
  it('groups samples against the default aviation / cooking / DIY intent', () => {
    const groups = viewerSampleGroups({ interests: ['aviation', 'cooking', 'DIY'], avoid: [], allowContextually: [] });
    expect(labels(groups, 'On your topics')).toEqual([
      'Crosswind landings · aviation (1:52)', 'Butter garlic noodles · cooking (2:43)', 'Build garage shelving · DIY (2:47)',
    ]);
    expect(labels(groups, 'Off your topics')).toContain('Me at the zoo (0:19)');
    expect(labels(groups, 'Title vs. content')).toHaveLength(1);
    expect(groups.find((group) => group.title === 'Sensitive news')?.expectation).toMatch(/allowed as news reporting/);
  });

  it('follows the viewer when their topics change', () => {
    const groups = viewerSampleGroups({ interests: ['Animals'], avoid: [], allowContextually: [] });
    expect(labels(groups, 'On your topics')).toEqual(['Me at the zoo (0:19)', 'Surprised Kitty (0:17)']);
    expect(labels(groups, 'Off your topics')).toContain('Crosswind landings · aviation (1:52)');
  });

  it('makes no topic claims when the viewer chose no topics', () => {
    const groups = viewerSampleGroups({ interests: [' '], avoid: [], allowContextually: [] });
    expect(groups.map((group) => group.title)).toEqual(['Everyday videos', 'Title vs. content', 'Sensitive news']);
  });

  it('expects a hold for sensitive news only when the viewer avoids news reporting', () => {
    const avoid = [{ category: 'news_reporting' }];
    const held = viewerSampleGroups({ interests: ['aviation'], avoid, allowContextually: [] });
    expect(held.find((group) => group.title === 'Sensitive news')?.expectation).toMatch(/should be held/);
    const allowed = viewerSampleGroups({ interests: ['aviation'], avoid, allowContextually: ['news_reporting'] });
    expect(allowed.find((group) => group.title === 'Sensitive news')?.expectation).toMatch(/allowed as news reporting/);
  });
});
