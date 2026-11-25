import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { MapPin, Search, Navigation, X, Check, CornerDownLeft } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import {
    GOOGLE_MAPS_CLIENT_KEY,
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

export default function LocationPicker({
    label,
    value,
    onChange,
    placeholder = 'Search location or enter your own...',
}: LocationPickerProps) {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState(value || '');
    const [results, setResults] = useState<LocationResult[]>([]);
    const [nearbyResults, setNearbyResults] = useState<LocationResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [locating, setLocating] = useState(false);

    const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);

    const [mapModalVisible, setMapModalVisible] = useState(false);
    const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [pinAddress, setPinAddress] = useState<string>('');
    const [pinLoading, setPinLoading] = useState(false);

    useEffect(() => {
        if (value !== undefined && value !== query) {
            setQuery(value);
        }
    }, [value]);

    // Silently detect device GPS on mount and preload nearby landmarks
    useEffect(() => {
        getWebHighAccuracyGPS(8000)
            .then((pos) => {
                const coords = { lat: pos.lat, lon: pos.lon };
                setUserCoords(coords);
                fetchNearbyPlaces(pos.lat, pos.lon).then(setNearbyResults);
            })
            .catch(() => {});
    }, []);

    // Listen to messages from Map iframe
    useEffect(() => {
        const handleMessage = async (e: any) => {
            if (e.data && e.data.type === 'FINDMATE_PIN_SELECTED') {
                const lat = parseFloat(e.data.lat);
                const lon = parseFloat(e.data.lon);
                const poiName = e.data.poiName ? String(e.data.poiName).trim() : '';
                setPinnedCoords({ lat, lon });
                if (poiName) {
                    setPinAddress(poiName);
                    setPinLoading(false);
                    return;
                }
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

    const handleSelectResult = async (item: LocationResult) => {
        if (item.googlePlaceId) {
            setLoading(true);
            const details = await resolveGooglePlaceDetails(item.googlePlaceId);
            setLoading(false);
            if (details) {
                const display = details.display_name || item.display_name;
                setQuery(display);
                onChange(display, { latitude: details.lat, longitude: details.lon });
                setResults([]);
                setIsFocused(false);
                return;
            }
        }

        setQuery(item.display_name);
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        onChange(item.display_name, { latitude: lat, longitude: lon });
        setResults([]);
        setIsFocused(false);
    };

    const useCurrentLocation = async () => {
        setLocating(true);
        try {
            const gps = await getWebHighAccuracyGPS(12000);
            setUserCoords({ lat: gps.lat, lon: gps.lon });
            fetchNearbyPlaces(gps.lat, gps.lon).then(setNearbyResults);

            const resolvedAddress = await fetchAddressForCoords(gps.lat, gps.lon);
            onChange(resolvedAddress, { latitude: gps.lat, longitude: gps.lon });
            setQuery(resolvedAddress);
            setIsFocused(false);
        } catch {
            if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        setUserCoords({ lat, lon });
                        fetchNearbyPlaces(lat, lon).then(setNearbyResults);
                        const resolvedAddress = await fetchAddressForCoords(lat, lon);
                        onChange(resolvedAddress, { latitude: lat, longitude: lon });
                        setQuery(resolvedAddress);
                        setIsFocused(false);
                        setLocating(false);
                    },
                    () => {
                        alert('Could not get GPS signal. Please allow location permissions in your browser or select on map.');
                        setLocating(false);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                alert('Geolocation is not supported by your browser. Please select on map.');
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

    // Google Maps JS API interactive picker with seamless automatic Leaflet fallback if API/billing is disabled
    const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .search-overlay {
          position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
          width: 90%; max-width: 420px; z-index: 1000; display: flex; gap: 6px;
        }
        #pac-input {
          flex: 1; padding: 10px 14px; border-radius: 24px; border: 1px solid #d1d5db;
          box-shadow: 0 4px 12px rgba(0,0,0,0.18); font-size: 14px; outline: none; background: #fff;
        }
        .hint {
          position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
          background: rgba(17, 24, 39, 0.85); color: #ffffff; padding: 6px 14px;
          border-radius: 20px; font-size: 12px; font-weight: 500; z-index: 1000;
          pointer-events: none; white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div class="search-overlay" id="search-box" style="display:none;">
        <input id="pac-input" type="text" placeholder="Search nearby shop, road, landmark..." />
      </div>
      <div class="hint" id="map-hint">📍 Tap any landmark/place or drag pin</div>
      <div id="map"></div>
      <script>
        var initialLat = ${pinnedCoords?.lat || userCoords?.lat || 11.3992};
        var initialLng = ${pinnedCoords?.lon || userCoords?.lon || 79.6935};
        var mapModeActive = '';

        function sendPin(lat, lng, poiName) {
          window.parent.postMessage({ type: 'FINDMATE_PIN_SELECTED', lat: lat, lon: lng, poiName: poiName || '' }, '*');
        }

        function initLeafletFallback() {
          if (mapModeActive === 'leaflet') return;
          mapModeActive = 'leaflet';
          document.getElementById('search-box').style.display = 'none';
          document.getElementById('map').innerHTML = '';
          var map = L.map('map').setView([initialLat, initialLng], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);
          var marker = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
          sendPin(initialLat, initialLng);
          marker.on('dragend', function() {
            var pos = marker.getLatLng();
            sendPin(pos.lat, pos.lng);
          });
          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            sendPin(e.latlng.lat, e.latlng.lng);
          });
        }

        window.gm_authFailure = function() {
          initLeafletFallback();
        };

        window.initGoogleMap = function() {
          try {
            if (!window.google || !window.google.maps) { initLeafletFallback(); return; }
            mapModeActive = 'google';
            var center = { lat: initialLat, lng: initialLng };
            var map = new google.maps.Map(document.getElementById('map'), {
              center: center,
              zoom: 17,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              clickableIcons: true
            });
            var marker = new google.maps.Marker({
              position: center,
              map: map,
              draggable: true
            });

            // Setup Google Places Autocomplete search input inside map modal
            var input = document.getElementById('pac-input');
            if (google.maps.places && google.maps.places.Autocomplete) {
              document.getElementById('search-box').style.display = 'flex';
              var autocomplete = new google.maps.places.Autocomplete(input);
              autocomplete.bindTo('bounds', map);
              autocomplete.addListener('place_changed', function() {
                var place = autocomplete.getPlace();
                if (!place.geometry || !place.geometry.location) return;
                map.panTo(place.geometry.location);
                map.setZoom(18);
                marker.setPosition(place.geometry.location);
                var label = place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
                  ? place.name + ', ' + place.formatted_address
                  : (place.formatted_address || place.name || '');
                sendPin(place.geometry.location.lat(), place.geometry.location.lng(), label);
              });
            }

            var placesService = google.maps.places ? new google.maps.places.PlacesService(map) : null;

            sendPin(initialLat, initialLng);

            marker.addListener('dragend', function(e) {
              sendPin(e.latLng.lat(), e.latLng.lng());
            });

            map.addListener('click', function(e) {
              marker.setPosition(e.latLng);
              if (e.placeId && placesService) {
                e.stop();
                placesService.getDetails({ placeId: e.placeId, fields: ['name', 'formatted_address'] }, function(place, status) {
                  if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    var label = place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
                      ? place.name + ', ' + place.formatted_address
                      : (place.formatted_address || place.name || '');
                    sendPin(e.latLng.lat(), e.latLng.lng(), label);
                  } else {
                    sendPin(e.latLng.lat(), e.latLng.lng());
                  }
                });
              } else {
                sendPin(e.latLng.lat(), e.latLng.lng());
              }
            });
          } catch (err) {
            initLeafletFallback();
          }
        };
      </script>
      <script async defer
        src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_CLIENT_KEY}&libraries=places&callback=initGoogleMap"
        onerror="initLeafletFallback()">
      </script>
      <script>
        setTimeout(function() { if (!mapModeActive) initLeafletFallback(); }, 5500);
      </script>
    </body>
    </html>
    `;

    const displayedResults = query.trim().length >= 2 ? results : nearbyResults;

    return (
        <View style={styles.wrapper}>
            {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}

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
                        } else if (userCoords && nearbyResults.length === 0) {
                            fetchNearbyPlaces(userCoords.lat, userCoords.lon).then(setNearbyResults);
                        }
                    }}
                    onBlur={() => {
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
                    <Text style={[styles.actionText, { color: colors.primary }]}>Google Map Pin</Text>
                </TouchableOpacity>
            </View>

            {isFocused && (displayedResults.length > 0 || (query.trim().length >= 2 && !loading)) && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' }}>
                            {query.trim().length >= 2 ? 'Search Results' : 'Nearby Landmarks & Places'}
                        </Text>
                    </View>

                    {displayedResults.length > 0 ? (
                        <FlatList
                            data={displayedResults}
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

            <Modal visible={mapModalVisible} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                    <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MapPin size={20} color={colors.primary} />
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Place on Map</Text>
                            </View>
                            <TouchableOpacity onPress={() => setMapModalVisible(false)} style={{ padding: 4 }}>
                                <X size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.mapFrameWrapper}>
                            {React.createElement('iframe', {
                                srcDoc: mapHtml,
                                title: 'Location Map Picker',
                                style: { width: '100%', height: '100%', border: 'none' },
                            })}
                        </View>

                        <View style={[styles.modalFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Selected Location:</Text>
                                <Text style={{ fontSize: 14, color: colors.text, marginTop: 2 }} numberOfLines={2}>
                                    {pinLoading ? 'Resolving address...' : (pinAddress || 'Move pin or tap a place on map')}
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
    wrapper: { marginBottom: 16, position: 'relative', zIndex: 10 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, height: 52, paddingHorizontal: 16 },
    icon: { marginRight: 10 },
    input: { flex: 1, height: '100%', fontSize: 15, outlineStyle: 'none' } as any,
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
    actionBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    actionText: { fontSize: 13, fontWeight: '600' },
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
    dropdownHeader: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
    customResultItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderBottomWidth: 1 },
    resultItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderBottomWidth: 1 },
    resultText: { fontSize: 14, lineHeight: 20 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
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
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
    modalTitle: { fontSize: 17, fontWeight: '700' },
    mapFrameWrapper: { flex: 1, width: '100%', minHeight: 350, backgroundColor: '#e5e7eb' },
    modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1 },
    confirmBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
});
