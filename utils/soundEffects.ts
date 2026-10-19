// Synthesized audio ringtones using Web Audio API (zero external assets, instant playback)

class SoundEffectsService {
    private audioCtx: AudioContext | null = null;
    private ringbackTimer: any = null;
    private ringtoneTimer: any = null;
    private isRingbackPlaying = false;
    private isRingtonePlaying = false;
    private activeGainNodes: GainNode[] = [];

    private getAudioContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass();
            }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        return this.audioCtx;
    }

    /**
     * Standard telephone ringback tone for caller side
     * 440 Hz + 480 Hz dual-frequency tone (standard North American / Indian ringback)
     * Cadence: 1.5s tone, 3.5s silence
     */
    startRingback() {
        if (this.isRingbackPlaying) return;
        this.stopAll();
        this.isRingbackPlaying = true;

        const playTone = () => {
            if (!this.isRingbackPlaying) return;
            const ctx = this.getAudioContext();
            if (!ctx) return;

            try {
                const now = ctx.currentTime;
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(440, now);
                osc2.frequency.setValueAtTime(480, now);

                // Smooth fade-in and fade-out to prevent clicks
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
                gain.gain.setValueAtTime(0.12, now + 1.4);
                gain.gain.linearRampToValueAtTime(0, now + 1.5);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                this.activeGainNodes.push(gain);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.55);
                osc2.stop(now + 1.55);

                osc1.onended = () => {
                    this.activeGainNodes = this.activeGainNodes.filter(g => g !== gain);
                };
            } catch (err) {
                console.warn('[SoundEffects] ringback error:', err);
            }
        };

        playTone();
        this.ringbackTimer = setInterval(playTone, 4500);
    }

    stopRingback() {
        this.isRingbackPlaying = false;
        if (this.ringbackTimer) {
            clearInterval(this.ringbackTimer);
            this.ringbackTimer = null;
        }
        this.muteActiveGainNodes();
    }

    /**
     * Melodic incoming call ringtone for receiver side
     * Pleasant chime notes (C5, E5, G5, B5, C6) repeating smoothly
     */
    startRingtone() {
        if (this.isRingtonePlaying) return;
        this.stopAll();
        this.isRingtonePlaying = true;

        const notes = [
            { freq: 523.25, time: 0.0, dur: 0.18 }, // C5
            { freq: 659.25, time: 0.15, dur: 0.18 }, // E5
            { freq: 783.99, time: 0.30, dur: 0.18 }, // G5
            { freq: 987.77, time: 0.45, dur: 0.25 }, // B5
            { freq: 1046.50, time: 0.70, dur: 0.40 }, // C6
            { freq: 783.99, time: 1.15, dur: 0.18 }, // G5
            { freq: 1046.50, time: 1.30, dur: 0.50 }, // C6
        ];

        const playMelody = () => {
            if (!this.isRingtonePlaying) return;
            const ctx = this.getAudioContext();
            if (!ctx) return;

            try {
                const baseTime = ctx.currentTime;
                notes.forEach(({ freq, time, dur }) => {
                    if (!this.isRingtonePlaying) return;
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, baseTime + time);

                    gain.gain.setValueAtTime(0, baseTime + time);
                    gain.gain.linearRampToValueAtTime(0.2, baseTime + time + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, baseTime + time + dur);

                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    this.activeGainNodes.push(gain);

                    osc.start(baseTime + time);
                    osc.stop(baseTime + time + dur + 0.05);

                    osc.onended = () => {
                        this.activeGainNodes = this.activeGainNodes.filter(g => g !== gain);
                    };
                });
            } catch (err) {
                console.warn('[SoundEffects] ringtone error:', err);
            }
        };

        playMelody();
        this.ringtoneTimer = setInterval(playMelody, 2600);
    }

    stopRingtone() {
        this.isRingtonePlaying = false;
        if (this.ringtoneTimer) {
            clearInterval(this.ringtoneTimer);
            this.ringtoneTimer = null;
        }
        this.muteActiveGainNodes();
    }

    stopAll() {
        this.stopRingback();
        this.stopRingtone();
    }

    private muteActiveGainNodes() {
        const ctx = this.audioCtx;
        if (!ctx) return;
        this.activeGainNodes.forEach(gain => {
            try {
                gain.gain.cancelScheduledValues(ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
            } catch {}
        });
        this.activeGainNodes = [];
    }
}

export const soundEffects = new SoundEffectsService();
export default soundEffects;
