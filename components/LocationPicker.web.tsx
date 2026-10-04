import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
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
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState(value || '');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const searchPlaces = async (text: string) => {
        setQuery(text);
        if (text.length < 3) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
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

    const handleSelectResult = (item: any) => {
        setQuery(item.display_name);
        onChange(item.display_name, { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) });
        setResults([]);
        setIsFocused(false);
    };

    const useCurrentLocation = () => {
        setLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    try {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
                        const data = await res.json();
                        const address = data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                        onChange(address, { latitude: lat, longitude: lon });
                        setQuery(address);
                        setIsFocused(false);
                    } catch (e) {
                        alert("Could not fetch address for this location.");
                    } finally {
                        setLoading(false);
                    }
                },
                (error) => {
                    alert("Location access denied or unavailable.");
                    setLoading(false);
                }
            );
        } else {
            alert("Geolocation is not supported by this browser.");
            setLoading(false);
        }
    };

    return (
        <View style={styles.wrapper}>
            <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Search size={20} color={colors.textSecondary} style={styles.icon} />
                <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={searchPlaces}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                        // Delay blur to allow item press
                        setTimeout(() => setIsFocused(false), 200);
                    }}
                />
                {loading && <ActivityIndicator size="small" color={colors.primary} style={styles.icon} />}
            </View>
            
            {/* Added Current Location Button for Web */}
            <TouchableOpacity onPress={useCurrentLocation} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 4 }}>
                <MapPin size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Use my current location</Text>
            </TouchableOpacity>

            {isFocused && results.length > 0 && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <FlatList
                        data={results}
                        keyExtractor={(item) => item.place_id.toString()}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <TouchableOpacity 
                                style={[styles.resultItem, { borderBottomColor: colors.border }]}
                                onPress={() => handleSelectResult(item)}
                            >
                                <MapPin size={16} color={colors.textSecondary} style={{ marginRight: 8, marginTop: 2 }} />
                                <Text style={[styles.resultText, { color: colors.text }]}>{item.display_name}</Text>
                            </TouchableOpacity>
                        )}
                        style={{ maxHeight: 200 }}
                    />
                </View>
            )}
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
        borderWidth: 1,
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
        fontSize: 16,
    },
    dropdown: {
        position: 'absolute',
        top: 80,
        left: 0,
        right: 0,
        borderWidth: 1,
        borderRadius: 12,
        maxHeight: 200,
        zIndex: 999,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    resultItem: {
        flexDirection: 'row',
        padding: 12,
        borderBottomWidth: 1,
    },
    resultText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
});
