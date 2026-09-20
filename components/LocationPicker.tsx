import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { MapPin, X, Navigation, Search, Check } from 'lucide-react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/ThemeContext';

interface LocationResult {
    address: string;
    lat: number;
    lon: number;
}

interface LocationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: LocationResult) => void;
    initialLocation?: string;
}

export default function LocationPicker({ visible, onClose, onSelect, initialLocation }: LocationPickerProps) {
    const { colors } = useTheme();
    const [query, setQuery] = useState(initialLocation || '');
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

    // Initial Location
    useEffect(() => {
        if (visible && !mapMode) {
            setQuery(initialLocation || '');
            setResults([]);
        }
    }, [visible, mapMode, initialLocation]);

    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 3) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5`, {
                headers: {
                    'User-Agent': 'FindMateApp/1.0',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            const data = await res.json();
            setResults(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
                headers: {
                    'User-Agent': 'FindMateApp/1.0',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            const data = await res.json();
            return data.display_name || 'Unknown Location';
        } catch (error) {
            console.error(error);
            return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
    };

    const useCurrentLocation = async () => {
        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                alert('Permission to access location was denied');
                setLoading(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const address = await reverseGeocode(location.coords.latitude, location.coords.longitude);
            
            onSelect({
                address,
                lat: location.coords.latitude,
                lon: location.coords.longitude
            });
            onClose();
        } catch (error) {
            alert('Failed to get current location');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectResult = (item: any) => {
        onSelect({
            address: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
        });
        onClose();
    };

    const handleMapConfirm = async () => {
        if (!markerCoord) return;
        setLoading(true);
        const address = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
        onSelect({
            address,
            lat: markerCoord.latitude,
            lon: markerCoord.longitude
        });
        setLoading(false);
        onClose();
    };

    const centerMapOnMe = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({});
                setRegion({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05
                });
                setMarkerCoord({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude
                });
            }
        } catch(e) {}
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <KeyboardAvoidingView 
                    style={[styles.container, { backgroundColor: colors.surface }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.title, { color: colors.text }]}>Select Location</Text>
                        <TouchableOpacity onPress={onClose}>
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
                            >
                                {markerCoord && (
                                    <Marker coordinate={markerCoord} />
                                )}
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
                                    style={[styles.input, { color: colors.text }]}
                                    placeholder="Search nearby places, addresses..."
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
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        height: '85%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    searchContainer: {
        flex: 1,
        padding: 20,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    input: {
        flex: 1,
        fontSize: 16,
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 8,
        flex: 0.48,
        justifyContent: 'center',
    },
    actionText: {
        marginLeft: 8,
        fontWeight: '600',
        fontSize: 14,
    },
    resultItem: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    resultText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 32,
        fontSize: 16,
    },
    mapContainer: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    myLocationBtn: {
        position: 'absolute',
        bottom: 90,
        right: 20,
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    mapFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderTopWidth: 1,
    },
    textBtn: {
        padding: 12,
    },
    confirmBtn: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
    }
});
