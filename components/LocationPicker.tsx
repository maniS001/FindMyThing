import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { MapPin, X, Navigation, Search, Check } from 'lucide-react-native';
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

export default function LocationPicker({ label, value, onChange, placeholder = "Search location..." }: LocationPickerProps) {
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
        latitude: 20.5937,
        longitude: 78.9629,
        latitudeDelta: 10,
        longitudeDelta: 10,
    });
    const [markerCoord, setMarkerCoord] = useState<{ latitude: number, longitude: number } | null>(null);

    useEffect(() => {
        if (modalVisible) {
            setQuery(value || '');
            setResults([]);
        }
    }, [modalVisible, value]);

    // Silently check last known location on mount to bias search results
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    if (loc) {
                        setUserCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
                    }
                }
            } catch {}
        })();
    }, []);

    const reverseGeocode = async (lat: number, lon: number) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            });
            const data = await res.json();
            return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        } catch (error) {
            return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
    };

    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=8&countrycodes=in`;
            if (userCoords) {
                const minLon = userCoords.lon - 0.4;
                const maxLat = userCoords.lat + 0.4;
                const maxLon = userCoords.lon + 0.4;
                const minLat = userCoords.lat - 0.4;
                url += `&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=0`;
            }
            const res = await fetch(url, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            });
            const data = await res.json();
            
            if (Array.isArray(data)) {
                let mapped: LocationResult[] = data.map((item: any) => {
                    const itemLat = parseFloat(item.lat);
                    const itemLon = parseFloat(item.lon);
                    const dist = userCoords ? getDistanceKm(userCoords.lat, userCoords.lon, itemLat, itemLon) : undefined;
                    return {
                        place_id: item.place_id,
                        display_name: item.display_name,
                        lat: item.lat,
                        lon: item.lon,
                        distanceKm: dist,
                    };
                });

                if (userCoords) {
                    mapped.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
                }
                setResults(mapped);
            } else {
                setResults([]);
            }
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
                alert('Permission to access location was denied');
                return;
            }
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setUserCoords({ lat: location.coords.latitude, lon: location.coords.longitude });
            const address = await reverseGeocode(location.coords.latitude, location.coords.longitude);
            
            onChange(address, { latitude: location.coords.latitude, longitude: location.coords.longitude });
            setModalVisible(false);
        } catch (error) {
            alert('Failed to get current location. Please ensure GPS is turned on.');
        } finally {
            setLoading(false);
            setLocatingInline(false);
        }
    };

    const handleSelectResult = (item: LocationResult) => {
        onChange(item.display_name, { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) });
        setModalVisible(false);
    };

    const handleMapConfirm = async () => {
        if (!markerCoord) return;
        setLoading(true);
        const address = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
        onChange(address, { latitude: markerCoord.latitude, longitude: markerCoord.longitude });
        setLoading(false);
        setModalVisible(false);
    };

    const centerMapOnMe = async () => {
        try {
            setLoading(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                setUserCoords({ lat: location.coords.latitude, lon: location.coords.longitude });
                setRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015
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
            {/* The Trigger Input */}
            <TouchableOpacity activeOpacity={0.8} onPress={() => { Keyboard.dismiss(); setMapMode(false); setModalVisible(true); }}>
                <View pointerEvents="none">
                    <Input
                        label={label}
                        placeholder={placeholder}
                        value={value}
                        editable={false}
                        onChangeText={() => {}}
                    />
                </View>
            </TouchableOpacity>

            {/* Direct Quick Action Buttons Under the Field */}
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
                        {locatingInline ? 'Locating...' : 'Use my current location'}
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

            {/* The Modal */}
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
                                        placeholder="Search nearby places, landmarks..."
                                        placeholderTextColor={colors.textSecondary}
                                        value={query}
                                        onChangeText={searchPlaces}
                                        autoFocus
                                    />
                                    {loading && <ActivityIndicator color={colors.primary} size="small" />}
                                </View>

                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={useCurrentLocation}>
                                        <Navigation size={18} color={colors.primary} />
                                        <Text style={[styles.actionText, { color: colors.primary }]}>Use my current location</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => { setMapMode(true); centerMapOnMe(); }}>
                                        <MapPin size={18} color={colors.primary} />
                                        <Text style={[styles.actionText, { color: colors.primary }]}>Choose on map</Text>
                                    </TouchableOpacity>
                                </View>

                                {userCoords && results.length > 0 && (
                                    <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.background }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                                            Nearby Locations
                                        </Text>
                                    </View>
                                )}

                                <FlatList
                                    data={results}
                                    keyExtractor={(item) => String(item.place_id)}
                                    keyboardShouldPersistTaps="handled"
                                    renderItem={({ item }) => (
                                        <TouchableOpacity 
                                            style={[styles.resultItem, { borderBottomColor: colors.border }]}
                                            onPress={() => handleSelectResult(item)}
                                        >
                                            <MapPin size={20} color={colors.textSecondary} style={{ marginTop: 2, marginRight: 12 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.resultText, { color: colors.text }]}>{item.display_name}</Text>
                                                {item.distanceKm !== undefined && (
                                                    <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '600' }}>
                                                        📍 {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`} away
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                    ListEmptyComponent={() => (
                                        !loading && query.length > 2 ? (
                                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No places found</Text>
                                        ) : null
                                    )}
                                />
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
    inlineActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
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
        fontSize: 18,
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
        paddingVertical: 12,
    },
    actionText: {
        marginLeft: 8,
        fontSize: 14,
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
        marginTop: 40,
        fontSize: 16,
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
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        minWidth: 120,
        alignItems: 'center',
    },
});
