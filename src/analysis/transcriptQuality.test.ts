import { describe, expect, it } from 'vitest';
import { automaticTranscriptIssue } from './transcriptQuality';

describe('automaticTranscriptIssue', () => {
  it('rejects a long Whisper repetition loop', () => {
    const transcript = Array.from({ length: 80 }, () => 'school, school is a school').join(', ');
    expect(automaticTranscriptIssue(transcript, 'en')?.kind).toBe('repetition');
  });

  it('rejects the observed mixed-tail school hallucination', () => {
    const transcript = `${Array.from({ length: 45 }, () => 'school is a school').join(', ')}, school is جوچتے بار`;
    expect(automaticTranscriptIssue(transcript, 'bn')?.kind).toBe('repetition');
  });

  it('rejects a wrong-script transcript for Bengali', () => {
    const transcript = 'School should begin later because students need enough sleep and better concentration throughout every lesson.';
    expect(automaticTranscriptIssue(transcript, 'bn')?.kind).toBe('language');
  });

  it('allows natural Bengali with a little English code-switching', () => {
    const transcript = 'আমি এই প্রস্তাবের পক্ষে কারণ শিক্ষার্থীদের পর্যাপ্ত ঘুম দরকার এবং school শুরু হলে তারা class এ ভালো মনোযোগ দিতে পারে।';
    expect(automaticTranscriptIssue(transcript, 'bn')).toBeNull();
  });

  it('rejects a wrong-script transcript for Hindi', () => {
    const transcript = 'School should begin later because students need enough sleep and better concentration throughout every lesson.';
    const issue = automaticTranscriptIssue(transcript, 'hi');
    expect(issue?.kind).toBe('language');
    expect(issue?.message).toContain('Hindi');
  });

  it('allows natural Hindi with a little English code-switching', () => {
    const transcript = 'मैं इस प्रस्ताव के पक्ष में हूँ क्योंकि विद्यार्थियों को पर्याप्त sleep चाहिए और school देर से शुरू होने पर वे बेहतर ध्यान दे सकते हैं।';
    expect(automaticTranscriptIssue(transcript, 'hi')).toBeNull();
  });

  it('allows purposeful repetition in an otherwise varied speech', () => {
    const transcript = 'We need safer streets, we need fairer streets, and we need streets that children can use because public space belongs to everyone.';
    expect(automaticTranscriptIssue(transcript, 'en')).toBeNull();
  });

  it('does not second-guess very short transcripts', () => {
    expect(automaticTranscriptIssue('school school school', 'en')).toBeNull();
  });
});
