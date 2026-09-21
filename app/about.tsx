import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

export default function AboutScreen() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>About Us</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>FindMyThing</Text>
                    <Text style={[styles.version, { color: colors.textSecondary }]}>Version 1.0.0</Text>

                    <Text style={[styles.description, { color: colors.text }]}>
                        FindMyThing helps reconnect people with their lost belongings.
                        Our platform makes it easy to report found items and search for lost ones.
                    </Text>

                    <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                        More information coming soon...
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    content: {
        padding: 24,
    },
    card: {
        padding: 24,
        borderRadius: 12,
        borderWidth: 1,
    },
    cardTitle: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 4,
    },
    version: {
        fontSize: 14,
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 16,
    },
    placeholderText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
});
