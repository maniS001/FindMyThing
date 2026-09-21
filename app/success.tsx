import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { BackHandler, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { claimItem, Complaint, getComplaints, updateComplaintStatus, updateItemStatus } from '../store';
import { showAlert } from '../utils/alert';

export default function Success() {
    const router = useRouter();
    const { colors } = useTheme();
    const { user } = useAuth();
    const params = useLocalSearchParams<{
        type: string;
        message: string;
        contactInfo?: string;
        itemId?: string;
    }>();
    const [updating, setUpdating] = useState(false);

    // Complaint Closure State
    const [showComplaintModal, setShowComplaintModal] = useState(false);
    const [userComplaints, setUserComplaints] = useState<Complaint[]>([]);
    const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);

    useEffect(() => {
        if (params.itemId && user) {
            fetchUserComplaints();
        }

        // Handle Android hardware back button
        const onBackPress = () => {
            router.dismissAll();
            router.replace('/');
            return true; // Prevent default back navigation
        };
        const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

        // Auto-close requirement: If we showed contact info, show popup on exit
        const hasContactInfo = !!params.contactInfo;
        return () => {
            backHandler.remove();
            if (hasContactInfo) {
                showAlert(
                    'Complaint Resolved',
                    'Since you have viewed the contact details, we have marked this inquiry as resolved. If you did not recover your item, you can reopen it from your account.',
                    [{ text: 'OK' }]
                );
            }
        };
    }, [params.itemId, user, params.contactInfo, router]);

    const fetchUserComplaints = async () => {
        try {
            const allComplaints = await getComplaints();
            const myOpenComplaints = allComplaints.filter(c =>
                c.userId === user?.id &&
                (c.status === 'OPEN' || !c.status)
            );
            setUserComplaints(myOpenComplaints);
        } catch (error) {
            console.error('Failed to fetch complaints', error);
        }
    };

    const getTitle = () => {
        switch (params.type) {
            case 'complaint':
                return 'Complaint Filed Successfully!';
            case 'report':
                return 'Item Reported Successfully!';
            case 'payment':
                return 'Payment Successful!';
            case 'verification':
                return 'Identity Verified!';
            case 'notified':
                return 'Victim Notified!';
            default:
                return 'Success!';
        }
    };

    const getMessage = () => {
        if (params.message) return params.message;

        switch (params.type) {
            case 'complaint':
                return 'Your complaint has been registered. We will notify you if someone reports finding a matching item.';
            case 'report':
                return 'Your found item has been posted. Victims can now search and claim it.';
            case 'payment':
                return 'You can now contact the founder to collect your item.';
            case 'verification':
                return 'Contact the founder to collect your item.';
            case 'notified':
                return 'We have securely notified the victim. They will review your report and contact you if it matches.';
            default:
                return 'Your request has been completed successfully.';
        }
    };

    const handleConfirmRecovery = async () => {
        if (!params.itemId) return;

        setUpdating(true);
        try {
            if (user?.id) {
                await claimItem(params.itemId, user.id);
            } else {
                await updateItemStatus(params.itemId, 'CLAIMED');
            }

            if (userComplaints.length > 0) {
                setShowComplaintModal(true);
            } else {
                showAlert('Great!', 'We are happy you found your item. The item status has been updated.', [
                    { text: 'OK', onPress: () => router.push('/') }
                ]);
            }
        } catch (error) {
            showAlert('Error', 'Failed to update item status. Please try again.');
        } finally {
            setUpdating(false);
        }
    };

    const handleCloseComplaint = async () => {
        if (!selectedComplaintId) {
            router.push('/');
            return;
        }

        try {
            await updateComplaintStatus(selectedComplaintId, 'RESOLVED', 'Item recovered via FindMyThing');
            showAlert('Success', 'Item marked as recovered and complaint closed!', [
                { text: 'OK', onPress: () => router.push('/') }
            ]);
        } catch (error) {
            showAlert('Error', 'Failed to close complaint.');
        }
    };

    // Determine whether to show the "Go Back" button
    const showBackButton = params.type !== 'complaint' && params.type !== 'notified' && params.type !== 'payment' && params.type !== 'verification';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
            {/* Complaint Closure Modal */}
            <Modal visible={showComplaintModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Close Related Complaint?</Text>
                        <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                            You have open complaints. Does this item resolve one of them?
                        </Text>

                        <ScrollView style={{ maxHeight: 200, marginVertical: 16 }}>
                            {userComplaints.map(complaint => (
                                <TouchableOpacity
                                    key={complaint.id}
                                    style={[
                                        styles.complaintItem,
                                        {
                                            borderColor: selectedComplaintId === complaint.id ? colors.primary : colors.border,
                                            backgroundColor: selectedComplaintId === complaint.id ? colors.primary + '10' : 'transparent'
                                        }
                                    ]}
                                    onPress={() => setSelectedComplaintId(complaint.id)}
                                >
                                    <View style={styles.complaintInfo}>
                                        <Text style={[styles.complaintName, { color: colors.text }]}>{complaint.name}</Text>
                                        <Text style={[styles.complaintDate, { color: colors.textSecondary }]}>{complaint.date}</Text>
                                    </View>
                                    {selectedComplaintId === complaint.id && (
                                        <CheckCircle size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Button
                                title="Skip"
                                variant="outline"
                                onPress={() => { router.dismissAll(); router.replace('/'); }}
                                style={{ flex: 1 }}
                            />
                            <Button
                                title="Close Complaint"
                                onPress={handleCloseComplaint}
                                disabled={!selectedComplaintId}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </View>
            </Modal>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.iconContainer}>
                    <CheckCircle size={80} color={colors.success} strokeWidth={2} />
                </View>

                <Text style={[styles.title, { color: colors.text }]}>{getTitle()}</Text>
                <Text style={[styles.message, { color: colors.textSecondary }]}>{getMessage()}</Text>

                {params.contactInfo && (
                    <View style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Founder Contact:</Text>
                        <Text style={[styles.contactInfo, { color: colors.primary }]}>📞 {params.contactInfo}</Text>
                        <Button
                            title="Call Owner"
                            onPress={() => {
                                const phone = params.contactInfo?.replace(/[^0-9+]/g, '') || '';
                                Linking.openURL(`tel:${phone}`);
                            }}
                            style={{ marginTop: 16 }}
                        />
                    </View>
                )}

                {/* Recovery Confirmation Section */}
                {params.contactInfo && params.itemId && (
                    <View style={[styles.recoverySection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.recoveryTitle, { color: colors.text }]}>Did you recover your item?</Text>
                        <Text style={[styles.recoveryText, { color: colors.textSecondary }]}>
                            If you have successfully collected your item from the founder, please let us know.
                        </Text>
                        <Button
                            title="Yes, I got it!"
                            onPress={handleConfirmRecovery}
                            loading={updating}
                            style={{ marginTop: 12, backgroundColor: '#10B981' }}
                        />
                    </View>
                )}

                <View style={styles.buttonContainer}>
                    <Button
                        title="Go to Home"
                        onPress={() => { router.dismissAll(); router.replace('/'); }}
                        style={{ marginBottom: 12 }}
                        variant="primary"
                    />
                    {showBackButton && (
                        <Button
                            title="Go Back"
                            onPress={() => router.back()}
                            variant="secondary"
                        />
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    iconContainer: {
        marginBottom: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 16,
    },
    message: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
        maxWidth: 400,
    },
    contactCard: {
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 24,
        width: '100%',
        maxWidth: 400,
    },
    contactLabel: {
        fontSize: 14,
        marginBottom: 8,
    },
    contactInfo: {
        fontSize: 20,
        fontWeight: '600',
    },
    recoverySection: {
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 32,
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
    },
    recoveryTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    recoveryText: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
    },
    buttonContainer: {
        width: '100%',
        maxWidth: 400,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContent: {
        borderRadius: 24,
        padding: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        marginBottom: 16,
    },
    complaintItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    complaintInfo: {
        flex: 1,
    },
    complaintName: {
        fontSize: 16,
        fontWeight: '600',
    },
    complaintDate: {
        fontSize: 12,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
});
