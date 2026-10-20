import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Bell,
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    HelpCircle,
    MapPin,
    MessageCircle,
    Phone,
    QrCode,
    Search,
    ShieldCheck,
    Sparkles,
    Users,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

interface ManualSection {
    id: string;
    title: string;
    icon: any;
    summary: string;
    steps: string[];
    tips?: string[];
    warnings?: string[];
}

const MANUAL_SECTIONS: ManualSection[] = [
    {
        id: 'overview',
        title: '1. App Overview & Core Concept',
        icon: Sparkles,
        summary: 'FindMyThing is a privacy-first, community-driven lost and found recovery network powered by AI matching and cryptographic verification.',
        steps: [
            'FindMyThing connects two people: someone who lost an item ("Victim") and an honest citizen who found it ("Founder").',
            'Your identity, phone number, and private address are NEVER exposed publicly.',
            'Everything happens inside the app: AI matching, real-time secure messaging, anonymous voice calling, and encrypted QR handovers.',
        ],
        tips: [
            'Enable push notifications so you get alerted instantly when someone reports an item in your vicinity.',
        ],
    },
    {
        id: 'lost-item',
        title: '2. Reporting a Lost Item (Victim Flow)',
        icon: Search,
        summary: 'How to file an accurate lost report to maximize the chances of recovery.',
        steps: [
            'Tap "Report Lost Item" from the home screen.',
            'Choose the exact Category (Electronics, Wallets & Bags, Documents, Keys, Jewelry, Pets, Clothing, Other).',
            'Enter the Item Title and a clear Description (brand, color, identifying marks, stickers, scratches).',
            'Select the Date, Time, and precise Location where you last remember having the item. You can set an approximate radius.',
            'Upload reference photos if you have pictures of the item.',
            'Set Secret Verification Questions: Specify private details only the true owner would know (e.g. "What color is the keychain?", "What photo is set as the phone lock screen?").',
            'Optional Reward: You can offer a voluntary reward to thank the honest finder.',
        ],
        warnings: [
            'Do NOT disclose full bank card numbers, passwords, PINs, or sensitive government credentials in public descriptions.',
        ],
    },
    {
        id: 'found-item',
        title: '3. Reporting a Found Item (Finder Flow)',
        icon: ShieldCheck,
        summary: 'How to report a discovered item while preventing false claims by dishonest people.',
        steps: [
            'Tap "Report Found Item" on the home screen.',
            'Select the Category and capture clear photos of the item.',
            'Set the precise location where you found the object (or where you left it, e.g. college desk or station counter).',
            'Keep Unique Details Secret: Never photograph the serial number, inside cash amount, or unique lock screen. Keep these as verification tests when claimants reach out.',
            'Submit the report. Our AI engine will immediately search existing lost reports for potential matches.',
        ],
        tips: [
            'If you hand the item over to a local security or police desk, mention that in the notes so the owner knows where to pick it up.',
        ],
    },
    {
        id: 'ai-matching',
        title: '4. Smart AI Matching & Auto-Alerts',
        icon: Sparkles,
        summary: 'How our intelligent matching algorithm connects finders with owners automatically.',
        steps: [
            'Every newly submitted report is analyzed against open reports using semantic AI analysis and geospatial proximity.',
            'When a probable match is detected, both the owner and finder receive instant push notifications with a Match Score (e.g. 92% Match).',
            'You can view matched complaints under "My Reports" -> "Potential Matches" and start a private conversation.',
        ],
    },
    {
        id: 'chat-ticks',
        title: '5. In-App Messaging & Delivery Receipts',
        icon: MessageCircle,
        summary: 'Communicate directly without sharing personal phone numbers or social media accounts.',
        steps: [
            'Tap on any active match or inquiry to open the encrypted In-App Chat.',
            'Delivery Receipt Indicators:',
            '• Single Tick (✓): Message sent to server.',
            '• Double Grey Ticks (✓✓): Delivered to recipient device.',
            '• Double Blue Ticks (✓✓): Read and opened by the recipient.',
            'Date separators and timestamps keep conversation history organized.',
        ],
        tips: [
            'Keep all conversation inside FindMyThing. Moving to WhatsApp or external apps exposes your phone number to strangers.',
        ],
    },
    {
        id: 'voice-calls',
        title: '6. Anonymous In-App Voice Calling',
        icon: Phone,
        summary: 'High-definition voice calling using WebRTC without exposing mobile numbers.',
        steps: [
            'Open the chat with the owner or finder and tap the Call button at top right.',
            'The call connects securely over the internet without using cellular minutes or revealing phone numbers.',
            'Call controls allow toggling Mute and Speaker directly from both the ringing screen and active call screen.',
            'Multitasking: If you switch back to another screen while talking, an Active Call Banner remains at the top so you can return to the call or hang up anytime.',
        ],
        warnings: [
            'Ensure microphone permissions are granted in your browser or phone app settings.',
        ],
    },
    {
        id: 'verification',
        title: '7. Ownership Verification & Anti-Fraud',
        icon: ShieldCheck,
        summary: 'How to reliably ensure the person claiming the item is the genuine owner.',
        steps: [
            'Challenge Secret Questions: Ask the claimant questions that only the owner could answer correctly.',
            'Request Proof of Purchase: Invoices, warranty cards, or original packaging.',
            'Photo Evidence: Ask for a picture of them wearing/using the item in the past.',
            'Never hand over an item until you are 100% convinced of their genuine ownership.',
        ],
    },
    {
        id: 'qr-handover',
        title: '8. Secure QR Handover & Claim Resolution',
        icon: QrCode,
        summary: 'The digital handshake that guarantees safe return and updates the platform status.',
        steps: [
            'When meeting in person for handover:',
            '1. The Owner opens the matched claim in FindMyThing and taps "Show Handover QR Code".',
            '2. The Finder taps "Scan Handover QR Code" in the app.',
            '3. Once scanned, the system registers the confirmed handover, automatically marks the item as "Resolved", and triggers reward completion.',
        ],
        tips: [
            'Ensure the screen brightness is turned up when presenting the QR code for scanning.',
        ],
    },
    {
        id: 'communities',
        title: '9. Communities & Hyper-Local Geo-Alerts',
        icon: Users,
        summary: 'Join your college, apartment complex, or office for localized lost-and-found circles.',
        steps: [
            'Go to Account -> My Communities.',
            'Join an existing community or create a new one for your workplace, university, or neighborhood.',
            'Community Admins can broadcast emergency lost alerts to all members within seconds.',
        ],
    },
    {
        id: 'emergencies',
        title: '10. Critical Situations & Emergency Protocols',
        icon: AlertTriangle,
        summary: 'Immediate action plans when losing sensitive, high-value items.',
        steps: [
            'Lost Wallet / ATM Cards: Immediately block all debit & credit cards via banking apps. File a Police NCR (Lost Report) online for Aadhaar, Driving License, or PAN to prevent identity theft.',
            'Lost Mobile Phone: Use Apple Find My or Google Find My Device to lock remotely. Call your telecom provider to block the SIM card so OTPs cannot be intercepted. Block the IMEI on ceir.gov.in.',
            'Suspicious Demands: If someone contacts you demanding advance courier fees, money transfers, or gift cards, DO NOT PAY. Report them immediately in the app.',
        ],
    },
    {
        id: 'safety',
        title: '11. Safety Rules for In-Person Handover',
        icon: HelpCircle,
        summary: 'Golden rules for safe physical meetings.',
        steps: [
            'Always meet in broad daylight in a busy, public location (e.g. Metro station, shopping mall, college reception, or outside a police station).',
            'Never meet in dark, isolated, or private residential areas.',
            'Take a trusted friend or family member along with you.',
            'Complete the digital QR code handover on the spot before parting ways.',
        ],
    },
];

