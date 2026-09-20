import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FeedbackModal from '../components/FeedbackModal';
import { API_URL } from '../constants/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { showAlert } from '../utils/alert';
import { clearAllNotifications, deleteNotification, markNotificationRead } from '../store';

interface Notification {
    id: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    type?: string;
    payload?: string;
}

export default function NotificationsScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { token } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);

    useEffect(() => {
        if (token) {
            setLoading(true);
            fetchNotifications();
        }
    }, [token]);

    const fetchNotifications = async () => {
        try {
            const response = await fetch(`${API_URL}/notifications`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setNotifications(data);

                data.forEach((n: any) => {
                    if (!n.read) {
                        markNotificationRead(n.id, token || '');
                    }
                });
            }
        } catch (error) {
            console.error('Failed to fetch notifications', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearAll = async () => {
        if (!token) return;
        setLoading(true);
        await clearAllNotifications(token);
        fetchNotifications();
    };

    const handleRemove = async (id: string) => {
        if (!token) return;
        setActionLoading(true);
        await deleteNotification(id, token);
        fetchNotifications();
    };

    const handleMarkResolved = (complaintId: string) => {
        setSelectedComplaintId(complaintId);
        setShowFeedbackModal(true);
    };

    const handleSubmitFeedback = async (rating: number, comment: string) => {
        if (!selectedComplaintId) return;
        setActionLoading(true);
        try {
            const response = await fetch(`${API_URL}/complaints/${selectedComplaintId}/resolve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ rating, comment }),
            });
            if (!response.ok) throw new Error('Failed to resolve');
            setShowFeedbackModal(false);
            showAlert('Success', 'Marked as resolved! Thank you for your feedback.');
            fetchNotifications(); // Refresh to update status
        } catch (error) {
            showAlert('Error', 'Failed to mark as resolved.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRaiseAgain = async (complaintId: string) => {
        setActionLoading(true);
        try {
            const response = await fetch(`${API_URL}/complaints/${complaintId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    status: 'OPEN',
                    reopenReason: 'Reopened by victim from notifications'
                }),
            });
            if (!response.ok) throw new Error('Failed to reopen');
            showAlert('Success', 'Complaint reopened successfully.');
            fetchNotifications(); // Refresh to update status
        } catch (error) {
            showAlert('Error', 'Failed to reopen complaint.');
        } finally {
            setActionLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Notification }) => {
        let payload: any = {};
        try {
            payload = item.payload ? JSON.parse(item.payload) : {};
        } catch (e) {
            console.error('Error parsing notification payload', e);
        }

        const isClaimRequest = item.type === 'CLAIM_REQUEST';
        const complaintStatus = payload.complaintStatus;
        const isResolved = complaintStatus === 'RESOLVED';
        const isClosed = complaintStatus === 'CLOSED';
        const isOpen = complaintStatus === 'OPEN' || complaintStatus === 'NOTIFIED' || !complaintStatus;

        const handleClaim = () => {
            router.push({
                pathname: '/victim/verify-notification',
                params: {
                    payload: item.payload,
                    notificationId: item.id
                }
            });
        };

        const handleViewComplaint = () => {
            if (payload.complaintId) {
                router.push({
                    pathname: '/founder/complaint-detail',
                    params: { id: payload.complaintId }
                });
            }
        };

        const handleViewItem = () => {
            if (payload.itemId) {
                router.push(`/victim/claim/${payload.itemId}`);
            }
        };

        // Determine notification type for founder notifications
        const isFounderNotification = item.type === 'COMPLAINT_CLOSED' ||
            item.type === 'COMPLAINT_REOPENED' ||
            item.type === 'ITEM_RECOVERED';

        const getIconColor = () => {
            if (item.type === 'ITEM_RECOVERED' || isResolved) return '#10B981';
            if (item.type === 'COMPLAINT_CLOSED') return '#F59E0B';
            if (item.type === 'COMPLAINT_REOPENED') return colors.primary;
            return colors.primary;
        };

        const getTypeBadge = () => {
            switch (item.type) {
                case 'ITEM_RECOVERED':
                    return { text: '✓ RECOVERED', color: '#10B981' };
                case 'COMPLAINT_CLOSED':
                    return { text: 'CLOSED', color: '#F59E0B' };
                case 'COMPLAINT_REOPENED':
                    return { text: 'REOPENED', color: colors.primary };
                default:
                    return null;
            }
        };

        const typeBadge = getTypeBadge();

        return (
            <View style={[styles.notificationItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item.id)}>
                    <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '20' }]}>
                    <Bell size={20} color={getIconColor()} />
                </View>
                <View style={styles.contentContainer}>
                    <View style={styles.titleRow}>
                        <Text style={[styles.title, { color: colors.text, flex: 1 }]} numberOfLines={1}>{item.title}</Text>
                        {typeBadge && (
                            <View style={[styles.typeBadge, { backgroundColor: typeBadge.color + '20' }]}>
                                <Text style={[styles.typeBadgeText, { color: typeBadge.color }]}>{typeBadge.text}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.message, { color: colors.textSecondary }]}>{item.message}</Text>
                    <Text style={[styles.date, { color: colors.textSecondary }]}>
                        {new Date(item.createdAt).toLocaleDateString()}
                    </Text>

                    {(isClaimRequest || item.type === 'AREA_ALERT' || item.type === 'MATCH_ALERT') && (
                        <View style={styles.actionsContainer}>
                            {isClaimRequest && isResolved ? (
                                <View style={[styles.recoveredBadge, { backgroundColor: '#10B981' + '20' }]}>
                                    <Text style={[styles.recoveredText, { color: '#10B981' }]}>✓ Recovered</Text>
                                </View>
                            ) : isClaimRequest && isClosed ? (
                                <View style={styles.buttonRow}>
                                    <TouchableOpacity
                                        style={[styles.actionButton, { backgroundColor: colors.primary }]}
                                        onPress={() => handleRaiseAgain(payload.complaintId)}
                                        disabled={actionLoading}
                                    >
                                        <RefreshCw size={14} color="#FFF" />
                                        <Text style={styles.actionButtonText}>Raise Again</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : isClaimRequest ? (
                                <TouchableOpacity
                                    style={[styles.claimButton, { backgroundColor: colors.primary }]}
                                    onPress={handleClaim}
                                >
                                    <Text style={styles.claimButtonText}>Verify & Claim</Text>
                                </TouchableOpacity>
                            ) : item.type === 'AREA_ALERT' ? (
                                <TouchableOpacity
                                    style={[styles.claimButton, { backgroundColor: colors.primary, marginTop: 8 }]}
                                    onPress={handleViewComplaint}
                                >
                                    <Text style={styles.claimButtonText}>View Complaint</Text>
                                </TouchableOpacity>
                            ) : item.type === 'MATCH_ALERT' ? (
                                <TouchableOpacity
                                    style={[styles.claimButton, { backgroundColor: colors.primary, marginTop: 8 }]}
                                    onPress={handleViewItem}
                                >
                                    <Text style={styles.claimButtonText}>Claim now</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    )}
                </View>
                {!item.read && (
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <FeedbackModal
                visible={showFeedbackModal}
                onClose={() => setShowFeedbackModal(false)}
                onSubmit={handleSubmitFeedback}
                loading={actionLoading}
            />

            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
                <TouchableOpacity onPress={handleClearAll} style={styles.clearAllButton}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Clear All</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.center}>
                    <Bell size={48} color={colors.textSecondary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        No notifications yet
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
    },
    list: {
        padding: 16,
        gap: 12,
    },
    notificationItem: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentContainer: {
        flex: 1,
        marginLeft: 12,
        gap: 4,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
    },
    date: {
        fontSize: 12,
        marginTop: 4,
    },
    actionsContainer: {
        marginTop: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 13,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 6,
    },
    claimButton: {
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    claimButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    recoveredBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    recoveredText: {
        fontWeight: '600',
        fontSize: 14,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    removeBtn: {
        position: 'absolute',
        top: 2,
        right: 2,
        padding: 8,
        zIndex: 10,
    },
    clearAllButton: {
        padding: 8,
    },
});
