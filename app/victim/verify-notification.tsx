import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import CaptchaWidget, { CaptchaRef } from '../../components/CaptchaWidget';
import Input from '../../components/Input';
import PaymentModal from '../../components/PaymentModal';
import { CONFIG } from '../../constants/config';
import { API_URL } from '../../constants/api';
import { useTheme } from '../../contexts/ThemeContext';
import { updateComplaintStatus } from '../../store';
import { showAlert } from '../../utils/alert';

export default function VerifyNotificationScreen() {
    const { payload, notificationId } = useLocalSearchParams<{ payload: string; notificationId: string }>();
    const router = useRouter();
    const { colors } = useTheme();

    // State for Verification Flow
    const [captchaVerified, setCaptchaVerified] = useState(!CONFIG.CAPTCHA_ENABLED);
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaError, setCaptchaError] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [isPaid, setIsPaid] = useState(false);
    const [isOtpVerified, setIsOtpVerified] = useState(!CONFIG.SMS_OTP_ENABLED);

    const captchaRef = useRef<CaptchaRef>(null);

    // State for Security Questions
    const [loading, setLoading] = useState(false);
    const [answers, setAnswers] = useState<string[]>([]);
    const [isSemanticPhase, setIsSemanticPhase] = useState(false);
    const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
    const [followUpAnswers, setFollowUpAnswers] = useState<string[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);

    let data: any = {};
    try {
        data = payload ? JSON.parse(payload) : {};
    } catch (e) {
        console.error('Error parsing payload', e);
    }

    const { questions = [], founderPhone, complaintId, description } = data;


    // --- Step 1: Verify CAPTCHA locally (client-side math check) ---
    const handleCaptchaSubmit = () => {
        if (!captchaRef.current?.isFilled()) {
            setCaptchaError('Please enter the CAPTCHA answer.');
            return;
        }
        setCaptchaLoading(true);
        setCaptchaError('');

        const isCorrect = captchaRef.current.validate();
        if (isCorrect) {
            setCaptchaVerified(true);
            // Proceed to payment or questions
            if (CONFIG.ENABLE_PAYMENT) {
                setShowPaymentModal(true);
            } else {
                setIsPaid(true);
            }
        } else {
            setCaptchaError('Incorrect answer. Please try again.');
            captchaRef.current?.refresh();
        }
        setCaptchaLoading(false);
    };

    // --- Step 3: Payment ---
    const handlePaymentSuccess = () => {
        setShowPaymentModal(false);
        setIsPaid(true);
    };

    const handleAnswerChange = (text: string, index: number, isFollowUp = false) => {
        if (isFollowUp) {
            const newAnswers = [...followUpAnswers];
            newAnswers[index] = text;
            setFollowUpAnswers(newAnswers);
        } else {
            const newAnswers = [...answers];
            newAnswers[index] = text;
            setAnswers(newAnswers);
        }
    };

    const handleVerifyAnswers = async () => {
        if (isSemanticPhase) {
            const allFilled = followUpQuestions.every((_, i) => (followUpAnswers[i] || '').trim().length > 0);
            if (!allFilled) {
                showAlert('Incomplete', 'Please answer all follow-up questions.');
                return;
            }
            setLoading(true);
            try {
                const payload = followUpQuestions.map((q, i) => ({
                    question: q,
                    correctAnswer: 'Verify logically using founder report context.',
                    userAnswer: followUpAnswers[i] || '',
                }));
                const res = await fetch(`${API_URL}/ai/validate-answers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        questions: payload,
                        founderReportData: { name: data.name, description: data.description }
                    }),
                });
                const resultData = await res.json();
                if (resultData.status === 'exact' || resultData.status === 'semantic') {
                    if (complaintId) await updateComplaintStatus(complaintId, 'CLOSED', 'Founder contacted');
                    setShowSuccess(true);
                } else {
                    showAlert('Verification Failed', resultData.reason || 'Answers are incorrect.');
                    setIsSemanticPhase(false);
                    setFollowUpQuestions([]);
                    setFollowUpAnswers([]);
                }
            } catch {
                showAlert('Error', 'Verification failed.');
            } finally {
                setLoading(false);
            }
            return;
        }

        // Phase 1 (Original questions)
        const allFilled = questions.every((_: any, i: number) => (answers[i] || '').trim().length > 0);
        if (!allFilled) {
            showAlert('Incomplete', 'Please answer all security questions.');
            return;
        }
        setLoading(true);
        try {
            const payload = questions.map((q: any, i: number) => ({
                question: q.question,
                correctAnswer: q.answer,
                userAnswer: answers[i] || '',
            }));

            const res = await fetch(`${API_URL}/ai/validate-answers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    questions: payload,
                    founderReportData: { name: data.name, description: data.description }
                }),
            });
            const resultData = await res.json();

            if (resultData.status === 'exact') {
                if (complaintId) await updateComplaintStatus(complaintId, 'CLOSED', 'Founder contacted');
                setShowSuccess(true);
            } else if (resultData.status === 'semantic') {
                setFollowUpQuestions(resultData.followUpQuestions || []);
                setIsSemanticPhase(true);
            } else {
                showAlert('Verification Failed', resultData.reason || 'Answers are incorrect.');
            }
        } catch (e) {
            // Fallback
            const isCorrect = questions.every((q: any, index: number) => {
                const userAnswer = answers[index] || '';
                return userAnswer.toLowerCase().trim() === q.answer.toLowerCase().trim();
            });
            if (isCorrect) {
                if (complaintId) await updateComplaintStatus(complaintId, 'CLOSED', 'Founder contacted');
                setShowSuccess(true);
            } else {
                showAlert('Verification Failed', 'One or more answers are incorrect.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Intercept hardware back button on success screen
    useEffect(() => {
        if (!showSuccess) return;
        const onBackPress = () => {
            router.dismissAll();
            router.replace('/');
            return true;
        };
        const backHandler = import('react-native').then(rn => {
            return rn.BackHandler.addEventListener('hardwareBackPress', onBackPress);
        });
        return () => {
            backHandler.then(bh => bh.remove());
        };
    }, [showSuccess, router]);

    // Render Success Screen
    if (showSuccess) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <View style={[styles.successCard, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.successTitle, { color: colors.primary }]}>Matched!</Text>
                        <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
                            Your answers matched the security questions set by the founder.
                        </Text>

                        <View style={styles.contactBox}>
                            <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Founder's Contact:</Text>
                            <Text style={[styles.contactValue, { color: colors.text }]}>{founderPhone}</Text>
                        </View>

                        <Text style={[styles.note, { color: colors.textSecondary }]}>
                            Please contact the founder to arrange the return.{"\n"}
                            Your complaint has been marked as resolved.
                        </Text>

                        <Button
                            title="Go to Home"
                            onPress={() => { router.dismissAll(); router.replace('/'); }}
                            style={{ width: '100%', marginTop: 24 }}
                        />
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <PaymentModal
                visible={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                onSuccess={handlePaymentSuccess}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={[styles.title, { color: colors.text }]}>Security Check</Text>

                    {!captchaVerified || (CONFIG.SMS_OTP_ENABLED && !isOtpVerified) || (CONFIG.ENABLE_PAYMENT && !isPaid) ? (
                        <View style={styles.section}>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                Complete the steps below to verify your identity before answering the founder's questions.
                            </Text>

                            <View style={styles.warningBox}>
                                <AlertCircle size={24} color="#B45309" />
                                <Text style={styles.warningText}>
                                    Verification required to prevent fraud and ensure you are a genuine claimant.
                                </Text>
                            </View>

                            {/* ── Backend-verified CAPTCHA ── */}
                            {!captchaVerified && (
                                <View>
                                    <CaptchaWidget ref={captchaRef} />
                                    {!!captchaError && (
                                        <Text style={styles.captchaError}>{captchaError}</Text>
                                    )}
                                    <Button
                                        title="Verify CAPTCHA"
                                        onPress={handleCaptchaSubmit}
                                        loading={captchaLoading}
                                        style={{ marginTop: 8 }}
                                    />
                                </View>
                            )}
                        </View>
                    ) : (
                        <View style={styles.section}>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                The founder has set security questions. Answer them to reveal the contact info.
                            </Text>

                            {description && (
                                <View style={[styles.messageBox, { backgroundColor: colors.surface }]}>
                                    <Text style={[styles.messageLabel, { color: colors.text }]}>Message from Founder:</Text>
                                    <Text style={[styles.messageText, { color: colors.textSecondary }]}>{description}</Text>
                                </View>
                            )}

                            <View style={styles.form}>
                                {isSemanticPhase ? (
                                    <>
                                        <Text style={{ color: colors.primary, fontWeight: '600', marginBottom: 8 }}>
                                            AI Follow-up: You're close! Please answer these additional questions to prove ownership.
                                        </Text>
                                        {followUpQuestions.map((q: string, index: number) => (
                                            <View key={index} style={styles.questionContainer}>
                                                <Text style={[styles.questionText, { color: colors.text }]}>
                                                    {index + 1}. {q}
                                                </Text>
                                                <Input
                                                    label={`Follow-up Answer ${index + 1}`}
                                                    placeholder="Your Answer"
                                                    value={followUpAnswers[index] || ''}
                                                    onChangeText={(text) => handleAnswerChange(text, index, true)}
                                                />
                                            </View>
                                        ))}
                                    </>
                                ) : (
                                    questions.map((q: any, index: number) => (
                                        <View key={index} style={styles.questionContainer}>
                                            <Text style={[styles.questionText, { color: colors.text }]}>
                                                {index + 1}. {q.question}
                                            </Text>
                                            <Input
                                                label={`Answer ${index + 1}`}
                                                placeholder="Your Answer"
                                                value={answers[index] || ''}
                                                onChangeText={(text) => handleAnswerChange(text, index, false)}
                                            />
                                        </View>
                                    ))
                                )}
                            </View>

                            <Button
                                title={loading ? 'AI Verifying...' : 'Verify & Reveal Contact'}
                                onPress={handleVerifyAnswers}
                                loading={loading}
                                disabled={loading || questions.length === 0}
                            />
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 24,
    },
    captchaError: {
        color: '#ff4d4f',
        fontSize: 13,
        marginTop: 6,
        marginBottom: 4,
        textAlign: 'center',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 24,
    },
    section: {
        gap: 16,
    },
    warningBox: {
        backgroundColor: '#FFFBEB',
        padding: 16,
        borderRadius: 16,
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    warningText: {
        flex: 1,
        color: '#92400E',
        fontSize: 14,
        lineHeight: 20,
    },
    messageBox: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    messageLabel: {
        fontWeight: '600',
        marginBottom: 4,
    },
    messageText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    form: {
        gap: 24,
        marginBottom: 32,
    },
    questionContainer: {
        gap: 12,
    },
    questionText: {
        fontSize: 16,
        fontWeight: '600',
    },
    successCard: {
        padding: 32,
        borderRadius: 24,
        alignItems: 'center',
        width: '100%',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    successTitle: {
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 16,
    },
    successDesc: {
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 16,
    },
    contactBox: {
        backgroundColor: 'rgba(0,0,0,0.05)',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        width: '100%',
        marginBottom: 16,
    },
    contactLabel: {
        fontSize: 12,
        marginBottom: 4,
    },
    contactValue: {
        fontSize: 24,
        fontWeight: '700',
    },
    note: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
    },
});
