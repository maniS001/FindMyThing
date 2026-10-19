import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Phone, PhoneOff, ArrowUpRight } from 'lucide-react-native';
import { useCall } from '../contexts/CallContext';
import { useRouter, usePathname } from 'expo-router';

export default function ActiveCallBanner() {
    const { activeCall, endActiveCall, formatDuration } = useCall();
    const router = useRouter();
    const pathname = usePathname();

    // Do not show banner if no call, or if user is currently inside the full call screen
    if (!activeCall || (activeCall.status !== 'active' && activeCall.status !== 'connecting')) {
        return null;
    }

    if (pathname.startsWith('/call')) {
        return null;
    }

    const returnToCall = () => {
        router.push({
            pathname: '/call/[conversationId]',
            params: {
                conversationId: activeCall.conversationId,
                otherName: activeCall.otherName,
                isInitiator: String(activeCall.isInitiator),
                incomingSdp: activeCall.incomingSdp || ''
            }
        });
    };

    return (
        <View style={styles.bannerContainer}>
            <TouchableOpacity style={styles.bannerContent} onPress={returnToCall} activeOpacity={0.9}>
                <View style={styles.leftSection}>
                    <View style={styles.pulseIconContainer}>
                        <Phone size={16} color="#FFF" />
                    </View>
                    <View style={styles.info}>
                        <Text style={styles.callerText} numberOfLines={1}>
                            In Call: {activeCall.otherName}
                        </Text>
                        <Text style={styles.timerText}>
                            {activeCall.status === 'active' ? formatDuration(activeCall.duration) : 'Connecting...'}
                        </Text>
                    </View>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity style={styles.returnBtn} onPress={returnToCall} activeOpacity={0.8}>
                        <Text style={styles.returnText}>Return</Text>
                        <ArrowUpRight size={14} color="#FFF" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.endBtn} onPress={endActiveCall} activeOpacity={0.8}>
                        <PhoneOff size={16} color="#FFF" />
                        <Text style={styles.endText}>End</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    bannerContainer: {
        width: '100%',
        backgroundColor: '#10B981',
        zIndex: 999999,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 10,
    },
    pulseIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    info: {
        flex: 1,
    },
    callerText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    timerText: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    returnBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    returnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    endBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 5,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
    },
    endText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
});
