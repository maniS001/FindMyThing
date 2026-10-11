import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Alert } from 'react-native';
import { MapPin, X, Navigation, Search, Edit3 } from 'lucide-react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export default function LocationPicker({ label, value, onChange, placeholder = "Search location within 5 km..." }: LocationPickerProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    
    // Modal state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locatingInline, setLocatingInline] = useState(false);
    const [mapMode, setMapMode] = useState(false);
    
    // User GPS location for nearby biasing
    const [userCoords, setUserCoords] = useState<{ lat: number, lon: number, name?: string } | null>(null);

    // Manual city override state
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [cityInput, setCityInput] = useState('');
    const [cityLoading, setCityLoading] = useState(false);

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

    // Restore cached location and check current location
    useEffect(() => {
        (async () => {
            try {
                const cached = await AsyncStorage.getItem('@findmate_user_coords');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed?.lat && parsed?.lon) {
                        setUserCoords(parsed);
                        setRegion({
                            latitude: parsed.lat,
                            longitude: parsed.lon,
                            latitudeDelta: 0.05,
                            longitudeDelta: 0.05,
                        });
                        return;
                    }
                }

                // Default anchor: Chidambaram
                setUserCoords({ lat: 11.3992, lon: 79.6935, name: 'Chidambaram' });

                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                    if (loc) {
                        const coords = { lat: loc.coords.latitude, lon: loc.coords.longitude };
                        setUserCoords(coords);
                        await AsyncStorage.setItem('@findmate_user_coords', JSON.stringify(coords));
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

        const cleanQuery = text
            .replace(/busstand/gi, 'bus stand')
            .replace(/railwaystation/gi, 'railway station')
            .replace(/policestation/gi, 'police station');

        try {
            let data: any[] = [];
            const coords = userCoords || { lat: 11.3992, lon: 79.6935 };

            // 5 km bounding box delta: 5km / 111km/deg ≈ 0.045 degrees
            const delta = 0.045;
            const minLon = coords.lon - delta;
            const maxLat = coords.lat + delta;
            const maxLon = coords.lon + delta;
            const minLat = coords.lat - delta;

            const nearbyUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=10&countrycodes=in&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;
            const nearbyRes = await fetch(nearbyUrl, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            });
            const nearbyData = await nearbyRes.json();
            if (Array.isArray(nearbyData) && nearbyData.length > 0) {
                data = nearbyData;
            }

            if (Array.isArray(data)) {
                // Strict 5.0 km filter
                let mapped: LocationResult[] = data
                    .map((item: any) => {
                        const itemLat = parseFloat(item.lat);
                        const itemLon = parseFloat(item.lon);
                        const dist = getDistanceKm(coords.lat, coords.lon, itemLat, itemLon);
                        return {
                            place_id: item.place_id,
                            display_name: item.display_name,
                            lat: item.lat,
                            lon: item.lon,
                            distanceKm: dist,
                        };
                    })
                    .filter((item) => item.distanceKm <= 5.0); // STRICTLY 5 KM ONLY

                mapped.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
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
                Alert.alert('Permission Denied', 'Permission to access location was denied. Please turn on device GPS or use Set City.');
                return;
            }
            // Use Highest Accuracy for hardware GPS satellite lock on phones
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            const coords = { lat: location.coords.latitude, lon: location.coords.longitude };
            setUserCoords(coords);
            await AsyncStorage.setItem('@findmate_user_coords', JSON.stringify(coords));

            const address = await reverseGeocode(location.coords.latitude, location.coords.longitude);
            
            onChange(address, { latitude: location.coords.latitude, longitude: location.coords.longitude });
            setModalVisible(false);
        } catch (error) {
            Alert.alert('GPS Notice', 'Could not get exact GPS signal. You can tap "Set Town / City" or "Select on map" to choose your location.');
        } finally {
            setLoading(false);
            setLocatingInline(false);
        }
    };

    const handleSelectResult = async (item: LocationResult) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        
        setUserCoords({ lat, lon });
        try {
            await AsyncStorage.setItem('@findmate_user_coords', JSON.stringify({ lat, lon }));
        } catch {}

        setModalVisible(false);
    };

    const handleMapConfirm = async () => {
        if (!markerCoord) return;
        setLoading(true);
        const address = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
        onChange(address, { latitude: markerCoord.latitude, longitude: markerCoord.longitude });
        
        const coords = { lat: markerCoord.latitude, lon: markerCoord.longitude };
        setUserCoords(coords);
        try {
            await AsyncStorage.setItem('@findmate_user_coords', JSON.stringify(coords));
        } catch {}

        setLoading(false);
        setModalVisible(false);
    };

    const handleSetCity = async () => {
        if (!cityInput.trim()) return;
        setCityLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityInput.trim() + ', Tamil Nadu, India')}&format=json&limit=1`, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0' }
            });
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                const newCoords = { lat, lon, name: data[0].display_name.split(',')[0] };
                setUserCoords(newCoords);
                await AsyncStorage.setItem('@findmate_user_coords', JSON.stringify(newCoords));
                setCityModalVisible(false);
                setCityInput('');
                Alert.alert('Location Updated', `Active area set to ${newCoords.name}. Place searches will now strictly look within 5 km.`);
            } else {
                Alert.alert('Not Found', 'Could not find that town/city.');
            }
        } catch {
            Alert.alert('Error', 'Failed to update city. Please check internet.');
        } finally {
            setCityLoading(false);
        }
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                {label ? <Text style={[styles.label, { color: colors.text, marginBottom: 0 }]}>{label}</Text> : <View />}
                <TouchableOpacity 
                    onPress={() => setCityModalVisible(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary + '18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                >
                    <MapPin size={12} color={colors.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        Nearby: {userCoords?.name || 'Chidambaram'} (5km)
                    </Text>
                    <Edit3 size={11} color={colors.primary} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
            </View>

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

                <TouchableOpacity 
                    onPress={() => setCityModalVisible(true)} 
                    style={[styles.inlineActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <Edit3 size={14} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.inlineActionText, { color: colors.primary }]}>Set Town / City</Text>
                </TouchableOpacity>
            </View>

            {/* Set Town Modal */}
            <Modal visible={cityModalVisible} animationType="fade" transparent>
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 }]}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Set Your City or Town</Text>
                            <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                                <X size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={{ height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.background, marginBottom: 14 }}
                            placeholder="Enter your town (e.g. Chidambaram)"
                            placeholderTextColor={colors.textSecondary}
                            value={cityInput}
                            onChangeText={setCityInput}
                        />
                        <TouchableOpacity
                            onPress={handleSetCity}
                            disabled={cityLoading}
                            style={[styles.confirmBtn, { backgroundColor: colors.primary, alignItems: 'center' }]}
                        >
                            {cityLoading ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700' }}>Save Area</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* The Main Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <KeyboardAvoidingView 
                        style={[styles.container, { backgroundColor: colors.surface }]}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={[styles.header, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.title, { color: colors.text }]}>
                                {mapMode ? 'Select on Map' : `Nearby (5 km of ${userCoords?.name || 'Chidambaram'})`}
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
                                        placeholder="Search nearby places within 5 km..."
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
                                                    <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                                        📍 {item.distanceKm! < 1 ? `${Math.round(item.distanceKm! * 1000)} meters` : `${item.distanceKm!.toFixed(1)} km`} away
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    />
                                ) : (
                                    query.length >= 2 && !loading ? (
                                        <View style={{ padding: 24, alignItems: 'center' }}>
                                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                                No places found within 5 km of {userCoords?.name || 'this area'}.
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
        paddingHorizontal: 11,
        paddingVertical: 6,
    },
    inlineActionText: {
        fontSize: 12,
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
