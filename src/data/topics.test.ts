import { describe, expect, it, vi } from 'vitest';
import { randomTopic, TOPICS } from './topics';

describe('topic bank', () => {
  it('keeps a balanced pool for every difficulty', () => {
    expect(TOPICS.filter((topic) => topic.difficulty === 'easy')).toHaveLength(24);
    expect(TOPICS.filter((topic) => topic.difficulty === 'medium')).toHaveLength(24);
    expect(TOPICS.filter((topic) => topic.difficulty === 'hard')).toHaveLength(24);
  });

  it('uses unique topic identifiers', () => {
    expect(new Set(TOPICS.map((topic) => topic.id)).size).toBe(TOPICS.length);
  });

  it('does not immediately return the excluded topic', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const excluded = TOPICS.find((topic) => topic.difficulty === 'easy')!;
    expect(randomTopic('easy', excluded.id).id).not.toBe(excluded.id);
    vi.restoreAllMocks();
  });
});
