import { useRouter } from 'expo-router';
import { Calendar, MapPin, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useState, useRef } from 'react';
import { Animated, ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import Card from '../../components/Card';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import { Complaint, getComplaints, searchComplaints } from '../../store';
import * as Location from 'expo-location';

export default function ViewComplaints() {
    const router = useRouter();
    const { colors } = useTheme();
    const { token } = useAuth();
    const { width } = useWindowDimensions();
    const numColumns = width >= 600 ? 2 : 1;
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const insets = useSafeAreaInsets();
    const HEADER_HEIGHT = insets.top + 65;
    const SCROLL_DISTANCE = 65; // Only translate by 65px so search bar stops below status bar
    const [searchHeight, setSearchHeight] = useState(100);

    const scrollY = useRef(new Animated.Value(0)).current;
    const translateY = Animated.diffClamp(scrollY, 0, SCROLL_DISTANCE).interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -SCROLL_DISTANCE],
        extrapolate: 'clamp',
    });
    const headerOpacity = translateY.interpolate({
        inputRange: [-SCROLL_DISTANCE, 0],
        outputRange: [0, 1],
        extrapolate: 'clamp',
    });

    // Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [filterType, setFilterType] = useState<'RADIUS' | 'COMMUNITY' | 'ORGANIZATION'>('RADIUS');
    const [filterRadius, setFilterRadius] = useState('1');
    const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
    const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
    const [comms, setComms] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);

    useEffect(() => {
        loadComplaints();
        if (token) {
            fetch(`${API_URL}/users/me/communities`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => setComms(Array.isArray(d) ? d : []))
                .catch(() => {});
            fetch(`${API_URL}/users/me/orgs`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => setOrgs(Array.isArray(d) ? d : []))
                .catch(() => {});
        }
    }, []);

    const activeFilterLabel = () => {
        if (filterType === 'COMMUNITY' && selectedCommunity) return `👥 ${selectedCommunity.name}`;
        if (filterType === 'ORGANIZATION' && selectedOrg) return `🏢 ${selectedOrg.name}`;
        return `📍 ${filterRadius} km radius`;
    };

    const loadComplaints = async () => {
        setLoading(true);
        try {
            const allComplaints = await getComplaints();
            setComplaints(allComplaints);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            if (!searchQuery.trim() && filterType === 'RADIUS') {
                loadComplaints();
                return;
            }
            let lat, lng, radiusNum;
            if (filterType === 'RADIUS' && filterRadius !== 'All') {
                try {
                    const { status } = await Location.requestForegroundPermissionsAsync();
                    if (status === 'granted') {
                        let loc = await Location.getLastKnownPositionAsync({});
                        if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                        if (loc) {
                            lat = loc.coords.latitude;
                            lng = loc.coords.longitude;
                            radiusNum = parseFloat(filterRadius);
                        }
                    }
                } catch(e) {}
            }
            const results = await searchComplaints(
                searchQuery,
                filterType === 'COMMUNITY' ? selectedCommunity?.id : undefined,
                filterType === 'ORGANIZATION' ? selectedOrg?.id : undefined,
                lat, lng, radiusNum
            );
            setComplaints(results);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: Complaint }) => {
        let images: string[] = [];
        try {
            if (Array.isArray(item.imageUris)) {
                images = item.imageUris;
            } else {
                const parsed = item.imageUris ? JSON.parse(item.imageUris) : [];
                if (Array.isArray(parsed)) {
                    images = parsed;
                } else if (typeof parsed === 'string') {
                    images = [parsed];
                }
            }
        } catch (e) {
            console.log('Error parsing images:', e);
        }

        return (
            <TouchableOpacity
                onPress={() => router.push({
                    pathname: '/founder/complaint-detail',
                    params: { id: item.id }
                })}
                activeOpacity={0.9}
                style={[styles.cardWrapper, numColumns > 1 && { maxWidth: '48.5%' }]}
            >
                <Card style={styles.card}>
                    {images.length > 0 ? (
                        <Image
                            source={{ uri: images[0] }}
                            style={styles.itemImage}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={[styles.itemImage, styles.noImagePlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.noImageText, { color: colors.textSecondary }]}>No Image</Text>
                        </View>
                    )}

                    <View style={styles.itemHeader}>
                        <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                        <View style={[
                            styles.badge,
                            item.status === 'NOTIFIED' && { backgroundColor: colors.primary + '20' }
                        ]}>
                            <Text style={[
                                styles.badgeText,
                                item.status === 'NOTIFIED' && { color: colors.primary }
                            ]}>
                                {item.status === 'NOTIFIED' ? 'Notified' : 'Lost'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.row}>
                        <MapPin size={16} color={colors.textSecondary} />
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{item.location}</Text>
                    </View>

                    <View style={styles.row}>
                        <Calendar size={16} color={colors.textSecondary} />
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{item.date}</Text>
                    </View>

                    {item.cashPrize && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: colors.success + '15', padding: 6, borderRadius: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 16 }}>💰</Text>
                            <Text style={{ color: colors.success, fontWeight: '700', fontSize: 12 }}>Reward: {item.cashPrize}</Text>
                        </View>
                    )}

                    <Text style={[styles.description, { color: colors.textSecondary, marginTop: 8 }]} numberOfLines={2}>
                        {item.description}
                    </Text>

                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                        <Text style={[styles.contact, { color: colors.text }]}>{item.contactInfo}</Text>
                    </View>
                </Card>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                {/* Fixed Status Bar Background */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.headerBackground, zIndex: 30 }} />

                {/* Animated Topbar */}
                <Animated.View style={{ transform: [{ translateY }], position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
                    <Header forceShow />
                </Animated.View>

                {/* Animated Search Container */}
                <Animated.View 
                    onLayout={(e) => setSearchHeight(e.nativeEvent.layout.height)}
                    style={{ transform: [{ translateY }], position: 'absolute', top: HEADER_HEIGHT, left: 0, right: 0, zIndex: 10, elevation: 10, alignItems: 'center' }}
                >
                    <View style={[styles.searchContainer, { width: '100%', maxWidth: 800, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                        <View style={styles.searchRow}>
                            <TextInput
                                style={[styles.searchInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                placeholder=" Search complaint"
                                placeholderTextColor={colors.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                onSubmitEditing={handleSearch}
                            />
                        </View>

                        {/* Active Filter Pill & Filter Button */}
                        <View style={styles.filterPillRow}>
                            <TouchableOpacity
                                onPress={() => setShowFilters(!showFilters)}
                                style={[styles.smallFilterBtn, { borderColor: colors.border, backgroundColor: showFilters ? colors.primary + '15' : colors.surface }]}
                            >
                                <SlidersHorizontal size={14} color={showFilters ? colors.primary : colors.text} />
                            </TouchableOpacity>
                            <View style={[styles.filterPill, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{activeFilterLabel()}</Text>
                            </View>
                        </View>

                    {/* Expanded Filter Panel */}
                    {showFilters && (
                        <View style={[styles.filterPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={[styles.filterTitle, { color: colors.text }]}>Search Scope</Text>
                            <View style={styles.filterTypeRow}>
                                <TouchableOpacity
                                    style={[styles.filterTypeBtn, { borderColor: filterType === 'RADIUS' ? colors.primary : colors.border, backgroundColor: filterType === 'RADIUS' ? colors.primary + '15' : 'transparent' }]}
                                    onPress={() => setFilterType('RADIUS')}
                                >
                                    <Text style={{ fontSize: 16 }}>📍</Text>
                                    <Text style={[styles.filterTypeTxt, { color: filterType === 'RADIUS' ? colors.primary : colors.text }]}>Radius</Text>
                                </TouchableOpacity>

                                {comms.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.filterTypeBtn, { borderColor: filterType === 'COMMUNITY' ? colors.primary : colors.border, backgroundColor: filterType === 'COMMUNITY' ? colors.primary + '15' : 'transparent' }]}
                                        onPress={() => setFilterType('COMMUNITY')}
                                    >
                                        <Text style={{ fontSize: 16 }}>👥</Text>
                                        <Text style={[styles.filterTypeTxt, { color: filterType === 'COMMUNITY' ? colors.primary : colors.text }]}>Community</Text>
                                    </TouchableOpacity>
                                )}

                                {orgs.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.filterTypeBtn, { borderColor: filterType === 'ORGANIZATION' ? colors.primary : colors.border, backgroundColor: filterType === 'ORGANIZATION' ? colors.primary + '15' : 'transparent' }]}
                                        onPress={() => setFilterType('ORGANIZATION')}
                                    >
                                        <Text style={{ fontSize: 16 }}>🏢</Text>
                                        <Text style={[styles.filterTypeTxt, { color: filterType === 'ORGANIZATION' ? colors.primary : colors.text }]}>Organization</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {filterType === 'RADIUS' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>Radius around current location:</Text>
                                    <View style={styles.radiusRow}>
                                        {['All', '1', '2', '5', '10'].map(r => (
                                            <TouchableOpacity
                                                key={r}
                                                style={[styles.radiusChip, { borderColor: filterRadius === r ? colors.primary : colors.border, backgroundColor: filterRadius === r ? colors.primary : 'transparent' }]}
                                                onPress={() => setFilterRadius(r)}
                                            >
                                                <Text style={{ color: filterRadius === r ? 'white' : colors.text, fontWeight: '600', fontSize: 13 }}>{r === 'All' ? 'All' : r + ' km'}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {filterType === 'COMMUNITY' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>Select community:</Text>
                                    {comms.map(c => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.selectItem, { borderColor: selectedCommunity?.id === c.id ? colors.primary : colors.border, backgroundColor: selectedCommunity?.id === c.id ? colors.primary + '15' : colors.surface }]}
                                            onPress={() => setSelectedCommunity(c)}
                                        >
                                            <Text style={[styles.selectItemText, { color: selectedCommunity?.id === c.id ? colors.primary : colors.text }]}>{c.name}</Text>
                                            {selectedCommunity?.id === c.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {filterType === 'ORGANIZATION' && (
                                <View style={{ marginTop: 8 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>Select organization:</Text>
                                    {orgs.map(o => (
                                        <TouchableOpacity
                                            key={o.id}
                                            style={[styles.selectItem, { borderColor: selectedOrg?.id === o.id ? colors.primary : colors.border, backgroundColor: selectedOrg?.id === o.id ? colors.primary + '15' : colors.surface }]}
                                            onPress={() => setSelectedOrg(o)}
                                        >
                                            <Text style={[styles.selectItemText, { color: selectedOrg?.id === o.id ? colors.primary : colors.text }]}>{o.name}</Text>
                                            {selectedOrg?.id === o.id && <Text style={{ color: colors.primary }}>✓</Text>}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <TouchableOpacity
                                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                                onPress={() => { setShowFilters(false); handleSearch(); }}
                            >
                                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Apply Filter & Search</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    </View>
                </Animated.View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <View style={{ flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' }}>
                    <Animated.FlatList
                        data={complaints}
                        renderItem={renderItem}
                        keyExtractor={item => item.id}
                        key={numColumns}
                        numColumns={numColumns}
                        contentContainerStyle={[styles.list, { paddingTop: HEADER_HEIGHT + searchHeight + 16, paddingBottom: 100 }]}
                        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
                        keyboardShouldPersistTaps="handled"
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                            { useNativeDriver: true }
                        )}
                        scrollEventThrottle={16}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    {searchQuery ? 'No matching complaints found' : 'No complaints yet'}
                                </Text>
                                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                                    If you found an item that isn't listed here, please report it.
                                </Text>
                            </View>
                        }
                    />
                    </View>
                )}

                <View style={[styles.bottomAction, { backgroundColor: colors.surface, borderBottomColor: colors.border, borderTopWidth: 1, position: 'absolute', bottom: 0, left: 0, right: 0 }]}>
                    <SafeAreaView edges={['bottom']} style={{ width: '100%', maxWidth: 800 }}>
                        <TouchableOpacity
                            style={[styles.reportButton, { backgroundColor: colors.primary }]}
                            onPress={() => router.push('/founder/report')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.reportButtonText}>Report New Item</Text>
                        </TouchableOpacity>
                    </SafeAreaView>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 24,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 0,
    },
    subtitle: {
        fontSize: 16,
        lineHeight: 24,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
        borderBottomWidth: 1,
        gap: 6,
    },
    searchRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    searchInput: {
        flex: 1,
        height: 48,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    searchButton: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchHint: {
        fontSize: 13,
        lineHeight: 18,
        flex: 1,
    },
    filterPillRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    smallFilterBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
    },
    filterPanel: {
        marginTop: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
    },
    filterTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
    filterTypeRow: { flexDirection: 'row', gap: 8 },
    filterTypeBtn: {
        flex: 1,
        alignItems: 'center',
        padding: 10,
        borderRadius: 10,
        borderWidth: 1.5,
        gap: 4,
    },
    filterTypeTxt: { fontSize: 12, fontWeight: '600' },
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
        marginBottom: 6,
        gap: 10,
    },
    selectItemText: { flex: 1, fontSize: 14, fontWeight: '500' },
    applyBtn: {
        marginTop: 8,
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    list: {
        padding: 16,
        gap: 16,
    },
    cardWrapper: {
        flex: 1,
    },
    card: {
        overflow: 'hidden',
        flex: 1,
    },
    columnWrapper: {
        gap: 16,
    },
    itemImage: {
        width: '100%',
        aspectRatio: 4 / 3,
        marginBottom: 16,
        backgroundColor: '#F1F5F9',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    itemName: {
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    },
    badge: {
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#92400E',
        fontSize: 12,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    itemMeta: {
        fontSize: 14,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        marginTop: 8,
    },
    footer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    contact: {
        fontSize: 14,
        fontWeight: '500',
    },
    empty: {
        padding: 48,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
    },
    bottomAction: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        borderTopWidth: 1,
        alignItems: 'center',
        gap: 16,
    },
    actionText: {
        fontSize: 16,
        fontWeight: '500',
    },
    reportButton: {
        width: '100%',
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reportButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
    },
    noImagePlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    noImageText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
