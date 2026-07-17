import { describe, expect, it, vi } from 'vitest';
import { BENGALI_TOPICS, randomTopic, TOPICS } from './topics';

describe('topic bank', () => {
  it('keeps a balanced pool for every difficulty', () => {
    expect(TOPICS.filter((topic) => topic.difficulty === 'easy')).toHaveLength(24);
    expect(TOPICS.filter((topic) => topic.difficulty === 'medium')).toHaveLength(24);
    expect(TOPICS.filter((topic) => topic.difficulty === 'hard')).toHaveLength(24);
  });

  it('uses unique topic identifiers', () => {
    const topics = [...TOPICS, ...BENGALI_TOPICS];
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
  });

  it('keeps a balanced Bengali pool for every difficulty', () => {
    expect(BENGALI_TOPICS.filter((topic) => topic.difficulty === 'easy')).toHaveLength(12);
    expect(BENGALI_TOPICS.filter((topic) => topic.difficulty === 'medium')).toHaveLength(12);
    expect(BENGALI_TOPICS.filter((topic) => topic.difficulty === 'hard')).toHaveLength(12);
    expect(BENGALI_TOPICS.every((topic) => topic.language === 'bn')).toBe(true);
  });

  it('does not immediately return the excluded topic', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const excluded = TOPICS.find((topic) => topic.difficulty === 'easy')!;
    expect(randomTopic('easy', excluded.id).id).not.toBe(excluded.id);
    vi.restoreAllMocks();
  });

  it('draws only from the requested language', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomTopic('medium', undefined, 'bn').language).toBe('bn');
    expect(randomTopic('medium', undefined, 'en').language).toBeUndefined();
    vi.restoreAllMocks();
  });
});
