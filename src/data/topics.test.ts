import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Difficulty, SpeechLanguage, Topic } from '../types';
import { BENGALI_TOPICS, HINDI_TOPICS, randomTopic, TOPICS } from './topics';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const CATALOGS: Array<{ language: SpeechLanguage; topics: Topic[] }> = [
  { language: 'en', topics: TOPICS },
  { language: 'bn', topics: BENGALI_TOPICS },
  { language: 'hi', topics: HINDI_TOPICS },
];

function normalizedPrompt(prompt: string): string {
  return prompt
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

afterEach(() => vi.restoreAllMocks());

describe('topic bank', () => {
  it.each(CATALOGS)('provides 100 $language motions at every difficulty', ({ topics }) => {
    for (const difficulty of DIFFICULTIES) {
      expect(topics.filter((topic) => topic.difficulty === difficulty)).toHaveLength(100);
    }
  });

  it('uses unique topic identifiers across every language', () => {
    const topics = CATALOGS.flatMap((catalog) => catalog.topics);
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
  });

  it.each(CATALOGS)('does not repeat normalized $language motions', ({ topics }) => {
    const prompts = topics.map((topic) => normalizedPrompt(topic.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it.each(CATALOGS)('keeps varied $language categories at every difficulty', ({ topics }) => {
    for (const difficulty of DIFFICULTIES) {
      const categories = topics
        .filter((topic) => topic.difficulty === difficulty)
        .map((topic) => normalizedPrompt(topic.category));
      expect(new Set(categories).size).toBeGreaterThanOrEqual(8);
    }
  });

  it('tags each catalog with the expected language and script', () => {
    expect(TOPICS.every((topic) => topic.language === undefined)).toBe(true);
    expect(BENGALI_TOPICS.every((topic) => topic.language === 'bn')).toBe(true);
    expect(BENGALI_TOPICS.every((topic) => /\p{Script=Bengali}/u.test(topic.prompt))).toBe(true);
    expect(HINDI_TOPICS.every((topic) => topic.language === 'hi')).toBe(true);
    expect(HINDI_TOPICS.every((topic) => /\p{Script=Devanagari}/u.test(topic.prompt))).toBe(true);
  });

  it('preserves the original stable topic identifiers', () => {
    expect(TOPICS[0].id).toBe('easy-01');
    expect(BENGALI_TOPICS[0].id).toBe('bn-easy-01');
    expect(HINDI_TOPICS[0].id).toBe('hi-easy-01');
  });

  it('does not immediately return the excluded topic', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const excluded = TOPICS.find((topic) => topic.difficulty === 'easy')!;
    expect(randomTopic('easy', excluded.id).id).not.toBe(excluded.id);
  });

  it('avoids seen topics while the selected difficulty still has fresh ones', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const seenIds = TOPICS.filter((topic) => topic.difficulty === 'medium').slice(0, 12).map((topic) => topic.id);
    const next = randomTopic('medium', undefined, 'en', seenIds);
    expect(seenIds).not.toContain(next.id);
    expect(next.difficulty).toBe('medium');
  });

  it('still returns a valid topic after the whole tier has been seen', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const tier = BENGALI_TOPICS.filter((topic) => topic.difficulty === 'hard');
    const next = randomTopic('hard', undefined, 'bn', tier.map((topic) => topic.id));
    expect(tier.map((topic) => topic.id)).toContain(next.id);
  });

  it('draws only from the requested language', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomTopic('medium', undefined, 'bn').language).toBe('bn');
    expect(randomTopic('medium', undefined, 'hi').language).toBe('hi');
    expect(randomTopic('medium', undefined, 'en').language).toBeUndefined();
  });
});
