import { describe, expect, it } from 'vitest';
import type { AudioMetrics, Topic } from '../types';
import { calculateScores } from './scoring';
import { analyzeText, textTestHelpers } from './textAnalysis';

const audio: AudioMetrics = {
  recordedDurationSeconds: 38,
  speakingSpanSeconds: 32,
  voicedSeconds: 27,
  silenceRatio: 0.18,
  initialSilenceSeconds: 1,
  trailingSilenceSeconds: 1,
  pauseCount: 3,
  longPauseCount: 0,
  averagePauseSeconds: 0.5,
  longestPauseSeconds: 0.7,
  pauses: [],
  averageVolumeDb: -20,
  volumeVariation: 5,
  clippingRatio: 0,
  averagePitchHz: 175,
  pitchVariationSemitones: 2.5,
};

const topic: Topic = {
  id: 'hi-test',
  prompt: 'स्कूलों में वित्तीय शिक्षा अनिवार्य होनी चाहिए।',
  difficulty: 'easy',
  category: 'शिक्षा',
  language: 'hi',
};

describe('Hindi text analysis', () => {
  it('keeps Devanagari combining marks inside words and recognizes the danda', () => {
    expect(textTestHelpers.tokenize('हिन्दी शिक्षा प्रौद्योगिकी', 'hi')).toEqual(['हिन्दी', 'शिक्षा', 'प्रौद्योगिकी']);

    const metrics = analyzeText(
      'मैं इस प्रस्ताव के पक्ष में हूँ। स्कूलों में वित्तीय शिक्षा होनी चाहिए। निष्कर्ष में, यह विद्यार्थियों के काम आएगी।',
      topic,
      'for',
      audio,
    );
    expect(metrics.sentenceCount).toBe(3);
    expect(metrics.wordCount).toBeGreaterThan(12);
    expect(metrics.language).toBe('hi');
  });

  it('extracts Hindi fillers, transitions, reasoning, examples, openings, and conclusions', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ। पहली बात, स्कूलों में वित्तीय शिक्षा अनिवार्य होनी चाहिए क्योंकि इससे विद्यार्थी बजट बनाना सीखते हैं। उम, उदाहरण के लिए, वे आय और खर्च का हिसाब समझ सकते हैं। इसलिए यह शिक्षा भविष्य की समस्याएँ कम करती है। निष्कर्ष में, वित्तीय शिक्षा स्कूलों में ज़रूरी है।';
    const metrics = analyzeText(transcript, topic, 'for', audio);

    expect(metrics.fillerCount).toBe(1);
    expect(metrics.transitionVariety).toBeGreaterThanOrEqual(4);
    expect(metrics.reasoningMarkerCount).toBeGreaterThanOrEqual(2);
    expect(metrics.exampleMarkerCount).toBeGreaterThanOrEqual(1);
    expect(metrics.topicKeywordCoverage).toBeGreaterThan(0.6);
    expect(metrics.hasOpening).toBe(true);
    expect(metrics.hasConclusion).toBe(true);
    expect(metrics.stanceSignal).toBe('aligned');
    expect(metrics.stanceEngine).toBe('Fast Hindi phrase signals');
  });

  it('marks an explicit Hindi opposite-side speech as opposed to the assigned side', () => {
    const transcript = 'मैं इस प्रस्ताव के खिलाफ हूँ। स्कूलों में वित्तीय शिक्षा अनिवार्य नहीं होनी चाहिए, क्योंकि हर विद्यार्थी की ज़रूरत अलग है। पहली बात, स्कूल का समय पहले से सीमित है। उदाहरण के लिए, नया विषय जोड़ने से विज्ञान के लिए समय कम होगा। अंत में, परिवार चाहे तो अलग से यह शिक्षा दे सकता है।';
    const opposed = analyzeText(transcript, topic, 'for', audio);
    const scores = calculateScores(audio, opposed);

    expect(opposed.stanceSignal).toBe('opposed');
    expect(scores.relevance).toBeLessThanOrEqual(28);
    expect(scores.overall).toBeLessThanOrEqual(45);
    expect(analyzeText(transcript, topic, 'against', audio).stanceSignal).toBe('aligned');
  });

  it('recognizes common feminine and plural opposition without a पक्ष or विपक्ष opening', () => {
    const feminine = 'स्कूलों में वित्तीय शिक्षा अनिवार्य नहीं होनी चाहिए क्योंकि इससे समय का नुकसान होगा। यह अनिवार्य नहीं होनी चाहिए और दूसरे विषयों को हानि नहीं पहुँचनी चाहिए।';
    const pluralTopic: Topic = { ...topic, prompt: 'स्कूलों में मोबाइल फोन प्रतिबंधित होने चाहिए।' };
    const plural = 'मोबाइल फोन प्रतिबंधित नहीं होने चाहिए क्योंकि पूर्ण प्रतिबंध से नुकसान होगा। वे प्रतिबंधित नहीं होने चाहिए; स्पष्ट नियम अधिक उपयोगी हैं।';

    expect(analyzeText(feminine, topic, 'for', audio).stanceSignal).toBe('opposed');
    expect(analyzeText(plural, pluralTopic, 'against', audio).stanceSignal).toBe('aligned');
  });

  it('does not invert explicit opposition when the Hindi motion is negative', () => {
    const negativeTopic: Topic = {
      id: 'hi-negative',
      prompt: 'स्कूलों में मोबाइल फोन प्रतिबंधित होने चाहिए।',
      difficulty: 'medium',
      category: 'शिक्षा',
      language: 'hi',
    };
    const transcript = 'मैं इस प्रस्ताव के खिलाफ हूँ। स्कूलों में मोबाइल फोन प्रतिबंधित नहीं होने चाहिए, क्योंकि आपातकाल में संपर्क ज़रूरी है। शिक्षक कक्षा के समय फोन बंद रखने का स्पष्ट नियम बना सकते हैं। अंत में, पूर्ण प्रतिबंध की तुलना में नियंत्रित उपयोग बेहतर है।';

    expect(analyzeText(transcript, negativeTopic, 'against', audio).stanceSignal).toBe('aligned');
  });

  it('distinguishes Hindi support from a negated अधिक नुकसान comparison', () => {
    const sanctionsTopic: Topic = {
      id: 'hi-sanctions',
      prompt: 'आर्थिक प्रतिबंध लाभ से अधिक नुकसान पहुँचाते हैं।',
      difficulty: 'hard',
      category: 'अंतरराष्ट्रीय संबंध',
      language: 'hi',
    };
    const support = 'आर्थिक प्रतिबंध लाभ से अधिक नुकसान पहुँचाते हैं क्योंकि आम परिवार अधिक कीमत चुकाते हैं जबकि नेता उन लागतों से बचे रहते हैं।';
    const opposition = 'आर्थिक प्रतिबंध लाभ से अधिक नुकसान नहीं पहुँचाते क्योंकि लक्षित आर्थिक दबाव युद्ध के बिना नीति बदलने में मदद कर सकता है।';

    expect(analyzeText(support, sanctionsTopic, 'for', audio).stanceSignal).toBe('aligned');
    expect(analyzeText(opposition, sanctionsTopic, 'against', audio).stanceSignal).toBe('aligned');
    expect(analyzeText(opposition, sanctionsTopic, 'for', audio).stanceSignal).toBe('opposed');
  });
});
