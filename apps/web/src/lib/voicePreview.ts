let current: HTMLAudioElement | null = null;

/** Play a TTS voice sample; a new play cuts off the previous one. */
export function playVoicePreview(voiceId: string): void {
  current?.pause();
  current = new Audio(`/api/tts/preview/${encodeURIComponent(voiceId)}`);
  void current.play().catch(() => {});
}
