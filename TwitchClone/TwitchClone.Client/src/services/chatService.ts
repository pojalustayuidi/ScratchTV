// services/chatService.ts
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
const toCamelCase = (key: string) => key.charAt(0).toLowerCase() + key.slice(1);

// Функция для нормализации всех ключей объекта
const normalizeObjectKeys = (obj: any): any => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeObjectKeys);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toCamelCase(k), normalizeObjectKeys(v)])
  );
};

// Присоединиться к чату канала
export const joinChannelChat = async (channelId: number): Promise<void> => {
  try {
    await invokeChatHubMethod<void>("JoinChannel", channelId);
    console.log(`✅ Joined chat for channel ${channelId}`);
  } catch (err: any) {
    console.warn(`⚠️ Join channel warning: ${err.message}`);
    // Для гостей это нормально, продолжаем в режиме просмотра
    throw err;
  }
};

// Отправить сообщение
export const sendChatMessage = async (channelId: number, message: string): Promise<void> => {
  if (!message.trim()) throw new Error("Сообщение не может быть пустым");
  if (!isChatConnected()) throw new Error("Чат не подключен");
  
  try {
    await invokeChatHubMethod<void>("SendMessage", channelId, message);
  } catch (err: any) {
    if (err.message.includes("Гостям запрещено") || err.message.includes("гостевом режиме")) {
      throw new Error("Войдите, чтобы писать в чат");
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
    try {
      console.log("📩 Raw message from server:", data);
      const normalized = normalizeObjectKeys(data) as ChatMessage;
      console.log("📩 Normalized message:", normalized);
      callback(normalized);
    } catch (error) {
      console.error("Error processing message:", error);
    }
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
    try {
      console.log("📜 Raw history from server:", messages?.length, "messages");
      const normalized = normalizeObjectKeys(messages) as ChatMessage[];
      console.log("📜 Normalized history:", normalized);
      callback(normalized);
    } catch (error) {
      console.error("Error processing history:", error);
    }
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
    try {
      console.log("🗑️ Raw delete data:", data);
      const normalized = normalizeObjectKeys(data);
      callback({
        messageId: normalized.messageId,
        deletedBy: normalized.deletedBy
      });
    } catch (error) {
      console.error("Error processing delete:", error);
    }
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

// Подписаться на системные сообщения
export const onSystemMessage = (callback: (message: string) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onSystemMessage");
    return () => {};
  }
  
  const eventName = "SystemMessage";
  
  connection.on(eventName, callback);
  
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`📢 Registered handler for ${eventName}`);
  
  return () => {
    console.log(`📢 Unregistering handler for ${eventName}`);
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

// Подписаться на информацию о подключении пользователей
export const onUserJoined = (callback: (username: string) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("⚠️ No chat connection for onUserJoined");
    return () => {};
  }
  
  const eventName = "UserJoined";
  
  connection.on(eventName, callback);
  
  if (!chatSubscriptions.has(eventName)) {
    chatSubscriptions.set(eventName, new Set());
  }
  chatSubscriptions.get(eventName)!.add(callback);
  
  console.log(`👤 Registered handler for ${eventName}`);
  
  return () => {
    console.log(`👤 Unregistering handler for ${eventName}`);
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

// Вспомогательная функция для проверки состояния чата
export const checkChatStatus = (): {
  isConnected: boolean;
  isAuthenticated: boolean;
  canSendMessages: boolean;
} => {
  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;
  const isConnected = isChatConnected();
  
  return {
    isConnected,
    isAuthenticated,
    canSendMessages: isAuthenticated && isConnected
  };
};