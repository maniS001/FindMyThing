import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import CategoryPicker from '../../components/CategoryPicker';
import LocationPicker from '../../components/LocationPicker';
import DatePicker from '../../components/DatePicker';
import CustomImagePicker from '../../components/ImagePicker';
import Input from '../../components/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { API_URL } from '../../constants/api';
import { addComplaint } from '../../store';
import { showAlert } from '../../utils/alert';

export default function FileComplaint() {
    const router = useRouter();
    const { colors } = useTheme();
    const { user, token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
    const [aiFeedback, setAiFeedback] = useState<{ issues: string[]; suggestions: string[] } | null>(null);

    // Community/Org data
    const [comms, setComms] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);

    // Notification target state
    const [notificationType, setNotificationType] = useState<'RADIUS' | 'COMMUNITY' | 'ORGANIZATION'>('RADIUS');
    const [notifyRadius, setNotifyRadius] = useState('1');
    const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
    const [selectedOrg, setSelectedOrg] = useState<any | null>(null);

    // Cash prize
    const [cashPrize, setCashPrize] = useState('');

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

    useEffect(() => {
        if (token) {
            fetch(`${API_URL}/users/me/communities`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async r => { if (!r.ok) throw new Error(); const t = await r.text(); return JSON.parse(t); })
                .then(d => setComms(Array.isArray(d) ? d : []))
                .catch(() => {});
            fetch(`${API_URL}/users/me/orgs`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async r => { if (!r.ok) throw new Error(); const t = await r.text(); return JSON.parse(t); })
                .then(d => setOrgs(Array.isArray(d) ? d : []))
                .catch(() => {});
        }
    }, [token]);

    const handleAutoGenerate = async () => {
        if (!form.name || !form.category || !form.location) {
            showAlert('Missing Information', 'Please fill Item Name, Category, and Location first.');
            return;
        }
        setIsGeneratingDesc(true);
        try {
            const res = await fetch(`${API_URL}/ai/generate-description`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name, category: form.category,
                    location: form.location, date: date.toISOString().split('T')[0],
                    role: 'victim'
                }),
            });
            const data = await res.json();
            if (data.error) { showAlert('AI Error', data.error); }
            else if (data.description) { setForm(prev => ({ ...prev, description: data.description })); }
        } catch {
            showAlert('Error', 'Failed to auto-generate description. Check network.');
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.name || !form.category || !form.location ) {
            showAlert('Missing Information', 'Please fill in all required fields.');
            return;
        }
        if (notificationType === 'COMMUNITY' && !selectedCommunity) {
            showAlert('Select Community', 'Please select a community to notify.');
            return;
        }
        if (notificationType === 'ORGANIZATION' && !selectedOrg) {
            showAlert('Select Organization', 'Please select an organization to notify.');
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
            if (aiData.error) {
                setAiFeedback({ issues: ['AI Service Error: ' + aiData.error], suggestions: [] });
                setAiLoading(false);
                return;
            }
            if (!aiData.valid) {
                setAiFeedback({
                    issues: aiData.issues?.length ? aiData.issues : [aiData.reason || 'Invalid data.'],
                    suggestions: aiData.suggestions || []
                });
                setAiLoading(false);
                return;
            }
        } catch {
            // AI unavailable — allow submission
        }
        setAiLoading(false);

        setLoading(true);
        try {
            let loc = null;
            

            const { convertImagesToBase64 } = await import('../../utils/imageUtils');
            const base64Images = form.imageUris.length > 0
                ? await convertImagesToBase64(form.imageUris)
                : [];

            await addComplaint({
                name: form.name,
                category: form.category,
                location: form.location,
                date: date.toISOString().split('T')[0],
                description: form.description,
                                imageUris: base64Images,
                userId: user?.id,
                cashPrize: cashPrize.trim() || undefined,
                notifyRadius: notificationType === 'RADIUS' ? Math.min(Math.max(parseInt(notifyRadius) || 1, 1), 10) : undefined,
                targetCommunityId: notificationType === 'COMMUNITY' ? selectedCommunity?.id : undefined,
                targetOrganizationId: notificationType === 'ORGANIZATION' ? selectedOrg?.id : undefined,
                latitude: locationCoords?.lat,
                longitude: locationCoords?.lon,
            });

            router.push({ pathname: '/success', params: { type: 'complaint' } });
        } catch (error) {
            console.error('Submit error:', error);
            showAlert('Error', 'Failed to file complaint. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={0}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.heading, { color: colors.text }]}>File a Complaint</Text>
                    <Text style={[styles.subHeader, { color: colors.textSecondary }]}>
                        Didn't find your item? File a complaint and we'll notify people nearby to help.
                    </Text>

                    <View style={styles.form}>
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
                            <TouchableOpacity
                                onPress={handleAutoGenerate}
                                disabled={isGeneratingDesc}
                                style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            >
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

                        {/* Cash Prize Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.sectionHeader}>
                                <Text style={{ fontSize: 18 }}>💰</Text>
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Cash Prize (Optional)</Text>
                                    <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                                        Announce a reward to encourage finders to return your item
                                    </Text>
                                </View>
                            </View>
                            <Input
                                placeholder="e.g. ₹500, ₹1000 reward..."
                                value={cashPrize}
                                onChangeText={setCashPrize}
                            />
                            {cashPrize.trim() !== '' && (
                                <View style={[styles.previewBadge, { backgroundColor: '#16a34a15', borderColor: '#16a34a' }]}>
                                    <Text style={{ fontSize: 14 }}>💰</Text>
                                    <Text style={{ color: '#16a34a', fontWeight: '700', marginLeft: 6, fontSize: 13 }}>
                                        Reward shown on item card: {cashPrize}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Notification Target Section */}
                        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.sectionHeader}>
                                <Text style={{ fontSize: 18 }}>📢</Text>
                                <View style={{ marginLeft: 10, flex: 1 }}>
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Who to Notify</Text>
                                    <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                                        Choose who gets a notification about your lost item
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
                                    <View style={styles.radiusRow}>
                                        {['1', '2', '5', '10'].map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                style={[styles.radiusChip, { borderColor: notifyRadius === r ? colors.primary : colors.border, backgroundColor: notifyRadius === r ? colors.primary : 'transparent' }]}
                                                onPress={() => setNotifyRadius(r)}
                                            >
                                                <Text style={{ color: notifyRadius === r ? 'white' : colors.text, fontWeight: '600', fontSize: 13 }}>{r} km</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Community Selector */}
                            {notificationType === 'COMMUNITY' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                                        Notify members of this community:
                                    </Text>
                                    {comms.map(c => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.selectItem, {
                                                borderColor: selectedCommunity?.id === c.id ? colors.primary : colors.border,
                                                backgroundColor: selectedCommunity?.id === c.id ? colors.primary + '15' : colors.background
                                            }]}
                                            onPress={() => setSelectedCommunity(c)}
                                        >
                                            <Text style={{ fontSize: 14 }}>👥</Text>
                                            <Text style={[styles.selectItemText, { color: selectedCommunity?.id === c.id ? colors.primary : colors.text }]}>{c.name}</Text>
                                            {selectedCommunity?.id === c.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Organization Selector */}
                            {notificationType === 'ORGANIZATION' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                                        Notify all members in this organization:
                                    </Text>
                                    {orgs.map(o => (
                                        <TouchableOpacity
                                            key={o.id}
                                            style={[styles.selectItem, {
                                                borderColor: selectedOrg?.id === o.id ? colors.primary : colors.border,
                                                backgroundColor: selectedOrg?.id === o.id ? colors.primary + '15' : colors.background
                                            }]}
                                            onPress={() => setSelectedOrg(o)}
                                        >
                                            <Text style={{ fontSize: 14 }}>🏢</Text>
                                            <Text style={[styles.selectItemText, { color: selectedOrg?.id === o.id ? colors.primary : colors.text }]}>{o.name}</Text>
                                            {selectedOrg?.id === o.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        {/* AI Feedback Banner */}
                        {aiFeedback && (
                            <View style={styles.aiBanner}>
                                <Text style={styles.aiBannerTitle}>⚠️ AI Review: Please fix the following</Text>
                                {aiFeedback.issues.map((issue, i) => (
                                    <Text key={i} style={styles.aiIssue}>• {issue}</Text>
                                ))}
                                {aiFeedback.suggestions.length > 0 && (
                                    <>
                                        <Text style={styles.aiSuggestTitle}>💡 Suggestions:</Text>
                                        {aiFeedback.suggestions.map((s, i) => (
                                            <Text key={i} style={styles.aiSuggest}>• {s}</Text>
                                        ))}
                                    </>
                                )}
                            </View>
                        )}

                        <Button
                            title={aiLoading ? 'Verifying with AI...' : 'Submit Complaint'}
                            onPress={handleSubmit}
                            loading={loading || aiLoading}
                            style={{ marginTop: 24 }}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 24 },
    heading: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
    subHeader: { fontSize: 16, marginBottom: 32, lineHeight: 24 },
    form: { gap: 8 },
    sectionCard: {
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 8,
        gap: 10,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    sectionDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
    previewBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    notifyTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    notifyTypeBtn: {
        flex: 1,
        minWidth: 80,
        alignItems: 'center',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1.5,
        gap: 4,
    },
    notifyTypeTxt: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
    radiusRow: { flexDirection: 'row', gap: 8 },
    radiusChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    selectItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1.5,
        marginBottom: 8,
        gap: 10,
    },
    selectItemText: { flex: 1, fontSize: 14, fontWeight: '500' },
    aiBanner: {
        backgroundColor: '#FFF3CD',
        borderColor: '#F59E0B',
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        gap: 6,
    },
    aiBannerTitle: { fontWeight: '700', color: '#92400E', fontSize: 14, marginBottom: 4 },
    aiIssue: { color: '#B45309', fontSize: 13, lineHeight: 20 },
    aiSuggestTitle: { fontWeight: '600', color: '#065F46', fontSize: 13, marginTop: 8 },
    aiSuggest: { color: '#047857', fontSize: 13, lineHeight: 20 },
});
