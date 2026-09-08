import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../constants/api';
import { useTheme } from '../../contexts/ThemeContext';
import { showAlert } from '../../utils/alert';

export default function JoinCommunityScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { token, user } = useAuth();
    const { colors } = useTheme();
    const [loading, setLoading] = useState(true);
    const [community, setCommunity] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            router.replace('/auth/login');
            return;
        }

        fetchCommunityDetails();
    }, [id, token]);

    const fetchCommunityDetails = async () => {
        try {
            const myRes = await fetch(`${API_URL}/users/me/communities`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const myComms = await myRes.json();
            if (Array.isArray(myComms) && myComms.some(c => c.id === id)) {
                showAlert('Info', 'You are already a member of this community!');
                router.replace('/account/communities');
                return;
            }

            setCommunity({ id });
            setLoading(false);
        } catch (e: any) {
            setError('Failed to load community details.');
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/communities/${id}/join-request`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to join community');
            
            showAlert('Success', 'Successfully joined or requested to join the community!');
            router.replace('/account/communities');
        } catch (e: any) {
            showAlert('Error', e.message);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.text, marginTop: 16, textAlign: 'center' }}>Loading Community...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.error, fontSize: 16, marginBottom: 16 }}>{error}</Text>
                <TouchableOpacity onPress={() => router.replace('/')} style={[styles.btn, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Go Home</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 8 }}>
                You've been invited!
            </Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 32 }}>
                You have been invited to join a FindMate community. Click below to accept the invitation.
            </Text>
            <TouchableOpacity onPress={handleJoin} style={[styles.btn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>
                    Join Community
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 16 }}>
                <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    btn: {
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
    }
});
