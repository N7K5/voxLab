/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import type { SpeechLanguage } from '../types';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7';
const MIN_ACCEPT_SCORE = 0.55;
const MIN_ACCEPT_MARGIN = 0.12;

export type TopicSuitability = 'suitable' | 'too_narrow' | 'one_sided' | 'not_a_motion';

export interface TopicSuitabilityLabel {
  verdict: TopicSuitability;
  text: string;
}

interface VerificationMessage {
  id: string;
  prompt: string;
  language?: SpeechLanguage;
}

interface ZeroShotOutput {
  labels: string[];
  scores: number[];
}

type ZeroShotPipeline = (
  text: string,
  labels: string[],
  options: { hypothesis_template: string; multi_label: boolean },
) => Promise<ZeroShotOutput>;

let classifierPromise: Promise<ZeroShotPipeline> | null = null;

function post(id: string, payload: Record<string, unknown>): void {
  (globalThis as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ...payload });
}

function normalizeLanguage(value: unknown): SpeechLanguage {
  return value === 'bn' || value === 'hi' ? value : 'en';
}

export function buildTopicSuitabilityLabels(language: SpeechLanguage): TopicSuitabilityLabel[] {
  if (language === 'bn') return [
    { verdict: 'suitable', text: 'একটি স্পষ্ট, বিস্তৃত ও ভারসাম্যপূর্ণ বিতর্কের প্রস্তাব, যার পক্ষে ও বিপক্ষে যুক্তিসঙ্গত যুক্তি আছে' },
    { verdict: 'too_narrow', text: 'একটি অতিরিক্ত ব্যক্তিগত, তুচ্ছ বা সংকীর্ণ বক্তব্য, যা সাধারণ বিতর্কের বিষয় নয়' },
    { verdict: 'one_sided', text: 'একটি একপেশে বক্তব্য, যার একটি পক্ষ যুক্তিসঙ্গতভাবে সমর্থন করা যায় না' },
    { verdict: 'not_a_motion', text: 'একটি প্রশ্ন, অসম্পূর্ণ বাক্য, তথ্য খোঁজার অনুরোধ বা অস্পষ্ট বিষয়; বিতর্কের প্রস্তাব নয়' },
  ];
  if (language === 'hi') return [
    { verdict: 'suitable', text: 'एक स्पष्ट, व्यापक और संतुलित वाद-विवाद प्रस्ताव, जिसके पक्ष और विपक्ष में उचित तर्क हैं' },
    { verdict: 'too_narrow', text: 'एक अत्यधिक निजी, मामूली या संकीर्ण कथन, जो सामान्य बहस का विषय नहीं है' },
    { verdict: 'one_sided', text: 'एक एकतरफ़ा कथन, जिसके किसी एक पक्ष का उचित समर्थन नहीं किया जा सकता' },
    { verdict: 'not_a_motion', text: 'एक प्रश्न, अधूरा वाक्य, तथ्य खोजने का अनुरोध या अस्पष्ट विषय; वाद-विवाद प्रस्ताव नहीं' },
  ];
  return [
    { verdict: 'suitable', text: 'a clear, broad and balanced debate motion with reasonable arguments on both sides' },
    { verdict: 'too_narrow', text: 'an overly personal, trivial or narrow statement that is not a general debate topic' },
    { verdict: 'one_sided', text: 'a one-sided statement for which one side cannot be defended reasonably' },
    { verdict: 'not_a_motion', text: 'a question, fragment, factual lookup request or unclear subject rather than a debate motion' },
  ];
}

export function resolveTopicSuitability(
  output: Pick<ZeroShotOutput, 'labels' | 'scores'>,
  labels: TopicSuitabilityLabel[],
): { verdict: TopicSuitability; confidence: number; accepted: boolean } {
  const topLabel = output.labels[0];
  const topScore = Number.isFinite(output.scores[0]) ? output.scores[0] : 0;
  const secondScore = Number.isFinite(output.scores[1]) ? output.scores[1] : 0;
  const matched = labels.find((label) => label.text === topLabel);
  const verdict = matched?.verdict ?? 'not_a_motion';
  const accepted = verdict === 'suitable'
    && topScore >= MIN_ACCEPT_SCORE
    && topScore - secondScore >= MIN_ACCEPT_MARGIN;
  return { verdict, confidence: topScore, accepted };
}

