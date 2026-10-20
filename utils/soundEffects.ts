// Robust Sound Effects Service for Web and Mobile

class SoundEffectsService {
    private audioCtx: AudioContext | null = null;
    private ringbackAudio: HTMLAudioElement | null = null;
    private ringtoneAudio: HTMLAudioElement | null = null;
    private isRingbackPlaying = false;
    private isRingtonePlaying = false;
    private ringbackTimer: any = null;
    private ringtoneTimer: any = null;
    private isUnlocked = false;

    constructor() {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            // One-time gesture listener to unlock AudioContext & HTMLAudio on mobile browsers
            const unlock = () => {
                this.unlockAudio();
                document.removeEventListener('touchstart', unlock, true);
                document.removeEventListener('touchend', unlock, true);
                document.removeEventListener('click', unlock, true);
            };
            document.addEventListener('touchstart', unlock, true);
            document.addEventListener('touchend', unlock, true);
            document.addEventListener('click', unlock, true);
        }
    }

    /**
     * Proactively unlocks audio on the first user interaction
     */
    unlockAudio() {
        if (typeof window === 'undefined') return;
        this.isUnlocked = true;

        // 1. Unlock Web Audio Context
        try {
            const ctx = this.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
        } catch {}

        // 2. Pre-create HTMLAudio elements
        try {
            if (!this.ringbackAudio) {
                this.ringbackAudio = new Audio('/sounds/ringback.wav');
                this.ringbackAudio.loop = true;
                this.ringbackAudio.preload = 'auto';
            }
            if (!this.ringtoneAudio) {
                this.ringtoneAudio = new Audio('/sounds/ringtone.wav');
                this.ringtoneAudio.loop = true;
                this.ringtoneAudio.preload = 'auto';
            }
        } catch {}
    }

    private getAudioContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass();
            }
        }
        return this.audioCtx;
    }

    /**
     * Start playing standard telephone ringback tone for caller side
     */
    async startRingback() {
        if (this.isRingbackPlaying) return;
        this.stopAll();
        this.isRingbackPlaying = true;

        // Method 1: HTML5 Audio element (most reliable for loop playback on mobile browsers)
        if (typeof window !== 'undefined') {
            try {
                if (!this.ringbackAudio) {
                    this.ringbackAudio = new Audio('/sounds/ringback.wav');
                    this.ringbackAudio.loop = true;
                }
                this.ringbackAudio.currentTime = 0;
                const playPromise = this.ringbackAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn('[SoundEffects] HTMLAudio ringback blocked, falling back to WebAudio synth:', err);
                        this.playRingbackSynth();
                    });
                }
                return;
            } catch {
                // fallback to synth
            }
        }

        // Method 2: Web Audio Synthesizer fallback
        this.playRingbackSynth();
    }

    private async playRingbackSynth() {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        try {
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
        } catch {}

        const playTone = () => {
            if (!this.isRingbackPlaying) return;
            try {
                const now = ctx.currentTime;
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(440, now);
                osc2.frequency.setValueAtTime(480, now);

                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
                gain.gain.setValueAtTime(0.15, now + 1.8);
                gain.gain.linearRampToValueAtTime(0, now + 2.0);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 2.0);
                osc2.stop(now + 2.0);
            } catch (err) {
                console.warn('[SoundEffects] Synth error:', err);
            }
        };

        playTone();
        this.ringbackTimer = setInterval(playTone, 4000);
    }

    stopRingback() {
        this.isRingbackPlaying = false;
        if (this.ringbackAudio) {
            try {
                this.ringbackAudio.pause();
                this.ringbackAudio.currentTime = 0;
            } catch {}
        }
        if (this.ringbackTimer) {
            clearInterval(this.ringbackTimer);
            this.ringbackTimer = null;
        }
    }

    /**
     * Start playing melodic incoming call ringtone on receiver side
     */
    async startRingtone() {
        if (this.isRingtonePlaying) return;
        this.stopAll();
        this.isRingtonePlaying = true;

        // Method 1: HTML5 Audio element
        if (typeof window !== 'undefined') {
            try {
                if (!this.ringtoneAudio) {
                    this.ringtoneAudio = new Audio('/sounds/ringtone.wav');
                    this.ringtoneAudio.loop = true;
                }
                this.ringtoneAudio.currentTime = 0;
                const playPromise = this.ringtoneAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn('[SoundEffects] HTMLAudio ringtone blocked, falling back to WebAudio synth:', err);
                        this.playRingtoneSynth();
                    });
                }
                return;
            } catch {
                // fallback to synth
            }
        }

        // Method 2: Web Audio Synthesizer fallback
        this.playRingtoneSynth();
    }

    private async playRingtoneSynth() {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        try {
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
        } catch {}

        const notes = [
            { freq: 523.25, time: 0.0, dur: 0.2 },
            { freq: 659.25, time: 0.2, dur: 0.2 },
            { freq: 783.99, time: 0.4, dur: 0.2 },
            { freq: 987.77, time: 0.6, dur: 0.28 },
            { freq: 1046.50, time: 0.9, dur: 0.45 },
            { freq: 783.99, time: 1.45, dur: 0.2 },
            { freq: 1046.50, time: 1.65, dur: 0.55 },
        ];

        const playMelody = () => {
            if (!this.isRingtonePlaying) return;
            try {
                const baseTime = ctx.currentTime;
                notes.forEach(({ freq, time, dur }) => {
                    if (!this.isRingtonePlaying) return;
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, baseTime + time);

                    gain.gain.setValueAtTime(0, baseTime + time);
                    gain.gain.linearRampToValueAtTime(0.25, baseTime + time + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, baseTime + time + dur);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(baseTime + time);
                    osc.stop(baseTime + time + dur + 0.05);
                });
            } catch (err) {
                console.warn('[SoundEffects] Synth ringtone error:', err);
            }
        };

        playMelody();
        this.ringtoneTimer = setInterval(playMelody, 2800);
    }

    stopRingtone() {
        this.isRingtonePlaying = false;
        if (this.ringtoneAudio) {
            try {
                this.ringtoneAudio.pause();
                this.ringtoneAudio.currentTime = 0;
            } catch {}
        }
        if (this.ringtoneTimer) {
            clearInterval(this.ringtoneTimer);
            this.ringtoneTimer = null;
        }
    }

    stopAll() {
        this.stopRingback();
        this.stopRingtone();
    }
}

export const soundEffects = new SoundEffectsService();
export default soundEffects;
