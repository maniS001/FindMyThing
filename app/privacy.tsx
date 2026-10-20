import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Bell,
    Camera,
    CheckCircle,
    EyeOff,
    FileCheck,
    Lock,
    MapPin,
    Mic,
    Shield,
    Trash2,
} from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function PrivacyPolicyScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Privacy Policy</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Introduction & Consent Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <Shield size={22} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>Your Privacy & Consent</Text>
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>Effective Date: October 2026</Text>
                        </View>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.text }]}>
                        At FindMyThing, your personal privacy and safety are our foundational commitment. This Privacy Policy details what information we collect, why we need it, and how we protect your identity.
                    </Text>
                    <View style={[styles.consentBanner, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
                        <CheckCircle size={18} color={colors.primary} style={{ marginTop: 2 }} />
                        <Text style={[styles.consentText, { color: colors.text }]}>
                            <Text style={{ fontWeight: '700' }}>Explicit Permission: </Text>
                            By creating an account and using FindMyThing, you grant us permission to collect and process the specific data outlined below solely for the purpose of lost and found recovery and secure communication.
                        </Text>
                    </View>
                </View>

                {/* Device Permissions We Ask For */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionHeading, { color: colors.text }]}>Device Permissions & Why We Need Them</Text>

                    <View style={styles.permissionItem}>
                        <View style={[styles.smallIcon, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                            <Camera size={18} color="#3B82F6" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>Camera Access</Text>
                            <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>
                                Used strictly when you take photos of found or lost items to upload reports, and to scan verification QR codes during handover. We never access your camera without your explicit trigger.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.permissionItem}>
                        <View style={[styles.smallIcon, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <Mic size={18} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>Microphone Access</Text>
                            <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>
                                Used exclusively for real-time WebRTC audio voice calling between victim and finder. Voice streams are encrypted in transit and <Text style={{ fontWeight: '700' }}>are never recorded, transcribed, or stored</Text> on any server.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.permissionItem}>
                        <View style={[styles.smallIcon, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <MapPin size={18} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>Location Information</Text>
                            <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>
                                Needed to associate your lost or found report with a geographic area so our AI can match nearby items. We never run background GPS tracking without your knowledge.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.permissionItem}>
                        <View style={[styles.smallIcon, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                            <Bell size={18} color="#8B5CF6" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>Push Notifications</Text>
                            <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>
                                Delivers instant notifications when a matching item is reported, an incoming call arrives, or you receive an in-app chat message.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Identity Shielding */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <EyeOff size={22} color="#10B981" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Identity Shielding & Masking</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>No Public Phone Numbers: </Text>
                        Your real phone number is kept strictly confidential. When you call another user inside FindMyThing, it routes through encrypted WebRTC internet audio, completely hiding your personal mobile number.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Private Chat Relays: </Text>
                        In-app messages do not disclose your email address or account credentials to the other party.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Hidden Identifying Secrets: </Text>
                        We advise finders to conceal unique serial numbers, engraving details, or inner contents so only the true owner can describe them.
                    </Text>
                </View>

                {/* Data Security & Sharing Policy */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <Lock size={22} color={colors.primary} />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Data Security & Zero-Selling Policy</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>We never sell your data: </Text>
                        FindMyThing does not monetize, sell, or rent your personal information, photos, or location telemetry to marketing companies or third-party brokers.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>End-to-End Transport Security: </Text>
                        All API requests and socket streams utilize modern TLS encryption protocols to protect your communications against eavesdropping.
                    </Text>
                </View>

                {/* User Rights & Account Deletion */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <Trash2 size={22} color="#EF4444" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Your Rights & Data Deletion</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        You hold complete control over your personal records:
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        1. <Text style={{ fontWeight: '700', color: colors.text }}>Report Removal: </Text>
                        Once an item is returned or resolved, you can close or remove the report at any time.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        2. <Text style={{ fontWeight: '700', color: colors.text }}>Account Erasure: </Text>
                        You can request full account deletion via Settings -> Delete Account. This permanently removes your profile, complaints, images, and chat logs from our active databases.
                    </Text>
                </View>

                {/* Contact Us */}
                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                        For privacy inquiries or compliance questions, please contact our Data Protection Officer through the Help & Support section.
                    </Text>
                </View>
            </ScrollView>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        padding: 16,
        gap: 16,
    },
    card: {
        padding: 20,
        borderRadius: 14,
        borderWidth: 1,
        gap: 12,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    metaText: {
        fontSize: 12,
        marginTop: 2,
    },
    sectionHeading: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    paragraph: {
        fontSize: 13,
        lineHeight: 21,
    },
    consentBanner: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        gap: 10,
        marginTop: 6,
    },
    consentText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 19,
    },
    permissionItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginVertical: 4,
    },
    smallIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    itemDesc: {
        fontSize: 12,
        lineHeight: 18,
    },
    footer: {
        padding: 16,
        alignItems: 'center',
        marginBottom: 20,
    },
    footerText: {
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
});
