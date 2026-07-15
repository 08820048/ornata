let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function emitTick(context: AudioContext) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1_650, now);
  oscillator.frequency.exponentialRampToValueAtTime(1_180, now + 0.026);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.018, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.03);
}

export function playOutlineTick() {
  const now = performance.now();
  if (now - lastPlayedAt < 24) return;
  lastPlayedAt = now;

  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume().then(() => {
      if (audioContext) emitTick(audioContext);
    });
    return;
  }
  emitTick(audioContext);
}
