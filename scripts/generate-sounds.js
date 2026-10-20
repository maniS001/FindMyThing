const fs = require('fs');
const path = require('path');

function createWavHeader(dataLength, sampleRate = 44100, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size
    header.writeUInt16LE(1, 20);  // PCM format
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return header;
}

// 1. Generate Telephone Ringback (440Hz + 480Hz dual tone, 2s tone, 2s silence)
function generateRingback() {
    const sampleRate = 44100;
    const duration = 4.0; // seconds
    const toneDuration = 2.0;
    const totalSamples = Math.floor(sampleRate * duration);
    const dataBuffer = Buffer.alloc(totalSamples * 2);

    for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;
        if (t < toneDuration) {
            // Apply slight attack and release to avoid pops
            let env = 1.0;
            if (t < 0.05) env = t / 0.05;
            else if (t > toneDuration - 0.05) env = (toneDuration - t) / 0.05;

            const s1 = Math.sin(2 * Math.PI * 440 * t);
            const s2 = Math.sin(2 * Math.PI * 480 * t);
            sample = (s1 + s2) * 0.25 * env;
        }
        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        dataBuffer.writeInt16LE(intSample, i * 2);
    }

    const header = createWavHeader(dataBuffer.length, sampleRate);
    return Buffer.concat([header, dataBuffer]);
}

// 2. Generate Pleasant Melodic Ringtone (repeating chime sequence, 3s loop)
function generateRingtone() {
    const sampleRate = 44100;
    const duration = 3.0; // seconds
    const totalSamples = Math.floor(sampleRate * duration);
    const dataBuffer = Buffer.alloc(totalSamples * 2);

    const notes = [
        { freq: 523.25, start: 0.0, dur: 0.25 }, // C5
        { freq: 659.25, start: 0.2, dur: 0.25 }, // E5
        { freq: 783.99, start: 0.4, dur: 0.25 }, // G5
        { freq: 987.77, start: 0.6, dur: 0.35 }, // B5
        { freq: 1046.50, start: 0.9, dur: 0.50 }, // C6
        { freq: 783.99, start: 1.45, dur: 0.25 }, // G5
        { freq: 1046.50, start: 1.65, dur: 0.60 }, // C6
    ];

    for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;

        for (const note of notes) {
            if (t >= note.start && t < note.start + note.dur) {
                const noteT = t - note.start;
                // Decay envelope
                const env = Math.exp(-noteT * 7.0);
                // Fundamental + 2nd harmonic (warm bell/chime)
                const s = Math.sin(2 * Math.PI * note.freq * noteT) +
                          0.4 * Math.sin(2 * Math.PI * note.freq * 2 * noteT);
                sample += s * 0.3 * env;
            }
        }

        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        dataBuffer.writeInt16LE(intSample, i * 2);
    }

    const header = createWavHeader(dataBuffer.length, sampleRate);
    return Buffer.concat([header, dataBuffer]);
}

// Write to public/sounds and assets/sounds
const publicSoundsDir = path.join(__dirname, '..', 'public', 'sounds');
const assetsSoundsDir = path.join(__dirname, '..', 'assets', 'sounds');

fs.mkdirSync(publicSoundsDir, { recursive: true });
fs.mkdirSync(assetsSoundsDir, { recursive: true });

const ringback = generateRingback();
const ringtone = generateRingtone();

fs.writeFileSync(path.join(publicSoundsDir, 'ringback.wav'), ringback);
fs.writeFileSync(path.join(assetsSoundsDir, 'ringback.wav'), ringback);

fs.writeFileSync(path.join(publicSoundsDir, 'ringtone.wav'), ringtone);
fs.writeFileSync(path.join(assetsSoundsDir, 'ringtone.wav'), ringtone);

console.log('Successfully generated ringback.wav (' + ringback.length + ' bytes) and ringtone.wav (' + ringtone.length + ' bytes)');
