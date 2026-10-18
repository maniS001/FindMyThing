import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Alert } from 'react-native';
import { MapPin, X, Navigation, Search, CornerDownLeft } from 'lucide-react-native';
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
    isCustom?: boolean;
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

// Resilient multi-engine reverse geocoder: Nominatim zoom=18 first
async function fetchAddressForCoords(lat: number, lon: number): Promise<string> {
    // Engine 1: OpenStreetMap Nominatim with full landmark/street breakdown
    try {
        const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`,
            {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            }
        );
        if (nomRes.ok) {
            const data = await nomRes.json();
            if (data && data.address) {
                const a = data.address;
                const landmark = data.name || a.amenity || a.leisure || a.tourism || a.building || a.shop || a.office || a.historic || a.place || '';
                const road = a.road || a.pedestrian || a.street || '';
                const subLocality = a.suburb || a.village || a.neighbourhood || a.hamlet || '';
                const town = a.town || a.city || a.county || a.municipality || '';
                const district = a.state_district || a.district || '';
                const postcode = a.postcode || '';

                const parts = [landmark, road, subLocality, town, district, postcode].filter(Boolean);
                const uniqueParts: string[] = [];
                for (const p of parts) {
                    if (!uniqueParts.includes(p)) uniqueParts.push(p);
                }
                if (uniqueParts.length >= 2) {
                    return uniqueParts.join(', ');
                }
                if (data.display_name) return data.display_name;
            }
        }
    } catch {}

    // Engine 2: BigDataCloud fallback
    try {
        const bdcRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        );
        if (bdcRes.ok) {
            const bdc = await bdcRes.json();
            const locality = bdc.locality || bdc.city || '';
            const district = bdc.localityInfo?.administrative?.find((a: any) => a.order >= 9 && a.order <= 11)?.name || '';
            const state = bdc.principalSubdivision || '';
            const parts = [locality, district !== locality ? district : '', state].filter(Boolean);
            if (parts.length > 0) return parts.join(', ');
        }
    } catch {}

    // Engine 3: Photon fallback
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

export default function LocationPicker({ label, value, onChange, placeholder = "Search location or enter your own..." }: LocationPickerProps) {
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

    // Search places nearby, always including the user's custom entered text
    const searchPlaces = async (text: string) => {
        setQuery(text);

        // Directly allow typing without forcing selection
        onChange(text, userCoords ? { latitude: userCoords.lat, longitude: userCoords.lon } : undefined);

        const trimmed = text.trim();
        if (trimmed.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);

        const cleanQuery = trimmed
            .replace(/busstand/gi, 'bus stand')
            .replace(/railwaystation/gi, 'railway station')
            .replace(/policestation/gi, 'police station');

        try {
            const coords = userCoords;
            const combined: LocationResult[] = [];

            // 1. ALWAYS ADD USER'S EXACT ENTERED TEXT AS THE FIRST OPTION
            combined.push({
                place_id: 'custom-user-input',
                display_name: trimmed,
                isCustom: true,
                lat: String(coords?.lat || 11.3992),
                lon: String(coords?.lon || 79.6935),
                distanceKm: coords ? 0 : undefined,
            });

            // 2. Query Engine 1: Photon with GPS proximity bias
            try {
                let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=12`;
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

            // 3. Query Engine 2: OpenStreetMap Nominatim
            try {
                let nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=8&countrycodes=in`;
                if (coords) {
                    const delta = 0.5; // ~55 km
                    nomUrl += `&viewbox=${coords.lon - delta},${coords.lat + delta},${coords.lon + delta},${coords.lat - delta}`;
                }
                const nomRes = await fetch(nomUrl, {
                    headers: { 'User-Agent': 'FindMyThingApp/1.0' }
                });
                if (nomRes.ok) {
                    const nomData = await nomRes.json();
                    if (Array.isArray(nomData)) {
                        for (const item of nomData) {
                            const itemLat = parseFloat(item.lat);
                            const itemLon = parseFloat(item.lon);
                            const dist = coords ? getDistanceKm(coords.lat, coords.lon, itemLat, itemLon) : undefined;
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

            // Deduplicate
            const seen = new Set<string>();
            const deduplicated: LocationResult[] = [];
            for (const item of combined) {
                if (item.isCustom) {
                    deduplicated.push(item);
                    continue;
                }
                const key = `${parseFloat(item.lat).toFixed(3)}_${parseFloat(item.lon).toFixed(3)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    deduplicated.push(item);
                }
            }

            // Sort non-custom items by proximity to user
            const customItem = deduplicated.find((i) => i.isCustom);
            let otherItems = deduplicated.filter((i) => !i.isCustom);
            if (coords) {
                // If user has GPS coords, only keep results within 60 km, unless user specifically searched for that distant city/state
                otherItems = otherItems.filter((i) => {
                    if (i.distanceKm !== undefined && i.distanceKm > 60) {
                        const qLower = cleanQuery.toLowerCase();
                        const dLower = i.display_name.toLowerCase();
                        const words = qLower.split(/\s+/).filter(w => w.length > 3);
                        return words.some(w => dLower.includes(w) && !['park', 'road', 'street', 'station', 'stand', 'nagar', 'cross', 'near', 'main'].includes(w));
                    }
                    return true;
                });
                otherItems.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
            }

            setResults(customItem ? [customItem, ...otherItems] : otherItems);
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
                                        placeholder="Search landmark or type address..."
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
    customResultItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderBottomWidth: 1,
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
