import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Lock, PhoneCall } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import Input from './Input';

interface ContactPhoneCardProps {
    phone: string;
    onChangePhone: (value: string) => void;
    exposePhone: boolean;
    onToggleExpose: (value: boolean) => void;
}

export default function ContactPhoneCard({
    phone,
    onChangePhone,
    exposePhone,
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
                        Not mandatory. Leave blank to use anonymous in-app chat & calling only.
                    </Text>
                </View>
            </View>

            <Input
                placeholder="Optional phone number (e.g. +91 98765 43210)"
                value={phone}
                onChangeText={(text) => {
                    onChangePhone(text);
                    if (!text.trim() && exposePhone) {
                        onToggleExpose(false);
                    }
                }}
                keyboardType="phone-pad"
            />

            <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: hasPhone ? colors.text : colors.textSecondary }]}>
                        Expose phone for Direct Call
                    </Text>
                    <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                        {hasPhone
                            ? 'Allow finders to see this number and make a direct phone call instead of in-app call'
                            : 'Enter a phone number above to enable direct calling'}
                    </Text>
                </View>
                <Switch
                    value={hasPhone && exposePhone}
                    onValueChange={(val) => {
                        if (hasPhone) onToggleExpose(val);
                    }}
                    disabled={!hasPhone}
                    trackColor={{ false: colors.border, true: '#10B981' }}
                    thumbColor={hasPhone && exposePhone ? '#FFF' : '#F4F3F4'}
                />
            </View>

            {hasPhone && (
                <View
                    style={[
                        styles.statusBanner,
                        exposePhone
                            ? { backgroundColor: '#10B98115', borderColor: '#10B981' }
                            : { backgroundColor: colors.primary + '10', borderColor: colors.border },
                    ]}
                >
                    {exposePhone ? (
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
                            color: exposePhone ? '#059669' : colors.textSecondary,
                        }}
                    >
                        {exposePhone
                            ? `Finders can directly call ${phone.trim()} from your complaint page.`
                            : 'Your phone number stays hidden. Finders can reach you via in-app chat & call.'}
                    </Text>
                </View>
            )}
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
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 10,
        borderTopWidth: 1,
    },
    toggleTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    toggleDesc: {
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
