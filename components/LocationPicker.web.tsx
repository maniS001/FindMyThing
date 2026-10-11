import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { MapPin, Search, Navigation, X, Check, Edit3 } from 'lucide-react-native';
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

export default function LocationPicker({ label, value, onChange, placeholder = "Search location within 5 km..." }: LocationPickerProps) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState(value || '');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locating, setLocating] = useState(false);
    
    // User GPS location for nearby biasing (defaults or restores from cache)
    const [userCoords, setUserCoords] = useState<{ lat: number, lon: number, name?: string } | null>(null);

    // City Selector modal state (for fixing ISP/Broadband IP mismatch on PCs)
    const [cityModalVisible, setCityModalVisible] = useState(false);
    const [cityInput, setCityInput] = useState('');
    const [cityLoading, setCityLoading] = useState(false);

    // Map modal state (Web interactive map)
    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [mapSearchQuery, setMapSearchQuery] = useState('');
    const [mapSearchLoading, setMapSearchLoading] = useState(false);
    const [pinnedCoords, setPinnedCoords] = useState<{ lat: number, lon: number } | null>(null);
    const [pinAddress, setPinAddress] = useState<string>('');
    const [pinLoading, setPinLoading] = useState(false);

    // Sync external value
    useEffect(() => {
        if (value !== undefined && value !== query) {
            setQuery(value);
        }
    }, [value]);

    // Restore cached location from localStorage if available, or default to Chidambaram / TN
    useEffect(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const cached = window.localStorage.getItem('findmate_user_coords');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed?.lat && parsed?.lon) {
                        setUserCoords(parsed);
                        return;
                    }
                }
            } catch {}
        }
        // Default anchor: Chidambaram, Tamil Nadu
        setUserCoords({ lat: 11.3992, lon: 79.6935, name: 'Chidambaram' });
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
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
                        headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                    });
                    const data = await res.json();
                    setPinAddress(data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
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

    // Search places strictly within 5 km of user's active location
    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);

        // Normalize common Indian compound words (e.g. busstand -> bus stand)
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

    const handleSelectResult = (item: LocationResult) => {
        setQuery(item.display_name);
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setResults([]);
        setIsFocused(false);
    };

    // Use Device Geolocation with ISP Inaccuracy Guard
    const useCurrentLocation = () => {
        setLocating(true);
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        const accuracy = position.coords.accuracy || 9999;

                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
                            headers: { 'User-Agent': 'FindMyThingApp/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
                        });
                        const data = await res.json();
                        const address = data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

                        // Guard against broadband ISP locating user to Adyar, Chennai when accuracy is broad
                        if (accuracy > 3000 || address.includes('Chennai') || address.includes('Adyar')) {
                            const isUserActuallyInChennai = window.confirm(
                                `Your internet provider detected your location as:\n"${address}"\n(Accuracy: ±${Math.round(accuracy / 1000)} km)\n\nAre you currently in Chennai? Click "Cancel" to set your real city (e.g. Chidambaram) instead.`
                            );
                            if (!isUserActuallyInChennai) {
                                setLocating(false);
                                setCityModalVisible(true);
                                return;
                            }
                        }

                        const newCoords = { lat, lon, name: data.address?.city || data.address?.town || data.address?.suburb || 'My Location' };
                        setUserCoords(newCoords);
                        if (typeof window !== 'undefined' && window.localStorage) {
                            try {
                                window.localStorage.setItem('findmate_user_coords', JSON.stringify(newCoords));
                            } catch {}
                        }

                        onChange(address, { latitude: lat, longitude: lon });
                        setQuery(address);
                        setIsFocused(false);
                    } catch (e) {
                        alert("Could not fetch address for this location.");
                    } finally {
                        setLocating(false);
                    }
                },
                (error) => {
                    alert("Location access was denied or is unavailable on this device. You can set your city or choose on the map instead.");
                    setLocating(false);
                    setCityModalVisible(true);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        } else {
            alert("Geolocation is not supported by this browser. Please use 'Set City' or 'Select on map'.");
            setLocating(false);
        }
    };

    // Set City / Town Manually (Fixes PC ISP IP Geolocation)
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
                if (typeof window !== 'undefined' && window.localStorage) {
                    try {
                        window.localStorage.setItem('findmate_user_coords', JSON.stringify(newCoords));
                    } catch {}
                }
                setCityModalVisible(false);
                setCityInput('');
                alert(`Location anchor set to ${newCoords.name}! All place searches will now strictly look within 5 km of ${newCoords.name}.`);
            } else {
                alert("Could not find that town/city. Please check the spelling.");
            }
        } catch {
            alert("Failed to find city. Please check your internet connection.");
        } finally {
            setCityLoading(false);
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
        
        // Anchor userCoords to confirmed map pin
        const newCoords = { lat: pinnedCoords.lat, lon: pinnedCoords.lon, name: pinAddress.split(',')[0] };
        setUserCoords(newCoords);
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.setItem('findmate_user_coords', JSON.stringify(newCoords));
            } catch {}
        }
        
        setMapModalVisible(false);
    };

    // Jump map in iframe when searching inside map modal
    const handleMapSearchJump = async () => {
        if (!mapSearchQuery.trim()) return;
        setMapSearchLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(mapSearchQuery.trim() + ', Tamil Nadu')}&format=json&limit=1`, {
                headers: { 'User-Agent': 'FindMyThingApp/1.0' }
            });
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                setPinnedCoords({ lat, lon });
                setPinAddress(data[0].display_name);
            }
        } catch {} finally {
            setMapSearchLoading(false);
        }
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                {label ? <Text style={[styles.label, { color: colors.text, marginBottom: 0 }]}>{label}</Text> : <View />}
                
                {/* Active Anchor Pill: shows current city & allows 1-click change */}
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
                        {locating ? 'Detecting GPS...' : 'Use my current location'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={openMapModal} 
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <MapPin size={15} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Select on map</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={() => setCityModalVisible(true)} 
                    style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                    <Edit3 size={14} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Set Town / City</Text>
                </TouchableOpacity>
            </View>

            {/* Auto-suggest Dropdown Strictly Showing 5 km Results */}
            {isFocused && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                            Nearby within 5 km of {userCoords?.name || 'Chidambaram'}
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
                                        <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                            📍 {item.distanceKm! < 1 ? `${Math.round(item.distanceKm! * 1000)} meters` : `${item.distanceKm!.toFixed(1)} km`} away
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            style={{ maxHeight: 220 }}
                        />
                    ) : (
                        query.length >= 2 && !loading ? (
                            <View style={{ padding: 16 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                                    No places found within 5 km of {userCoords?.name || 'your area'}. 
                                </Text>
                                <TouchableOpacity 
                                    onPress={() => setCityModalVisible(true)} 
                                    style={{ marginTop: 8 }}
                                >
                                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                                        Not in {userCoords?.name || 'this area'}? Tap here to change city
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    )}
                </View>
            )}

            {/* Set Town / City Modal */}
            <Modal visible={cityModalVisible} animationType="fade" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                    <View style={[styles.cityModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Set Your City or Town</Text>
                            <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                                <X size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 18 }}>
                            If your broadband internet detected Adyar/Chennai incorrectly, type your real town name below (e.g. "Chidambaram").
                        </Text>
                        <TextInput
                            style={[styles.cityInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                            placeholder="Enter your town (e.g. Chidambaram)"
                            placeholderTextColor={colors.textSecondary}
                            value={cityInput}
                            onChangeText={setCityInput}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity 
                                onPress={() => { setCityInput('Chidambaram'); }}
                                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.primary + '20' }}
                            >
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>⚡ Quick Set: Chidambaram</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            onPress={handleSetCity}
                            disabled={cityLoading}
                            style={[styles.confirmBtn, { backgroundColor: colors.primary, marginTop: 18, justifyContent: 'center' }]}
                        >
                            {cityLoading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Set as Current Area</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

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
        gap: 8,
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
    cityModalCard: {
        width: '100%',
        maxWidth: 440,
        borderRadius: 16,
        borderWidth: 1,
        padding: 20,
    },
    cityInput: {
        height: 48,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        fontSize: 15,
        outlineStyle: 'none',
    } as any,
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
