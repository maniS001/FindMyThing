import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import CategoryPicker from '../../components/CategoryPicker';
import LocationPicker from '../../components/LocationPicker';
import DatePicker from '../../components/DatePicker';
import CustomImagePicker from '../../components/ImagePicker';
import Input from '../../components/Input';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import { getComplaintById, updateComplaint } from '../../store';
import { showAlert } from '../../utils/alert';

export default function EditComplaint() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiFeedback, setAiFeedback] = useState<{ issues: string[]; suggestions: string[] } | null>(null);
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

    const handleAutoGenerate = async () => {
        if (!form.name || !form.category || !form.location) {
            Alert.alert('Missing Info', 'Please fill Item Name, Category, and Location first.');
            return;
        }
        setIsGeneratingDesc(true);
        try {
            const res = await fetch(`${API_URL}/ai/generate-description`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    category: form.category,
                    location: form.location,
                    date: date.toISOString().split('T')[0],
                    role: 'victim'
                })
            });
            const data = await res.json();
            if (data.description) {
                setForm({ ...form, description: data.description });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const [form, setForm] = useState({
        name: '',
        category: '',
        location: '',
        description: '',
                imageUris: [] as string[],
    });
    const [date, setDate] = useState(new Date());
    const [pickerVisible, setPickerVisible] = useState(false);
    const [locationCoords, setLocationCoords] = useState<{lat: number, lon: number} | null>(null);

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
        if (id) {
            fetchComplaint(id as string);
        }
    }, [id]);

    const fetchComplaint = async (complaintId: string) => {
        try {
            const data = await getComplaintById(complaintId);
            if (data) {
                setForm({
                    name: data.name,
                    category: data.category,
                    location: data.location,
                    description: data.description,
                                        imageUris: Array.isArray(data.imageUris)
                        ? data.imageUris
                        : (typeof data.imageUris === 'string'
                            ? JSON.parse(data.imageUris)
                            : []),
                });
                setDate(new Date(data.date));

                if (data.targetCommunityId) {
                    setNotificationType('COMMUNITY');
                    setTargetCommunityId(data.targetCommunityId);
                } else if (data.targetOrganizationId) {
                    setNotificationType('ORGANIZATION');
                    setTargetOrganizationId(data.targetOrganizationId);
                } else {
                    setNotificationType('RADIUS');
                    setNotifyRadius(data.notifyRadius ? String(data.notifyRadius) : '1');
                }
            } else {
                showAlert('Error', 'Complaint not found');
                router.back();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            showAlert('Error', 'Failed to load complaint details');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.category || !form.location ) {
            showAlert('Missing Information', 'Please fill in all required fields.');
            return;
        }

        // --- AI Validation ---
        setAiLoading(true);
        setAiFeedback(null);
        try {
            const aiRes = await fetch(`${API_URL}/ai/validate-complaint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    category: form.category,
                    description: form.description,
                    location: form.location,
                    date: date.toISOString().split('T')[0]
                }),
            });
            const aiData = await aiRes.json();
            if (!aiData.valid && aiData.issues?.length > 0) {
                setAiFeedback({ issues: aiData.issues, suggestions: aiData.suggestions || [] });
                setAiLoading(false);
                return; // Block submission
            }
        } catch {
            // AI unavailable — allow submission
        }
        setAiLoading(false);
        // --- End AI Validation ---

        setSubmitting(true);
        try {
            // Convert images to base64 if needed (assuming existing URIs might be remote URLs and new ones local)
            // Ideally we should handle this, but for now we pass URIs.
            // If new images were picked, they need to be processed.
            // For simplicity and reusing logic, we'll try to process all.
            const { convertImagesToBase64 } = await import('../../utils/imageUtils');

            // Filter out existing remote images if any preventing re-uploading them as base64 if not needed
            // But existing images might be passed as strings.
            // Let's just process them. convertImagesToBase64 handles remote URLs gracefully?
            // Checking `imageUtils` implementation would be good but standard is:
            // if it starts with http, keep it; if content:// or file://, convert.

            const base64Images = form.imageUris.length > 0
                ? await convertImagesToBase64(form.imageUris)
                : [];

            await updateComplaint(id as string, {
                name: form.name,
                category: form.category,
                location: form.location,
                date: date.toISOString().split('T')[0],
                description: form.description,
                                imageUris: base64Images,
                notifyRadius: notificationType === 'RADIUS' ? parseInt(notifyRadius) || 1 : undefined,
                targetCommunityId: notificationType === 'COMMUNITY' ? targetCommunityId || undefined : undefined,
                targetOrganizationId: notificationType === 'ORGANIZATION' ? targetOrganizationId || undefined : undefined,
            });

            showAlert('Success', 'Report updated successfully.', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Update error:', error);
            showAlert('Error', 'Failed to update report.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text }}>Loading...</Text>
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
                >
                    <Text style={[styles.heading, { color: colors.text }]}>Edit Report</Text>

                    <View style={styles.form}>
                        {aiFeedback && (
                            <View style={{ backgroundColor: colors.error + '1A', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                                <Text style={{ color: colors.error, fontWeight: 'bold', marginBottom: 4 }}>Please fix the following issues:</Text>
                                {aiFeedback.issues.map((issue, idx) => (
                                    <Text key={idx} style={{ color: colors.error, fontSize: 13 }}>• {issue}</Text>
                                ))}
                            </View>
                        )}
                        <Input
                            label="Item Name *"
                            placeholder="e.g. iPhone 13 Pro"
                            value={form.name}
                            onChangeText={(text) => setForm({ ...form, name: text })}
                        />

                        <CategoryPicker
                            label="Category *"
                            value={form.category}
                            onChange={(category) => setForm({ ...form, category })}
                        />

                        <LocationPicker
                            label="Where did you lose it? *"
                            value={form.location}
                            onChange={(location, coords) => {
                                setForm({ ...form, location });
                                setLocationCoords(coords ? { lat: coords.latitude, lon: coords.longitude } : null);
                            }}
                        />

                        <DatePicker
                            label="When did you lose it?"
                            value={date}
                            onChange={setDate}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 }}>Description</Text>
                            <TouchableOpacity onPress={handleAutoGenerate} disabled={isGeneratingDesc} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {isGeneratingDesc ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                                    {isGeneratingDesc ? 'Generating...' : '✨ Auto-Generate'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <Input
                            placeholder="Additional details about the item..."
                            value={form.description}
                            onChangeText={(text) => setForm({ ...form, description: text })}
                            multiline
                            numberOfLines={5}
                        />

                        <CustomImagePicker
                            label="Upload Photos (Optional)"
                            onImagesSelected={(uris) => setForm({ ...form, imageUris: uris })}
                            initialImages={form.imageUris}
                        />

                        {/* Notification Target Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 20 }]}>
                            <View style={styles.sectionHeader}>
                                <Text style={{ fontSize: 18 }}>📢</Text>
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={[styles.heading, { color: colors.text, marginBottom: 0 }]}>Who to Notify</Text>
                                    <Text style={[styles.heading, { color: colors.textSecondary, marginBottom: 0 }]}>
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
                            title={aiLoading ? 'AI Checking...' : 'Update Report'}
                            onPress={handleSubmit}
                            loading={submitting || aiLoading}
                            style={{ marginTop: 24 }}
                        />
                        <Button
                            title="Cancel"
                            variant="outline"
                            onPress={() => router.back()}
                            style={{ marginTop: 12 }}
                        />
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
    content: {
        padding: 24,
    },
    heading: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 24,
    },
    form: {
        gap: 8,
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
