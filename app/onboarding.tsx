import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import Input from '../components/Input';
import { API_URL } from '../constants/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Onboarding() {
    const { colors } = useTheme();
    const router = useRouter();
    const { login } = useAuth();
    const params = useLocalSearchParams();
    
    // We expect these to be passed from the login screen
    const firebaseIdToken = params.firebaseIdToken as string;
    const phone = params.phone as string;

    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState(1); // 1 = Name, 2 = Permissions

    const handleNext = () => {
        if (!name.trim()) {
            setError('Please enter your name to continue.');
            return;
        }
        setError('');
        setStep(2);
    };

    const handleRequestPermissionsAndSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            // Request Location Permission
            let locationName = '';
            let latitude = 0;
            let longitude = 0;
            const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
            if (locationStatus === 'granted') {
                const locationData = await Location.getCurrentPositionAsync({});
                latitude = locationData.coords.latitude;
                longitude = locationData.coords.longitude;
                
                // Get city name roughly using reverse geocoding
                const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (geocode.length > 0) {
                    locationName = geocode[0].city || geocode[0].region || geocode[0].country || 'Unknown';
                }
            }

            // Request Camera Permission
            await ImagePicker.requestCameraPermissionsAsync();
            await ImagePicker.requestMediaLibraryPermissionsAsync();

            const pushToken = await AsyncStorage.getItem('expoPushToken');

            // Finalize registration
            const response = await fetch(`${API_URL}/auth/phone-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    firebaseIdToken, 
                    name: name.trim(),
                    pushToken,
                    location: locationName || undefined,
                    latitude: latitude || undefined,
                    longitude: longitude || undefined
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Registration failed');

            // Success, log the user in!
            await login(data.token, data.user);
        } catch (e: any) {
            console.error('Registration error:', e);
            setError(e.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.primary }]}>Welcome to FindMyThing</Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {step === 1 ? "Let's get to know you" : "We need a few permissions"}
                        </Text>
                    </View>

                    <View style={styles.form}>
                        {!!error && (
                            <View style={[styles.errorBox, { backgroundColor: '#ff4d4f20', borderColor: '#ff4d4f' }]}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {step === 1 && (
                            <>
                                <Input
                                    label="Full Name"
                                    value={name}
                                    onChangeText={(v) => { setName(v); setError(''); }}
                                    placeholder="Enter your name"
                                    autoCapitalize="words"
                                />
                                <Button title="Next" onPress={handleNext} style={styles.button} />
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <Text style={[styles.infoText, { color: colors.text }]}>
                                    To provide you with the best experience, FindMyThing uses your location to show lost/found items near you, and your camera to take pictures of items.
                                </Text>
                                <Button 
                                    title="Grant Permissions & Finish" 
                                    onPress={handleRequestPermissionsAndSubmit} 
                                    loading={loading}
                                    style={styles.button} 
                                />
                                <Button 
                                    title="Skip Permissions for now" 
                                    onPress={handleRequestPermissionsAndSubmit} 
                                    loading={loading}
                                    variant="outline"
                                    style={styles.buttonSecondary} 
                                />
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
    },
    form: {
        gap: 16,
        width: '100%',
        maxWidth: 480,
        alignSelf: 'center',
    },
    errorBox: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
    },
    errorText: {
        color: '#ff4d4f',
        fontSize: 13,
        textAlign: 'center',
    },
    button: { marginTop: 8 },
    buttonSecondary: { marginTop: 8 },
    infoText: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 16,
    }
});
