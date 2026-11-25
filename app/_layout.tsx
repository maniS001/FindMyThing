import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ActiveCallBanner from '../components/ActiveCallBanner';
import Header from '../components/Header';
import IncomingCallModal from '../components/IncomingCallModal';
import { API_URL } from '../constants/api';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { CallProvider } from '../contexts/CallContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import chatService from '../services/chatService';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import soundEffects from '../utils/soundEffects';

// Configure foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootLayoutContent() {
  const { theme, colors } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const [expoPushToken, setExpoPushToken] = useState('');
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const handledResponseIdRef = useRef<string | null>(null);

  const { user, token: authToken } = useAuth();

  // Route or handle notification response (works for both cold-start closed app and background resume)
  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    try {
      const reqId = response.notification.request.identifier;
      const actionId = response.actionIdentifier;
      const dedupeKey = `${reqId}:${actionId}`;
      if (handledResponseIdRef.current === dedupeKey) return;
      handledResponseIdRef.current = dedupeKey;

      const data: any = response.notification.request.content.data || {};

      if (actionId === 'decline_call' && data.conversationId) {
        soundEffects.stopRingtone();
        chatService.rejectCall(data.conversationId);
        const token = await AsyncStorage.getItem('token');
        if (token && data.callRequestId) {
          await fetch(`${API_URL}/calls/${data.callRequestId}/reject`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        return;
      }

      if (data.type === 'INCOMING_CALL' && data.conversationId) {
        soundEffects.stopRingtone();
        (router as any).push({
          pathname: '/call/[conversationId]',
          params: {
            conversationId: String(data.conversationId),
            otherName: String(data.senderName || 'Caller'),
            isInitiator: 'false',
            callRequestId: data.callRequestId ? String(data.callRequestId) : '',
            autoAccept: actionId === 'answer_call' ? 'true' : 'false',
          },
        });
        return;
      }

      if (typeof data.url === 'string' && data.url.length > 0) {
        router.push(data.url as never);
      }
    } catch (err) {
      console.warn('Error handling notification response:', err);
    }
  }, [router]);

  useEffect(() => {
    if (lastNotificationResponse) {
      handleNotificationResponse(lastNotificationResponse);
    }
  }, [lastNotificationResponse, handleNotificationResponse]);

  // Helper to obtain device GPS on both Native & Web cleanly
  const fetchCurrentCoords = useCallback(async (): Promise<{ latitude?: number; longitude?: number }> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          return await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              () => resolve({}),
              { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
            );
          });
        }
        return {};
      }

      const { status: existing } = await Location.getForegroundPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        finalStatus = req.status;
      }
      if (finalStatus === 'granted') {
        const loc =
          (await Location.getLastKnownPositionAsync({})) ||
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (loc) {
          return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        }
      }
    } catch (locErr) {
      console.warn('Location fetch failed:', locErr);
    }
    return {};
  }, []);

  // Sync push token & current GPS whenever authToken changes or app resumes foreground
  const syncPushTokenAndLocation = useCallback(async (tokenStr: string) => {
    try {
      let pushToken = expoPushToken || (await AsyncStorage.getItem('expoPushToken')) || '';
      if (!pushToken) {
        const freshToken = await registerForPushNotificationsAsync();
        if (freshToken) {
          pushToken = freshToken;
          setExpoPushToken(freshToken);
          await AsyncStorage.setItem('expoPushToken', freshToken);
        }
      }

      const { latitude, longitude } = await fetchCurrentCoords();

      if (pushToken || (latitude !== undefined && longitude !== undefined)) {
        await fetch(`${API_URL}/auth/update-push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenStr}`,
          },
          body: JSON.stringify({
            ...(pushToken ? { pushToken } : {}),
            ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
          }),
        });
        console.log('[Sync] Push token / GPS synced to backend');
      }
    } catch (e) {
      console.warn('[Sync] Failed to sync push token & location:', e);
    }
  }, [expoPushToken, fetchCurrentCoords]);

  // Connect WebSocket & sync token + location when authenticated
  useEffect(() => {
    if (!authToken) {
      chatService.disconnect();
      return;
    }
    chatService.connect();
    syncPushTokenAndLocation(authToken);

    let sub: any = null;
    if (Platform.OS !== 'web') {
      sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          chatService.connect();
          syncPushTokenAndLocation(authToken);
        }
      });
    }
    return () => sub?.remove?.();
  }, [authToken, syncPushTokenAndLocation]);

  // Global message & alert notification listener via WebSocket
  useEffect(() => {
    const showLocalOrBrowserNotification = async (title: string, body: string, data: any) => {
      if (Platform.OS === 'web') {
        try {
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const notif = new Notification(title, { body, icon: '/icon.png' });
            notif.onclick = () => {
              window.focus();
              if (data?.url) router.push(data.url);
            };
          }
        } catch {}
        return;
      }

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
        });
      } catch (err) {
        console.warn('Failed to display local notification:', err);
      }
    };

    const handleIncomingMessage = async (payload: any) => {
      if (!payload || payload.senderId === user?.id) return;
      const currentChatId = pathname.startsWith('/chat/') ? pathname.replace('/chat/', '') : null;
      if (currentChatId === payload.conversationId) return;

      await showLocalOrBrowserNotification(
        `New message from ${payload.senderName || 'Someone'}`,
        payload.content || 'Sent you a message',
        { url: `/chat/${payload.conversationId}` }
      );
    };

    const handleNewNotification = async (payload: any) => {
      if (!payload) return;
      await showLocalOrBrowserNotification(
        payload.title || 'New Alert',
        payload.message || 'Tap to view details',
        { url: payload.url || '/notifications' }
      );
    };

    chatService.on('CHAT_MESSAGE', handleIncomingMessage);
    chatService.on('NEW_NOTIFICATION', handleNewNotification);
    return () => {
      chatService.off('CHAT_MESSAGE', handleIncomingMessage);
      chatService.off('NEW_NOTIFICATION', handleNewNotification);
    };
  }, [pathname, user?.id, router]);

  // Register push notifications & notification listeners once on mount
  useEffect(() => {
    registerForPushNotificationsAsync().then(async (pushToken) => {
      if (pushToken) {
        setExpoPushToken(pushToken);
        await AsyncStorage.setItem('expoPushToken', pushToken);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notif) => {
      const data: any = notif.request.content.data || {};
      if (data.type === 'INCOMING_CALL' && Platform.OS !== 'web') {
        soundEffects.startRingtone();
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [handleNotificationResponse]);

  const baseTheme = theme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: colors.background,
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <>
            <Stack
              screenOptions={{
                headerShown: true,
                header: () => <Header forceShow />,
                contentStyle: { backgroundColor: colors.background, ...(Platform.OS === 'web' ? { maxWidth: 800, alignSelf: 'center', width: '100%' } : {}) }
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="auth/login" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="victim/search" />
              <Stack.Screen name="victim/results" />
              <Stack.Screen name="victim/claim/[id]" />
              <Stack.Screen name="founder/report" />
              <Stack.Screen name="founder/complaints" options={{ headerShown: false, contentStyle: { maxWidth: '100%', width: '100%' } }} />
              <Stack.Screen name="founder/complaint-detail" />
              <Stack.Screen name="success" options={{ headerShown: false }} />
              <Stack.Screen name="account" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="about" options={{ headerShown: false }} />
              <Stack.Screen name="help" options={{ headerShown: false }} />
              <Stack.Screen name="manual" options={{ headerShown: false }} />
              <Stack.Screen name="privacy" options={{ headerShown: false }} />
              <Stack.Screen name="terms" options={{ headerShown: false }} />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="chat/index" options={{ headerShown: false }} />
              <Stack.Screen name="chat/[conversationId]" options={{ headerShown: false }} />
              <Stack.Screen name="call/[conversationId]" options={{ headerShown: false }} />
            </Stack>
            <ActiveCallBanner />
            <IncomingCallModal />
          </>
        </View>
      </SafeAreaProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <CallProvider>
          <RootLayoutContent />
        </CallProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
