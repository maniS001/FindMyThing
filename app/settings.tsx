import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    ChevronRight,
    FileText,
    HelpCircle,
    Info,
    Moon,
    Shield,
    Sun,
    Trash2,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../constants/api';
import { useTheme } from '../contexts/ThemeContext';

export default function SettingsScreen() {
    const router = useRouter();
    const { theme, toggleTheme, colors } = useTheme();
    const [deleting, setDeleting] = useState(false);

    const handleDeleteAccount = () => {
        const confirmMessage = 'Are you sure you want to delete your account? This will permanently delete your profile, complaints, images, and chat history. This action cannot be undone.';
        
        if (Platform.OS === 'web') {
            if (window.confirm(confirmMessage)) {
                executeDelete();
            }
        } else {
            Alert.alert(
                'Delete Account',
                confirmMessage,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: executeDelete },
                ]
            );
        }
    };

    const executeDelete = async () => {
        try {
            setDeleting(true);
            const token = await AsyncStorage.getItem('token');
            if (token) {
                await fetch(`${API_URL}/auth/account`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
            await AsyncStorage.clear();
            router.replace('/auth/login' as never);
        } catch (error) {
            console.error('Delete account error:', error);
            await AsyncStorage.clear();
            router.replace('/auth/login' as never);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
                <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Appearance Section */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                        Appearance
                    </Text>

                    <View style={styles.settingRow}>
                        <View style={styles.settingLeft}>
                            {theme === 'light' ? (
                                <Moon size={22} color={colors.text} />
                            ) : (
                                <Sun size={22} color={colors.text} />
                            )}
                            <View style={styles.settingTextContainer}>
                                <Text style={[styles.settingLabel, { color: colors.text }]}>
                                    Dark Mode
                                </Text>
                                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                                    {theme === 'dark' ? 'Currently using dark theme' : 'Switch to dark theme'}
                                </Text>
                            </View>
                        </View>
                        <Switch
                            value={theme === 'dark'}
                            onValueChange={toggleTheme}
                            trackColor={{ false: colors.border, true: colors.primary }}
                            thumbColor={theme === 'dark' ? '#FFF' : '#F4F3F4'}
                        />
                    </View>
                </View>

                {/* Support & Resources */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                        Support & Guidance
                    </Text>

                    {/* Help & Support */}
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => router.push('/help' as never)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <HelpCircle size={20} color={colors.primary} />
                            <View>
                                <Text style={[styles.menuLabel, { color: colors.text }]}>Help & Support</Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    FindBot AI Assistant & Troubleshooting
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={colors.border} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    {/* About Us (Kept right after Help & Support) */}
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => router.push('/about' as never)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <Info size={20} color={colors.primary} />
                            <View>
                                <Text style={[styles.menuLabel, { color: colors.text }]}>About Us</Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    Our Problem, Goal, and Vision
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={colors.border} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    {/* App Manual */}
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => router.push('/manual' as never)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <BookOpen size={20} color={colors.primary} />
                            <View>
                                <Text style={[styles.menuLabel, { color: colors.text }]}>App Manual</Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    Complete Feature & Safety Guide
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={colors.border} />
                    </TouchableOpacity>
                </View>

                {/* Legal & Policies */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                        Legal & Policies
                    </Text>

                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => router.push('/privacy' as never)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <Shield size={20} color={colors.textSecondary} />
                            <View>
                                <Text style={[styles.menuLabel, { color: colors.text }]}>Privacy Policy</Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    Data permissions, consent & security
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={colors.border} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => router.push('/terms' as never)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <FileText size={20} color={colors.textSecondary} />
                            <View>
                                <Text style={[styles.menuLabel, { color: colors.text }]}>Terms of Service</Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    Fair use, rules & liability limits
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={colors.border} />
                    </TouchableOpacity>
                </View>

                {/* Account Actions */}
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                        Account Security
                    </Text>

                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={handleDeleteAccount}
                        disabled={deleting}
                        activeOpacity={0.7}
                    >
                        <View style={styles.menuLeft}>
                            <Trash2 size={20} color="#EF4444" />
                            <View>
                                <Text style={[styles.menuLabel, { color: "#EF4444" }]}>
                                    {deleting ? 'Deleting Account...' : 'Delete Account'}
                                </Text>
                                <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>
                                    Permanently remove your account and data
                                </Text>
                            </View>
                        </View>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 6,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        padding: 16,
        gap: 16,
    },
    card: {
        padding: 20,
        borderRadius: 14,
        borderWidth: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 14,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    settingTextContainer: {
        flex: 1,
    },
    settingLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    settingDescription: {
        fontSize: 13,
        marginTop: 2,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    menuLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    menuLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    menuSubtext: {
        fontSize: 12,
        marginTop: 2,
    },
    divider: {
        height: 1,
        marginVertical: 4,
    },
});