function resultReason(language: SpeechLanguage, verdict: TopicSuitability, accepted: boolean): string {
  if (accepted) {
    if (language === 'bn') return 'বিষয়টি যথেষ্ট বিস্তৃত, স্পষ্ট এবং উভয় পক্ষেই যুক্তি তৈরির সুযোগ দেয়।';
    if (language === 'hi') return 'विषय पर्याप्त व्यापक और स्पष्ट है तथा दोनों पक्षों के लिए तर्क बनाने की गुंजाइश देता है।';
    return 'The motion is broad and clear enough to support meaningful arguments on both sides.';
  }
  if (language === 'bn') {
    if (verdict === 'too_narrow') return 'বিষয়টি খুব ব্যক্তিগত বা সংকীর্ণ। এটিকে বৃহত্তর কোনো দল, প্রতিষ্ঠান বা নীতির ওপর প্রয়োগ করে লিখুন।';
    if (verdict === 'one_sided') return 'বিষয়টির একটি পক্ষ যুক্তিসঙ্গতভাবে রক্ষা করা কঠিন। আরও বাস্তব একটি বিনিময় বা খরচ যোগ করুন।';
    return 'এটিকে প্রশ্ন বা শিরোনাম নয়, একটি স্পষ্ট বিতর্কযোগ্য বক্তব্য হিসেবে লিখুন।';
  }
  if (language === 'hi') {
    if (verdict === 'too_narrow') return 'विषय बहुत निजी या संकीर्ण है। इसे किसी बड़े समूह, संस्था या नीति पर लागू करके लिखें।';
    if (verdict === 'one_sided') return 'इस विषय के एक पक्ष का उचित बचाव करना कठिन है। कोई वास्तविक समझौता, लागत या विकल्प जोड़ें।';
    return 'इसे प्रश्न या शीर्षक के बजाय एक स्पष्ट, बहस योग्य कथन के रूप में लिखें।';
  }
  if (verdict === 'too_narrow') return 'The topic is too personal or narrow. Apply it to a broader group, institution, or policy.';
  if (verdict === 'one_sided') return 'One side is difficult to defend reasonably. Add a real trade-off, cost, or competing value.';
  return 'Write it as one clear debatable statement rather than a question, heading, or factual lookup.';
}

function loadClassifier(id: string): Promise<ZeroShotPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline('zero-shot-classification', MODEL, {
      dtype: 'q8',
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        post(id, {
          type: 'status',
          message: progress.status === 'progress'
            ? `Loading ${progress.file ?? 'topic-check model'} (browser cache or network)…`
            : 'Preparing the local topic checker…',
          progress: typeof progress.progress === 'number' ? progress.progress : undefined,
        });
      },
    }).then((loaded) => loaded as unknown as ZeroShotPipeline).catch((error) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

async function handleMessage(event: MessageEvent<VerificationMessage>): Promise<void> {
  const { id, prompt } = event.data;
  const language = normalizeLanguage(event.data.language);
  try {
    const classifier = await loadClassifier(id);
    post(id, { type: 'status', message: 'Checking breadth, clarity, and balance…' });
    const labels = buildTopicSuitabilityLabels(language);
    const output = await classifier(prompt, labels.map(({ text }) => text), {
      hypothesis_template: language === 'en' ? 'This draft is {}.' : '{}',
      multi_label: false,
    });
    const result = resolveTopicSuitability(output, labels);
    post(id, {
      type: 'result',
      accepted: result.accepted,
      confidence: result.confidence,
      verdict: result.verdict,
      reason: resultReason(language, result.verdict, result.accepted),
      model: MODEL,
    });
  } catch (error) {
    post(id, { type: 'error', error: error instanceof Error ? error.message : 'The local topic checker failed.' });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  (globalThis as unknown as DedicatedWorkerGlobalScope).onmessage = handleMessage;
}
