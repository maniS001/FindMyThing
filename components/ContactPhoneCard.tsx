import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Lock, PhoneCall } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Input from './Input';

interface ContactPhoneCardProps {
    phone: string;
    onChangePhone: (value: string) => void;
    exposePhone?: boolean;
    onToggleExpose: (value: boolean) => void;
}

export default function ContactPhoneCard({
    phone,
    onChangePhone,
    onToggleExpose,
}: ContactPhoneCardProps) {
    const { colors } = useTheme();
    const hasPhone = phone.trim().length > 0;

    return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
                <PhoneCall size={18} color={colors.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.title, { color: colors.text }]}>Contact Number (Optional)</Text>
                    <Text style={[styles.desc, { color: colors.textSecondary }]}>
                        Not mandatory. Entering a phone number allows finders to call you directly.
                    </Text>
                </View>
            </View>

            <Input
                placeholder="Optional phone number (e.g. +91 98765 43210)"
                value={phone}
                onChangeText={(text) => {
                    onChangePhone(text);
                    onToggleExpose(Boolean(text.trim()));
                }}
                keyboardType="phone-pad"
            />

            <View
                style={[
                    styles.statusBanner,
                    hasPhone
                        ? { backgroundColor: '#10B98115', borderColor: '#10B981' }
                        : { backgroundColor: colors.primary + '10', borderColor: colors.border },
                ]}
            >
                {hasPhone ? (
                    <PhoneCall size={14} color="#10B981" />
                ) : (
                    <Lock size={14} color={colors.primary} />
                )}
                <Text
                    style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: '600',
                        marginLeft: 8,
                        lineHeight: 17,
                        color: hasPhone ? '#059669' : colors.textSecondary,
                    }}
                >
                    {hasPhone
                        ? `Direct call enabled: finders can call ${phone.trim()} directly from your complaint page.`
                        : 'If no phone number is provided, finders will contact you via in-app messages and calls.'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        marginTop: 8,
        marginBottom: 8,
        gap: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
    },
    desc: {
        fontSize: 12,
        marginTop: 2,
        lineHeight: 16,
    },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
});
