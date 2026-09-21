import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { ArrowLeft, Bell, Info, Menu, Settings, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../constants/api';
import { useTheme } from '../contexts/ThemeContext';

interface MenuItem {
    icon: React.ReactNode;
    label: string;
    route: string;
}

export default function Header({ forceShow = false }: { forceShow?: boolean } = {}) {
    const router = useRouter();
    const pathname = usePathname();
    const { colors } = useTheme();
    const [menuVisible, setMenuVisible] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    // Fetch unread count on mount and when pathname changes
    useEffect(() => {
        fetchUnreadCount();
        // Poll every 30 seconds for updates
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [pathname]);

    const fetchUnreadCount = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_URL}/notifications/unread-count`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();
                setUnreadCount(data.count);
            }
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    const menuItems: MenuItem[] = [
        { icon: <User size={20} color={colors.text} />, label: 'Account Details', route: '/account' },
        { icon: <Settings size={20} color={colors.text} />, label: 'Settings', route: '/settings' },
        { icon: <Info size={20} color={colors.text} />, label: 'About Us', route: '/about' },
    ];

    const handleMenuItemPress = (route: string) => {
        setMenuVisible(false);
        if (pathname !== route) {
            router.push(route as never);
        }
    };

    const hideHeaderRoutes = ['/auth/login', '/account', '/settings', '/about', '/notifications', '/success', '/founder/complaints'];
    if (!forceShow && hideHeaderRoutes.includes(pathname)) return null;

    return (
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBackground }}>

            <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.headerBackground }]}>
                <View style={styles.leftSection}>
                    {pathname === '/' && (
                        <TouchableOpacity
                            onPress={() => {
                                router.push('/account' as never);
                            }}
                            style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                            activeOpacity={0.7}
                        >
                            <User size={20} color={colors.headerText} />
                        </TouchableOpacity>
                    )}

                    {pathname !== '/' && (
                        <>
                            {pathname !== '/' && pathname !== '/account' && pathname !== '/settings' && pathname !== '/about' && pathname !== '/notifications' && (
                                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                                    <ArrowLeft size={24} color={colors.headerText} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => router.dismissAll()} activeOpacity={0.7}>
                                <Text style={[styles.logo, { color: colors.headerText }]}>FindMyThing</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={styles.actions}>
                    {/* User Icon (on right for non-home pages) */}
                    {pathname !== '/' && (
                        <TouchableOpacity
                            onPress={() => {
                                if (pathname !== '/account') {
                                    router.push('/account' as never);
                                }
                            }}
                            style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                            activeOpacity={0.7}
                        >
                            <User size={20} color={colors.headerText} />
                        </TouchableOpacity>
                    )}

                    {/* Notification Button */}
                    <TouchableOpacity
                        onPress={() => {
                            if (pathname !== '/notifications') {
                                router.push('/notifications' as never);
                                setUnreadCount(0); // Reset count when navigating to notifications
                            }
                        }}
                        style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                        activeOpacity={0.7}
                    >
                        <Bell size={20} color={colors.headerText} />
                        {unreadCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Menu Button */}
                    <TouchableOpacity
                        onPress={() => setMenuVisible(true)}
                        style={[styles.iconButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                        activeOpacity={0.7}
                    >
                        <Menu size={20} color={colors.headerText} />
                    </TouchableOpacity>
                </View>

                {/* Dropdown Menu Modal */}
                <Modal
                    visible={menuVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setMenuVisible(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setMenuVisible(false)}
                    >
                        <View style={[styles.menuContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            {menuItems.map((item, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.menuItem,
                                        { borderBottomColor: colors.border },
                                        index === menuItems.length - 1 && styles.lastMenuItem
                                    ]}
                                    onPress={() => handleMenuItemPress(item.route)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.menuItemIcon}>{item.icon}</View>
                                    <Text style={[styles.menuItemText, { color: colors.text }]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </TouchableOpacity>
                </Modal>
            </View>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    logo: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backButton: {
        padding: 4,
        marginLeft: -4,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
    badgeText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '700',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 70,
        paddingRight: 20,
    },
    menuContainer: {
        borderRadius: 12,
        borderWidth: 1,
        minWidth: 200,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    lastMenuItem: {
        borderBottomWidth: 0,
    },
    menuItemIcon: {
        marginRight: 12,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '500',
    },
});
