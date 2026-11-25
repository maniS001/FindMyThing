import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    Modal,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    Alert,
} from 'react-native';
import { MapPin, X, Navigation, Search, CornerDownLeft } from 'lucide-react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/ThemeContext';
import Input from './Input';
import {
    LocationResult,
    fetchAddressForCoords,
    fetchNearbyPlaces,
    resolveGooglePlaceDetails,
    searchPlacesWithFallback,
} from '../utils/placesService';

interface LocationPickerProps {
    label?: string;
    value: string;
    onChange: (location: string, coords?: { latitude: number; longitude: number }) => void;
    placeholder?: string;
}

export default function LocationPicker({
    label,
    value,
    onChange,
    placeholder = 'Search location or enter your own...',
}: LocationPickerProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [nearbyResults, setNearbyResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locatingInline, setLocatingInline] = useState(false);
    const [mapMode, setMapMode] = useState(false);

    const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [region, setRegion] = useState<Region>({
        latitude: 11.3992,
        longitude: 79.6935,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
    });
    const [markerCoord, setMarkerCoord] = useState<{ latitude: number; longitude: number } | null>(null);
    const [selectedPoiName, setSelectedPoiName] = useState<string | null>(null);

    useEffect(() => {
        if (modalVisible) {
            setQuery(value || '');
            setResults([]);
            if (userCoords && nearbyResults.length === 0) {
                fetchNearbyPlaces(userCoords.lat, userCoords.lon).then(setNearbyResults);
            }
        }
    }, [modalVisible, value]);

    // Detect device GPS on mount and preload nearby places
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc =
                        (await Location.getLastKnownPositionAsync()) ||
                        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }));
                    if (loc) {
                        const c = { lat: loc.coords.latitude, lon: loc.coords.longitude };
                        setUserCoords(c);
                        setRegion({
                            latitude: c.lat,
                            longitude: c.lon,
                            latitudeDelta: 0.015,
                            longitudeDelta: 0.015,
                        });
                        fetchNearbyPlaces(c.lat, c.lon).then(setNearbyResults);
                    }
                }
            } catch {}
        })();
    }, []);

    const searchPlaces = async (text: string) => {
        setQuery(text);
        onChange(text, userCoords ? { latitude: userCoords.lat, longitude: userCoords.lon } : undefined);

        const trimmed = text.trim();
        if (trimmed.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const list = await searchPlacesWithFallback(trimmed, userCoords);
            setResults(list);
        } catch (error) {
            console.error('Search error', error);
        } finally {
            setLoading(false);
        }
    };

    const useCurrentLocation = async () => {
        setLoading(true);
        setLocatingInline(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Please allow Location permission in phone settings to get your exact location.');
                return;
            }
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            const coords = { lat: location.coords.latitude, lon: location.coords.longitude };
            setUserCoords(coords);
            fetchNearbyPlaces(coords.lat, coords.lon).then(setNearbyResults);

            const address = await fetchAddressForCoords(location.coords.latitude, location.coords.longitude);
            onChange(address, { latitude: location.coords.latitude, longitude: location.coords.longitude });
            setModalVisible(false);
        } catch {
            Alert.alert('GPS Notice', 'Could not get GPS satellite lock. Please ensure phone location is turned on.');
        } finally {
            setLoading(false);
            setLocatingInline(false);
        }
    };

    const handleSelectResult = async (item: LocationResult) => {
        if (item.googlePlaceId) {
            setLoading(true);
            const details = await resolveGooglePlaceDetails(item.googlePlaceId);
            setLoading(false);
            if (details) {
                onChange(details.display_name || item.display_name, { latitude: details.lat, longitude: details.lon });
                setModalVisible(false);
                return;
            }
        }
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setModalVisible(false);
    };

    const handleMapConfirm = async () => {
        if (!markerCoord) return;
        setLoading(true);
        const address = selectedPoiName
            ? `${selectedPoiName} (${await fetchAddressForCoords(markerCoord.latitude, markerCoord.longitude)})`
            : await fetchAddressForCoords(markerCoord.latitude, markerCoord.longitude);
        onChange(address, { latitude: markerCoord.latitude, longitude: markerCoord.longitude });
        setUserCoords({ lat: markerCoord.latitude, lon: markerCoord.longitude });
        setSelectedPoiName(null);
        setLoading(false);
        setModalVisible(false);
    };

    const centerMapOnMe = async () => {
        try {
            setLoading(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                const coords = { lat: location.coords.latitude, lon: location.coords.longitude };
                setUserCoords(coords);
                setRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
                setMarkerCoord({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                });
                setSelectedPoiName(null);
                fetchNearbyPlaces(coords.lat, coords.lon).then(setNearbyResults);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const openMapDirectly = () => {
        setMapMode(true);
        setModalVisible(true);
        centerMapOnMe();
    };

    const displayedList = query.trim().length >= 2 ? results : nearbyResults;

    return (
        <View style={styles.wrapper}>
            {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}

            <TouchableOpacity activeOpacity={0.8} onPress={() => { Keyboard.dismiss(); setMapMode(false); setModalVisible(true); }}>
                <View pointerEvents="none">
                    <Input
                        placeholder={placeholder}
                        value={value}
                        editable={false}
                        onChangeText={() => {}}
                    />
                </View>
            </TouchableOpacity>

            <View style={styles.inlineActionRow}>
                <TouchableOpacity
                    onPress={useCurrentLocation}
                    style={[styles.inlineActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    disabled={locatingInline}
                >
                    {locatingInline ? (
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
                    ) : (
                        <Navigation size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    )}
                    <Text style={[styles.inlineActionText, { color: colors.primary }]}>
                        {locatingInline ? 'Acquiring GPS...' : 'Use my current location'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={openMapDirectly}
                    style={[styles.inlineActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <MapPin size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.inlineActionText, { color: colors.primary }]}>Google Map Pin</Text>
                </TouchableOpacity>
            </View>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <KeyboardAvoidingView
                        style={[styles.container, { backgroundColor: colors.surface }]}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={[styles.header, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.title, { color: colors.text }]}>
                                {mapMode ? 'Select Place on Google Map' : 'Search Places & Nearby Landmarks'}
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {mapMode ? (
                            <View style={styles.mapContainer}>
                                <MapView
                                    provider={PROVIDER_GOOGLE}
                                    style={styles.map}
                                    region={region}
                                    onRegionChangeComplete={setRegion}
                                    onPress={(e) => {
                                        setSelectedPoiName(null);
                                        setMarkerCoord(e.nativeEvent.coordinate);
                                    }}
                                    onPoiClick={(e) => {
                                        const poi = e.nativeEvent;
                                        setSelectedPoiName(poi.name ? poi.name.replace(/\n/g, ' ') : null);
                                        setMarkerCoord(poi.coordinate);
                                    }}
                                    showsUserLocation={true}
                                    showsPointsOfInterest={true}
                                    showsBuildings={true}
                                    showsCompass={true}
                                >
                                    {markerCoord && (
                                        <Marker
                                            coordinate={markerCoord}
                                            title={selectedPoiName || 'Selected Pin'}
                                        />
                                    )}
                                </MapView>

                                {selectedPoiName && (
                                    <View style={[styles.poiBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <MapPin size={16} color={colors.primary} />
                                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, marginLeft: 6, flex: 1 }} numberOfLines={1}>
                                            {selectedPoiName}
                                        </Text>
                                    </View>
                                )}

                                <TouchableOpacity style={[styles.myLocationBtn, { backgroundColor: colors.surface }]} onPress={centerMapOnMe}>
                                    <Navigation size={20} color={colors.primary} />
                                </TouchableOpacity>

                                <View style={[styles.mapFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                                    <TouchableOpacity style={styles.textBtn} onPress={() => setMapMode(false)}>
                                        <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Search List</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.confirmBtn, { backgroundColor: markerCoord ? colors.primary : colors.border }]}
                                        disabled={!markerCoord || loading}
                                        onPress={handleMapConfirm}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#FFF" />
                                        ) : (
                                            <Text style={{ color: 'white', fontWeight: 'bold' }}>Confirm Pin</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.searchContainer}>
                                <View style={styles.inputWrapper}>
                                    <Search size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={[styles.searchInput, { color: colors.text }]}
                                        placeholder="Search shop, temple, bus stand, address..."
                                        placeholderTextColor={colors.textSecondary}
                                        value={query}
                                        onChangeText={searchPlaces}
                                        autoFocus
                                    />
                                    {loading && <ActivityIndicator color={colors.primary} size="small" />}
                                </View>

                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={useCurrentLocation}>
                                        <Navigation size={16} color={colors.primary} />
                                        <Text style={[styles.actionText, { color: colors.primary }]}>Use GPS location</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setMapMode(true); centerMapOnMe(); }}>
                                        <MapPin size={16} color={colors.primary} />
                                        <Text style={[styles.actionText, { color: colors.primary }]}>Google Map Pin</Text>
                                    </TouchableOpacity>
                                </View>

                                {query.trim().length < 2 && nearbyResults.length > 0 && (
                                    <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                                            Nearby Places Around You
                                        </Text>
                                    </View>
                                )}

                                {displayedList.length > 0 ? (
                                    <FlatList
                                        data={displayedList}
                                        keyExtractor={(item, idx) => `${String(item.place_id)}-${idx}`}
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => {
                                            if (item.isCustom) {
                                                return (
                                                    <TouchableOpacity
                                                        style={[styles.customResultItem, { backgroundColor: colors.primary + '15', borderBottomColor: colors.border }]}
                                                        onPress={() => handleSelectResult(item)}
                                                    >
                                                        <CornerDownLeft size={16} color={colors.primary} style={{ marginRight: 10, marginTop: 2 }} />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.resultText, { color: colors.primary, fontWeight: '700' }]}>
                                                                Use "{item.display_name}"
                                                            </Text>
                                                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                                                                Set custom place name directly
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            }

                                            return (
                                                <TouchableOpacity
                                                    style={[styles.resultItem, { borderBottomColor: colors.border }]}
                                                    onPress={() => handleSelectResult(item)}
                                                >
                                                    <MapPin size={20} color={colors.primary} style={{ marginTop: 2, marginRight: 12 }} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.resultText, { color: colors.text }]}>{item.display_name}</Text>
                                                        {item.distanceKm !== undefined && item.distanceKm > 0 && (
                                                            <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                                                📍 {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`} away
                                                            </Text>
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                ) : (
                                    query.trim().length >= 2 && !loading ? (
                                        <View style={{ padding: 16 }}>
                                            <TouchableOpacity
                                                style={[styles.customResultItem, { backgroundColor: colors.primary + '15', borderRadius: 8, padding: 12 }]}
                                                onPress={() => {
                                                    onChange(query.trim(), userCoords ? { latitude: userCoords.lat, longitude: userCoords.lon } : undefined);
                                                    setModalVisible(false);
                                                }}
                                            >
                                                <CornerDownLeft size={16} color={colors.primary} style={{ marginRight: 10, marginTop: 2 }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.resultText, { color: colors.primary, fontWeight: '700' }]}>
                                                        Use "{query.trim()}"
                                                    </Text>
                                                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                                                        Tap to save what you entered
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    ) : null
                                )}
                            </View>
                        )}
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { width: '100%', marginBottom: 8 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
    inlineActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10, flexWrap: 'wrap' },
    inlineActionBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    inlineActionText: { fontSize: 13, fontWeight: '600' },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    container: {
        height: '85%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
    title: { fontSize: 17, fontWeight: 'bold' },
    searchContainer: { flex: 1 },
    inputWrapper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    searchInput: { flex: 1, fontSize: 16, height: 40 },
    actionRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
    actionText: { marginLeft: 8, fontSize: 13, fontWeight: '600' },
    customResultItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1 },
    resultItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1 },
    resultText: { fontSize: 14, lineHeight: 20 },
    mapContainer: { flex: 1, position: 'relative' },
    map: { flex: 1 },
    poiBanner: {
        position: 'absolute',
        top: 12,
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        elevation: 5,
    },
    myLocationBtn: {
        position: 'absolute',
        bottom: 90,
        right: 16,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    mapFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, borderTopWidth: 1 },
    textBtn: { padding: 8 },
    confirmBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, minWidth: 120, alignItems: 'center' },
});
