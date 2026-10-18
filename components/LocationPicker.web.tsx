import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { MapPin, Search, Navigation, X, Check, CornerDownLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

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

// High-accuracy web GPS acquisition using watchPosition
function getWebHighAccuracyGPS(timeoutMs = 12000): Promise<{ lat: number; lon: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            return reject(new Error('Geolocation not supported by browser'));
        }
        let bestPos: GeolocationPosition | null = null;
        let watchId: number | null = null;

        const cleanup = () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
        };

        const timer = setTimeout(() => {
            cleanup();
            if (bestPos) {
                resolve({
                    lat: bestPos.coords.latitude,
                    lon: bestPos.coords.longitude,
                    accuracy: bestPos.coords.accuracy,
                });
            } else {
                reject(new Error('GPS request timed out'));
            }
        }, timeoutMs);

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
                    bestPos = pos;
                }
                // Under 100 meters indicates true satellite hardware GPS lock
                if (pos.coords.accuracy <= 100) {
                    clearTimeout(timer);
                    cleanup();
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                    });
                }
            },
            (err) => {
                if (!bestPos) {
                    clearTimeout(timer);
                    cleanup();
                    reject(err);
                }
            },
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
        );
    });
}

// High-detail reverse geocoding engine: OpenStreetMap Nominatim zoom=18 first
async function fetchAddressForCoords(lat: number, lon: number): Promise<string> {
    // Engine 1: OpenStreetMap Nominatim (High detail: building, street, village, landmark)
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

    // Silently detect actual device GPS coordinates on mount
    useEffect(() => {
        getWebHighAccuracyGPS(8000)
            .then((pos) => {
                setUserCoords({ lat: pos.lat, lon: pos.lon });
            })
            .catch(() => {});
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
                    const address = await fetchAddressForCoords(lat, lon);
                    setPinAddress(address);
                } catch {
                    setPinAddress(`Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
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

    // Search places nearby, always including the user's custom typed text
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

            // 3. Query Engine 2: Nominatim
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

    const handleSelectResult = (item: LocationResult) => {
        setQuery(item.display_name);
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setResults([]);
        setIsFocused(false);
    };

    // Use Device Hardware GPS location with watchPosition & high-detail reverse geocoding
    const useCurrentLocation = async () => {
        setLocating(true);
        try {
            const gps = await getWebHighAccuracyGPS(12000);
            setUserCoords({ lat: gps.lat, lon: gps.lon });

            const resolvedAddress = await fetchAddressForCoords(gps.lat, gps.lon);
            onChange(resolvedAddress, { latitude: gps.lat, longitude: gps.lon });
            setQuery(resolvedAddress);
            setIsFocused(false);
        } catch (error: any) {
            // Fallback to basic geolocation if watchPosition timed out
            if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        setUserCoords({ lat, lon });
                        const resolvedAddress = await fetchAddressForCoords(lat, lon);
                        onChange(resolvedAddress, { latitude: lat, longitude: lon });
                        setQuery(resolvedAddress);
                        setIsFocused(false);
                        setLocating(false);
                    },
                    (err) => {
                        alert("Could not get GPS signal. Please allow location permissions in your browser or select on map.");
                        setLocating(false);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                alert("Geolocation is not supported by your browser. Please select on map.");
                setLocating(false);
            }
            return;
        }
        setLocating(false);
    };

    const openMapModal = () => {
        const initialLat = userCoords?.lat || (pinnedCoords ? pinnedCoords.lat : 11.3992);
        const initialLon = userCoords?.lon || (pinnedCoords ? pinnedCoords.lon : 79.6935);
        setPinnedCoords({ lat: initialLat, lon: initialLon });
        setMapModalVisible(true);
    };

    const confirmMapSelection = () => {
        if (!pinnedCoords) return;
        const address = pinAddress || `Location (${pinnedCoords.lat.toFixed(4)}, ${pinnedCoords.lon.toFixed(4)})`;
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
                    onFocus={() => {
                        setIsFocused(true);
                        if (query.trim().length >= 2 && results.length === 0) {
                            searchPlaces(query);
                        }
                    }}
                    onBlur={() => {
                        // Persist whatever was typed if not selected
                        if (query.trim()) {
                            onChange(query.trim(), userCoords ? { latitude: userCoords.lat, longitude: userCoords.lon } : undefined);
                        }
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

            {/* Auto-suggest Dropdown */}
            {isFocused && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                            {userCoords ? 'Nearby Places' : 'Location Suggestions'}
                        </Text>
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
                                                <Text style={[styles.resultText, { color: colors.primary, fontWeight: '700' }]} numberOfLines={2}>
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
                                        <MapPin size={16} color={colors.primary} style={{ marginRight: 10, marginTop: 3 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={2}>
                                                {item.display_name}
                                            </Text>
                                            {item.distanceKm !== undefined && item.distanceKm > 0 && (
                                                <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2, fontWeight: '700' }}>
                                                    📍 {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`} away
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            style={{ maxHeight: 280 }}
                        />
                    ) : (
                        query.trim().length >= 2 && !loading ? (
                            <View style={{ padding: 14 }}>
                                <TouchableOpacity 
                                    style={[styles.customResultItem, { backgroundColor: colors.primary + '15', borderRadius: 8, padding: 10 }]}
                                    onPress={() => {
                                        onChange(query.trim(), userCoords ? { latitude: userCoords.lat, longitude: userCoords.lon } : undefined);
                                        setIsFocused(false);
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
        maxHeight: 300,
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
    customResultItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
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
