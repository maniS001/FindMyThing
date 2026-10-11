import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { MapPin, Search, Navigation, X, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

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

export default function LocationPicker({ label, value, onChange, placeholder = "Search location or choose on map..." }: LocationPickerProps) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState(value || '');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locating, setLocating] = useState(false);
    
    // User GPS location for nearby biasing
    const [userCoords, setUserCoords] = useState<{ lat: number, lon: number } | null>(null);

    // Map modal state (Web interactive map)
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [pinnedCoords, setPinnedCoords] = useState<{ lat: number, lon: number } | null>(null);
    const [pinAddress, setPinAddress] = useState<string>('');
    const [pinLoading, setPinLoading] = useState(false);

    // Sync external value
    useEffect(() => {
        if (value !== undefined && value !== query) {
            setQuery(value);
        }
    }, [value]);

    // Fetch user GPS coordinates on mount (like Rapido / Google Maps)
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                },
                () => {
                    // Silently ignore if not granted yet
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    }, []);

    // Listen to messages from Leaflet map iframe
    useEffect(() => {
        const handleMessage = async (e: any) => {
            if (e.data && e.data.type === 'FINDMATE_PIN_SELECTED') {
                const lat = parseFloat(e.data.lat);
                const lon = parseFloat(e.data.lon);
                setPinnedCoords({ lat, lon });
                setPinLoading(true);
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`, {
                        headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                    });
                    const data = await res.json();
                    let formatted = data.display_name;
                    if (data.address) {
                        const addr = data.address;
                        const parts = [
                            addr.road || addr.suburb || addr.village || addr.neighbourhood || addr.hamlet,
                            addr.town || addr.city || addr.county,
                            addr.state_district,
                            addr.state,
                            addr.postcode
                        ].filter(Boolean);
                        if (parts.length > 0) formatted = parts.join(', ');
                    }
                    setPinAddress(formatted || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
                } catch {
                    setPinAddress(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
                } finally {
                    setPinLoading(false);
                }
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('message', handleMessage);
            return () => window.removeEventListener('message', handleMessage);
        }
    }, []);

    // Search places nearby within 50 km radius
    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);

        // Normalize common Indian compound words
        const cleanQuery = text
            .replace(/busstand/gi, 'bus stand')
            .replace(/railwaystation/gi, 'railway station')
            .replace(/policestation/gi, 'police station');

        try {
            let data: any[] = [];
            const coords = userCoords;

            // 50 km bounding box delta: 50km / 111km/deg ≈ 0.45 degrees
            if (coords) {
                const delta = 0.45;
                const minLon = coords.lon - delta;
                const maxLat = coords.lat + delta;
                const maxLon = coords.lon + delta;
                const minLat = coords.lat - delta;

                const nearbyUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=15&countrycodes=in&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;
                const nearbyRes = await fetch(nearbyUrl, {
                    headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                });
                const nearbyData = await nearbyRes.json();
                if (Array.isArray(nearbyData) && nearbyData.length > 0) {
                    data = nearbyData;
                }
            }

            // Fallback search if no nearby results within 50km or no GPS yet
            if (data.length === 0) {
                let fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=15&countrycodes=in`;
                if (coords) {
                    const delta = 1.0;
                    fallbackUrl += `&viewbox=${coords.lon - delta},${coords.lat + delta},${coords.lon + delta},${coords.lat - delta}&bounded=0`;
                }
                const fallbackRes = await fetch(fallbackUrl, {
                    headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                });
                const fallbackData = await fallbackRes.json();
                if (Array.isArray(fallbackData)) {
                    data = fallbackData;
                }
            }

            if (Array.isArray(data)) {
                let mapped: LocationResult[] = data.map((item: any) => {
                    const itemLat = parseFloat(item.lat);
                    const itemLon = parseFloat(item.lon);
                    const dist = coords ? getDistanceKm(coords.lat, coords.lon, itemLat, itemLon) : undefined;
                    return {
                        place_id: item.place_id,
                        display_name: item.display_name,
                        lat: item.lat,
                        lon: item.lon,
                        distanceKm: dist,
                    };
                });

                // Filter to 50km if GPS is active
                if (coords) {
                    mapped = mapped.filter((item) => item.distanceKm === undefined || item.distanceKm <= 50.0);
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

    const handleSelectResult = (item: LocationResult) => {
        setQuery(item.display_name);
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setResults([]);
        setIsFocused(false);
    };

    // Use Device Hardware GPS location (like Rapido / Uber)
    const useCurrentLocation = () => {
        setLocating(true);
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        setUserCoords({ lat, lon });

                        // High precision reverse geocode (zoom 18 = house/street/village level)
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`, {
                            headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                        });
                        const data = await res.json();
                        
                        let formattedAddress = data.display_name;
                        if (data.address) {
                            const addr = data.address;
                            const parts = [
                                addr.road || addr.suburb || addr.village || addr.neighbourhood || addr.hamlet,
                                addr.town || addr.city || addr.county,
                                addr.state_district,
                                addr.state,
                                addr.postcode
                            ].filter(Boolean);
                            if (parts.length > 0) formattedAddress = parts.join(', ');
                        }

                        onChange(formattedAddress, { latitude: lat, longitude: lon });
                        setQuery(formattedAddress);
                        setIsFocused(false);
                    } catch (e) {
                        alert("Could not fetch address for your current position.");
                    } finally {
                        setLocating(false);
                    }
                },
                (error) => {
                    let msg = "Could not get your location.";
                    if (error.code === 1) msg = "Location permission denied. Please allow location access in your phone/browser settings.";
                    else if (error.code === 2) msg = "GPS signal unavailable. Please ensure location/GPS is turned on.";
                    else if (error.code === 3) msg = "Location request timed out. Please try again.";
                    alert(msg);
                    setLocating(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        } else {
            alert("Geolocation is not supported by your browser.");
            setLocating(false);
        }
    };

    const openMapModal = () => {
        const initialLat = userCoords?.lat || (pinnedCoords ? pinnedCoords.lat : 11.3992);
        const initialLon = userCoords?.lon || (pinnedCoords ? pinnedCoords.lon : 79.6935);
        setPinnedCoords({ lat: initialLat, lon: initialLon });
        setMapModalVisible(true);
    };

    const confirmMapSelection = () => {
        if (!pinnedCoords) return;
        const address = pinAddress || `${pinnedCoords.lat.toFixed(4)}, ${pinnedCoords.lon.toFixed(4)}`;
        onChange(address, { latitude: pinnedCoords.lat, longitude: pinnedCoords.lon });
        setQuery(address);
        setUserCoords(pinnedCoords);
        setMapModalVisible(false);
    };

    // Leaflet HTML string for the web map iframe
    const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
        .hint {
          position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
          background: rgba(17, 24, 39, 0.85); color: #ffffff; padding: 6px 16px;
          border-radius: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px; font-weight: 500; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div class="hint">📍 Tap or drag marker to set exact location</div>
      <div id="map"></div>
      <script>
        var initialLat = ${pinnedCoords?.lat || userCoords?.lat || 11.3992};
        var initialLng = ${pinnedCoords?.lon || userCoords?.lon || 79.6935};
        var map = L.map('map').setView([initialLat, initialLng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        var marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

        function sendPin(lat, lng) {
          window.parent.postMessage({ type: 'FINDMATE_PIN_SELECTED', lat: lat, lon: lng }, '*');
        }

        sendPin(initialLat, initialLng);

        marker.on('dragend', function(e) {
          var pos = marker.getLatLng();
          sendPin(pos.lat, pos.lng);
        });

        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          sendPin(e.latlng.lat, e.latlng.lng);
        });
      </script>
    </body>
    </html>
    `;

    return (
        <View style={styles.wrapper}>
            {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
            
            {/* Search Input Box */}
            <View style={[styles.inputContainer, { borderColor: isFocused ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
                <Search size={20} color={colors.textSecondary} style={styles.icon} />
                <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={searchPlaces}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        setTimeout(() => setIsFocused(false), 250);
                    }}
                />
                {loading && <ActivityIndicator size="small" color={colors.primary} style={styles.icon} />}
                {query.length > 0 && !loading && (
                    <TouchableOpacity onPress={() => { setQuery(''); onChange(''); setResults([]); }}>
                        <X size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Quick Action Options directly under field */}
            <View style={styles.actionRow}>
                <TouchableOpacity 
                    onPress={useCurrentLocation} 
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    disabled={locating}
                >
                    {locating ? (
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
                    ) : (
                        <Navigation size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    )}
                    <Text style={[styles.actionText, { color: colors.primary }]}>
                        {locating ? 'Acquiring GPS...' : 'Use my current location'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={openMapModal} 
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <MapPin size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Select on map</Text>
                </TouchableOpacity>
            </View>

            {/* Auto-suggest Dropdown Showing 50 km Results */}
            {isFocused && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                            {userCoords ? 'Nearby Places (within 50 km)' : 'Matching Locations'}
                        </Text>
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
                                    <MapPin size={16} color={colors.primary} style={{ marginRight: 10, marginTop: 3 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={2}>
                                            {item.display_name}
                                        </Text>
                                        {item.distanceKm !== undefined && (
                                            <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                                📍 {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`} away
                                            </Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            )}
                            style={{ maxHeight: 240 }}
                        />
                    ) : (
                        query.length >= 2 && !loading ? (
                            <View style={{ padding: 16 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                                    No locations found matching "{query}" within 50 km. Try searching or pick on map.
                                </Text>
                            </View>
                        ) : null
                    )}
                </View>
            )}

            {/* Interactive Leaflet Map Modal for Web */}
            <Modal visible={mapModalVisible} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                    <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        {/* Modal Header */}
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MapPin size={20} color={colors.primary} />
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Location on Map</Text>
                            </View>
                            <TouchableOpacity onPress={() => setMapModalVisible(false)} style={{ padding: 4 }}>
                                <X size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Interactive Web Map View via Leaflet iframe */}
                        <View style={styles.mapFrameWrapper}>
                            {React.createElement('iframe', {
                                srcDoc: mapHtml,
                                title: 'Location Map Picker',
                                style: { width: '100%', height: '100%', border: 'none' },
                            })}
                        </View>

                        {/* Selected Address Preview & Confirmation */}
                        <View style={[styles.modalFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Selected Location:</Text>
                                <Text style={{ fontSize: 14, color: colors.text, marginTop: 2 }} numberOfLines={2}>
                                    {pinLoading ? 'Resolving address...' : (pinAddress || 'Move pin to choose address')}
                                </Text>
                            </View>

                            <TouchableOpacity 
                                onPress={confirmMapSelection} 
                                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                                disabled={pinLoading}
                            >
                                <Check size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Confirm Location</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        marginBottom: 16,
        position: 'relative',
        zIndex: 10,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 12,
        height: 52,
        paddingHorizontal: 16,
    },
    icon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: '100%',
        fontSize: 15,
        outlineStyle: 'none',
    } as any,
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
        flexWrap: 'wrap',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    dropdown: {
        position: 'absolute',
        top: 86,
        left: 0,
        right: 0,
        borderWidth: 1,
        borderRadius: 12,
        maxHeight: 260,
        zIndex: 9999,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    dropdownHeader: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        borderBottomWidth: 1,
    },
    resultText: {
        fontSize: 14,
        lineHeight: 20,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalCard: {
        width: '100%',
        maxWidth: 720,
        height: '80%',
        maxHeight: 600,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    mapFrameWrapper: {
        flex: 1,
        width: '100%',
        minHeight: 350,
        backgroundColor: '#e5e7eb',
    },
    modalFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderTopWidth: 1,
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 11,
        borderRadius: 10,
    },
});
