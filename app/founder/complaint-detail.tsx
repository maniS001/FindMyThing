import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, MapPin, Phone, MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Card from '../../components/Card';
import NotifyOwnerModal from '../../components/NotifyOwnerModal';
import { API_URL } from '../../constants/api';
import { CONFIG } from '../../constants/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Complaint, getComplaintById, Item, notifyOwner, updateComplaintStatus } from '../../store';
import { showAlert } from '../../utils/alert';

export default function ComplaintDetail() {
    const { id, prefillFromItemId } = useLocalSearchParams<{ id: string; prefillFromItemId?: string }>();
    const { colors } = useTheme();
    const { token } = useAuth();
    const { width } = useWindowDimensions();
    // 24px padding on each side of ScrollView (48) + 16px padding on each side of Card (32) = 80px
    const IMAGE_WIDTH = Math.min(width - 80, 800); // cap max width for large screens
    const router = useRouter();
    const [complaint, setComplaint] = useState<Complaint | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [notifyModalVisible, setNotifyModalVisible] = useState(false);
    const [notifyLoading, setNotifyLoading] = useState(false);
    const [userItems, setUserItems] = useState<Item[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            if (id) {
                const fetchedComplaint = await getComplaintById(id);
                setComplaint(fetchedComplaint);
            }

            if (token) {
                try {
                    const response = await fetch(`${API_URL}/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setUserItems(data.items || []);
                    }
                } catch (error) {
                    console.error('Failed to fetch user items', error);
                }
            }
            setLoading(false);
        };
        fetchData();
    }, [id, token]);

    useEffect(() => {
        if (prefillFromItemId && !loading && userItems.length > 0) {
            setNotifyModalVisible(true);
        }
    }, [prefillFromItemId, loading, userItems]);

    const handleNotify = async (data: { questions: { question: string; answer: string }[]; description: string; phone: string; itemId?: string }) => {
        if (!complaint || !token) return;
        setNotifyLoading(true);
        try {
            await notifyOwner(complaint.id, {
                ...data,
                itemId: data.itemId || ''
            }, token);

            // Update complaint status to NOTIFIED locally and on backend
            await updateComplaintStatus(complaint.id, 'NOTIFIED');

            setNotifyModalVisible(false);
            // Navigate to success screen
            router.push({
                pathname: '/success',
                params: { type: 'notified' }
            });
        } catch (error) {
            showAlert('Error', 'Failed to notify owner.');
        } finally {
            setNotifyLoading(false);
        }
    };


    const handleMessage = async () => {
        if (!complaint.userId || !token) return;
        try {
            const res = await fetch(`${API_URL}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ recipientId: complaint.userId, complaintId: complaint.id })
            });
            const conv = await res.json();
            router.push({ pathname: '/chat/[conversationId]', params: { conversationId: conv.id, otherName: (complaint as any).user?.name || 'User' } });
        } catch { showAlert('Error', 'Failed to open chat'); }
    };

    const handleCall = async () => {
        if (!complaint.userId || !token) return;
        try {
            const res = await fetch(`${API_URL}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ recipientId: complaint.userId, complaintId: complaint.id })
            });
            const conv = await res.json();
            router.push({ pathname: '/call/[conversationId]', params: { conversationId: conv.id, otherName: (complaint as any).user?.name || 'User', isInitiator: 'true' } });
        } catch { showAlert('Error', 'Failed to start call'); }
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Text style={{ color: colors.text }}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!complaint) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Text style={{ color: colors.text }}>Complaint not found</Text>
                </View>
            </SafeAreaView>
        );
    }

    let images: string[] = [];
    if (complaint.imageUris && Array.isArray(complaint.imageUris)) {
        images = complaint.imageUris;
    } else if (typeof complaint.imageUris === 'string') {
        try {
            const parsed = JSON.parse(complaint.imageUris);
            if (Array.isArray(parsed)) images = parsed;
            else images = [complaint.imageUris];
        } catch (e) {
            images = [complaint.imageUris];
        }
    }

    const isResolved = complaint.status === 'RESOLVED' || complaint.status === 'CLOSED';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Card>
                    {images.length > 0 && (
                        <View style={styles.imageContainer}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.imageScrollContent}
                                snapToInterval={IMAGE_WIDTH}
                                decelerationRate="fast"
                                pagingEnabled={false}
                            >
                                {images.map((uri: string, index: number) => (
                                    <Image
                                        key={index}
                                        source={{ uri }}
                                        style={[styles.scrollImage, { width: IMAGE_WIDTH }]}
                                        resizeMode="contain"
                                    />
                                ))}
                            </ScrollView>
                            {images.length > 1 && (
                                <View style={styles.pagination}>
                                    <Text style={styles.paginationText}>
                                        Swipe to see more photos ({images.length})
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    <View style={styles.header}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{complaint.name}</Text>
                        <View style={[
                            styles.badge,
                            { backgroundColor: isResolved ? '#10B981' : '#EF4444' }
                        ]}>
                            <Text style={styles.badgeText}>
                                {isResolved ? 'Resolved' : 'Lost Item'}
                            </Text>
                        </View>
                    </View>

                    {complaint.category && (
                        <View style={styles.categoryContainer}>
                            <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>Category:</Text>
                            <Text style={[styles.categoryValue, { color: colors.text }]}>{complaint.category}</Text>
                        </View>
                    )}

                    <View style={styles.section}>
                        <View style={styles.infoRow}>
                            <MapPin size={20} color={colors.primary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Location</Text>
                                <Text style={[styles.infoValue, { color: colors.text }]}>{complaint.location}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <Calendar size={20} color={colors.primary} />
                            <View style={styles.infoContent}>
                                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Date Lost</Text>
                                <Text style={[styles.infoValue, { color: colors.text }]}>{complaint.date}</Text>
                            </View>
                        </View>

                        {/* In-app Message & Call -- no phone numbers exposed */}
                        {complaint.userId && complaint.userId !== user?.id && (
                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                    onPress={handleMessage}
                                >
                                    <MessageCircle size={20} color="#FFF" />
                                    <Text style={styles.actionBtnText}>Message</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                                    onPress={handleCall}
                                >
                                    <Phone size={20} color="#FFF" />
                                    <Text style={styles.actionBtnText}>Call</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {complaint.description && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>Description</Text>
                            <Text style={[styles.description, { color: colors.textSecondary }]}>
                                {complaint.description}
                            </Text>
                        </View>
                    )}
                </Card>

                {/* Only show Notify Owner button when payment is enabled */}
                {CONFIG.ENABLE_PAYMENT && !isResolved && (
                    <View style={styles.actions}>
                        <Button
                            title="Notify Owner"
                            onPress={() => setNotifyModalVisible(true)}
                            style={{ flex: 1 }}
                            variant="primary"
                        />
                    </View>
                )}
            </ScrollView>

            <NotifyOwnerModal
                visible={notifyModalVisible}
                onClose={() => setNotifyModalVisible(false)}
                onSubmit={handleNotify}
                loading={notifyLoading}
                userItems={userItems}
                preselectedItemId={prefillFromItemId}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 24,
    },
    imageContainer: {
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
        alignItems: 'center', // Centers the 800px container if the card is wider
    },
    imageScrollContent: {
        gap: 0,
    },
    scrollImage: {
        aspectRatio: 4 / 3,
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
    },
    pagination: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    paginationText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    itemName: {
        fontSize: 28,
        fontWeight: '700',
        flex: 1,
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    categoryContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 24,
    },
    categoryLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
    categoryValue: {
        fontSize: 14,
        fontWeight: '700',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        marginBottom: 8,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
    },
    actionBtnText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 15,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
});
