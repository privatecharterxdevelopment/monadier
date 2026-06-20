import React, { createContext, useContext, useState, useCallback } from 'react';
import { ensureArray, loadJsonArrayFromStorage } from '../lib/ensureArray';

export interface Notification {
  id: string;
  type: 'trade_closed' | 'take_profit' | 'stop_loss' | 'info' | 'warning' | 'error' | 'bonus';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: {
    profit?: number;
    pair?: string;
    txHash?: string;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearNotifications: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const rows = loadJsonArrayFromStorage<Record<string, unknown>>('notifications');
    return rows
      .map((row) => {
        if (typeof row.id !== 'string') return null;
        return {
          id: row.id,
          type: row.type as Notification['type'],
          title: String(row.title ?? ''),
          message: String(row.message ?? ''),
          timestamp: new Date(String(row.timestamp ?? Date.now())),
          read: Boolean(row.read),
          data: row.data as Notification['data'],
        } satisfies Notification;
      })
      .filter((n): n is Notification => n != null);
  });

  const saveNotifications = (notifs: Notification[]) => {
    localStorage.setItem('notifications', JSON.stringify(notifs.slice(0, 50)));
  };

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date(),
      read: false,
    };
    setNotifications((prev) => {
      const updated = [newNotification, ...ensureArray(prev)].slice(0, 50);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = ensureArray(prev).map((n) => (n.id === id ? { ...n, read: true } : n));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = ensureArray(prev).map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    localStorage.removeItem('notifications');
  }, []);

  const unreadCount = ensureArray(notifications).filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
