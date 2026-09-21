import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    RTCPeerConnection, RTCSessionDescription, RTCIceCandidate,
    mediaDevices, MediaStream
} from 'react-native-webrtc';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import chatService, { WSPayload } from '../../services/chatService';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

type CallState = 'connecting' | 'ringing' | 'active' | 'ended' | 'rejected';

export default function CallScreen() {
    const { conversationId, otherName, isInitiator, incomingSdp } = useLocalSearchParams<{
        conversationId: string;
        otherName: string;
        isInitiator: string;
        incomingSdp: string;
    }>();
    const { colors } = useTheme();
    const router = useRouter();
    const initiator = isInitiator === 'true';

    const [callState, setCallState] = useState<CallState>(initiator ? 'connecting' : 'ringing');
    const [muted, setMuted] = useState(false);
    const [speakerOn, setSpeakerOn] = useState(false);
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const ringVibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Ringing vibration pattern for caller
    const startCallerRinging = () => {
        ringVibrationRef.current = setInterval(() => {
            Vibration.vibrate(400);
        }, 2000);
    };
    const stopRinging = () => {
        if (ringVibrationRef.current) clearInterval(ringVibrationRef.current);
        Vibration.cancel();
    };

    // ============ Setup PeerConnection ============
    const setupPC = useCallback(async () => {
        const pc = new RTCPeerConnection(ICE_SERVERS as any);
        pcRef.current = pc;

        const stream: MediaStream = await mediaDevices.getUserMedia({ audio: true, video: false }) as MediaStream;
        localStreamRef.current = stream;
        stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

        pc.onicecandidate = (e: any) => {
            if (e.candidate) {
                chatService.sendIceCandidate(conversationId, e.candidate.toJSON());
            }
        };

        pc.onconnectionstatechange = () => {
            const state = (pc as any).connectionState;
            if (state === 'connected') {
                stopRinging();
                setCallState('active');
                timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            } else if (['disconnected', 'failed', 'closed'].includes(state)) {
                cleanup(false);
                setCallState('ended');
                setTimeout(() => router.back(), 1500);
            }
        };

        return pc;
    }, [conversationId]);

    // ============ Initiator: Create and send offer ============
    useEffect(() => {
        if (!initiator) return;
        (async () => {
            startCallerRinging();
            const pc = await setupPC();
            const offer = await pc.createOffer({} as any);
            await pc.setLocalDescription(offer as any);
            chatService.sendCallOffer(conversationId, offer);
        })();
        return () => cleanup(true);
    }, []);

    // ============ Recipient: Accept call immediately if SDP passed via params ============
    useEffect(() => {
        if (initiator || !incomingSdp) return;
        const sdp = JSON.parse(incomingSdp);
        acceptCall(sdp);
    }, []);

    const acceptCall = useCallback(async (incomingOffer: any) => {
        stopRinging();
        const pc = await setupPC();
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer) as any);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer as any);
        chatService.sendCallAnswer(conversationId, answer);
        setCallState('active');
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }, [conversationId, setupPC]);

    // ============ WS Event Listeners ============
    useEffect(() => {
        const handleAnswer = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp) as any);
            stopRinging();
            setCallState('active');
        };

        const handleIce = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(payload.candidate) as any); } catch {}
        };

        const handleEnded = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            stopRinging();
            setCallState('ended');
            setTimeout(() => router.back(), 1500);
        };

        const handleRejected = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            stopRinging();
            setCallState('rejected');
            setTimeout(() => router.back(), 1500);
        };

        chatService.on('CALL_ANSWER', handleAnswer);
        chatService.on('ICE_CANDIDATE', handleIce);
        chatService.on('CALL_ENDED', handleEnded);
        chatService.on('CALL_REJECTED', handleRejected);

        return () => {
            chatService.off('CALL_ANSWER', handleAnswer);
            chatService.off('ICE_CANDIDATE', handleIce);
            chatService.off('CALL_ENDED', handleEnded);
            chatService.off('CALL_REJECTED', handleRejected);
        };
    }, [conversationId]);

    // ============ Controls ============
    const endCall = useCallback(() => {
        chatService.endCall(conversationId);
        cleanup(true);
        setCallState('ended');
        setTimeout(() => router.back(), 1000);
    }, [conversationId]);

    const rejectCall = useCallback(() => {
        chatService.rejectCall(conversationId);
        cleanup(true);
        setCallState('rejected');
        setTimeout(() => router.back(), 1000);
    }, [conversationId]);

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            stream.getAudioTracks().forEach((t: any) => { t.enabled = !t.enabled; });
            setMuted(m => !m);
        }
    }, []);

    const toggleSpeaker = useCallback(() => {
        // react-native-webrtc doesn't have built-in speaker toggle
        // This toggles a visual state; audio routing is managed by OS during call
        setSpeakerOn(s => !s);
    }, []);

    const cleanup = (sendSignal: boolean) => {
        stopRinging();
        if (timerRef.current) clearInterval(timerRef.current);
        localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
        if (sendSignal) pcRef.current?.close();
    };

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const stateLabels: Record<CallState, string> = {
        connecting: 'Calling... 📞',
        ringing: 'Incoming call... 🔔',
        active: formatDuration(duration),
        ended: 'Call ended',
        rejected: 'Call declined',
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#1a0533' }]}>
            {/* Caller info */}
            <View style={styles.top}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(otherName || '?')[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{otherName}</Text>
                <Text style={styles.status}>{stateLabels[callState]}</Text>
                {callState === 'connecting' && (
                    <Text style={styles.hint}>Waiting for {otherName} to answer...</Text>
                )}
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                {/* Mute + Speaker row (only when active) */}
                {callState === 'active' && (
                    <View style={styles.auxRow}>
                        <TouchableOpacity
                            style={[styles.auxBtn, { backgroundColor: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }]}
                            onPress={toggleMute}
                        >
                            {muted ? <MicOff size={26} color="#FFF" /> : <Mic size={26} color="#FFF" />}
                            <Text style={styles.auxLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.auxBtn, { backgroundColor: speakerOn ? '#7C3AED' : 'rgba(255,255,255,0.15)' }]}
                            onPress={toggleSpeaker}
                        >
                            {speakerOn ? <Volume2 size={26} color="#FFF" /> : <VolumeX size={26} color="#FFF" />}
                            <Text style={styles.auxLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Accept / Decline / End */}
                {callState === 'ringing' ? (
                    <View style={styles.ringerRow}>
                        <View style={styles.callOption}>
                            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={rejectCall}>
                                <PhoneOff size={32} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.callOptionLabel}>Decline</Text>
                        </View>
                        <View style={styles.callOption}>
                            <TouchableOpacity
                                style={[styles.bigBtn, { backgroundColor: '#10B981' }]}
                                onPress={() => {
                                    // SDP already accepted on mount via incomingSdp param
                                    // This button is for visual feedback only when modal was bypassed
                                    if (incomingSdp) {
                                        acceptCall(JSON.parse(incomingSdp));
                                    }
                                }}
                            >
                                <Phone size={32} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.callOptionLabel}>Accept</Text>
                        </View>
                    </View>
                ) : (callState === 'connecting' || callState === 'active') ? (
                    <View style={styles.callOption}>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={endCall}>
                            <PhoneOff size={32} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.callOptionLabel}>End Call</Text>
                    </View>
                ) : (
                    <Text style={styles.endedText}>{stateLabels[callState]}</Text>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', paddingVertical: 48 },
    top: { alignItems: 'center', gap: 14, paddingTop: 20 },
    avatar: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
    },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 44 },
    name: { color: '#FFF', fontSize: 28, fontWeight: '700' },
    status: { color: 'rgba(255,255,255,0.7)', fontSize: 18 },
    hint: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 4 },
    controls: { alignItems: 'center', gap: 32, paddingHorizontal: 40, paddingBottom: 20 },
    auxRow: { flexDirection: 'row', gap: 32 },
    auxBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', gap: 4 },
    auxLabel: { color: '#FFF', fontSize: 11, marginTop: 2 },
    ringerRow: { flexDirection: 'row', gap: 64 },
    callOption: { alignItems: 'center', gap: 10 },
    callOptionLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
    bigBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
    endedText: { color: '#FFF', fontSize: 20, marginTop: 20 },
});
