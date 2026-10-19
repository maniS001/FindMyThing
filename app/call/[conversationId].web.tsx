// Web version of the call screen — uses browser's built-in WebRTC APIs
// (RTCPeerConnection, getUserMedia are native to all modern browsers)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Phone, PhoneOff, Mic, MicOff, ChevronDown } from 'lucide-react-native';
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

export default function CallScreenWeb() {
    const { conversationId, otherName, isInitiator, incomingSdp } = useLocalSearchParams<{
        conversationId: string;
        otherName: string;
        isInitiator: string;
        incomingSdp?: string;
    }>();
    const { colors } = useTheme();
    const { activeCall, setActiveCall, updateCall, endActiveCall } = useCall();
    const router = useRouter();
    const initiator = isInitiator === 'true';

    const [callState, setCallState] = useState<CallState>(initiator ? 'connecting' : 'ringing');
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isExplicitlyEnded = useRef(false);

    const cleanupWebRTC = () => {
        soundEffects.stopAll();
        if (timerRef.current) clearInterval(timerRef.current);
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        pcRef.current?.close();
        pcRef.current = null;

        // Stop audio player
        if (typeof document !== 'undefined') {
            const player = document.getElementById('findmything-call-audio') as HTMLAudioElement;
            if (player) {
                player.srcObject = null;
                player.remove();
            }
        }
    };

    const setupPC = useCallback(async () => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        try {
            // Get mic audio using browser API
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        } catch (micErr) {
            console.warn('[WebRTC] Microphone access denied or unavailable:', micErr);
        }

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                chatService.sendIceCandidate(conversationId, e.candidate.toJSON());
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[WebRTC] connectionState changed:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                soundEffects.stopRingback();
                setCallState('active');
                updateCall({ status: 'active' });
                if (!timerRef.current) {
                    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
                }
            } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                if (isExplicitlyEnded.current) {
                    cleanupWebRTC();
                    setCallState('ended');
                    updateCall({ status: 'ended' });
                    setTimeout(() => router.back(), 1200);
                }
            }
        };

        // Play received audio in browser
        pc.ontrack = (e) => {
            if (typeof document !== 'undefined') {
                let audio = document.getElementById('findmything-call-audio') as HTMLAudioElement;
                if (!audio) {
                    audio = document.createElement('audio');
                    audio.id = 'findmything-call-audio';
                    audio.autoplay = true;
                    (audio as any).playsInline = true;
                    document.body.appendChild(audio);
                }
                audio.srcObject = e.streams[0];
                audio.play().catch(err => console.warn('[WebRTC audio play autoplay policy]', err));
            }
        };

        return pc;
    }, [conversationId, updateCall]);

    // Recipient: accept call
    const acceptCall = useCallback(async (incomingOffer: any) => {
        console.log('[WebRTC] Accepting incoming offer on web');
        soundEffects.stopAll();
        const pc = await setupPC();
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        chatService.sendCallAnswer(conversationId, answer);
        setCallState('active');
        updateCall({ status: 'active' });
        if (!timerRef.current) {
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
    }, [conversationId, setupPC, updateCall]);

    // Initiator: start offer
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
            soundEffects.startRingback();
            (async () => {
                const pc = await setupPC();
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                chatService.sendCallOffer(conversationId, offer);
            })();
        } else {
            // Recipient: If incoming SDP is available, accept immediately
            const raw = incomingSdp || activeCall?.incomingSdp;
            if (raw) {
                try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    acceptCall(parsed);
                } catch (e) {
                    console.error('[WebRTC] Could not parse incoming SDP', e);
                }
            }
        }

        return () => {
            soundEffects.stopAll();
            // Only teardown if call was explicitly ended, otherwise user navigated/minimized
            if (isExplicitlyEnded.current) {
                cleanupWebRTC();
            }
        };
    }, []);

    // WS Event Listeners
    useEffect(() => {
        const handleAnswer = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            console.log('[WebRTC] Caller received CALL_ANSWER');
            soundEffects.stopRingback();
            try {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                setCallState('active');
                updateCall({ status: 'active' });
                if (!timerRef.current) {
                    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
                }
            } catch (err) {
                console.error('[WebRTC] setRemoteDescription error:', err);
            }
        };

        const handleIce = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            try {
                if (pcRef.current && payload.candidate) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            } catch (err) {
                console.warn('[WebRTC] addIceCandidate failed', err);
            }
        };

        const handleEnded = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            isExplicitlyEnded.current = true;
            soundEffects.stopAll();
            cleanupWebRTC();
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
            soundEffects.stopAll();
            cleanupWebRTC();
            setCallState('rejected');
            updateCall({ status: 'rejected' });
            setTimeout(() => {
                setActiveCall(null);
                router.back();
            }, 1200);
        };

        const handleIncoming = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId || initiator) return;
            if (payload.sdp) acceptCall(payload.sdp);
        };

        chatService.on('CALL_ANSWER', handleAnswer);
        chatService.on('ICE_CANDIDATE', handleIce);
        chatService.on('CALL_ENDED', handleEnded);
        chatService.on('CALL_REJECTED', handleRejected);
        chatService.on('CALL_INCOMING', handleIncoming);

        return () => {
            chatService.off('CALL_ANSWER', handleAnswer);
            chatService.off('ICE_CANDIDATE', handleIce);
            chatService.off('CALL_ENDED', handleEnded);
            chatService.off('CALL_REJECTED', handleRejected);
            chatService.off('CALL_INCOMING', handleIncoming);
        };
    }, [conversationId, initiator, acceptCall, updateCall, setActiveCall]);

    const handleEndCall = useCallback(() => {
        isExplicitlyEnded.current = true;
        soundEffects.stopAll();
        chatService.endCall(conversationId);
        cleanupWebRTC();
        setCallState('ended');
        updateCall({ status: 'ended' });
        setTimeout(() => {
            setActiveCall(null);
            router.back();
        }, 800);
    }, [conversationId, updateCall, setActiveCall]);

    const handleRejectCall = useCallback(() => {
        isExplicitlyEnded.current = true;
        soundEffects.stopAll();
        chatService.rejectCall(conversationId);
        cleanupWebRTC();
        setCallState('rejected');
        updateCall({ status: 'rejected' });
        setTimeout(() => {
            setActiveCall(null);
            router.back();
        }, 800);
    }, [conversationId, updateCall, setActiveCall]);

    const toggleMute = useCallback(() => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
        setMuted(m => !m);
        updateCall({ muted: !muted });
    }, [muted, updateCall]);

    const formatDuration = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const stateLabels: Record<CallState, string> = {
        connecting: 'Calling...',
        ringing: 'Incoming call...',
        active: formatDuration(duration),
        ended: 'Call ended',
        rejected: 'Call declined',
    };

    return (
        <View style={[styles.container, { backgroundColor: '#0F172A' }]}>
            {/* Top Bar with Minimize button */}
            <View style={styles.headerBar}>
                <TouchableOpacity
                    style={styles.minimizeBtn}
                    onPress={() => router.back()}
                    activeOpacity={0.7}
                >
                    <ChevronDown size={28} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>In-App Audio Call</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.top}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(otherName || '?')[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{otherName}</Text>
                <Text style={[styles.status, callState === 'active' && { color: '#10B981', fontWeight: '700' }]}>
                    {stateLabels[callState]}
                </Text>
            </View>

            <View style={styles.controls}>
                {(callState === 'connecting' || callState === 'active') && (
                    <TouchableOpacity
                        style={[styles.ctrlBtn, { backgroundColor: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }]}
                        onPress={toggleMute}
                    >
                        {muted ? <MicOff size={28} color="#FFF" /> : <Mic size={28} color="#FFF" />}
                        <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
                    </TouchableOpacity>
                )}

                {callState === 'ringing' ? (
                    <View style={styles.ringerRow}>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#10B981' }]} onPress={() => acceptCall(null)}>
                            <Phone size={32} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={handleRejectCall}>
                            <PhoneOff size={32} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Decline</Text>
                        </TouchableOpacity>
                    </View>
                ) : (callState === 'connecting' || callState === 'active') ? (
                    <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={handleEndCall}>
                        <PhoneOff size={32} color="#FFF" />
                        <Text style={styles.bigBtnLabel}>End Call</Text>
                    </TouchableOpacity>
                ) : (
                    <Text style={{ color: '#FFF', fontSize: 18, marginTop: 20 }}>{stateLabels[callState]}</Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', paddingVertical: 40, minHeight: '100vh' as any },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
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
    top: { alignItems: 'center', gap: 16, marginTop: 20 },
    avatar: {
        width: 108, height: 108, borderRadius: 54,
        backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#2563EB', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20,
    },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 48 },
    name: { color: '#FFF', fontSize: 26, fontWeight: '700' },
    status: { color: 'rgba(255,255,255,0.7)', fontSize: 18 },
    controls: { alignItems: 'center', gap: 32, paddingHorizontal: 40, marginBottom: 40 },
    ctrlBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
    ctrlLabel: { color: '#FFF', fontSize: 12, marginTop: 4 },
    ringerRow: { flexDirection: 'row', gap: 60 },
    bigBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', gap: 4 },
    bigBtnLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
