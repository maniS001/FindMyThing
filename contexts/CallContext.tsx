import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import chatService from '../services/chatService';
import { useRouter } from 'expo-router';

export interface ActiveCall {
    conversationId: string;
    otherName: string;
    isInitiator: boolean;
    status: 'connecting' | 'ringing' | 'active' | 'ended' | 'rejected';
    duration: number;
    muted: boolean;
    incomingSdp?: string;
}

interface CallContextType {
    activeCall: ActiveCall | null;
    setActiveCall: (call: ActiveCall | null) => void;
    updateCall: (partial: Partial<ActiveCall>) => void;
    endActiveCall: () => void;
    toggleMute: () => void;
    formatDuration: (seconds: number) => string;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const router = useRouter();
    const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Live call duration timer
    useEffect(() => {
        if (activeCall && activeCall.status === 'active') {
            if (!durationInterval.current) {
                durationInterval.current = setInterval(() => {
                    setActiveCall(prev => prev ? { ...prev, duration: prev.duration + 1 } : null);
                }, 1000);
            }
        } else {
            if (durationInterval.current) {
                clearInterval(durationInterval.current);
                durationInterval.current = null;
            }
        }
        return () => {
            if (durationInterval.current) {
                clearInterval(durationInterval.current);
                durationInterval.current = null;
            }
        };
    }, [activeCall?.status]);

    // Global listener for remote call ended / rejected
    useEffect(() => {
        const handleEnded = (payload: any) => {
            if (activeCall && payload.conversationId === activeCall.conversationId) {
                setActiveCall(prev => prev ? { ...prev, status: 'ended' } : null);
                setTimeout(() => setActiveCall(null), 1500);
            }
        };
        const handleRejected = (payload: any) => {
            if (activeCall && payload.conversationId === activeCall.conversationId) {
                setActiveCall(prev => prev ? { ...prev, status: 'rejected' } : null);
                setTimeout(() => setActiveCall(null), 1500);
            }
        };

        chatService.on('CALL_ENDED', handleEnded);
        chatService.on('CALL_REJECTED', handleRejected);
        return () => {
            chatService.off('CALL_ENDED', handleEnded);
            chatService.off('CALL_REJECTED', handleRejected);
        };
    }, [activeCall?.conversationId]);

    const updateCall = (partial: Partial<ActiveCall>) => {
        setActiveCall(prev => prev ? { ...prev, ...partial } : null);
    };

    const endActiveCall = () => {
        if (activeCall) {
            chatService.endCall(activeCall.conversationId);
            setActiveCall(prev => prev ? { ...prev, status: 'ended' } : null);
            setTimeout(() => setActiveCall(null), 1000);
        }
    };

    const toggleMute = () => {
        setActiveCall(prev => prev ? { ...prev, muted: !prev.muted } : null);
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <CallContext.Provider value={{
            activeCall,
            setActiveCall,
            updateCall,
            endActiveCall,
            toggleMute,
            formatDuration,
        }}>
            {children}
        </CallContext.Provider>
    );
}

export function useCall() {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
}
