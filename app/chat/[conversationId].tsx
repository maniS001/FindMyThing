import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Phone, Send, ArrowLeft, Video } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import chatService, { WSPayload } from '../../services/chatService';

interface Message {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string;
    read: boolean;
    pending?: boolean;
}

export default function ChatScreen() {
    const { conversationId, otherName } = useLocalSearchParams<{ conversationId: string; otherName: string }>();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const flatListRef = useRef<FlatList>(null);

    // Load history from REST
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/conversations/${conversationId}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setMessages(data.map((m: any) => ({
                        id: m.id, content: m.content, senderId: m.senderId,
                        senderName: m.sender?.name || 'Unknown', createdAt: m.createdAt, read: m.read
                    })));
                }
            })
            .finally(() => setLoading(false));
    }, [conversationId, token]);

    // Listen for real-time messages
    const handleIncoming = useCallback((payload: WSPayload) => {
        if (payload.conversationId !== conversationId) return;
        setMessages(prev => {
            // Remove pending duplicate if exists
            const filtered = prev.filter(m => !m.pending);
            return [...filtered, {
                id: payload.messageId || Date.now().toString(),
                content: payload.content || '',
                senderId: payload.senderId || '',
                senderName: payload.senderName || 'Unknown',
                createdAt: new Date().toISOString(),
                read: false
            }];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, [conversationId]);

    useEffect(() => {
        chatService.on('CHAT_MESSAGE', handleIncoming);
        return () => chatService.off('CHAT_MESSAGE', handleIncoming);
    }, [handleIncoming]);

    const sendMessage = () => {
        if (!text.trim()) return;
        const content = text.trim();
        setText('');

        // Optimistic UI
        const optimistic: Message = {
            id: `pending-${Date.now()}`, content,
            senderId: user?.id || '', senderName: user?.name || 'You',
            createdAt: new Date().toISOString(), read: false, pending: true
        };
        setMessages(prev => [...prev, optimistic]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        chatService.sendMessage(conversationId, content);
    };

    const startCall = () => {
        (router as any).push({ pathname: '/call/[conversationId]', params: { conversationId, otherName, isInitiator: 'true' } });
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isMine = item.senderId === user?.id;
        return (
            <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                <View style={[
                    styles.bubble,
                    isMine
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
                ]}>
                    <Text style={[styles.msgText, { color: isMine ? '#FFF' : colors.text }]}>{item.content}</Text>
                    <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {item.pending ? '  ⏳' : ''}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
                    <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerAvatar}>
                    <Text style={styles.headerAvatarText}>{(otherName || '?')[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{otherName || 'Chat'}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.primary + '20' }]} onPress={startCall}>
                    <Phone size={20} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Messages */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={m => m.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.list}
                    onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                No messages yet. Say hi! 👋
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Input Bar */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                        value={text}
                        onChangeText={setText}
                        placeholder="Type a message..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        maxLength={1000}
                        returnKeyType="send"
                        onSubmitEditing={sendMessage}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.border }]}
                        onPress={sendMessage}
                        disabled={!text.trim()}
                    >
                        <Send size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 12
    },
    headerBtn: { padding: 4 },
    headerAvatar: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center'
    },
    headerAvatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
    headerName: { fontSize: 17, fontWeight: '600', flex: 1 },
    callBtn: { padding: 10, borderRadius: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 16, gap: 8 },
    msgRow: { flexDirection: 'row', marginBottom: 4 },
    msgRowRight: { justifyContent: 'flex-end' },
    msgRowLeft: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
    msgText: { fontSize: 15, lineHeight: 22 },
    msgTime: { fontSize: 11, marginTop: 4, textAlign: 'right' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { fontSize: 15 },
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, gap: 10
    },
    input: {
        flex: 1, borderRadius: 20, borderWidth: 1,
        paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
        maxHeight: 120, minHeight: 44
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }
});
