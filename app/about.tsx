import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Eye,
    Heart,
    Lock,
    MapPin,
    ShieldCheck,
    Sparkles,
    Target,
    Users,
} from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function AboutScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>About Us</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Hero Card */}
                <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.logoBadge, { backgroundColor: `${colors.primary}15` }]}>
                        <Sparkles size={28} color={colors.primary} />
                    </View>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>FindMyThing</Text>
                    <View style={[styles.versionPill, { backgroundColor: `${colors.primary}12` }]}>
                        <Text style={[styles.versionText, { color: colors.primary }]}>Version 1.0.0 (Beta)</Text>
                    </View>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                        A community-powered, privacy-first recovery platform reconnecting people with their lost belongings.
                    </Text>
                </View>

                {/* The Problem We Are Solving */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <Heart size={20} color="#EF4444" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>The Problem</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        We have all experienced that sudden, stomach-dropping panic when you reach into your pocket or bag and realize your wallet, mobile phone, keys, or vital documents are gone.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        The aftermath is exhausting: frantically searching everywhere, canceling bank cards, worrying about identity theft, and mourning lost family memories. Meanwhile, an honest person nearby has picked up your item, but has no safe way to contact you without publishing their private phone number or risking scams.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        Traditional lost-and-found is broken: scattered physical desks, lost social media posts, and lack of trust cause millions of items to sit unclaimed in storage boxes every year.
                    </Text>
                </View>

                {/* Our Mission & Goal */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <Target size={20} color={colors.primary} />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Our Goal</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        Our goal is simple yet transformative: to bridge the gap between people who lost their precious items and the honest good samaritans who find them.
                    </Text>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        FindMyThing provides an intelligent, automated recovery network that matches lost reports with found reports in real time, enables anonymous in-app voice calls and chat, verifies true ownership through secret security questions, and seals the return with a digital QR code handshake.
                    </Text>
                </View>

                {/* Our Vision */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <Eye size={20} color="#10B981" />
                        </View>
                        <Text style={[styles.cardTitle, { color: colors.text }]}>Our Vision</Text>
                    </View>
                    <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
                        We envision a world where losing an essential belonging does not mean losing hope. A culture where integrity and kindness are rewarded, where communities unite to look out for each other, and where modern technology transforms everyday citizens into lifesavers.
                    </Text>
                </View>

                {/* Core Values */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 16 }]}>Our Core Principles</Text>

                    <View style={styles.valueRow}>
                        <View style={[styles.smallIconCircle, { backgroundColor: `${colors.primary}15` }]}>
                            <Lock size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.valueTitle, { color: colors.text }]}>Zero-Compromise Privacy</Text>
                            <Text style={[styles.valueText, { color: colors.textSecondary }]}>
                                Your personal phone number, private email, and home address are never published. All calls and messages remain securely masked inside the app.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.valueRow}>
                        <View style={[styles.smallIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <ShieldCheck size={16} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.valueTitle, { color: colors.text }]}>Verifiable Proof & Trust</Text>
                            <Text style={[styles.valueText, { color: colors.textSecondary }]}>
                                Impostors and scammers are stopped in their tracks by private verification questions and digital QR handovers.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.valueRow}>
                        <View style={[styles.smallIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <Users size={16} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.valueTitle, { color: colors.text }]}>Community Collaboration</Text>
                            <Text style={[styles.valueText, { color: colors.textSecondary }]}>
                                Hyper-local alerts empower colleges, apartment societies, transit hubs, and workplaces to solve losses together.
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Footer Notice */}
                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                        Crafted with care to bring relief and peace of mind to everyone.
                    </Text>
                    <Text style={[styles.copyrightText, { color: colors.textSecondary }]}>
                        © 2026 FindMyThing. All rights reserved.
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
    heroCard: {
        padding: 24,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        textAlign: 'center',
    },
    logoBadge: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    heroTitle: {
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 6,
    },
    versionPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 12,
    },
    versionText: {
        fontSize: 12,
        fontWeight: '700',
    },
    heroSubtitle: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
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
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    paragraph: {
        fontSize: 14,
        lineHeight: 22,
    },
    valueRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginVertical: 4,
    },
    smallIconCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    valueTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 2,
    },
    valueText: {
        fontSize: 13,
        lineHeight: 18,
    },
    footer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 24,
        gap: 6,
    },
    footerText: {
        fontSize: 13,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    copyrightText: {
        fontSize: 12,
    },
});
