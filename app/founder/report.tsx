import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Modal, FlatList, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import CategoryPicker from '../../components/CategoryPicker';
import LocationPicker from '../../components/LocationPicker';
import DatePicker from '../../components/DatePicker';
import CustomImagePicker from '../../components/ImagePicker';
import Input from '../../components/Input';
import { API_URL } from '../../constants/api';
import { X, Phone } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { addItem } from '../../store';
import { showAlert } from '../../utils/alert';

export default function ReportFoundItem() {
    const router = useRouter();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
    const [descError, setDescError] = useState<string | null>('');
    const [matchModalVisible, setMatchModalVisible] = useState(false);
    const [matchedComplaints, setMatchedComplaints] = useState<any[]>([]);
    const [submitFinalLoading, setSubmitFinalLoading] = useState(false);

    const [comms, setComms] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);
    const [notificationType, setNotificationType] = useState<'RADIUS' | 'COMMUNITY' | 'ORGANIZATION'>('RADIUS');
    const [notifyRadius, setNotifyRadius] = useState('1');
    const [targetCommunityId, setTargetCommunityId] = useState('');
    const [targetOrganizationId, setTargetOrganizationId] = useState('');

    useEffect(() => {
        if (token) {
            fetch(`${API_URL}/users/me/communities`, { headers: { Authorization: `Bearer ${token}` }})
                .then(async r => {
                    if (!r.ok) throw new Error('Failed to fetch communities');
                    const text = await r.text();
                    try { return JSON.parse(text); } catch (e) { throw new Error('Invalid JSON'); }
                })
                .then(setComms)
                .catch(e => console.log('Communities fetch error:', e.message));

            fetch(`${API_URL}/users/me/orgs`, { headers: { Authorization: `Bearer ${token}` }})
                .then(async r => {
                    if (!r.ok) throw new Error('Failed to fetch orgs');
                    const text = await r.text();
                    try { return JSON.parse(text); } catch (e) { throw new Error('Invalid JSON'); }
                })
                .then(setOrgs)
                .catch(e => console.log('Orgs fetch error:', e.message));
        }
    }, [user]);

    const [form, setForm] = useState({
        name: '',
        category: '',
        location: '',
        description: '',
        questions: [{ question: '', answer: '' }],
                imageUris: [] as string[],
    });
    const [date, setDate] = useState(new Date());
    const [pickerVisible, setPickerVisible] = useState(false);
    const [locationCoords, setLocationCoords] = useState<{lat: number, lon: number} | null>(null);

    const handleAddQuestion = () => {
        setForm({
            ...form,
            questions: [...form.questions, { question: '', answer: '' }]
        });
    };

    const handleRemoveQuestion = (index: number) => {
        const newQuestions = [...form.questions];
        newQuestions.splice(index, 1);
        setForm({ ...form, questions: newQuestions });
    };

    const handleQuestionChange = (text: string, index: number, field: 'question' | 'answer') => {
        const newQuestions = [...form.questions];
        newQuestions[index][field] = text;
        setForm({ ...form, questions: newQuestions });
    };

    // AI validate description when user finishes typing
    const handleDescriptionBlur = async () => {
        if (!form.description.trim() || form.description.trim().length < 10) return;
        try {
            const res = await fetch(`${API_URL}/ai/validate-founder-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, date: date.toISOString().split('T')[0] }),
            });
            const data = await res.json();
            if (!data.valid) {
                setDescError(`⚠️ ${data.reason}`);
            } else {
                setDescError('');
            }
        } catch {
            // AI unavailable — allow
        }
    };

    const handleAutoGenerate = async () => {
        if (!form.name || !form.category || !form.location) {
            showAlert('Missing Information', 'Please fill Item Name, Category, and Location first.');
            return;
        }
        setDescError('');
        setIsGeneratingDesc(true);
        try {
            const res = await fetch(`${API_URL}/ai/generate-description`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: form.name, category: form.category, 
                    location: form.location, date: date.toISOString().split('T')[0],
                    role: 'founder'
                }),
            });
            const data = await res.json();
            if (data.description) {
                setForm(prev => ({ ...prev, description: data.description }));
            }
        } catch {
            showAlert('Error', 'Failed to auto-generate description.');
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handleSubmit = async () => {
        const areQuestionsValid = form.questions.every(q => q.question.trim() && q.answer.trim());

        if (!form.name || !form.location || !areQuestionsValid ) {
            showAlert('Missing Information', 'Please fill in all required fields, including all security questions and answers.');
            return;
        }

        // Re-validate entire report on submit for safety
        setAiLoading(true);
        setDescError(''); // Clear old errors so it can be re-evaluated
        try {
            const res = await fetch(`${API_URL}/ai/validate-founder-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, date: date.toISOString().split('T')[0] }),
            });
            const data = await res.json();
            if (!data.valid) {
                const errorMsg = `⚠️ ${data.reason}\n${(data.issues || []).join('\n')}`;
                setDescError(errorMsg);
                showAlert('Validation Error', data.reason || 'Please fix the issues in your report before submitting.');
                setAiLoading(false);
                return;
            }
        } catch {
            // AI unavailable — allow
        }
        
        // Check for matches
        try {
            const matchRes = await fetch(`${API_URL}/items/preview-matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    category: form.category,
                    location: form.location,
                    date: date.toISOString().split('T')[0]
                })
            });
            if (matchRes.ok) {
                const matchData = await matchRes.json();
                if (matchData.matches && matchData.matches.length > 0) {
                    setMatchedComplaints(matchData.matches);
                    setMatchModalVisible(true);
                    setAiLoading(false);
                    return; // Stop here, wait for user to interact with modal
                }
            }
        } catch (e) {
            console.log("Match preview failed", e);
        }

        setAiLoading(false);
        submitFinalItem(false); // No matches, proceed normally
    };

    const submitFinalItem = async (skipNotifications: boolean) => {
        setSubmitFinalLoading(true);
        try {
            let loc = null;
            

            const { convertImagesToBase64 } = await import('../../utils/imageUtils');
            const base64Images = form.imageUris.length > 0
                ? await convertImagesToBase64(form.imageUris)
                : [];

            await addItem({
                name: form.name,
                category: form.category,
                location: form.location,
                date: date.toISOString().split('T')[0],
                description: form.description,
                                imageUris: base64Images,
                questions: form.questions,
                userId: user?.id,
                notifyRadius: notificationType === 'RADIUS' ? parseInt(notifyRadius) || 1 : undefined,
                targetCommunityId: notificationType === 'COMMUNITY' ? targetCommunityId || undefined : undefined,
                targetOrganizationId: notificationType === 'ORGANIZATION' ? targetOrganizationId || undefined : undefined,
                latitude: locationCoords?.lat,
                longitude: locationCoords?.lon,
                skipNotifications,
            });
            setMatchModalVisible(false);
            router.push({
                pathname: '/success',
                params: { type: 'report' }
            });
        } catch (error) {
            console.error('Submit error:', error);
            showAlert('Error', 'Failed to report item. Please try again.');
        } finally {
            setSubmitFinalLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[styles.heading, { color: colors.text }]}>Report Found Item</Text>
                    <Text style={[styles.subHeader, { color: colors.textSecondary }]}>Help the owner find their lost belonging.</Text>

                    <View style={styles.form}>
                        <CustomImagePicker
                            label="Item Photos"
                            onImagesSelected={(uris) => setForm({ ...form, imageUris: uris })}
                            initialImages={form.imageUris}
                        />



                        <Input
                            label="Item Name"
                            placeholder="e.g. Blue Car Keys"
                            value={form.name}
                            onChangeText={(text) => setForm({ ...form, name: text })}
                        />

                        <CategoryPicker
                            label="Category"
                            value={form.category}
                            onChange={(category) => setForm({ ...form, category })}
                        />

                        <LocationPicker
                            label="Location Found *"
                            value={form.location}
                            onChange={(location, coords) => {
                                setForm({ ...form, location });
                                setLocationCoords(coords ? { lat: coords.latitude, lon: coords.longitude } : null);
                            }}
                        />

                        <DatePicker
                            label="Date Found"
                            value={date}
                            onChange={setDate}
                        />

                        {/* Description with AI generation & validation */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 }}>Description (Visible to public)</Text>
                            <TouchableOpacity onPress={handleAutoGenerate} disabled={isGeneratingDesc} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {isGeneratingDesc ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                                    {isGeneratingDesc ? 'Generating...' : '✨ Auto-Generate'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <Input
                            placeholder="Brief description of the item (no phone numbers)..."
                            multiline
                            numberOfLines={5}
                            style={{ height: 80, textAlignVertical: 'top' }}
                            value={form.description}
                            onChangeText={(text) => {
                                setForm({ ...form, description: text });
                                if (descError) setDescError('');
                            }}
                            onBlur={handleDescriptionBlur}
                        />
                        {!!descError && (
                            <View style={styles.descErrorBox}>
                                <Text style={styles.descErrorText}>{descError}</Text>
                            </View>
                        )}

                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Verification Details</Text>
                        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                            Add one or more security questions. The owner must answer ALL of them correctly to claim the item.
                        </Text>

                        {form.questions.map((q, index) => (
                            <View key={index} style={styles.questionContainer}>
                                <View style={styles.questionHeader}>
                                    <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>
                                        Question {index + 1}
                                    </Text>
                                    {form.questions.length > 1 && (
                                        <TouchableOpacity onPress={() => handleRemoveQuestion(index)}>
                                            <Text style={{ color: colors.error, fontWeight: '600' }}>Remove</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <Input
                                    label="Secret Question"
                                    placeholder="e.g. What is the keychain character?"
                                    value={q.question}
                                    onChangeText={(text) => handleQuestionChange(text, index, 'question')}
                                />

                                <Input
                                    label="Secret Answer"
                                    placeholder="The correct answer"
                                    secureTextEntry
                                    value={q.answer}
                                    onChangeText={(text) => handleQuestionChange(text, index, 'answer')}
                                />
                            </View>
                        ))}

                        <Button
                            title="+ Add Another Question"
                            onPress={handleAddQuestion}
                            variant="secondary"
                            style={{ marginBottom: 24 }}
                        />

                        <View style={{ marginBottom: 24, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                            <View style={styles.sectionHeader}>
                                <Text style={{ fontSize: 18 }}>📢</Text>
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Who to Notify</Text>
                                    <Text style={[styles.sectionDesc, { color: colors.textSecondary, marginBottom: 0 }]}>
                                        Choose who gets an alert about this item
                                    </Text>
                                </View>
                            </View>

                            {/* Type Selector */}
                            <View style={styles.notifyTypeRow}>
                                <TouchableOpacity
                                    style={[styles.notifyTypeBtn, { borderColor: notificationType === 'RADIUS' ? colors.primary : colors.border, backgroundColor: notificationType === 'RADIUS' ? colors.primary + '15' : 'transparent' }]}
                                    onPress={() => setNotificationType('RADIUS')}
                                >
                                    <Text style={{ fontSize: 18 }}>📍</Text>
                                    <Text style={[styles.notifyTypeTxt, { color: notificationType === 'RADIUS' ? colors.primary : colors.text }]}>Nearby</Text>
                                </TouchableOpacity>

                                {comms.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.notifyTypeBtn, { borderColor: notificationType === 'COMMUNITY' ? colors.primary : colors.border, backgroundColor: notificationType === 'COMMUNITY' ? colors.primary + '15' : 'transparent' }]}
                                        onPress={() => setNotificationType('COMMUNITY')}
                                    >
                                        <Text style={{ fontSize: 18 }}>👥</Text>
                                        <Text style={[styles.notifyTypeTxt, { color: notificationType === 'COMMUNITY' ? colors.primary : colors.text }]}>Community</Text>
                                    </TouchableOpacity>
                                )}

                                {orgs.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.notifyTypeBtn, { borderColor: notificationType === 'ORGANIZATION' ? colors.primary : colors.border, backgroundColor: notificationType === 'ORGANIZATION' ? colors.primary + '15' : 'transparent' }]}
                                        onPress={() => setNotificationType('ORGANIZATION')}
                                    >
                                        <Text style={{ fontSize: 18 }}>🏢</Text>
                                        <Text style={[styles.notifyTypeTxt, { color: notificationType === 'ORGANIZATION' ? colors.primary : colors.text }]}>Organization</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Radius Selector */}
                            {notificationType === 'RADIUS' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                                        Notify people within this radius of the selected location:
                                    </Text>
                                    <Input
                                        placeholder="Radius in km (e.g. 5)"
                                        value={notifyRadius}
                                        onChangeText={setNotifyRadius}
                                        keyboardType="number-pad"
                                    />
                                </View>
                            )}

                            {/* Community Selector */}
                            {notificationType === 'COMMUNITY' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Select community to notify:</Text>
                                    {comms.map(c => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.selectItem, { borderColor: targetCommunityId === c.id ? colors.primary : colors.border, backgroundColor: targetCommunityId === c.id ? colors.primary + '15' : colors.surface }]}
                                            onPress={() => setTargetCommunityId(c.id)}
                                        >
                                            <Text style={[{ flex: 1, fontSize: 14, fontWeight: '500' }, { color: targetCommunityId === c.id ? colors.primary : colors.text }]}>{c.name}</Text>
                                            {targetCommunityId === c.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Org Selector */}
                            {notificationType === 'ORGANIZATION' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Select organization to notify:</Text>
                                    {orgs.map(o => (
                                        <TouchableOpacity
                                            key={o.id}
                                            style={[styles.selectItem, { borderColor: targetOrganizationId === o.id ? colors.primary : colors.border, backgroundColor: targetOrganizationId === o.id ? colors.primary + '15' : colors.surface }]}
                                            onPress={() => setTargetOrganizationId(o.id)}
                                        >
                                            <Text style={[{ flex: 1, fontSize: 14, fontWeight: '500' }, { color: targetOrganizationId === o.id ? colors.primary : colors.text }]}>{o.name}</Text>
                                            {targetOrganizationId === o.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        <Button
                            title={aiLoading ? 'Verifying with AI...' : 'Report Item'}
                            onPress={handleSubmit}
                            loading={loading || aiLoading}
                            style={{ marginTop: 8 }}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Match Modal */}
            <Modal visible={matchModalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', width: '100%', maxWidth: 600, alignSelf: 'center' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold' }}>Potential Matches Found!</Text>
                            <TouchableOpacity onPress={() => setMatchModalVisible(false)}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
                            We found similar items reported as lost. You can contact them directly or notify all of them and submit your report.
                        </Text>
                        
                        <FlatList
                            data={matchedComplaints}
                            keyExtractor={(item) => item.complaintId}
                            renderItem={({ item }) => {
                                const c = item.complaint;
                                return (
                                    <TouchableOpacity 
                                        style={{ backgroundColor: colors.background, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            setMatchModalVisible(false);
                                            router.push({
                                                pathname: '/founder/complaint-detail',
                                                params: { id: item.complaintId }
                                            });
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{c.name}</Text>
                                                <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>📍 {c.location}</Text>
                                                <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>📅 {new Date(c.date).toLocaleDateString()}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            style={{ maxHeight: 300 }}
                        />

                        <TouchableOpacity 
                            style={{ padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary, marginTop: 16 }} 
                            onPress={() => submitFinalItem(false)} 
                            disabled={submitFinalLoading}
                        >
                            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{submitFinalLoading ? 'Submitting...' : 'Notify All & Submit Report'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>

    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 24,
        paddingBottom: 100,
    },
    heading: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
    },
    subHeader: {
        fontSize: 16,
        marginBottom: 12,
    },
    form: {
        gap: 8,
    },
    divider: {
        height: 1,
        marginVertical: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    sectionDesc: {
        fontSize: 14,
        marginBottom: 24,
    },
    questionContainer: {
        marginBottom: 16,
    },
    questionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    questionLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    descErrorBox: {
        backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        marginTop: 4,
    },
    descErrorText: {
        color: '#B91C1C',
        fontSize: 13,
        lineHeight: 20,
    },
    sectionCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    notifyTypeRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    notifyTypeBtn: {
        flex: 1,
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        gap: 4,
    },
    notifyTypeTxt: {
        fontSize: 12,
        fontWeight: '600',
    },
    selectItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        marginBottom: 6,
        gap: 10,
    },
});
