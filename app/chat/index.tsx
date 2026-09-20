import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import Header from '../../components/Header';

interface Conversation {
    id: string;
    initiatorId: string;
    recipientId: string;
    initiator: { id: string; name: string };
    recipient: { id: string; name: string };
    complaint?: { id: string; name: string } | null;
    messages: { content: string; createdAt: string }[];
    updatedAt: string;
}

export default function ChatInbox() {
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/conversations`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setConversations(data); })
            .finally(() => setLoading(false));
    }, [token]);

    const getOther = (conv: Conversation) =>
        conv.initiatorId === user?.id ? conv.recipient : conv.initiator;

    const renderItem = ({ item }: { item: Conversation }) => {
        const other = getOther(item);
        const lastMsg = item.messages[0];
        return (
            <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => router.push({
                    pathname: '/chat/[conversationId]',
                    params: { conversationId: item.id, otherName: other.name }
                })}
            >
                <View style={[styles.avatar, { backgroundColor: '#7C3AED' }]}>
                    <Text style={styles.avatarText}>{other.name[0].toUpperCase()}</Text>
                </View>
                <View style={styles.rowContent}>
                    <View style={styles.rowHeader}>
                        <Text style={[styles.name, { color: colors.text }]}>{other.name}</Text>
                        <Text style={[styles.time, { color: colors.textSecondary }]}>
                            {new Date(item.updatedAt).toLocaleDateString()}
                        </Text>
                    </View>
                    {item.complaint && (
                        <Text style={[styles.context, { color: colors.primary }]}>Re: {item.complaint.name}</Text>
                    )}
                    <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
                        {lastMsg ? lastMsg.content : 'Start the conversation'}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Header title="Messages" />
            {loading ? (
                <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={i => i.id}
                    renderItem={renderItem}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <MessageCircle size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No conversations yet</Text>
                            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                                When a Founder messages you about a found item, it will appear here.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 14 },
    avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 20 },
    rowContent: { flex: 1 },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    name: { fontSize: 16, fontWeight: '600' },
    time: { fontSize: 12 },
    context: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    preview: { fontSize: 14 },
    emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '700' },
    emptyDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
