// services/chatService.ts - окончательная версия
import { getChatConnection, invokeChatHubMethod, isChatConnected } from "./signalrService";

// Базовый тип для сообщения
export interface ChatMessage {
  id: number;
  userId: number | null;
  username: string;
  avatarUrl: string;
  message: string;
  timestamp: string;
  isSystemMessage: boolean;
  color: string;
  isModerator?: boolean;
  isStreamer?: boolean;
  isDeleted?: boolean;
}

// Функция для преобразования PascalCase в camelCase
const toCamelCase = (key: string): string => {
  if (!key) return key;
  return key.charAt(0).toLowerCase() + key.slice(1);
};

// Функция для нормализации всех ключей объекта
const normalizeObjectKeys = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(normalizeObjectKeys);
  }
  
  const result: any = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = toCamelCase(key);
      result[camelKey] = normalizeObjectKeys(obj[key]);
    }
  }
  
  return result;
};

// Присоединиться к чату канала
export const joinChannelChat = async (channelId: number): Promise<void> => {
  try {
    await invokeChatHubMethod<void>("JoinChannel", channelId);
    console.log(`✅ Joined chat for channel ${channelId}`);
  } catch (err: any) {
    console.error("❌ Failed to join chat:", err);
    throw err;
  }
};

// Отправить сообщение
export const sendChatMessage = async (channelId: number, message: string): Promise<void> => {
  if (!message.trim()) {
    throw new Error("Message cannot be empty");
  }

  if (!isChatConnected()) {
    throw new Error("Chat is not connected. Please wait...");
  }

  try {
    await invokeChatHubMethod<void>("SendMessage", channelId, message);
  } catch (err: any) {
    console.error("❌ Failed to send message:", err);
    
    if (err.message.includes("connection is not in the 'Connected' State")) {
      throw new Error("Chat connection lost. Try again in a moment.");
    }
    throw err;
  }
};

// Покинуть чат канала
export const leaveChannelChat = async (channelId: number): Promise<void> => {
  try {
    await invokeChatHubMethod<void>("LeaveChannel", channelId);
    console.log(`✅ Left chat for channel ${channelId}`);
  } catch (err) {
    console.error("❌ Failed to leave chat:", err);
  }
};

// Удалить сообщение
export const deleteChatMessage = async (messageId: number): Promise<void> => {
  try {
    await invokeChatHubMethod<void>("DeleteMessage", messageId);
  } catch (err: any) {
    console.error("❌ Failed to delete message:", err);
    throw err;
  }
};

// Глобальный объект для отслеживания подписок
const chatSubscriptions = new Map<string, Set<Function>>();

// Подписаться на новые сообщения
export const onChatMessageReceived = (callback: (message: ChatMessage) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onChatMessageReceived");
    return () => {};
  }
  
  const eventName = "ReceiveMessage";
  
  // Создаем уникальный обработчик
  const handler = (data: any) => {
    console.log("📩 Raw message from server:", data);
    const normalized = normalizeObjectKeys(data) as ChatMessage;
    console.log("📩 Normalized message:", normalized);
    callback(normalized);
  };
  
  // Регистрируем обработчик
  connection.on(eventName, handler);
  
  // Сохраняем для возможности отписки
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`📩 Registered handler for ${eventName}`);
  
  return () => {
    console.log(`📩 Unregistering handler for ${eventName}`);
    connection.off(eventName, handler);
    
    const callbacks = chatSubscriptions.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        chatSubscriptions.delete(eventName);
      }
    }
  };
};

// Подписаться на историю чата
export const onChatHistoryLoaded = (callback: (messages: ChatMessage[]) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onChatHistoryLoaded");
    return () => {};
  }
  
  const eventName = "LoadHistory";
  
  const handler = (messages: any[]) => {
    console.log("📜 Raw history from server:", messages?.length, "messages");
    const normalized = normalizeObjectKeys(messages) as ChatMessage[];
    console.log("📜 Normalized history:", normalized);
    callback(normalized);
  };
  
  connection.on(eventName, handler);
  
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`📜 Registered handler for ${eventName}`);
  
  return () => {
    console.log(`📜 Unregistering handler for ${eventName}`);
    connection.off(eventName, handler);
    
    const callbacks = chatSubscriptions.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        chatSubscriptions.delete(eventName);
      }
    }
  };
};

// Подписаться на удаление сообщений
export const onMessageDeleted = (callback: (data: { messageId: number, deletedBy: number }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onMessageDeleted");
    return () => {};
  }
  
  const eventName = "MessageDeleted";
  
  const handler = (data: any) => {
    console.log("🗑️ Raw delete data:", data);
    const normalized = normalizeObjectKeys(data);
    callback({
      messageId: normalized.messageId,
      deletedBy: normalized.deletedBy
    });
  };
  
  connection.on(eventName, handler);
  
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`🗑️ Registered handler for ${eventName}`);
  
  return () => {
    console.log(`🗑️ Unregistering handler for ${eventName}`);
    connection.off(eventName, handler);
    
    const callbacks = chatSubscriptions.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        chatSubscriptions.delete(eventName);
      }
    }
  };
};

// Подписаться на ошибки
export const onChatError = (callback: (error: string) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onChatError");
    return () => {};
  }
  
  const eventName = "Error";
  
  connection.on(eventName, callback);
  
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`❌ Registered handler for ${eventName}`);
  
  return () => {
    console.log(`❌ Unregistering handler for ${eventName}`);
    connection.off(eventName, callback);
    
    const callbacks = chatSubscriptions.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        chatSubscriptions.delete(eventName);
      }
    }
  };
};

// Очистить все подписки чата
export const clearChatSubscriptions = () => {
  const connection = getChatConnection();
  if (!connection) return;
  
  console.log("🧹 Clearing all chat subscriptions");
  
  // Очищаем все обработчики из соединения
  for (const [eventName] of chatSubscriptions) {
    connection.off(eventName);
  }
  
  // Очищаем нашу карту подписок
  chatSubscriptions.clear();
};