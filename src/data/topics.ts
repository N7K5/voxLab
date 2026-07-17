import type { Difficulty, SpeechLanguage, Topic } from '../types';
import { BENGALI_TOPICS } from './topics.bn';
import { ENGLISH_TOPICS } from './topics.en';
import { HINDI_TOPICS } from './topics.hi';

export { BENGALI_TOPICS, ENGLISH_TOPICS, HINDI_TOPICS };

// Keep the original export name for existing callers and saved-history tests.
export const TOPICS = ENGLISH_TOPICS;

const TOPICS_BY_LANGUAGE: Record<SpeechLanguage, Topic[]> = {
  en: ENGLISH_TOPICS,
  bn: BENGALI_TOPICS,
  hi: HINDI_TOPICS,
};

function weightedTopic(pool: Topic[], historyTopicIds: readonly string[]): Topic {
  const historyCounts = new Map<string, number>();
  historyTopicIds.forEach((id) => historyCounts.set(id, (historyCounts.get(id) ?? 0) + 1));

  const unseen = pool.filter((topic) => !historyCounts.has(topic.id));
  // Do not recycle a completed motion while this language/difficulty still has a
  // fresh one. Once the tier is exhausted, prefer the least recent, least used item.
  const candidates = unseen.length > 0 ? unseen : pool;
  const weights = candidates.map((topic) => {
    const count = historyCounts.get(topic.id) ?? 0;
    if (count === 0) return 1;

    // Attempts are stored newest-first, so recent and repeatedly used motions receive
    // the smallest weight when the bank eventually has to recycle a topic.
    const recentIndex = historyTopicIds.indexOf(topic.id);
    const recencyFactor = recentIndex < 5 ? 0.04 : recentIndex < 20 ? 0.15 : 0.4;
    return recencyFactor / (1 + count * 3);
  });

  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let target = Math.random() * totalWeight;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return candidates[index];
  }
  return candidates.at(-1) ?? pool[0];
}

export function randomTopic(
  difficulty: Difficulty,
  excludeId?: string,
  language: SpeechLanguage = 'en',
  historyTopicIds: readonly string[] = [],
): Topic {
  const topics = TOPICS_BY_LANGUAGE[language];
  const pool = topics.filter((topic) => topic.difficulty === difficulty && topic.id !== excludeId);
  return pool.length > 0 ? weightedTopic(pool, historyTopicIds) : topics[0];
}
