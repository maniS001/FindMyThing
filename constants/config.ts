import { APP_CONFIG } from '../config';

export const CONFIG = {
    // Payment Gateway Feature Flag
    // Set to true in config.ts to enable payments
    ENABLE_PAYMENT: APP_CONFIG.FEATURES.PAYMENT_GATEWAY_ENABLED,

    // Default OTP for testing
    DEFAULT_OTP: '123456',

    // Push Notifications
    PUSH_NOTIFICATIONS_ENABLED: APP_CONFIG.FEATURES.PUSH_NOTIFICATIONS_ENABLED,

    // Captcha Verification
    CAPTCHA_ENABLED: APP_CONFIG.FEATURES.CAPTCHA_ENABLED,

    // SMS OTP
    SMS_OTP_ENABLED: APP_CONFIG.FEATURES.SMS_OTP_ENABLED,
    MERCHANT_VPA: 'merchant@upi', // Replace with real VPA in production
    MERCHANT_NAME: 'FindMyThing Services',
    PAYMENT_MODE: 'UPI' as 'UPI' | 'SANDBOX',
    PROCESSING_FEE: 10,
} as const;
