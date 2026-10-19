import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    RTCPeerConnection, RTCSessionDescription, RTCIceCandidate,
    mediaDevices, MediaStream
} from 'react-native-webrtc';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useCall } from '../../contexts/CallContext';
import chatService, { WSPayload } from '../../services/chatService';
import soundEffects from '../../utils/soundEffects';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
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
    const { activeCall, setActiveCall, updateCall, endActiveCall } = useCall();
    const router = useRouter();
    const initiator = isInitiator === 'true';

    const [callState, setCallState] = useState<CallState>(initiator ? 'connecting' : 'ringing');
    const [muted, setMuted] = useState(false);
    const [speakerOn, setSpeakerOn] = useState(false);
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isExplicitlyEnded = useRef(false);

    // Audio ringback for caller
    const startCallerRinging = () => {
        soundEffects.startRingback();
    };
    const stopRinging = () => {
        soundEffects.stopAll();
    };

    // ============ Setup PeerConnection ============
    const setupPC = useCallback(async () => {
        const pc = new RTCPeerConnection(ICE_SERVERS as any);
        pcRef.current = pc;

        try {
            const stream: MediaStream = await mediaDevices.getUserMedia({ audio: true, video: false }) as MediaStream;
            localStreamRef.current = stream;
            stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
        } catch (err) {
            console.warn('[WebRTC Native] Mic error:', err);
        }

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
                updateCall({ status: 'active' });
                if (!timerRef.current) {
                    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
                }
            } else if (['disconnected', 'failed', 'closed'].includes(state)) {
                if (isExplicitlyEnded.current) {
                    cleanup(false);
                    setCallState('ended');
                    updateCall({ status: 'ended' });
                    setTimeout(() => router.back(), 1500);
                }
            }
        };

        return pc;
    }, [conversationId, updateCall]);

    // ============ Initiator: Create and send offer ============
    useEffect(() => {
        setActiveCall({
            conversationId,
            otherName: otherName || 'User',
            isInitiator: initiator,
            status: initiator ? 'connecting' : 'ringing',
            duration: 0,
            muted: false,
            incomingSdp,
        });

        if (initiator) {
            (async () => {
                startCallerRinging();
                const pc = await setupPC();
                const offer = await pc.createOffer({} as any);
                await pc.setLocalDescription(offer as any);
                chatService.sendCallOffer(conversationId, offer);
            })();
        } else {
            // Recipient: Accept immediately if SDP is passed
            const raw = incomingSdp || activeCall?.incomingSdp;
            if (raw) {
                try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    acceptCall(parsed);
                } catch (e) {
                    console.error('[WebRTC Native] Failed to parse incoming SDP', e);
                }
            }
        }

        return () => {
            stopRinging();
            if (isExplicitlyEnded.current) {
                cleanup(true);
            }
        };
    }, []);

    const acceptCall = useCallback(async (incomingOffer: any) => {
        stopRinging();
        const pc = await setupPC();
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer) as any);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer as any);
        chatService.sendCallAnswer(conversationId, answer);
        setCallState('active');
        updateCall({ status: 'active' });
        if (!timerRef.current) {
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
    }, [conversationId, setupPC, updateCall]);

    // ============ WS Event Listeners ============
    useEffect(() => {
        const handleAnswer = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp) as any);
            stopRinging();
            setCallState('active');
            updateCall({ status: 'active' });
            if (!timerRef.current) {
                timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            }
        };

        const handleIce = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(payload.candidate) as any); } catch {}
        };

        const handleEnded = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            isExplicitlyEnded.current = true;
            stopRinging();
            cleanup(false);
            setCallState('ended');
            updateCall({ status: 'ended' });
            setTimeout(() => {
                setActiveCall(null);
                router.back();
            }, 1200);
        };

        const handleRejected = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            isExplicitlyEnded.current = true;
            stopRinging();
            cleanup(false);
            setCallState('rejected');
            updateCall({ status: 'rejected' });
            setTimeout(() => {
                setActiveCall(null);
                router.back();
            }, 1200);
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
    }, [conversationId, updateCall, setActiveCall]);

    // ============ Controls ============
    const handleEndCall = useCallback(() => {
        isExplicitlyEnded.current = true;
        chatService.endCall(conversationId);
        cleanup(true);
        setCallState('ended');
        updateCall({ status: 'ended' });
        setTimeout(() => {
            setActiveCall(null);
            router.back();
        }, 800);
    }, [conversationId, updateCall, setActiveCall]);

    const handleRejectCall = useCallback(() => {
        isExplicitlyEnded.current = true;
        chatService.rejectCall(conversationId);
        cleanup(true);
        setCallState('rejected');
        updateCall({ status: 'rejected' });
        setTimeout(() => {
            setActiveCall(null);
            router.back();
        }, 800);
    }, [conversationId, updateCall, setActiveCall]);

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            stream.getAudioTracks().forEach((t: any) => { t.enabled = !t.enabled; });
            setMuted(m => !m);
            updateCall({ muted: !muted });
        }
    }, [muted, updateCall]);

    const toggleSpeaker = useCallback(() => {
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
        <SafeAreaView style={[styles.container, { backgroundColor: '#0F172A' }]}>
            {/* Header bar with minimize */}
            <View style={styles.headerBar}>
                <TouchableOpacity
                    style={styles.minimizeBtn}
                    onPress={() => router.back()}
                    activeOpacity={0.7}
                >
                    <ChevronDown size={28} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>In-App Call</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Caller info */}
            <View style={styles.top}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(otherName || '?')[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{otherName}</Text>
                <Text style={[styles.status, callState === 'active' && { color: '#10B981', fontWeight: '700' }]}>
                    {stateLabels[callState]}
                </Text>
                {callState === 'connecting' && (
                    <Text style={styles.hint}>Waiting for {otherName} to answer...</Text>
                )}
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                {/* Mute + Speaker row (available during calling & active) */}
                {(callState === 'connecting' || callState === 'active') && (
                    <View style={styles.midRow}>
                        <TouchableOpacity
                            style={[styles.ctrlBtn, { backgroundColor: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }]}
                            onPress={toggleMute}
                        >
                            {muted ? <MicOff size={26} color="#FFF" /> : <Mic size={26} color="#FFF" />}
                            <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.ctrlBtn, { backgroundColor: speakerOn ? colors.primary : 'rgba(255,255,255,0.15)' }]}
                            onPress={toggleSpeaker}
                        >
                            {speakerOn ? <Volume2 size={26} color="#FFF" /> : <VolumeX size={26} color="#FFF" />}
                            <Text style={styles.ctrlLabel}>{speakerOn ? 'Speaker On' : 'Speaker Off'}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Bottom action button */}
                {callState === 'ringing' ? (
                    <View style={styles.ringerRow}>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#10B981' }]} onPress={() => acceptCall(null)}>
                            <Phone size={34} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={handleRejectCall}>
                            <PhoneOff size={34} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Decline</Text>
                        </TouchableOpacity>
                    </View>
                ) : (callState === 'connecting' || callState === 'active') ? (
                    <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={handleEndCall}>
                        <PhoneOff size={34} color="#FFF" />
                        <Text style={styles.bigBtnLabel}>End Call</Text>
                    </TouchableOpacity>
                ) : (
                    <Text style={styles.endedText}>{stateLabels[callState]}</Text>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', paddingVertical: 20 },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    minimizeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    top: { alignItems: 'center', gap: 16, marginTop: 40 },
    avatar: {
        width: 108, height: 108, borderRadius: 54,
        backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#2563EB', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20,
        elevation: 8,
    },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 48 },
    name: { color: '#FFF', fontSize: 26, fontWeight: '700' },
    status: { color: 'rgba(255,255,255,0.7)', fontSize: 18, marginTop: 4 },
    hint: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
    controls: { alignItems: 'center', gap: 28, paddingHorizontal: 40, marginBottom: 40 },
    midRow: { flexDirection: 'row', gap: 32 },
    ctrlBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', gap: 4 },
    ctrlLabel: { color: '#FFF', fontSize: 11, fontWeight: '500' },
    ringerRow: { flexDirection: 'row', gap: 60 },
    bigBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', gap: 4, elevation: 8 },
    bigBtnLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
    endedText: { color: '#FFF', fontSize: 18, marginTop: 20 },
});