export default function ManualScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
        overview: true,
        'lost-item': true,
    });

    const toggleSection = (id: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const expandAll = () => {
        const all: { [key: string]: boolean } = {};
        MANUAL_SECTIONS.forEach(s => { all[s.id] = true; });
        setExpandedSections(all);
    };

    const collapseAll = () => {
        setExpandedSections({});
    };

    const filteredSections = MANUAL_SECTIONS.filter(section => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
            section.title.toLowerCase().includes(q) ||
            section.summary.toLowerCase().includes(q) ||
            section.steps.some(step => step.toLowerCase().includes(q))
        );
    });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleWrap}>
                    <View style={styles.headerTitleRow}>
                        <BookOpen size={20} color={colors.primary} />
                        <Text style={[styles.title, { color: colors.text }]}>App Manual</Text>
                    </View>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Complete Feature & Safety Guide</Text>
                </View>
                <TouchableOpacity
                    onPress={() => router.push('/help' as never)}
                    style={[styles.aiButton, { backgroundColor: colors.primary }]}
                >
                    <Text style={styles.aiButtonText}>AI Bot</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Search Bar */}
                <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Search size={18} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Search manual (e.g. QR handover, call, wallet)..."
                        placeholderTextColor={colors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {/* Quick Toggle Controls */}
                <View style={styles.controlsRow}>
                    <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
                        {filteredSections.length} Sections Available
                    </Text>
                    <View style={styles.expandButtons}>
                        <TouchableOpacity onPress={expandAll} style={styles.toggleTextButton}>
                            <Text style={[styles.toggleText, { color: colors.primary }]}>Expand All</Text>
                        </TouchableOpacity>
                        <Text style={{ color: colors.border }}>•</Text>
                        <TouchableOpacity onPress={collapseAll} style={styles.toggleTextButton}>
                            <Text style={[styles.toggleText, { color: colors.primary }]}>Collapse</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Section Cards */}
                {filteredSections.map(section => {
                    const IconComponent = section.icon;
                    const isExpanded = !!expandedSections[section.id];

                    return (
                        <View
                            key={section.id}
                            style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                            <TouchableOpacity
                                style={styles.sectionHeader}
                                onPress={() => toggleSection(section.id)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
                                    <IconComponent size={20} color={colors.primary} />
                                </View>
                                <View style={styles.sectionTitleWrap}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
                                    <Text style={[styles.sectionSummary, { color: colors.textSecondary }]} numberOfLines={isExpanded ? undefined : 2}>
                                        {section.summary}
                                    </Text>
                                </View>
                                {isExpanded ? (
                                    <ChevronUp size={20} color={colors.textSecondary} />
                                ) : (
                                    <ChevronDown size={20} color={colors.textSecondary} />
                                )}
                            </TouchableOpacity>

                            {isExpanded && (
                                <View style={[styles.sectionBody, { borderTopColor: colors.border }]}>
                                    <Text style={[styles.stepsHeading, { color: colors.text }]}>Step-by-Step Instructions:</Text>
                                    {section.steps.map((step, idx) => (
                                        <View key={idx} style={styles.stepItem}>
                                            <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                                            <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
                                        </View>
                                    ))}

                                    {section.tips && section.tips.length > 0 && (
                                        <View style={[styles.tipBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
                                            <Sparkles size={16} color={colors.primary} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.tipTitle, { color: colors.primary }]}>Pro Tip</Text>
                                                {section.tips.map((tip, idx) => (
                                                    <Text key={idx} style={[styles.tipText, { color: colors.text }]}>{tip}</Text>
                                                ))}
                                            </View>
                                        </View>
                                    )}

                                    {section.warnings && section.warnings.length > 0 && (
                                        <View style={[styles.warningBox, { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                                            <AlertTriangle size={16} color="#EF4444" />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.warningTitle}>Caution & Safety</Text>
                                                {section.warnings.map((warn, idx) => (
                                                    <Text key={idx} style={[styles.warningText, { color: colors.text }]}>{warn}</Text>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    );
                })}

                {/* Need more help banner */}
                <View style={[styles.bottomHelpBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <HelpCircle size={28} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.bottomHelpTitle, { color: colors.text }]}>Still have questions?</Text>
                        <Text style={[styles.bottomHelpDesc, { color: colors.textSecondary }]}>
                            Chat with our FindBot AI assistant for customized guidance on any situation.
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.bottomHelpBtn, { backgroundColor: colors.primary }]}
                        onPress={() => router.push('/help' as never)}
                    >
                        <Text style={styles.bottomHelpBtnText}>Ask FindBot</Text>
                    </TouchableOpacity>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 12,
    },
    backButton: {
        padding: 6,
    },
    headerTitleWrap: {
        flex: 1,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    aiButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    aiButtonText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
    content: {
        padding: 16,
        gap: 12,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    controlsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
        marginTop: 4,
    },
    resultsCount: {
        fontSize: 12,
        fontWeight: '500',
    },
    expandButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    toggleTextButton: {
        paddingVertical: 4,
    },
    toggleText: {
        fontSize: 12,
        fontWeight: '600',
    },
    sectionCard: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitleWrap: {
        flex: 1,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    sectionSummary: {
        fontSize: 13,
        lineHeight: 18,
    },
    sectionBody: {
        borderTopWidth: 1,
        padding: 14,
        gap: 10,
    },
    stepsHeading: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    stepItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    bullet: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 7,
    },
    stepText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 20,
    },
    tipBox: {
        flexDirection: 'row',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        gap: 8,
        marginTop: 6,
    },
    tipTitle: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 2,
    },
    tipText: {
        fontSize: 12,
        lineHeight: 18,
    },
    warningBox: {
        flexDirection: 'row',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        gap: 8,
        marginTop: 4,
    },
    warningTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#EF4444',
        marginBottom: 2,
    },
    warningText: {
        fontSize: 12,
        lineHeight: 18,
    },
    bottomHelpBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
        marginTop: 8,
        marginBottom: 20,
    },
    bottomHelpTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    bottomHelpDesc: {
        fontSize: 12,
        lineHeight: 16,
        marginTop: 2,
    },
    bottomHelpBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    bottomHelpBtnText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
});
