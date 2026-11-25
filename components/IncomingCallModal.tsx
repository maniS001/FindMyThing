import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, AppState, Platform } from 'react-native';
import { Phone, PhoneOff } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/api';
import chatService, { WSPayload } from '../services/chatService';
import { useCall } from '../contexts/CallContext';
import soundEffects from '../utils/soundEffects';

export default function IncomingCallModal() {
    const router = useRouter();
    const pathname = usePathname();
    const { activeCall, setActiveCall } = useCall();
    const [incoming, setIncoming] = useState<(WSPayload & { iceCandidates?: any[] }) | null>(null);
    const activeCallRef = useRef(activeCall);
    const pathnameRef = useRef(pathname);

    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);

    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    const checkPendingCalls = useCallback(async () => {
        try {
            // Don't pop modal if already inside a call screen or already has an active call
            if (activeCallRef.current || pathnameRef.current.startsWith('/call/')) return;
            const token = await AsyncStorage.getItem('token');
            if (!token) return;

            const res = await fetch(`${API_URL}/calls/pending`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.call?.conversationId) {
                setIncoming((curr) => {
                    if (curr && curr.callRequestId === data.call.callRequestId) return curr;
                    soundEffects.startRingtone();
                    return {
                        type: 'CALL_INCOMING',
                        conversationId: data.call.conversationId,
                        callRequestId: data.call.callRequestId,
                        senderId: data.call.senderId,
                        senderName: data.call.senderName,
                        sdp: data.call.sdp,
                        iceCandidates: data.call.iceCandidates || [],
                    };
                });
            }
        } catch {}
    }, []);

    useEffect(() => {
        const handleIncoming = (payload: WSPayload) => {
            if (pathnameRef.current.startsWith(`/call/${payload.conversationId}`)) return;
            setIncoming(payload);
            soundEffects.startRingtone();
        };

        const handleCallerCancel = (payload: WSPayload) => {
            setIncoming(curr => {
                if (curr && curr.conversationId === payload.conversationId) {
                    soundEffects.stopRingtone();
                    return null;
                }
                return curr;
            });
        };

        chatService.on('CALL_INCOMING', handleIncoming);
        chatService.on('CALL_ENDED', handleCallerCancel);
        chatService.on('CALL_REJECTED', handleCallerCancel);

        // Also check pending calls when app opens or returns from background
        checkPendingCalls();

        let sub: any = null;
        if (Platform.OS !== 'web') {
            sub = AppState.addEventListener('change', (state) => {
                if (state === 'active') {
                    checkPendingCalls();
                }
            });
        }

        return () => {
            chatService.off('CALL_INCOMING', handleIncoming);
            chatService.off('CALL_ENDED', handleCallerCancel);
            chatService.off('CALL_REJECTED', handleCallerCancel);
            sub?.remove?.();
            soundEffects.stopRingtone();
        };
    }, [checkPendingCalls]);

    const accept = useCallback(() => {
        if (!incoming) return;
        soundEffects.stopRingtone();
        const { conversationId, senderName, sdp, callRequestId } = incoming;
        const sdpStr = sdp ? JSON.stringify(sdp) : '';

        setActiveCall({
            conversationId: conversationId!,
            otherName: senderName || 'Unknown',
            isInitiator: false,
            status: 'connecting',
            duration: 0,
            muted: false,
            incomingSdp: sdpStr,
        });

        setIncoming(null);
        (router as any).push({
            pathname: '/call/[conversationId]',
            params: {
                conversationId: conversationId!,
                otherName: senderName || 'Unknown',
                isInitiator: 'false',
                incomingSdp: sdpStr,
                callRequestId: callRequestId || '',
                autoAccept: 'true',
            }
        });
    }, [incoming, router, setActiveCall]);

    const decline = useCallback(async () => {
        if (!incoming) return;
        soundEffects.stopRingtone();
        chatService.rejectCall(incoming.conversationId!);
        if (incoming.callRequestId) {
            try {
                const token = await AsyncStorage.getItem('token');
                if (token) {
                    await fetch(`${API_URL}/calls/${incoming.callRequestId}/reject`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                    });
                }
            } catch {}
        }
        setIncoming(null);
    }, [incoming]);

    if (!incoming) return null;

    return (
        <Modal transparent animationType="slide" visible>
            <View style={styles.overlay} onTouchStart={() => soundEffects.startRingtone()}>
                <View style={styles.card}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(incoming.senderName || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.callerName}>{incoming.senderName || 'Caller'}</Text>
                    <Text style={styles.subtitle}>FindMyThing In-App Call</Text>

                    <View style={styles.btns}>
                        <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={decline}>
                            <PhoneOff size={32} color="#FFF" />
                            <Text style={styles.btnLabel}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={accept}>
                            <Phone size={32} color="#FFF" />
                            <Text style={styles.btnLabel}>Accept</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    card: {
        backgroundColor: '#1a0533',
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        paddingTop: 32, paddingBottom: 56, paddingHorizontal: 40,
        alignItems: 'center', gap: 12,
    },
    avatar: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20,
        marginBottom: 8,
    },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 36 },
    callerName: { color: '#FFF', fontSize: 26, fontWeight: '700' },
    subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: 16 },
    btns: { flexDirection: 'row', gap: 48, marginTop: 8 },
    btn: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', gap: 4 },
    declineBtn: { backgroundColor: '#EF4444' },
    acceptBtn: { backgroundColor: '#10B981' },
    btnLabel: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
