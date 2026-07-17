import type { Difficulty, Topic } from '../types';

export const TOPICS: Topic[] = [
  { id: 'easy-01', difficulty: 'easy', category: 'Everyday life', prompt: 'Homework should be optional on weekends.' },
  { id: 'easy-02', difficulty: 'easy', category: 'Food', prompt: 'Breakfast is the most important meal of the day.' },
  { id: 'easy-03', difficulty: 'easy', category: 'Technology', prompt: 'Students should be allowed to use phones in class.' },
  { id: 'easy-04', difficulty: 'easy', category: 'Lifestyle', prompt: 'Living in a small town is better than living in a big city.' },
  { id: 'easy-05', difficulty: 'easy', category: 'Entertainment', prompt: 'Books are more enjoyable than films.' },
  { id: 'easy-06', difficulty: 'easy', category: 'School', prompt: 'School uniforms are a good idea.' },
  { id: 'easy-07', difficulty: 'easy', category: 'Animals', prompt: 'Every child should grow up with a pet.' },
  { id: 'easy-08', difficulty: 'easy', category: 'Travel', prompt: 'A holiday is better when it is carefully planned.' },
  { id: 'easy-09', difficulty: 'easy', category: 'Work', prompt: 'A four-day work week should become standard.' },
  { id: 'easy-10', difficulty: 'easy', category: 'Social life', prompt: 'It is better to have a few close friends than many acquaintances.' },
  { id: 'easy-11', difficulty: 'easy', category: 'Learning', prompt: 'Everyone should learn how to cook.' },
  { id: 'easy-12', difficulty: 'easy', category: 'Sports', prompt: 'Team sports teach more useful skills than individual sports.' },

  { id: 'medium-01', difficulty: 'medium', category: 'Education', prompt: 'University education should be free for everyone.' },
  { id: 'medium-02', difficulty: 'medium', category: 'Technology', prompt: 'Social media companies should verify the age of every user.' },
  { id: 'medium-03', difficulty: 'medium', category: 'Work', prompt: 'Employers should publish salary ranges in every job advertisement.' },
  { id: 'medium-04', difficulty: 'medium', category: 'Environment', prompt: 'Cities should charge drivers to enter crowded downtown areas.' },
  { id: 'medium-05', difficulty: 'medium', category: 'Media', prompt: 'News organizations should avoid reporting opinion polls before elections.' },
  { id: 'medium-06', difficulty: 'medium', category: 'Health', prompt: 'Governments should tax foods with very high sugar content.' },
  { id: 'medium-07', difficulty: 'medium', category: 'Culture', prompt: 'Museums should return historic objects to their countries of origin.' },
  { id: 'medium-08', difficulty: 'medium', category: 'AI', prompt: 'AI-generated content should always carry a visible label.' },
  { id: 'medium-09', difficulty: 'medium', category: 'Transport', prompt: 'Public transport should be free in major cities.' },
  { id: 'medium-10', difficulty: 'medium', category: 'Privacy', prompt: 'Parents should be allowed to monitor all of their teenagers’ online activity.' },
  { id: 'medium-11', difficulty: 'medium', category: 'Democracy', prompt: 'Voting should be compulsory for eligible citizens.' },
  { id: 'medium-12', difficulty: 'medium', category: 'Consumer rights', prompt: 'Fast fashion advertising should be restricted.' },

  { id: 'hard-01', difficulty: 'hard', category: 'Justice', prompt: 'Predictive algorithms should never influence criminal sentencing.' },
  { id: 'hard-02', difficulty: 'hard', category: 'Economics', prompt: 'A universal basic income is preferable to targeted welfare programs.' },
  { id: 'hard-03', difficulty: 'hard', category: 'Technology', prompt: 'Powerful AI systems should require government licensing before deployment.' },
  { id: 'hard-04', difficulty: 'hard', category: 'Environment', prompt: 'Countries should prioritize climate adaptation over emissions reduction.' },
  { id: 'hard-05', difficulty: 'hard', category: 'Speech', prompt: 'Online platforms should be legally responsible for harmful misinformation posted by users.' },
  { id: 'hard-06', difficulty: 'hard', category: 'Ethics', prompt: 'Human genetic enhancement should be permitted under strict regulation.' },
  { id: 'hard-07', difficulty: 'hard', category: 'International relations', prompt: 'Economic sanctions cause more harm than good.' },
  { id: 'hard-08', difficulty: 'hard', category: 'Democracy', prompt: 'Citizens’ assemblies should be able to overrule elected legislatures on long-term issues.' },
  { id: 'hard-09', difficulty: 'hard', category: 'Economics', prompt: 'Companies should be required to give employees voting representation on their boards.' },
  { id: 'hard-10', difficulty: 'hard', category: 'Privacy', prompt: 'The right to digital privacy should outweigh national security surveillance needs.' },
  { id: 'hard-11', difficulty: 'hard', category: 'Science', prompt: 'Public funding should favor practical research over curiosity-driven research.' },
  { id: 'hard-12', difficulty: 'hard', category: 'Law', prompt: 'Legal personhood should be extended to certain natural ecosystems.' },
];

export function randomTopic(difficulty: Difficulty, excludeId?: string): Topic {
  const pool = TOPICS.filter((topic) => topic.difficulty === difficulty && topic.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)] ?? TOPICS[0];
}
