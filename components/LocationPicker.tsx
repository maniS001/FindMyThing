import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { MapPin, X, Navigation, Search } from 'lucide-react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/ThemeContext';
import Input from './Input';

interface LocationResult {
    address: string;
    lat: number;
    lon: number;
}

interface LocationPickerProps {
    label?: string;
    value: string;
    onChange: (location: string, coords?: { latitude: number, longitude: number }) => void;
    placeholder?: string;
}

export default function LocationPicker({ label, value, onChange, placeholder = "Search location..." }: LocationPickerProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    
    // Modal state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [mapMode, setMapMode] = useState(false);
    
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
            setMapMode(false);
            setMarkerCoord(null);
        }
    }, [modalVisible, value]);

    const reverseGeocode = async (lat: number, lon: number) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            });
            const data = await res.json();
            return data.display_name || 'Unknown Location';
        } catch (error) {
            return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
    };

    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 3) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            // Using OpenStreetMap Nominatim for search
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5&countrycodes=in`, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
            });
            const data = await res.json();
            setResults(data);
        } catch (error) {
            console.error('Search error', error);
        } finally {
            setLoading(false);
        }
    };

    const useCurrentLocation = async () => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                alert('Permission to access location was denied');
                return;
            }
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const address = await reverseGeocode(location.coords.latitude, location.coords.longitude);
            
            onChange(address, { latitude: location.coords.latitude, longitude: location.coords.longitude });
            setModalVisible(false);
        } catch (error) {
            alert('Failed to get current location. Please ensure GPS is turned on.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectResult = (item: any) => {
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
                setRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01
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

    return (
        <View style={styles.wrapper}>
            {/* The Trigger Input */}
            <TouchableOpacity activeOpacity={0.8} onPress={() => { Keyboard.dismiss(); setModalVisible(true); }}>
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

            {/* The Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <KeyboardAvoidingView 
                        style={[styles.container, { backgroundColor: colors.surface }]}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={[styles.header, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.title, { color: colors.text }]}>Select Location</Text>
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
                                        <Text style={{ color: colors.textSecondary }}>Back to Search</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.confirmBtn, { backgroundColor: markerCoord ? colors.primary : colors.border }]} 
                                        disabled={!markerCoord || loading}
                                        onPress={handleMapConfirm}
                                    >
                                        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: 'white', fontWeight: 'bold' }}>Confirm Pin</Text>}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.searchContainer}>
                                <View style={styles.inputWrapper}>
                                    <Search size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={[styles.searchInput, { color: colors.text }]}
                                        placeholder="Search nearby places..."
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

                                <FlatList
                                    data={results}
                                    keyExtractor={(item, idx) => item.place_id ? item.place_id.toString() : idx.toString()}
                                    keyboardShouldPersistTaps="handled"
                                    renderItem={({ item }) => (
                                        <TouchableOpacity 
                                            style={[styles.resultItem, { borderBottomColor: colors.border }]}
                                            onPress={() => handleSelectResult(item)}
                                        >
                                            <MapPin size={20} color={colors.textSecondary} style={{ marginTop: 2, marginRight: 12 }} />
                                            <Text style={[styles.resultText, { color: colors.text }]}>{item.display_name}</Text>
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
        padding: 16,
        borderBottomWidth: 1,
    },
    resultText: {
        flex: 1,
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
