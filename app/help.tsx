import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Bot,
    CheckCircle2,
    HelpCircle,
    Send,
    Sparkles,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../constants/api';
import { useTheme } from '../contexts/ThemeContext';

interface Message {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: string;
}

const QUICK_PROMPTS = [
    { label: '🆘 Lost Wallet / Cards', query: 'I lost my wallet and cards. What should I do right now?' },
    { label: '📱 Lost Mobile Phone', query: 'I lost my smartphone. What emergency steps should I take?' },
    { label: '🛡️ Verify Ownership', query: 'How can I verify if someone actually owns the item I found?' },
    { label: '🤝 Secure QR Handover', query: 'How does the secure QR Handover work step by step?' },
    { label: '📞 Audio Call Troubleshooting', query: 'My audio call is not working or there is no sound. How do I fix it?' },
    { label: '⚠️ Suspicious User / Ransom', query: 'Someone is asking for courier charges or money before returning my item. Is it safe?' },
    { label: '💬 Message Status Ticks', query: 'What do single tick, double tick, and blue tick mean in chat?' },
    { label: '💡 Safe Meetup Locations', query: 'Where should I meet the other person for safe item return?' },
];

function getClientFallbackAnswer(query: string): string {
    const q = (query || '').toLowerCase();
    if (q.includes('wallet') || q.includes('purse') || q.includes('card') || q.includes('bank') || q.includes('debit') || q.includes('atm')) {
        return `🚨 Critical Action Checklist for Lost Wallet / Cards:\n\n1. Block Cards Instantly: Open your mobile banking app or call your bank's 24/7 hotline to freeze all debit & credit cards immediately.\n\n2. Lodge a Police Lost Report (NCR): File an online lost property report on your state police portal or local station for identity cards (Aadhaar, Driving License, PAN). This shields you against identity fraud.\n\n3. Post on FindMyThing: Tap "Report Lost Item", select "Wallet / Purse", and set the approximate location and time. Mention outer appearance and color (do not disclose full card numbers).\n\n4. Automatic Alerts: When someone posts a found wallet in that area, FindMyThing will alert you via push notification.`;
    }
    if (q.includes('phone') || q.includes('mobile') || q.includes('android') || q.includes('iphone')) {
        return `🚨 Emergency Steps for Lost Phone:\n\n1. Locate & Lock Remotely:\n• Android: Visit google.com/android/find\n• iPhone: Visit icloud.com/find (activate Lost Mode)\n\n2. Block Your SIM Card: Contact your mobile operator right away so attackers cannot receive incoming OTPs or reset your bank passwords.\n\n3. Block IMEI on CEIR: Visit the government portal (ceir.gov.in) to block your IMEI across all national networks.\n\n4. Report in FindMyThing: Post a Lost complaint with the device model, color, and unique case details.\n\n5. Scammer Warning: Never share your phone lock passcode or Apple ID / Google credentials with anyone!`;
    }
    if (q.includes('verify') || q.includes('ownership') || q.includes('proof') || q.includes('claim')) {
        return `🛡️ How to Verify Item Ownership Safely:\n\n1. Secret Detail Questions: When reporting a found item, hide unique markers (serial number, lock screen wallpaper, inside contents). Ask the claimant to describe these specific secret details.\n\n2. Document Proof: Ask for a purchase receipt, warranty card, matching IMEI/serial number, or a photo of them with the item.\n\n3. Digital QR Handover: Do not hand over the item until the owner presents the in-app Handover QR code and you scan it to verify the claim.`;
    }
    if (q.includes('qr') || q.includes('handover') || q.includes('return')) {
        return `🤝 Secure QR Handover Guide:\n\n1. Meet at a Safe Public Spot (e.g. metro station, police station, busy cafe).\n\n2. Owner generates QR code: In the FindMyThing app, open the resolved match and tap "Show Handover QR Code".\n\n3. Finder scans QR code: Finder opens the claim and taps "Scan Handover QR Code".\n\n4. Instant Handshake: The app automatically logs the successful return, updates status to "Resolved", and releases any pledged reward confirmation.`;
    }
    if (q.includes('call') || q.includes('audio') || q.includes('mic') || q.includes('sound')) {
        return `📞 Audio Call Troubleshooting:\n\n1. Microphone Permission: Verify that FindMyThing has microphone access in your phone/browser app settings.\n\n2. Call Controls: Use the in-call Mute and Speaker buttons anytime, even while the phone is ringing.\n\n3. Network Connection: Ensure both parties have an active internet connection (Wi-Fi or mobile data).\n\n4. Alternative: If a call fails to connect, use in-app chat to coordinate a good time to call.`;
    }
    if (q.includes('money') || q.includes('ransom') || q.includes('fee') || q.includes('charge') || q.includes('scam') || q.includes('pay')) {
        return `⚠️ SCAM ALERT — Never Pay Upfront Fees:\n\n1. Never transfer money in advance: Fraudsters often pretend to have your item and ask for "courier fees", "petrol money", or "advance reward" before meeting.\n\n2. Genuine finders will always agree to meet in a public place or leave the item at the local police station or lost property counter.\n\n3. If anyone threatens you or demands unreasonable ransom, report the user in the app immediately and notify local authorities.`;
    }
    if (q.includes('tick') || q.includes('message') || q.includes('status')) {
        return `💬 Chat Message Delivery Status:\n\n• Single Grey Tick (✓): Sent to the server.\n• Double Grey Ticks (✓✓): Delivered to the recipient's phone.\n• Double Blue Ticks (✓✓): Read by the recipient.\n\nIf messages stay on a single tick, the recipient might currently have no network or their device is turned off.`;
    }
    return `👋 I am FindBot, your FindMyThing AI Assistant!\n\nI can help you with:\n• Immediate steps if you lost your phone, wallet, documents, or keys\n• How to verify true owners and prevent fake claims\n• Safe public handover instructions and QR verification\n• Troubleshooting calls, chat, and location alerts\n• Reporting fraud or suspicious activity\n\nFeel free to type your question or select one of the suggestions above!`;
}

