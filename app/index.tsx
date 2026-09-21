import { useRouter } from 'expo-router';
import { MapPin, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { wakeUpServer } from '../utils/serverWakeUp';

export default function LandingScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    const [isNavigating, setIsNavigating] = useState(false);

    // Wake up the backend server when app loads
    useEffect(() => {
        wakeUpServer();
    }, []);

    const handleNavigation = (path: any) => {
        if (isNavigating) return;
        setIsNavigating(true);
        router.push(path);
        // Reset after animations usually finish
        setTimeout(() => setIsNavigating(false), 1000);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={[styles.title, { color: colors.text }]}>FindMyThing</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        Reconnecting people with their belongings.
                    </Text>
                </View>

                <View style={styles.content}>
                    <TouchableOpacity
                        style={[styles.card, styles.lostCard]}
                        onPress={() => handleNavigation('/victim/search')}
                        activeOpacity={0.9}
                    >
                        <View style={styles.iconContainer}>
                            <Search size={32} color="#FFF" />
                        </View>
                        <Text style={styles.cardTitle}>I Lost Something</Text>
                        <Text style={styles.cardDesc}>Search for your lost items and claim them securely.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.card, styles.foundCard]}
                        onPress={() => handleNavigation('/founder/complaints')}
                        activeOpacity={0.9}
                    >
                        <View style={styles.iconContainer}>
                            <MapPin size={32} color="#FFF" />
                        </View>
                        <Text style={styles.cardTitle}>I Found Something</Text>
                        <Text style={styles.cardDesc}>Report an item you found to help return it.</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 60,
    },
    header: {
        marginTop: 0,
        marginBottom: 40,
    },
    title: {
        fontSize: 42,
        fontWeight: '800',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 18,
        marginTop: 8,
    },
    content: {
        gap: 24,
    },
    card: {
        padding: 32,
        borderRadius: 24,
        height: 220,
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
    },
    lostCard: {
        backgroundColor: '#3B82F6', // Blue
    },
    foundCard: {
        backgroundColor: '#10B981', // Emerald
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#FFF',
        marginBottom: 8,
    },
    cardDesc: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 24,
    },
});
