import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import CategoryPicker from '../../components/CategoryPicker';
import LocationPicker from '../../components/LocationPicker';
import DatePicker from '../../components/DatePicker';
import CustomImagePicker from '../../components/ImagePicker';
import Input from '../../components/Input';
import { useTheme } from '../../contexts/ThemeContext';
import { API_URL } from '../../constants/api';
import { getItemById, updateItem } from '../../store';
import { showAlert } from '../../utils/alert';

export default function EditFoundItem() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [descError, setDescError] = useState('');
    const [fetching, setFetching] = useState(true);
    const [form, setForm] = useState({
        name: '',
        category: '',
        location: '',
        description: '',
        questions: [] as { question: string; answer: string; }[],
                imageUris: [] as string[],
    });
    const [date, setDate] = useState(new Date());
    const [pickerVisible, setPickerVisible] = useState(false);
    const [locationCoords, setLocationCoords] = useState<{lat: number, lon: number} | null>(null);
    const [itemStatus, setItemStatus] = useState<string>('OPEN');
    
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

    useEffect(() => {
        const fetchItem = async () => {
            if (id) {
                const item = await getItemById(id);
                if (item) {
                    setForm({
                        name: item.name,
                        category: item.category,
                        location: item.location,
                        description: item.description,
                        questions: (item.questions && Array.isArray(item.questions) && item.questions.length > 0)
                            ? item.questions.map((q: any) => ({ question: q.question || '', answer: q.answer || '' }))
                            : [{ question: '', answer: '' }],
                                                imageUris: item.imageUris || (item.imageUri ? [item.imageUri] : []),
                    });
                    setDate(new Date(item.date));
                    setItemStatus(item.status || 'OPEN');
                    
                    if (item.targetCommunityId) {
                        setNotificationType('COMMUNITY');
                        setTargetCommunityId(item.targetCommunityId);
                    } else if (item.targetOrganizationId) {
                        setNotificationType('ORGANIZATION');
                        setTargetOrganizationId(item.targetOrganizationId);
                    } else {
                        setNotificationType('RADIUS');
                        setNotifyRadius(item.notifyRadius ? String(item.notifyRadius) : '1');
                    }
                } else {
                    showAlert('Error', 'Item not found');
                    router.back();
                }
            }
            setFetching(false);
        };
        fetchItem();
    }, [id]);

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

    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

    const handleQuestionChange = (text: string, index: number, field: 'question' | 'answer') => {
        const newQuestions = [...form.questions];
        newQuestions[index][field] = text;
        setForm({ ...form, questions: newQuestions });
    };

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
            // AI unavailable
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

        setDescError('');
        setAiLoading(true);
        try {
            const res = await fetch(`${API_URL}/ai/validate-founder-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, date: date.toISOString().split('T')[0] }),
            });
            const data = await res.json();
            if (!data.valid) {
                setDescError(`⚠️ ${data.reason}\n${(data.issues || []).join('\n')}`);
                setAiLoading(false);
                return;
            }
        } catch {
            // AI unavailable — allow
        }
        setAiLoading(false);

        setLoading(true);
        try {
            // Check if we need to convert new images (local URIs)
            // Existing remote images start with http
            const newImages: string[] = [];
            let needsConversion = false;

            // Simple check: if URI doesn't start with http, it's likely local and needs conversion
            // This is a simplification. The backend typically handles base64 in a specific way.
            // If images are mixed (some remote, some local), we should re-upload everything or handle carefully.
            // For now, assuming standard ImagePicker flow:
            // "CustomImagePicker" returns URIs. We probably need to convert ONLY local ones?
            // Or just pass URIs and let backend/model handle if they are strings vs base64?
            // The `addItem` logic imported `convertImagesToBase64`. We should do the same.

            const { convertImagesToBase64 } = await import('../../utils/imageUtils');

            // We need to distinguish between already uploaded URLs and new local URIs.
            // Base64 helper reads file from URI. It might fail on remote URL.
            // We should filter.

            const remoteImages = form.imageUris.filter(uri => uri.startsWith('http'));
            const localImages = form.imageUris.filter(uri => !uri.startsWith('http'));

            const base64LocalImages = localImages.length > 0
                ? await convertImagesToBase64(localImages)
                : [];

            // Combine: keep remote URLs as is, add base64 for new ones?
            // Backend `updateItem` expects `imageUris` as string[] (JSON stringified usually, or handled by body parser).
            // Actually `updateItem` takes Partial<Item>. Item `imageUris` is string[].
            // If we send http URLs, backend should just save them. If we send base64, backend usually uploads them (if configured) or saves as base64 string (bad practice but maybe what's happening).
            // Looking at `addItem` in `report.tsx`:
            // const base64Images = await convertImagesToBase64(form.imageUris);
            // So it sends ALL as base64?
            // If I edit, I download remote URL. I can't convert remote URL to base64 easily without fetching it blob.
            // If I just send `http` URL back, does backend handle it?
            // The backend `addItem` takes `imageUris` and saves it. If it's a string array, Prisma saves it.
            // If we send mixed, it's fine as long as frontend renders them.
            // BUT, if I send base64, does backend upload to cloud? The current backend `index.ts` just saves the string array to DB. 
            // So saving base64 to DB is the current implementation? (Yikes, but okay for prototype).
            // Wait, `app.post('/api/items')`: `imageUris: images`. `images` is the array.
            // Prisma `Item` model has `imageUris String[]`.
            // So yes, it just stores the strings.
            // So if I pass remote URLs, they are stored. If I pass Base64, they are stored.
            const finalImages = [...remoteImages, ...base64LocalImages];

            if (id) {
                await updateItem(id, {
                    name: form.name,
                    category: form.category,
                    location: form.location,
                    date: date.toISOString().split('T')[0],
                    description: form.description,
                                        imageUris: finalImages,
                    questions: form.questions,
                    notifyRadius: notificationType === 'RADIUS' ? parseInt(notifyRadius) || 1 : undefined,
                    targetCommunityId: notificationType === 'COMMUNITY' ? targetCommunityId || undefined : undefined,
                    targetOrganizationId: notificationType === 'ORGANIZATION' ? targetOrganizationId || undefined : undefined,
                });
                showAlert('Success', 'Item updated successfully');
                router.back();
            }
        } catch (error) {
            console.error('Update error:', error);
            showAlert('Error', 'Failed to update item. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={styles.center}>
                    <Text style={{ color: colors.text }}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

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
                    <Text style={[styles.heading, { color: colors.text }]}>
                        {itemStatus === 'NOTIFIED' ? 'Edit Notification Details' : 'Edit Reported Item'}
                    </Text>
                    <Text style={[styles.subHeader, { color: colors.textSecondary }]}>
                        {itemStatus === 'NOTIFIED'
                            ? 'Update security questions, description, or contact info.'
                            : 'Update details, questions, or status.'}
                    </Text>

                    <View style={styles.form}>
                        {/* Only show these fields for OPEN items */}
                        {itemStatus !== 'NOTIFIED' && (
                            <>
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
                            </>
                        )}

                        {/* Description with AI generation & validation */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 }}>Description</Text>
                            {itemStatus !== 'NOTIFIED' && (
                                <TouchableOpacity onPress={handleAutoGenerate} disabled={isGeneratingDesc} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    {isGeneratingDesc ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                                        {isGeneratingDesc ? 'Generating...' : '✨ Auto-Generate'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <Input
                            placeholder="Brief description..."
                            multiline
                            numberOfLines={5}
                            style={{ height: 80, textAlignVertical: 'top' }}
                            value={form.description}
                            onChangeText={(text) => {
                                setForm({ ...form, description: text });
                            }}
                            onBlur={handleDescriptionBlur}
                        />
                        {!!descError && (
                            <View style={{ backgroundColor: '#FFF3CD', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: -4, marginBottom: 16 }}>
                                <Text style={{ color: '#B45309', fontSize: 13, lineHeight: 20 }}>{descError}</Text>
                            </View>
                        )}

                        {/* Notification Target Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Verification Questions</Text>
                        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                            Update or add security questions.
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
                                    value={q.question}
                                    onChangeText={(text) => handleQuestionChange(text, index, 'question')}
                                />

                                <Input
                                    label="Secret Answer"
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

                        

                        <View style={styles.actions}>
                            <Button
                                title="Cancel"
                                variant="outline"
                                onPress={() => router.back()}
                                style={{ flex: 1 }}
                            />
                            <Button
                                title={aiLoading ? 'AI Checking...' : 'Update Item'}
                                onPress={handleSubmit}
                                loading={loading || aiLoading}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
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
        paddingBottom: 40,
    },
    heading: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
    },
    subHeader: {
        fontSize: 16,
        marginBottom: 24,
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
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
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
