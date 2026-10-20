import { useRouter } from 'expo-router';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    FileText,
    HelpCircle,
    Scale,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
} from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function TermsOfServiceScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Terms of Service</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Intro Card */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <Scale size={22} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>Agreement & Terms</Text>
                            <Text style={[styles.metaText, { color: colors.textSecondary }]}>Last Updated: October 2026</Text>
                        </View>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        Welcome to FindMyThing! By accessing, downloading, or using our mobile application or website, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.
                    </Text>
                </View>

                {/* 1. Purpose & Good Faith */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <UserCheck size={20} color="#10B981" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>1. Good Faith & Proper Use</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        FindMyThing is dedicated solely to reconnecting rightful owners with lost property in a spirit of honesty, community, and goodwill. All reports, claims, calls, and messages must be submitted in good faith with accurate, truthful details.
                    </Text>
                </View>

                {/* 2. Strictly Prohibited Conduct */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <AlertOctagon size={20} color="#EF4444" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>2. Strictly Prohibited Activities</Text>
                    </View>
                    <Text style={[styles.subheading, { color: colors.text }]}>Zero Tolerance Violations:</Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Extortion & Ransom: </Text>
                        It is strictly illegal to withhold someone's lost property or demand advance fees, courier charges, or arbitrary payment before returning an item.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Fraud & Fake Claims: </Text>
                        Claiming items that do not belong to you or submitting fabricated lost reports is fraudulent and will result in immediate permanent account termination and referral to cybercrime authorities.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Contraband & Illegal Items: </Text>
                        Reporting, listing, or soliciting firearms, weapons, illegal narcotics, adult items, or stolen merchandise is strictly banned.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Harassment & Abuse: </Text>
                        Using in-app chat or voice calling for abusive language, threats, stalking, or inappropriate communication is strictly forbidden.
                    </Text>
                </View>

                {/* 3. Platform Non-Liability Disclaimer */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <ShieldAlert size={20} color="#F59E0B" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>3. Limitation of Liability</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Facilitator Role: </Text>
                        FindMyThing is a technology platform that facilitates direct communication and verification between independent users. FindMyThing is not a courier, custodian, storage depot, or bailee of goods.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>No Recovery Guarantee: </Text>
                        While we use advanced AI matching to maximize recovery rates, FindMyThing cannot and does not guarantee that any lost item will be found or successfully returned.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        • <Text style={{ fontWeight: '700', color: colors.text }}>Property Condition: </Text>
                        FindMyThing is not responsible for any damage, depreciation, data loss, or missing components of items during loss or return.
                    </Text>
                </View>

                {/* 4. Physical Handover Safety */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <ShieldCheck size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>4. In-Person Handover Safety</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        You are solely responsible for exercising prudence and caution when meeting in person:
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        1. Always arrange handovers during daylight hours in public, CCTV-monitored locations such as metro stations, police station compounds, university desks, or busy shopping centers.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        2. Never meet alone in isolated spots, late at night, or at private residences.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        3. Always verify ownership through secret questions and complete the in-app QR code handshake before parting ways.
                    </Text>
                </View>

                {/* 5. Rewards & Gratuity */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                            <FileText size={20} color="#8B5CF6" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>5. Voluntary Rewards</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        Any reward offered by a victim is entirely voluntary and between the owner and the finder. FindMyThing is not an escrow service and takes no cut or commission from personal rewards.
                    </Text>
                </View>

                {/* 6. Account Suspension */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 8 }]}>6. Account Termination</Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        FindMyThing reserves the unconditional right to suspend, restrict, or permanently terminate any user account that violates these terms, exhibits abusive behavior, or engages in fraudulent activity.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                        By using FindMyThing, you acknowledge having read and understood these Terms of Service.
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
        gap: 10,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    iconCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
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
    subheading: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 4,
    },
    paragraph: {
        fontSize: 13,
        lineHeight: 20,
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
