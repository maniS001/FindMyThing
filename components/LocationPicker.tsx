import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Alert } from 'react-native';
import { MapPin, X, Navigation, Search } from 'lucide-react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/ThemeContext';
import Input from './Input';

interface LocationResult {
    place_id: string | number;
    display_name: string;
    lat: string;
    lon: string;
    distanceKm?: number;
}

interface LocationPickerProps {
    label?: string;
    value: string;
    onChange: (location: string, coords?: { latitude: number, longitude: number }) => void;
    placeholder?: string;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Resilient multi-engine reverse geocoder (BigDataCloud -> Nominatim -> Photon -> Coords)
async function fetchAddressForCoords(lat: number, lon: number): Promise<string> {
    // Engine 1: BigDataCloud (fast, zero rate limits)
    try {
        const bdcRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        if (bdcRes.ok) {
            const bdc = await bdcRes.json();
            const locality = bdc.locality || bdc.city || '';
            const district = bdc.localityInfo?.administrative?.find((a: any) => a.order >= 8 && a.order <= 11)?.name || '';
            const state = bdc.principalSubdivision || '';
            const parts = [locality, district !== locality ? district : '', state].filter(Boolean);
            if (parts.length > 0) {
                return parts.join(', ');
            }
        }
    } catch {}

    // Engine 2: OpenStreetMap Nominatim
    try {
        const nomRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=16&addressdetails=1`, {
            headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (nomRes.ok) {
            const nom = await nomRes.json();
            if (nom && nom.display_name && !nom.error) {
                return nom.display_name;
            }
        }
    } catch {}

    // Engine 3: Photon reverse
    try {
        const photonRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
        if (photonRes.ok) {
            const pData = await photonRes.json();
            const p = pData.features?.[0]?.properties;
            if (p) {
                const parts = [p.name, p.street, p.city || p.district, p.state].filter(Boolean);
                if (parts.length > 0) return parts.join(', ');
            }
        }
    } catch {}

    return `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
}

export default function LocationPicker({ label, value, onChange, placeholder = "Search location or choose on map..." }: LocationPickerProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    
    // Modal state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locatingInline, setLocatingInline] = useState(false);
    const [mapMode, setMapMode] = useState(false);
    
    // User GPS location for nearby biasing
    const [userCoords, setUserCoords] = useState<{ lat: number, lon: number } | null>(null);

    const [region, setRegion] = useState<Region>({
        latitude: 11.3992,
        longitude: 79.6935,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    });
    const [markerCoord, setMarkerCoord] = useState<{ latitude: number, longitude: number } | null>(null);

    useEffect(() => {
        if (modalVisible) {
            setQuery(value || '');
            setResults([]);
        }
    }, [modalVisible, value]);

    // Silently detect actual device GPS coordinates on mount
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                    if (loc) {
                        setUserCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
                        setRegion({
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                            latitudeDelta: 0.03,
                            longitudeDelta: 0.03,
                        });
                    }
                }
            } catch {}
        })();
    }, []);

    // Search places nearby within 50 km radius, strictly sorted by closest distance
    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);

        const cleanQuery = text
            .replace(/busstand/gi, 'bus stand')
            .replace(/railwaystation/gi, 'railway station')
            .replace(/policestation/gi, 'police station');

        try {
            const coords = userCoords;
            let combined: LocationResult[] = [];

            // Query Engine 1: Photon with GPS proximity bias
            try {
                let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=15`;
                if (coords) {
                    photonUrl += `&lat=${coords.lat}&lon=${coords.lon}`;
                }
                const pRes = await fetch(photonUrl, {
                    headers: { 'User-Agent': 'FindMyThingApp/1.0' }
                });
                if (pRes.ok) {
                    const pData = await pRes.json();
                    const features = pData.features || [];
                    for (const f of features) {
                        const p = f.properties || {};
                        const c = f.geometry?.coordinates || [0, 0];
                        const itemLon = c[0];
                        const itemLat = c[1];
                        const dist = coords ? getDistanceKm(coords.lat, coords.lon, itemLat, itemLon) : undefined;
                        const name = p.name || p.street || cleanQuery;
                        const placeDetails = [name, p.city || p.district || p.state].filter(Boolean).join(', ');
                        
                        combined.push({
                            place_id: `photon-${itemLat}-${itemLon}`,
                            display_name: placeDetails,
                            lat: String(itemLat),
                            lon: String(itemLon),
                            distanceKm: dist,
                        });
                    }
                }
            } catch {}

            // Query Engine 2: OpenStreetMap Nominatim with viewbox if Photon had few results
            if (combined.length < 5 && coords) {
                try {
                    const delta = 0.45; // ~50 km
                    const minLon = coords.lon - delta;
                    const maxLat = coords.lat + delta;
                    const maxLon = coords.lon + delta;
                    const minLat = coords.lat - delta;
                    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=10&countrycodes=in&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;
                    const nomRes = await fetch(nomUrl, {
                        headers: { 'User-Agent': 'FindMyThingApp/1.0' }
                    });
                    if (nomRes.ok) {
                        const nomData = await nomRes.json();
                        if (Array.isArray(nomData)) {
                            for (const item of nomData) {
                                const itemLat = parseFloat(item.lat);
                                const itemLon = parseFloat(item.lon);
                                const dist = getDistanceKm(coords.lat, coords.lon, itemLat, itemLon);
                                combined.push({
                                    place_id: item.place_id,
                                    display_name: item.display_name,
                                    lat: item.lat,
                                    lon: item.lon,
                                    distanceKm: dist,
                                });
                            }
                        }
                    }
                } catch {}
            }

            // Deduplicate
            const seen = new Set<string>();
            let filtered = combined.filter((item) => {
                const key = `${parseFloat(item.lat).toFixed(3)}_${parseFloat(item.lon).toFixed(3)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Filter to 50 km and STRICTLY sort closest distance first
            if (coords) {
                filtered = filtered.filter((item) => item.distanceKm === undefined || item.distanceKm <= 50.0);
                filtered.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
            }

            setResults(filtered);
        } catch (error) {
            console.error('Search error', error);
        } finally {
            setLoading(false);
        }
    };

    // Exact GPS satellite lock
    const useCurrentLocation = async () => {
        setLoading(true);
        setLocatingInline(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Please allow Location permission in phone settings to get your exact location.');
                return;
            }
            // Use Highest Accuracy for hardware GPS satellites
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            const coords = { lat: location.coords.latitude, lon: location.coords.longitude };
            setUserCoords(coords);

            const address = await fetchAddressForCoords(location.coords.latitude, location.coords.longitude);
            
            onChange(address, { latitude: location.coords.latitude, longitude: location.coords.longitude });
            setModalVisible(false);
        } catch (error) {
            Alert.alert('GPS Notice', 'Could not get GPS satellite lock. Please ensure phone location is turned on.');
        } finally {
            setLoading(false);
            setLocatingInline(false);
        }
    };

    const handleSelectResult = async (item: LocationResult) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setModalVisible(false);
    };

    const handleMapConfirm = async () => {
        if (!markerCoord) return;
        setLoading(true);
        const address = await fetchAddressForCoords(markerCoord.latitude, markerCoord.longitude);
        onChange(address, { latitude: markerCoord.latitude, longitude: markerCoord.longitude });
        setUserCoords({ lat: markerCoord.latitude, lon: markerCoord.longitude });
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
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02
                });
                setMarkerCoord({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude
                });
            }
        } catch(e) {
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

    return (
        <View style={styles.wrapper}>
            {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}

            {/* The Trigger Input */}
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

            {/* Direct Action Buttons Under the Field */}
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
                    <Text style={[styles.inlineActionText, { color: colors.primary }]}>Select on map</Text>
                </TouchableOpacity>
            </View>

            {/* The Main Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <KeyboardAvoidingView 
                        style={[styles.container, { backgroundColor: colors.surface }]}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={[styles.header, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.title, { color: colors.text }]}>
                                {mapMode ? 'Select on Map' : 'Search Location'}
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                                <X size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {mapMode ? (
                            <View style={styles.mapContainer}>
                                <MapView
                                    style={styles.map}
                                    region={region}
                                    onRegionChangeComplete={setRegion}
                                    onPress={(e) => setMarkerCoord(e.nativeEvent.coordinate)}
                                    showsUserLocation={true}
                                >
                                    {markerCoord && <Marker coordinate={markerCoord} />}
                                </MapView>
                                
                                <TouchableOpacity style={[styles.myLocationBtn, { backgroundColor: colors.surface }]} onPress={centerMapOnMe}>
                                    <Navigation size={20} color={colors.primary} />
                                </TouchableOpacity>
                                
                                <View style={[styles.mapFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                                    <TouchableOpacity style={styles.textBtn} onPress={() => setMapMode(false)}>
                                        <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Back to Search</Text>
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
                                        placeholder="Search nearby places (within 50 km)..."
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
                                        <Text style={[styles.actionText, { color: colors.primary }]}>Choose on map</Text>
                                    </TouchableOpacity>
                                </View>

                                {results.length > 0 ? (
                                    <FlatList
                                        data={results}
                                        keyExtractor={(item) => String(item.place_id)}
                                        keyboardShouldPersistTaps="handled"
                                        renderItem={({ item }) => (
                                            <TouchableOpacity 
                                                style={[styles.resultItem, { borderBottomColor: colors.border }]}
                                                onPress={() => handleSelectResult(item)}
                                            >
                                                <MapPin size={20} color={colors.primary} style={{ marginTop: 2, marginRight: 12 }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.resultText, { color: colors.text }]}>{item.display_name}</Text>
                                                    {item.distanceKm !== undefined && (
                                                        <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                                            📍 {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`} away
                                                        </Text>
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    />
                                ) : (
                                    query.length >= 2 && !loading ? (
                                        <View style={{ padding: 24, alignItems: 'center' }}>
                                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                                No places found matching "{query}" within 50 km.
                                            </Text>
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
    wrapper: {
        width: '100%',
        marginBottom: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
    },
    inlineActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        marginBottom: 10,
        flexWrap: 'wrap',
    },
    inlineActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    inlineActionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 17,
        fontWeight: 'bold',
    },
    searchContainer: {
        flex: 1,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        height: 40,
    },
    actionRow: {
        flexDirection: 'row',
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
    },
    actionText: {
        marginLeft: 8,
        fontSize: 13,
        fontWeight: '600',
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderBottomWidth: 1,
    },
    resultText: {
        fontSize: 14,
        lineHeight: 20,
    },
    emptyText: {
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 20,
    },
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    map: {
        flex: 1,
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
    mapFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        borderTopWidth: 1,
    },
    textBtn: {
        padding: 8,
    },
    confirmBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        minWidth: 120,
        alignItems: 'center',
    },
});