export default function HelpScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const scrollViewRef = useRef<ScrollView>(null);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome-1',
            sender: 'bot',
            text: `👋 Hi! I am FindBot, your 24/7 AI Support & Safety Assistant.\n\nAsk me anything about app features, urgent recovery steps, fail-safe procedures, or verification!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
    }, [messages, loading]);

    const handleSend = async (textToSend?: string) => {
        const query = (textToSend || inputText).trim();
        if (!query || loading) return;

        const userMsg: Message = {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: query,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        setLoading(true);

        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_URL}/ai/support-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    message: query,
                    history: messages.slice(-4).map(m => ({ sender: m.sender, text: m.text })),
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.reply) {
                    setMessages(prev => [
                        ...prev,
                        {
                            id: `bot-${Date.now()}`,
                            sender: 'bot',
                            text: data.reply,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        },
                    ]);
                    setLoading(false);
                    return;
                }
            }
            throw new Error('Fallback needed');
        } catch (err) {
            // Intelligent client-side fallback
            const fallback = getClientFallbackAnswer(query);
            setMessages(prev => [
                ...prev,
                {
                    id: `bot-${Date.now()}`,
                    sender: 'bot',
                    text: fallback,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <View style={styles.titleRow}>
                        <Bot size={20} color={colors.primary} />
                        <Text style={[styles.title, { color: colors.text }]}>Help & Support</Text>
                    </View>
                    <View style={styles.onlineBadge}>
                        <View style={styles.onlineDot} />
                        <Text style={styles.onlineText}>FindBot AI Online</Text>
                    </View>
                </View>
                <TouchableOpacity
                    onPress={() => router.push('/manual' as never)}
                    style={[styles.manualButton, { borderColor: colors.border }]}
                >
                    <Text style={[styles.manualButtonText, { color: colors.primary }]}>Manual</Text>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Chat Messages */}
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.chatArea}
                    contentContainerStyle={styles.chatContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Security Notice Card */}
                    <View style={[styles.securityNotice, { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)' }]}>
                        <AlertTriangle size={18} color="#EF4444" style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.securityTitle}>Urgent Safety Rule</Text>
                            <Text style={[styles.securityBody, { color: colors.textSecondary }]}>
                                Never pay advance courier fees or ransom to anyone claiming to have your item. Always meet in safe public areas.
                            </Text>
                        </View>
                    </View>

                    {messages.map(item => (
                        <View
                            key={item.id}
                            style={[
                                styles.messageRow,
                                item.sender === 'user' ? styles.userRow : styles.botRow,
                            ]}
                        >
                            {item.sender === 'bot' && (
                                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                                    <Bot size={16} color="#FFF" />
                                </View>
                            )}
                            <View
                                style={[
                                    styles.bubble,
                                    item.sender === 'user'
                                        ? [styles.userBubble, { backgroundColor: colors.primary }]
                                        : [styles.botBubble, { backgroundColor: colors.surface, borderColor: colors.border }],
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.messageText,
                                        { color: item.sender === 'user' ? '#FFF' : colors.text },
                                    ]}
                                >
                                    {item.text}
                                </Text>
                                <Text
                                    style={[
                                        styles.timestamp,
                                        { color: item.sender === 'user' ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
                                    ]}
                                >
                                    {item.timestamp}
                                </Text>
                            </View>
                        </View>
                    ))}

                    {loading && (
                        <View style={[styles.messageRow, styles.botRow]}>
                            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                                <Bot size={16} color="#FFF" />
                            </View>
                            <View style={[styles.bubble, styles.botBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <View style={styles.typingContainer}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={[styles.typingText, { color: colors.textSecondary }]}>FindBot is thinking...</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Quick Suggestion Pills */}
                    <View style={styles.suggestionsSection}>
                        <View style={styles.suggestionsHeader}>
                            <Sparkles size={16} color={colors.primary} />
                            <Text style={[styles.suggestionsTitle, { color: colors.textSecondary }]}>Common Scenarios & Guides</Text>
                        </View>
                        <View style={styles.pillsContainer}>
                            {QUICK_PROMPTS.map((prompt, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                    onPress={() => handleSend(prompt.query)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pillText, { color: colors.text }]}>{prompt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </ScrollView>

                {/* Input Bar */}
                <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <TextInput
                        style={[styles.textInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                        placeholder="Ask FindBot about any issue or feature..."
                        placeholderTextColor={colors.textSecondary}
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={() => handleSend()}
                        returnKeyType="send"
                        multiline
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            { backgroundColor: inputText.trim() ? colors.primary : colors.border },
                        ]}
                        onPress={() => handleSend()}
                        disabled={!inputText.trim() || loading}
                    >
                        <Send size={18} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
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
    headerTitleContainer: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    onlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        gap: 5,
    },
    onlineDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    onlineText: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '500',
    },
    manualButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    manualButtonText: {
        fontSize: 13,
        fontWeight: '600',
    },
    chatArea: {
        flex: 1,
    },
    chatContent: {
        padding: 16,
        gap: 12,
    },
    securityNotice: {
        flexDirection: 'row',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginBottom: 8,
    },
    securityTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#EF4444',
        marginBottom: 2,
    },
    securityBody: {
        fontSize: 12,
        lineHeight: 16,
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginVertical: 4,
        gap: 8,
    },
    userRow: {
        justifyContent: 'flex-end',
    },
    botRow: {
        justifyContent: 'flex-start',
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    bubble: {
        maxWidth: '82%',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
    },
    userBubble: {
        borderBottomRightRadius: 4,
    },
    botBubble: {
        borderBottomLeftRadius: 4,
        borderWidth: 1,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 21,
    },
    timestamp: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    typingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 4,
    },
    typingText: {
        fontSize: 13,
        fontStyle: 'italic',
    },
    suggestionsSection: {
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(150, 150, 150, 0.15)',
    },
    suggestionsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
    },
    suggestionsTitle: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    pillText: {
        fontSize: 13,
        fontWeight: '500',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: 1,
        gap: 10,
    },
    textInput: {
        flex: 1,
        minHeight: 40,
        maxHeight: 100,
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        fontSize: 14,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
