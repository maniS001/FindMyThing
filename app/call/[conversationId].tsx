import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    RTCPeerConnection, RTCSessionDescription, RTCIceCandidate,
    mediaDevices, RTCView, MediaStream
} from 'react-native-webrtc';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react-native';
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
    const { conversationId, otherName, isInitiator } = useLocalSearchParams<{
        conversationId: string;
        otherName: string;
        isInitiator: string;
    }>();
    const { colors } = useTheme();
    const router = useRouter();
    const initiator = isInitiator === 'true';

    const [callState, setCallState] = useState<CallState>(initiator ? 'connecting' : 'ringing');
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ============ Setup ============
    const setupPC = useCallback(async () => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Get mic audio
        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // ICE candidates → send via WS
        pc.onicecandidate = (e: any) => {
            if (e.candidate) {
                chatService.sendIceCandidate(conversationId, e.candidate.toJSON());
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setCallState('active');
                timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
            } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                endCall();
            }
        };

        return pc;
    }, [conversationId]);

    // ============ Initiate call (Offer) ============
    useEffect(() => {
        if (!initiator) return;
        (async () => {
            const pc = await setupPC();
            const offer = await pc.createOffer({});
            await pc.setLocalDescription(offer);
            chatService.sendCallOffer(conversationId, offer);
        })();

        return () => cleanup();
    }, []);

    // ============ Incoming call — wait for user to accept ============
    const acceptCall = useCallback(async (incomingSdp: any) => {
        const pc = await setupPC();
        await pc.setRemoteDescription(new RTCSessionDescription(incomingSdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        chatService.sendCallAnswer(conversationId, answer);
        setCallState('active');
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }, [conversationId, setupPC]);

    // ============ WS Event Listeners ============
    useEffect(() => {
        const handleAnswer = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            setCallState('active');
        };

        const handleIce = async (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
        };

        const handleEnded = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            setCallState('ended');
            setTimeout(() => router.back(), 1500);
        };

        const handleRejected = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            setCallState('rejected');
            setTimeout(() => router.back(), 1500);
        };

        const handleIncoming = (payload: WSPayload) => {
            if (payload.conversationId !== conversationId) return;
            // If we navigate to this screen with isInitiator=false and get CALL_OFFER, accept it
            if (!initiator && payload.sdp) acceptCall(payload.sdp);
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
    }, [conversationId, initiator, acceptCall]);

    // ============ Controls ============
    const endCall = useCallback(() => {
        chatService.endCall(conversationId);
        cleanup();
        setCallState('ended');
        setTimeout(() => router.back(), 1000);
    }, [conversationId]);

    const rejectCall = useCallback(() => {
        chatService.rejectCall(conversationId);
        cleanup();
        setCallState('rejected');
        setTimeout(() => router.back(), 1000);
    }, [conversationId]);

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (stream) {
            stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setMuted(m => !m);
        }
    }, []);

    const cleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        pcRef.current?.close();
    };

    const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const stateLabels: Record<CallState, string> = {
        connecting: 'Calling...',
        ringing: 'Incoming call...',
        active: formatDuration(duration),
        ended: 'Call ended',
        rejected: 'Call declined'
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#1a0533' }]}>
            {/* Avatar & Name */}
            <View style={styles.top}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(otherName || '?')[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{otherName}</Text>
                <Text style={styles.status}>{stateLabels[callState]}</Text>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
                {callState === 'active' && (
                    <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: muted ? '#EF4444' : 'rgba(255,255,255,0.15)' }]} onPress={toggleMute}>
                        {muted ? <MicOff size={28} color="#FFF" /> : <Mic size={28} color="#FFF" />}
                        <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
                    </TouchableOpacity>
                )}

                {/* End / Reject */}
                {callState === 'ringing' ? (
                    <View style={styles.ringerRow}>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#10B981' }]} onPress={() => acceptCall(null)}>
                            <Phone size={32} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={rejectCall}>
                            <PhoneOff size={32} color="#FFF" />
                            <Text style={styles.bigBtnLabel}>Decline</Text>
                        </TouchableOpacity>
                    </View>
                ) : (callState === 'connecting' || callState === 'active') ? (
                    <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#EF4444' }]} onPress={endCall}>
                        <PhoneOff size={32} color="#FFF" />
                        <Text style={styles.bigBtnLabel}>End Call</Text>
                    </TouchableOpacity>
                ) : (
                    <Text style={{ color: '#FFF', fontSize: 18, marginTop: 20 }}>{stateLabels[callState]}</Text>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'space-between', paddingVertical: 48 },
    top: { alignItems: 'center', gap: 16 },
    avatar: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20
    },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 44 },
    name: { color: '#FFF', fontSize: 28, fontWeight: '700' },
    status: { color: 'rgba(255,255,255,0.6)', fontSize: 18 },
    controls: { alignItems: 'center', gap: 32, paddingHorizontal: 40 },
    ctrlBtn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
    ctrlLabel: { color: '#FFF', fontSize: 12, marginTop: 4 },
    ringerRow: { flexDirection: 'row', gap: 60 },
    bigBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', gap: 4 },
    bigBtnLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
