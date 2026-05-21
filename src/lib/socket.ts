import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './auth';

interface NewMessagePayload {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  user_id: string;
  content: string;
  created_at: string;
}

interface TypingPayload {
  userId: string;
  channelId: string | null;
  conversationId: string | null;
  isTyping: boolean;
}

export type { NewMessagePayload, TypingPayload };

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket?.connected) return socket;

  // Disconnect stale socket if it exists
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
  const token = getAccessToken();

  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
