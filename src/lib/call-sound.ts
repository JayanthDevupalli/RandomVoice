"use client";

class CallSoundManager {
  private audioCtx: AudioContext | null = null;
  private ringtoneInterval: NodeJS.Timeout | null = null;
  private ringbackInterval: NodeJS.Timeout | null = null;
  private isPlayingRingtone = false;
  private isPlayingRingback = false;

  private initCtx() {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
  }

  /**
   * Plays a pleasant dual-tone chime ring for incoming calls
   */
  public startIncomingRingtone() {
    if (this.isPlayingRingtone) return;
    this.initCtx();
    this.isPlayingRingtone = true;

    const playChimeSequence = () => {
      if (!this.audioCtx || !this.isPlayingRingtone) return;
      try {
        const now = this.audioCtx.currentTime;

        // Tone 1: E5 (659Hz)
        const osc1 = this.audioCtx.createOscillator();
        const gain1 = this.audioCtx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(659.25, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.18, now + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(this.audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.45);

        // Tone 2: G5 (783.99Hz)
        const osc2 = this.audioCtx.createOscillator();
        const gain2 = this.audioCtx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(783.99, now + 0.15);
        gain2.gain.setValueAtTime(0, now + 0.15);
        gain2.gain.linearRampToValueAtTime(0.18, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(this.audioCtx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.65);

        // Tone 3: B5 (987.77Hz)
        const osc3 = this.audioCtx.createOscillator();
        const gain3 = this.audioCtx.createGain();
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(987.77, now + 0.3);
        gain3.gain.setValueAtTime(0, now + 0.3);
        gain3.gain.linearRampToValueAtTime(0.22, now + 0.35);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc3.connect(gain3);
        gain3.connect(this.audioCtx.destination);
        osc3.start(now + 0.3);
        osc3.stop(now + 1.25);
      } catch (e) {
        console.error("Error playing incoming ringtone:", e);
      }
    };

    playChimeSequence();
    this.ringtoneInterval = setInterval(playChimeSequence, 2400);
  }

  public stopIncomingRingtone() {
    this.isPlayingRingtone = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * Plays a subtle ringback beep tone for outgoing calls ("Tuuut... tuuut...")
   */
  public startOutgoingRingback() {
    if (this.isPlayingRingback) return;
    this.initCtx();
    this.isPlayingRingback = true;

    const playRingbackBeep = () => {
      if (!this.audioCtx || !this.isPlayingRingback) return;
      try {
        const now = this.audioCtx.currentTime;

        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(440, now); // 440 Hz
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(480, now); // 480 Hz

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.setValueAtTime(0.08, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.55);
        osc2.stop(now + 1.55);
      } catch (e) {
        console.error("Error playing outgoing ringback:", e);
      }
    };

    playRingbackBeep();
    this.ringbackInterval = setInterval(playRingbackBeep, 3500);
  }

  public stopOutgoingRingback() {
    this.isPlayingRingback = false;
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
  }

  /**
   * Plays a quick notification beep for call ended or declined
   */
  public playCallEndBeep() {
    this.initCtx();
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.25);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (e) {}
  }

  public stopAll() {
    this.stopIncomingRingtone();
    this.stopOutgoingRingback();
  }
}

export const callSoundManager = new CallSoundManager();
