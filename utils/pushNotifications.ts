import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#1E3A8A',
            sound: 'default',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        await Notifications.setNotificationChannelAsync('calls', {
            name: 'Incoming In-App Calls',
            description: 'High-priority incoming voice call alerts with common ringtone',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'ringtone.wav',
            enableVibrate: false,
            bypassDnd: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            audioAttributes: {
                usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
                contentType: Notifications.AndroidAudioContentType.SONIFICATION,
            },
        });
    }

    if (Platform.OS !== 'web') {
        try {
            await Notifications.setNotificationCategoryAsync('incoming_call', [
                {
                    identifier: 'answer_call',
                    buttonTitle: 'Answer',
                    options: { opensAppToForeground: true },
                },
                {
                    identifier: 'decline_call',
                    buttonTitle: 'Decline',
                    options: { opensAppToForeground: false, isDestructive: true },
                },
            ]);
        } catch (catErr) {
            console.warn('Could not register call notification category:', catErr);
        }
    }

    if (Platform.OS === 'web') {
        // Request standard Browser Notification permission on web if available
        try {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        } catch {}
        return undefined;
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowBadge: true,
                    allowSound: true,
                },
            });
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return undefined;
        }

        // Get the Expo push token
        try {
            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ??
                Constants?.easConfig?.projectId ??
                'a3455b6d-df63-4621-8856-f5dd70ec5a5c';
            token = (await Notifications.getExpoPushTokenAsync({
                projectId,
            })).data;
            console.log('Expo Push Token:', token);
        } catch (e) {
            console.error('Error fetching push token:', e);
        }
    } else {
        console.log('Must use physical device for Push Notifications');
    }

    return token;
}
