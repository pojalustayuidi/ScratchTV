// components/Chat/Chat.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";

import {
  joinChannelChat,
  sendChatMessage,
  leaveChannelChat,
  onChatMessageReceived,
  onChatHistoryLoaded,
  onMessageDeleted,
  onChatError,
  clearChatSubscriptions,
  type ChatMessage,
} from "../../services/chatService";
import "./Chat.css";
import { startChatConnection, getChatConnection } from "../../services/signalrService";

interface ChatProps {
  channelId: number;
  channelName: string;
  isStreamer: boolean;
}

interface ChatMessageWithDate extends Omit<ChatMessage, "timestamp"> {
  timestamp: Date;
}

// Функция ожидания состояния Connected
const waitForConnection = async (timeout = 5000): Promise<void> => {
  const connection = getChatConnection();
  if (!connection) throw new Error("Chat connection not established");

  if (connection.state === "Connected") return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.off("reconnected", onConnected);
      reject(new Error("Connection timeout"));
    }, timeout);

    const onConnected = () => {
      clearTimeout(timer);
      connection.off("reconnected", onConnected);
      resolve();
    };

    connection.onreconnected(onConnected);
  });
};

export default function Chat({ channelId, channelName, isStreamer }: ChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageWithDate[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [usersTyping, setUsersTyping] = useState<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const parseTimestamp = (timestamp: string): Date => {
    if (!timestamp) return new Date();
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) return date;
      return new Date(timestamp.replace("Z", ""));
    } catch {
      return new Date();
    }
  };

  const toChatMessageWithDate = (message: ChatMessage): ChatMessageWithDate => ({
    ...message,
    timestamp: parseTimestamp(message.timestamp),
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

 
useEffect(() => {
  let mounted = true;
  let unsubscribes: Array<() => void> = [];
  let initialized = false;

  const initializeChat = async () => {
    // Предотвращаем множественную инициализацию
    if (initialized) return;
    initialized = true;

    try {
      // Определяем режим подключения
      const isGuest = !user;
      console.log(`🚀 Initializing chat for ${isGuest ? 'guest' : 'user'}: ${user?.username || 'anonymous'}`);

      // Подключаемся к чату
      const connection = await startChatConnection(isGuest);
      
      if (!connection) {
        // Для гостей - режим только для просмотра
        if (isGuest) {
          console.log("👁️ Guest mode: chat view only");
          setIsConnected(true);
          setError("Чат доступен только для просмотра. Войдите, чтобы писать.");
          return;
        } else {
          throw new Error("Не удалось подключиться к чату");
        }
      }

      console.log("✅ Chat connection ready");
      setIsConnected(true);

      // Присоединяемся к каналу
      try {
        await joinChannelChat(channelId);
        console.log(`✅ Joined channel ${channelId}`);
      } catch (joinError) {
        console.warn("⚠️ Join channel warning:", joinError);
        // Продолжаем в режиме просмотра
      }

      // Подписываемся на новые сообщения
      const unsubscribeMessage = onChatMessageReceived((message: ChatMessage) => {
        if (!mounted) return;
        const msgWithDate = toChatMessageWithDate(message);
        setMessages((prev) => {
          const isDuplicate = prev.some((m) => m.id === msgWithDate.id);
          if (isDuplicate) return prev;
          return [...prev, msgWithDate];
        });
        setTimeout(scrollToBottom, 100);
      });

      // Подписываемся на историю чата
      const unsubscribeHistory = onChatHistoryLoaded((history: ChatMessage[]) => {
        if (!mounted) return;
        console.log(`📜 Loaded ${history.length} messages`);
        setMessages(history.map(toChatMessageWithDate));
        setTimeout(scrollToBottom, 200);
      });

      // Подписываемся на удаление сообщений
      const unsubscribeDeleted = onMessageDeleted(({ messageId }) => {
        if (!mounted) return;
        console.log(`🗑️ Message deleted: ${messageId}`);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, isDeleted: true, message: "Сообщение удалено" }
              : msg
          )
        );
      });

      // Подписываемся на ошибки
      const unsubscribeError = onChatError((errorMsg: string) => {
        if (!mounted) return;
        console.error("❌ Chat error:", errorMsg);
        setError(errorMsg);
        setTimeout(() => setError(""), 5000);
      });

      unsubscribes = [
        unsubscribeMessage,
        unsubscribeHistory,
        unsubscribeDeleted,
        unsubscribeError
      ];

    } catch (err: any) {
      console.error("❌ Chat initialization error:", err);
      
      if (!user) {
        // Гости видят чат в режиме чтения даже при ошибке подключения
        setIsConnected(true);
        setError("Режим просмотра. Войдите, чтобы писать в чат.");
      } else {
        setError(err.message || "Не удалось подключиться к чату");
        setIsConnected(false);
      }
    }
  };

  // Запускаем инициализацию с небольшой задержкой
  const initTimer = setTimeout(() => {
    initializeChat();
  }, 100);

  return () => {
    mounted = false;
    initialized = false;
    clearTimeout(initTimer);
    
    // Очищаем все подписки
    unsubscribes.forEach(unsub => unsub());
    clearChatSubscriptions();
    
    // Покидаем канал только для авторизованных пользователей
    if (user) {
      leaveChannelChat(channelId).catch(console.error);
    }
  };
}, [channelId, scrollToBottom, user]);

  useEffect(() => scrollToBottom(), [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user) {
      if (!user) {
        setError("Войдите, чтобы писать в чат");
        setTimeout(() => setError(""), 3000);
      }
      return;
    }

    try {
      await sendChatMessage(channelId, input);
      setInput("");
      setUsersTyping([]);
    } catch (err: any) {
      setError(err.message || "Не удалось отправить сообщение");
      setTimeout(() => setError(""), 5000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleTyping = () => {
    if (!user) return;
    const username = user.username;
    setUsersTyping((prev) => (prev.includes(username) ? prev : [...prev, username]));
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      setUsersTyping((prev) => prev.filter((u) => u !== username));
    }, 3000);
  };

  const formatTime = (date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    try {
      const msgDate = new Date(date);
      const today = new Date();
      msgDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (msgDate.getTime() === today.getTime()) return "Сегодня";
      if (msgDate.getTime() === yesterday.getTime()) return "Вчера";
      return msgDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    } catch {
      return "Дата неизвестна";
    }
  };

  const groupedMessages = messages.reduce((groups: Record<string, ChatMessageWithDate[]>, message) => {
    const dateKey = new Date(message.timestamp).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(message);
    return groups;
  }, {});

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-left">
          <div className="channel-info">
            <span className="channel-icon">💬</span>
            <h3 className="channel-name">{channelName}</h3>
            {!user && (
              <span className="guest-badge" title="Гостевой режим - только просмотр">
                👁️ Только просмотр
              </span>
            )}
          </div>
          <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
            <div className="status-pulse"></div>
            <span className="status-text">
              {isConnected 
                ? user 
                  ? "Чат подключен" 
                  : "Чат подключен (только просмотр)"
                : "Чат отключен"}
            </span>
          </div>
        </div>
        {!isConnected && (
          <button onClick={() => window.location.reload()} className="reconnect-btn twitch-btn">
            Переподключиться
          </button>
        )}
      </div>

      {error && <div className="chat-error twitch-alert">{error}</div>}

      {usersTyping.length > 0 && (
        <div className="typing-indicator twitch-typing">
          <span>
            {usersTyping.join(", ")} {usersTyping.length === 1 ? "печатает..." : "печатают..."}
          </span>
        </div>
      )}

      <div className="chat-messages twitch-messages">
        {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
          <div key={`date-group-${dateKey}`}>
            {dateKey !== "unknown" && (
              <div className="date-divider twitch-divider">
                <span className="divider-text">{formatDate(new Date(dateKey))}</span>
              </div>
            )}
            {dateMessages.map((msg: ChatMessageWithDate) => {
              const isOwnMessage = msg.userId === user?.id;
              return (
                <div
                  key={`message-${msg.id}`}
                  className={`message twitch-message ${msg.isSystemMessage ? "system" : ""} ${
                    msg.isDeleted ? "deleted" : ""
                  } ${isOwnMessage ? "own" : ""}`}
                >
                  {!msg.isSystemMessage && (
                    <div className="message-header">
                      <img
                        src={
                          msg.avatarUrl ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.username}&backgroundColor=9146ff`
                        }
                        alt={msg.username}
                        className="message-avatar"
                      />
                      <div className="message-user-info">
                        <span className="username" style={{ color: msg.color || "#9146FF" }}>
                          {msg.username}
                        </span>
                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                      </div>
                    </div>
                  )}
                  <div className="message-content-wrapper">
                    {msg.isSystemMessage ? (
                      <span className="system-message-text">{msg.message}</span>
                    ) : msg.isDeleted ? (
                      <span className="deleted-message-text">Сообщение удалено</span>
                    ) : (
                      <span className="message-text">{msg.message}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {messages.length === 0 && <div className="no-messages twitch-empty">Здесь пока нет сообщений</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="chat-input-form twitch-input">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (user) handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={user ? "Отправить сообщение..." : "Войдите, чтобы писать в чат"}
          disabled={!user || !isConnected}
          maxLength={500}
          title={!user ? "Гостям запрещено писать в чат" : ""}
        />
        <button 
          type="submit" 
          disabled={!input.trim() || !user || !isConnected}
          title={!user ? "Требуется авторизация" : ""}
        >
          Отправить
        </button>
      </form>
    </div>
  );
}