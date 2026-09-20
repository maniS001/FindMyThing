import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Vibration } from 'react-native';
import { Phone, PhoneOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import chatService, { WSPayload } from '../services/chatService';

export default function IncomingCallModal() {
    const router = useRouter();
    const [incoming, setIncoming] = useState<WSPayload | null>(null);

    useEffect(() => {
        const handleIncoming = (payload: WSPayload) => {
            setIncoming(payload);
            Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);
        };
        chatService.on('CALL_INCOMING', handleIncoming);
        return () => {
            chatService.off('CALL_INCOMING', handleIncoming);
            Vibration.cancel();
        };
    }, []);

    const accept = useCallback(() => {
        if (!incoming) return;
        Vibration.cancel();
        const { conversationId, senderName } = incoming;
        setIncoming(null);
        router.push({
            pathname: '/call/[conversationId]',
            params: { conversationId: conversationId!, otherName: senderName || 'Unknown', isInitiator: 'false' }
        });
    }, [incoming, router]);

    const decline = useCallback(() => {
        if (!incoming) return;
        Vibration.cancel();
        chatService.rejectCall(incoming.conversationId!);
        setIncoming(null);
    }, [incoming]);

    if (!incoming) return null;

    return (
        <Modal transparent animationType="slide" visible>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(incoming.senderName || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.callerName}>{incoming.senderName}</Text>
                    <Text style={styles.subtitle}>FindMate In-App Call</Text>

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
