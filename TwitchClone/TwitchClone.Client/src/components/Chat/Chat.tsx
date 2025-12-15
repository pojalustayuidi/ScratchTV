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
  type ChatMessage
} from "../../services/chatService";
import "./Chat.css";
import { startChatConnection } from "../../services/signalrService";

interface ChatProps {
  channelId: number;
  channelName: string;
  isStreamer: boolean;
}

// Локальный тип для сообщения с Date
interface ChatMessageWithDate extends Omit<ChatMessage, 'timestamp'> {
  timestamp: Date;
}

export default function Chat({ channelId, channelName, isStreamer }: ChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageWithDate[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [usersTyping, setUsersTyping] = useState<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Функция для парсинга timestamp
  const parseTimestamp = (timestamp: string): Date => {
    if (!timestamp) return new Date();
    
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
      
      // Пробуем без Z в конце
      const date2 = new Date(timestamp.replace('Z', ''));
      if (!isNaN(date2.getTime())) {
        return date2;
      }
      
      console.warn(`⚠️ Could not parse timestamp: ${timestamp}, using current date`);
      return new Date();
    } catch {
      console.warn(`⚠️ Error parsing timestamp: ${timestamp}, using current date`);
      return new Date();
    }
  };

  // Функция для преобразования ChatMessage в ChatMessageWithDate
  const toChatMessageWithDate = (message: ChatMessage): ChatMessageWithDate => ({
    ...message,
    timestamp: parseTimestamp(message.timestamp)
  });

  // Прокрутка к последнему сообщению
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Инициализация чата
  useEffect(() => {
    let mounted = true;
    
    const initializeChat = async () => {
      try {
        console.log(`🔗 Initializing chat for channel ${channelId}`);
        
        // Подключаемся к чату
        const connection = await startChatConnection();
        if (!connection) {
          throw new Error("Failed to connect to chat server");
        }
        
        setIsConnected(true);
        
        // Присоединяемся к каналу
        await joinChannelChat(channelId);
        console.log(`✅ Successfully joined chat for channel ${channelId}`);
        
        // Подписываемся на события с преобразованием типов
        const unsubscribeMessage = onChatMessageReceived((message: ChatMessage) => {
          console.log("📩 New chat message received:", message);
          if (mounted) {
            const msgWithDate = toChatMessageWithDate(message);
            
            // Проверяем на дубликаты
            setMessages(prev => {
              const isDuplicate = prev.some(m => m.id === msgWithDate.id);
              if (isDuplicate) {
                console.warn("⚠️ Duplicate message detected:", msgWithDate.id);
                return prev;
              }
              return [...prev, msgWithDate];
            });
            
            setTimeout(scrollToBottom, 100);
          }
        });
        
        const unsubscribeHistory = onChatHistoryLoaded((history: ChatMessage[]) => {
          console.log("📜 Chat history loaded:", history.length, "messages");
          if (mounted) {
            const formattedHistory = history.map(toChatMessageWithDate);
            setMessages(formattedHistory);
            setTimeout(scrollToBottom, 200);
          }
        });
        
        const unsubscribeDeleted = onMessageDeleted(({ messageId }) => {
          console.log(`🗑️ Message deleted: ${messageId}`);
          if (mounted) {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === messageId 
                  ? { ...msg, isDeleted: true, message: "Сообщение удалено" } 
                  : msg
              )
            );
          }
        });
        
        const unsubscribeError = onChatError((errorMsg: string) => {
          console.error("❌ Chat error:", errorMsg);
          if (mounted) {
            setError(errorMsg);
            setTimeout(() => setError(""), 5000);
          }
        });
        
        // Очистка при размонтировании
        return () => {
          console.log(`🗑️ Cleaning up chat for channel ${channelId}`);
          mounted = false;
          unsubscribeMessage();
          unsubscribeHistory();
          unsubscribeDeleted();
          unsubscribeError();
          clearChatSubscriptions();
          leaveChannelChat(channelId).catch(console.error);
        };
      } catch (err: any) {
        console.error("❌ Chat initialization error:", err);
        setError(err.message || "Не удалось подключиться к чату");
        setIsConnected(false);
      }
    };
    
    initializeChat();
    
    return () => {
      mounted = false;
    };
  }, [channelId, scrollToBottom]);

  // Автопрокрутка при новых сообщениях
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Очистка таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Отправка сообщения
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    try {
      await sendChatMessage(channelId, input);
      setInput("");
      setUsersTyping([]);
    } catch (err: any) {
      setError(err.message || "Не удалось отправить сообщение");
      setTimeout(() => setError(""), 5000);
    }
  };

  // Обработка нажатия Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Индикатор набора сообщения
  const handleTyping = () => {
    const username = user?.username || "";
    
    setUsersTyping(prev => {
      if (!prev.includes(username)) {
        return [...prev, username];
      }
      return prev;
    });
    
    // Очищаем предыдущий таймаут
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Устанавливаем новый таймаут
    typingTimeoutRef.current = window.setTimeout(() => {
      setUsersTyping(prev => prev.filter(u => u !== username));
    }, 3000);
  };

  // Безопасное форматирование времени
  const formatTime = (date: Date) => {
    try {
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "--:--";
      }
      return date.toLocaleTimeString([], { 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    } catch {
      return "--:--";
    }
  };

  // Безопасное форматирование даты
  const formatDate = (date: Date) => {
    try {
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Дата неизвестна";
      }
      
      const msgDate = new Date(date);
      const today = new Date();
      
      // Сбрасываем время для сравнения только дат
      msgDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (msgDate.getTime() === today.getTime()) {
        return "Сегодня";
      }
      
      if (msgDate.getTime() === yesterday.getTime()) {
        return "Вчера";
      }
      
      return msgDate.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long"
      });
    } catch {
      return "Дата неизвестна";
    }
  };

  // Группировка сообщений по дате
  const groupedMessages = messages.reduce((groups: Record<string, ChatMessageWithDate[]>, message) => {
    try {
      const dateKey = new Date(message.timestamp).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
      return groups;
    } catch {
      const dateKey = "unknown";
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
      return groups;
    }
  }, {});

  return (
   <div className="chat-container">
  {/* Заголовок чата */}
  <div className="chat-header">
    <div className="header-left">
      <div className="channel-info">
        <span className="channel-icon">💬</span>
        <h3 className="channel-name">{channelName}</h3>
      </div>
      <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
        <div className="status-pulse"></div>
        <span className="status-text">
          {isConnected ? "Чат подключен" : "Чат отключен"}
        </span>
      </div>
    </div>
    
    {!isConnected && (
      <button 
        onClick={() => window.location.reload()}
        className="reconnect-btn twitch-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M23 4V10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M1 20V14H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M3.51 9C4.01717 7.56678 4.87913 6.2854 6.01547 5.27542C7.1518 4.26543 8.52547 3.55976 10.0083 3.22426C11.4911 2.88875 13.0348 2.93434 14.4952 3.35677C15.9556 3.77921 17.2853 4.56471 18.36 5.64L23 10M1 14L5.64 18.36C6.71475 19.4353 8.04437 20.2208 9.50481 20.6432C10.9652 21.0657 12.5089 21.1112 13.9917 20.7757C15.4745 20.4402 16.8482 19.7346 17.9845 18.7246C19.1209 17.7146 19.9828 16.4332 20.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Переподключиться
      </button>
    )}
  </div>
  
  {/* Ошибка */}
  {error && (
    <div className="chat-error twitch-alert" key="chat-error">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <span>{error}</span>
    </div>
  )}
  
  {/* Индикатор набора */}
  {usersTyping.length > 0 && (
    <div className="typing-indicator twitch-typing" key="typing-indicator">
      <div className="typing-dots">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
      <span className="typing-text">
        {usersTyping.join(", ")} {usersTyping.length === 1 ? "печатает..." : "печатают..."}
      </span>
    </div>
  )}
  
  {/* Сообщения */}
  <div className="chat-messages twitch-messages" ref={chatContainerRef}>
    {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
      <div key={`date-group-${dateKey}`}>
        {dateKey !== "unknown" && (
          <div className="date-divider twitch-divider" key={`divider-${dateKey}`}>
            <span className="divider-line"></span>
            <span className="divider-text">{formatDate(new Date(dateKey))}</span>
            <span className="divider-line"></span>
          </div>
        )}
        {dateMessages.map((msg: ChatMessageWithDate) => {
          const isValidDate = msg.timestamp instanceof Date && !isNaN(msg.timestamp.getTime());
          const isOwnMessage = msg.userId === user?.id;
          
          return (
            <div
              key={`message-${msg.id}`}
              className={`message twitch-message ${
                msg.isSystemMessage ? "system" : ""
              } ${
                msg.isDeleted ? "deleted" : ""
              } ${
                isOwnMessage ? "own" : ""
              }`}
            >
              {!msg.isSystemMessage && (
                <div className="message-header">
                  <div className="avatar-container">
                    <img
                      src={msg.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.username}&backgroundColor=9146ff`}
                      alt={msg.username}
                      className="message-avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.username}&backgroundColor=9146ff`;
                      }}
                    />
                    {isOwnMessage && <div className="own-indicator"></div>}
                  </div>
                  <div className="message-user-info">
                    <div className="username-row">
                      <span 
                        className="username"
                        style={{ color: msg.color || '#9146FF' }}
                      >
                        {msg.username}
                      </span>
                      <div className="user-badges">
                        {msg.isStreamer && (
                          <span className="badge streamer-badge" title="Стример">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#9146FF">
                              <path d="M21 3H3C1.9 3 1 3.9 1 5V17C1 18.1 1.9 19 3 19H8V21H16V19H21C22.1 19 23 18.1 23 17V5C23 3.9 22.1 3 21 3ZM21 17H3V5H21V17Z"/>
                            </svg>
                          </span>
                        )}
                        {msg.isModerator && (
                          <span className="badge mod-badge" title="Модератор">
                            MOD
                          </span>
                        )}
                        {isOwnMessage && (
                          <span className="badge you-badge" title="Вы">
                            Вы
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="message-time">
                      {isValidDate ? formatTime(msg.timestamp) : "--:--"}
                    </span>
                  </div>
                </div>
              )}
              <div className="message-content-wrapper">
                {msg.isSystemMessage ? (
                  <div className="system-message-content">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="system-icon">
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span className="system-message-text">{msg.message}</span>
                  </div>
                ) : msg.isDeleted ? (
                  <div className="deleted-message-content">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="deleted-icon">
                      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span className="deleted-message-text">
                      Сообщение удалено
                    </span>
                  </div>
                ) : (
                  <span className="message-text">{msg.message}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    ))}
    
    {messages.length === 0 && (
      <div className="no-messages twitch-empty" key="no-messages">
        <div className="empty-icon">💬</div>
        <p className="empty-title">Здесь пока нет сообщений</p>
        <p className="empty-subtitle">Начните общение первым!</p>
      </div>
    )}
    
    <div ref={messagesEndRef} key="scroll-anchor" />
  </div>
  
  {/* Форма отправки */}
  <form onSubmit={handleSendMessage} className="chat-input-form twitch-input" key="chat-input-form">
    <div className="input-container">
      <div className="input-border-wrapper">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Отправить сообщение..." : "Чат не подключен"}
          disabled={!isConnected}
          maxLength={500}
          className={`chat-input ${!isConnected ? "disabled" : ""}`}
          autoComplete="off"
          spellCheck="true"
        />
      </div>
      <div className="input-footer">
        <div className="char-counter">
          <span className={`char-count ${input.length > 450 ? "warning" : ""}`}>
            {500 - input.length}
          </span>
        </div>
        <button 
          type="submit" 
          disabled={!input.trim() || !isConnected}
          className={`send-button twitch-send-btn ${
            !input.trim() || !isConnected ? "disabled" : ""
          }`}
          title={!isConnected ? "Чат не подключен" : "Отправить сообщение"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="send-text">Отправить</span>
        </button>
      </div>
    </div>
  </form>
</div>
  );
}