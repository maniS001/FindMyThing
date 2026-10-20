import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Phone, Send, ArrowLeft, Check, CheckCheck, Clock } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import chatService, { WSPayload } from '../../services/chatService';
import soundEffects from '../../utils/soundEffects';

interface Message {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string;
    read: boolean;
    delivered?: boolean;
    pending?: boolean;
}

function formatMessageDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMessageTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
    const { conversationId, otherName } = useLocalSearchParams<{ conversationId: string; otherName: string }>();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);

    // Native keyboard listener (iOS & Android)
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Mobile Web virtual keyboard listener (Chrome & Safari on Android/iOS)
    useEffect(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
            const handleViewportChange = () => {
                if (window.visualViewport) {
                    const diff = window.innerHeight - window.visualViewport.height;
                    // If height decreased by more than 80px, the soft keyboard is open
                    setKeyboardHeight(diff > 80 ? diff : 0);
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                }
            };
            window.visualViewport.addEventListener('resize', handleViewportChange);
            window.visualViewport.addEventListener('scroll', handleViewportChange);
            return () => {
                window.visualViewport?.removeEventListener('resize', handleViewportChange);
                window.visualViewport?.removeEventListener('scroll', handleViewportChange);
            };
        }
    }, []);

    // Load history from REST & mark read
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/conversations/${conversationId}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setMessages(data.map((m: any) => ({
                        id: m.id,
                        content: m.content,
                        senderId: m.senderId,
                        senderName: m.sender?.name || 'Unknown',
                        createdAt: m.createdAt,
                        read: m.read,
                        delivered: m.read || true
                    })));
                    chatService.sendReadReceipt(conversationId);
                }
            })
            .finally(() => setLoading(false));
    }, [conversationId, token]);

    // Handle real-time incoming messages & status updates
    const handleIncoming = useCallback((payload: WSPayload) => {
        if (payload.conversationId !== conversationId) return;

        setMessages(prev => {
            const isMine = payload.senderId === user?.id;
            const filtered = prev.filter(m => !m.pending || m.content !== payload.content);
            return [...filtered, {
                id: payload.messageId || Date.now().toString(),
                content: payload.content || '',
                senderId: payload.senderId || '',
                senderName: payload.senderName || 'Unknown',
                createdAt: payload.createdAt || new Date().toISOString(),
                read: !!payload.read,
                delivered: !!payload.delivered || !isMine
            }];
        });

        if (payload.senderId !== user?.id) {
            if (payload.messageId) {
                chatService.sendDeliveryReceipt(conversationId, payload.messageId);
            }
            chatService.sendReadReceipt(conversationId);
        }

        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, [conversationId, user?.id]);

    const handleDelivered = useCallback((payload: WSPayload) => {
        if (payload.conversationId !== conversationId) return;
        setMessages(prev => prev.map(m =>
            m.id === payload.messageId ? { ...m, delivered: true } : m
        ));
    }, [conversationId]);

    const handleRead = useCallback((payload: WSPayload) => {
        if (payload.conversationId !== conversationId) return;
        setMessages(prev => prev.map(m =>
            m.senderId === user?.id ? { ...m, read: true, delivered: true } : m
        ));
    }, [conversationId, user?.id]);

    useEffect(() => {
        chatService.on('CHAT_MESSAGE', handleIncoming);
        chatService.on('MESSAGE_DELIVERED', handleDelivered);
        chatService.on('MESSAGES_READ', handleRead);

        return () => {
            chatService.off('CHAT_MESSAGE', handleIncoming);
            chatService.off('MESSAGE_DELIVERED', handleDelivered);
            chatService.off('MESSAGES_READ', handleRead);
        };
    }, [handleIncoming, handleDelivered, handleRead]);

    const sendMessage = () => {
        if (!text.trim()) return;
        const content = text.trim();
        setText('');

        const optimistic: Message = {
            id: `pending-${Date.now()}`,
            content,
            senderId: user?.id || '',
            senderName: user?.name || 'You',
            createdAt: new Date().toISOString(),
            read: false,
            delivered: false,
            pending: true
        };
        setMessages(prev => [...prev, optimistic]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        chatService.sendMessage(conversationId, content);
    };

    const startCall = () => {
        soundEffects.startRingback();
        (router as any).push({
            pathname: '/call/[conversationId]',
            params: { conversationId, otherName, isInitiator: 'true' }
        });
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const isMine = item.senderId === user?.id;
        const prevItem = index > 0 ? messages[index - 1] : null;
        const isNewDate = !prevItem ||
            new Date(item.createdAt).toDateString() !== new Date(prevItem.createdAt).toDateString();

        return (
            <View>
                {/* Date Header for first message of each day */}
                {isNewDate && (
                    <View style={styles.dateDivider}>
                        <View style={[styles.datePill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                {formatMessageDate(item.createdAt)}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Message Bubble */}
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                    <View style={[
                        styles.bubble,
                        isMine
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
                    ]}>
                        <Text style={[styles.msgText, { color: isMine ? '#FFF' : colors.text }]}>{item.content}</Text>
                        <View style={styles.metaRow}>
                            <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                                {formatMessageTime(item.createdAt)}
                            </Text>

                            {/* Status ticks for sender */}
                            {isMine && (
                                <View style={styles.tickContainer}>
                                    {item.pending ? (
                                        <Clock size={11} color="rgba(255,255,255,0.7)" />
                                    ) : item.read ? (
                                        <CheckCheck size={14} color="#60A5FA" />
                                    ) : item.delivered ? (
                                        <CheckCheck size={14} color="rgba(255,255,255,0.75)" />
                                    ) : (
                                        <Check size={13} color="rgba(255,255,255,0.75)" />
                                    )}
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            edges={keyboardHeight > 0 ? ['top'] : ['top', 'bottom']}
        >
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

            {/* Messages List */}
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

            {/* Input Bar (pushed above virtual keyboard) */}
            <View style={[
                styles.inputBar,
                { backgroundColor: colors.surface, borderTopColor: colors.border },
                keyboardHeight > 0 && { marginBottom: keyboardHeight }
            ]}>
                <TextInput
                    ref={inputRef}
                    style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    value={text}
                    onChangeText={setText}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={1000}
                    returnKeyType="send"
                    onFocus={() => {
                        setTimeout(() => {
                            flatListRef.current?.scrollToEnd({ animated: true });
                            if (Platform.OS === 'web' && inputRef.current) {
                                (inputRef.current as any)?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
                            }
                        }, 150);
                    }}
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
    dateDivider: {
        alignItems: 'center',
        marginVertical: 12,
    },
    datePill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    dateText: {
        fontSize: 11,
        fontWeight: '600',
    },
    msgRow: { flexDirection: 'row', marginBottom: 4 },
    msgRowRight: { justifyContent: 'flex-end' },
    msgRowLeft: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
    msgText: { fontSize: 15, lineHeight: 22 },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        gap: 4,
    },
    msgTime: { fontSize: 11 },
    tickContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 2,
    },
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
