import { WS_URL } from '../constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

export type WSMessageType =
    | 'AUTH'
    | 'AUTH_OK'
    | 'PING'
    | 'PONG'
    | 'CHAT_MESSAGE'
    | 'MESSAGE_DELIVERED'
    | 'MESSAGE_READ'
    | 'MESSAGES_READ'
    | 'NEW_NOTIFICATION'
    | 'CALL_OFFER'
    | 'CALL_ANSWER'
    | 'ICE_CANDIDATE'
    | 'CALL_ENDED'
    | 'CALL_REJECTED'
    | 'CALL_INCOMING'
    | 'ERROR';

export interface WSPayload {
    type: WSMessageType;
    token?: string;
    conversationId?: string;
    content?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    createdAt?: string;
    sdp?: any;
    candidate?: any;
    callRequestId?: string;
    error?: string;
    delivered?: boolean;
    read?: boolean;
    readBy?: string;
    title?: string;
    message?: string;
    url?: string;
    notificationType?: string;
}

type MessageHandler = (payload: WSPayload) => void;

class ChatService {
    private ws: WebSocket | null = null;
    private listeners: Map<string, MessageHandler[]> = new Map();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private isConnected = false;
    private pendingQueue: WSPayload[] = [];

    constructor() {
        // Web visibility & network listeners
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                    console.log('[ChatService] Web tab visible again. Re-connecting WebSocket...');
                    this.connect();
                }
            });
            window.addEventListener('online', () => {
                console.log('[ChatService] Network back online. Reconnecting WebSocket...');
                this.connect();
            });
        }

        // Native iOS / Android foreground recovery listener
        if (Platform.OS !== 'web') {
            AppState.addEventListener('change', (nextState) => {
                if (nextState === 'active' && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                    console.log('[ChatService] Native app active. Reconnecting WebSocket...');
                    this.connect();
                }
            });
        }
    }

    connect = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            if (!token) return;
            if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                this.isConnected = true;
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.rawSend({ type: 'AUTH', token: token! });
                this.pendingQueue.forEach(m => this.rawSend(m));
                this.pendingQueue = [];
                console.log('[ChatService] WebSocket connected');

                if (this.pingTimer) clearInterval(this.pingTimer);
                this.pingTimer = setInterval(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.rawSend({ type: 'PING' });
                    }
                }, 20000);
            };

            this.ws.onmessage = (e) => {
                try {
                    const payload: WSPayload = JSON.parse(e.data);
                    if (payload.type === 'PONG') return;
                    this.dispatch(payload.type, payload);
                } catch (err) {
                    console.error('[ChatService] parse error', err);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                if (this.pingTimer) clearInterval(this.pingTimer);
                console.log('[ChatService] WebSocket closed. Reconnecting in 3s...');
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), 3000);
            };

            this.ws.onerror = (e) => {
                console.error('[ChatService] error', e);
            };
        } catch (err) {
            console.error('[ChatService] connect error', err);
        }
    };

    disconnect = () => {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.ws?.close();
        this.ws = null;
        this.isConnected = false;
    };

    private rawSend = (payload: WSPayload) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    };

    send = (payload: WSPayload) => {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            this.rawSend(payload);
        } else {
            this.pendingQueue.push(payload);
            this.connect();
        }
    };

    sendMessage = (conversationId: string, content: string) => {
        this.send({ type: 'CHAT_MESSAGE', conversationId, content });
    };

    sendDeliveryReceipt = (conversationId: string, messageId: string) => {
        this.send({ type: 'MESSAGE_DELIVERED', conversationId, messageId });
    };

    sendReadReceipt = (conversationId: string) => {
        this.send({ type: 'MESSAGE_READ', conversationId });
    };

    sendCallOffer = (conversationId: string, sdp: any) => {
        this.send({ type: 'CALL_OFFER', conversationId, sdp });
    };

    sendCallAnswer = (conversationId: string, sdp: any) => {
        this.send({ type: 'CALL_ANSWER', conversationId, sdp });
    };

    sendIceCandidate = (conversationId: string, candidate: any) => {
        this.send({ type: 'ICE_CANDIDATE', conversationId, candidate });
    };

    endCall = (conversationId: string) => {
        this.send({ type: 'CALL_ENDED', conversationId });
    };

    rejectCall = (conversationId: string) => {
        this.send({ type: 'CALL_REJECTED', conversationId });
    };

    on = (eventType: WSMessageType, handler: MessageHandler) => {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)!.push(handler);
    };

    off = (eventType: WSMessageType, handler: MessageHandler) => {
        const handlers = this.listeners.get(eventType) || [];
        this.listeners.set(eventType, handlers.filter(h => h !== handler));
    };

    private dispatch = (eventType: WSMessageType, payload: WSPayload) => {
        (this.listeners.get(eventType) || []).forEach(h => h(payload));
    };
}

const chatService = new ChatService();
export default chatService;
