import type { TtsLang, TtsVoiceModule } from './types';

/**
 * TTS voice catalog. Picking a specific voice always requires buying it with stardust; the free
 * path is "auto" (no voice sent) — a RANDOM voice of the text's language, so a purchase is what
 * buys control. The referenced models must exist in the piper voices dir — keep this list in
 * sync with scripts/setup-piper.ts and the Dockerfile.
 */
export const ttsVoices: TtsVoiceModule[] = [
  {
    id: 'voice-irina',
    type: 'tts_voice',
    costDust: 1500,
    lang: 'ru',
    gender: 'f',
    model: 'ru_RU-irina-medium',
    labels: { name: 'voice.irina', desc: 'voice.ruF' },
  },
  {
    id: 'voice-denis',
    type: 'tts_voice',
    costDust: 1500,
    lang: 'ru',
    gender: 'm',
    model: 'ru_RU-denis-medium',
    labels: { name: 'voice.denis', desc: 'voice.ruM' },
  },
  {
    id: 'voice-dmitri',
    type: 'tts_voice',
    costDust: 1500,
    lang: 'ru',
    gender: 'm',
    model: 'ru_RU-dmitri-medium',
    labels: { name: 'voice.dmitri', desc: 'voice.ruM' },
  },
  {
    id: 'voice-ruslan',
    type: 'tts_voice',
    costDust: 1500,
    lang: 'ru',
    gender: 'm',
    model: 'ru_RU-ruslan-medium',
    labels: { name: 'voice.ruslan', desc: 'voice.ruM' },
  },
  {
    id: 'voice-tetiana',
    type: 'tts_voice',
    costDust: 1000,
    lang: 'uk',
    gender: 'f',
    model: 'uk_UA-ukrainian_tts-medium',
    speaker: 2,
    labels: { name: 'voice.tetiana', desc: 'voice.ukF' },
  },
  {
    id: 'voice-lada',
    type: 'tts_voice',
    costDust: 1000,
    lang: 'uk',
    gender: 'f',
    model: 'uk_UA-ukrainian_tts-medium',
    speaker: 0,
    labels: { name: 'voice.lada', desc: 'voice.ukF' },
  },
  {
    id: 'voice-mykyta',
    type: 'tts_voice',
    costDust: 1000,
    lang: 'uk',
    gender: 'm',
    model: 'uk_UA-ukrainian_tts-medium',
    speaker: 1,
    labels: { name: 'voice.mykyta', desc: 'voice.ukM' },
  },
  {
    id: 'voice-amy',
    type: 'tts_voice',
    costDust: 1000,
    lang: 'en',
    gender: 'f',
    model: 'en_US-amy-medium',
    labels: { name: 'voice.amy', desc: 'voice.enF' },
  },
  {
    id: 'voice-ryan',
    type: 'tts_voice',
    costDust: 1000,
    lang: 'en',
    gender: 'm',
    model: 'en_US-ryan-medium',
    labels: { name: 'voice.ryan', desc: 'voice.enM' },
  },
];
