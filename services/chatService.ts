import { WS_URL } from '../constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WSMessageType =
    | 'AUTH'
    | 'AUTH_OK'
    | 'CHAT_MESSAGE'
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
    sdp?: any;
    candidate?: any;
    callRequestId?: string;
    error?: string;
}

type MessageHandler = (payload: WSPayload) => void;

class ChatService {
    private ws: WebSocket | null = null;
    private listeners: Map<string, MessageHandler[]> = new Map();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isConnected = false;
    private pendingQueue: WSPayload[] = [];

    connect = async () => {
        try {
            const token = await AsyncStorage.getItem('token');
            if (!token || this.ws?.readyState === WebSocket.OPEN) return;

            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                this.isConnected = true;
                if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
                // Authenticate immediately
                this.rawSend({ type: 'AUTH', token: token! });
                // Flush queued messages
                this.pendingQueue.forEach(m => this.rawSend(m));
                this.pendingQueue = [];
                console.log('[ChatService] WebSocket connected');
            };

            this.ws.onmessage = (e) => {
                try {
                    const payload: WSPayload = JSON.parse(e.data);
                    this.dispatch(payload.type, payload);
                } catch (err) {
                    console.error('[ChatService] parse error', err);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                console.log('[ChatService] WebSocket closed. Reconnecting in 3s...');
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
        if (this.isConnected) {
            this.rawSend(payload);
        } else {
            this.pendingQueue.push(payload);
        }
    };

    sendMessage = (conversationId: string, content: string) => {
        this.send({ type: 'CHAT_MESSAGE', conversationId, content });
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

// Singleton export
const chatService = new ChatService();
export default chatService;
