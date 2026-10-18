jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { markNotificationRead, deleteNotification, clearAllNotifications } from './store';

// Mock the global fetch
global.fetch = jest.fn();

describe('Notification API in store.ts', () => {
    beforeEach(() => {
        (global.fetch as jest.Mock).mockClear();
    });

    it('markNotificationRead calls PATCH with correct headers', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
        
        const result = await markNotificationRead('123', 'fake-token');
        
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/notifications/123/read'), {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer fake-token' }
        });
        expect(result).toBe(true);
    });

    it('deleteNotification calls DELETE with correct headers', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
        
        const result = await deleteNotification('123', 'fake-token');
        
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/notifications/123'), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer fake-token' }
        });
        expect(result).toBe(true);
    });

    it('clearAllNotifications calls DELETE on the main notifications endpoint', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
        
        const result = await clearAllNotifications('fake-token');
        
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/notifications'), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer fake-token' }
        });
        expect(result).toBe(true);
    });
});
