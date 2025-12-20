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

import {
  getChannelModerators,
  addChannelModerator,
  removeChannelModerator,
  deleteChatMessage,
  sendChatMessageRest,
  getUserBanInfo,
  getBanMessage,
  isUserBanned,
  checkAndGetBanStatus,
  formatBanMessage,
  type ChannelModerator,
  type BanInfo
} from "../../services/chatModerationService";

import {
  onUserModeratorAdded,
  onUserModeratorRemoved,
  onUserBanned,
  onUserPermissionsUpdated,
  syncUserPermissions,
  onUserUnbanned
} from "../../services/signalrService";

import UserMenu from "./UserMenu";
import "./Chat.css";

interface ChatProps {
  channelId: number;
  channelName: string;
  isStreamer: boolean;
  channelOwnerId: number;
}

interface ChatMessageWithDate extends Omit<ChatMessage, "timestamp"> {
  timestamp: Date;
}

export default function Chat({ channelId, channelName, isStreamer, channelOwnerId }: ChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageWithDate[]>([]);
  const [moderators, setModerators] = useState<ChannelModerator[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [usersTyping, setUsersTyping] = useState<string[]>([]);
  const [isLoadingModerators, setIsLoadingModerators] = useState(false);
  const [currentUserIsModerator, setCurrentUserIsModerator] = useState(false);
  const [isUserCurrentlyBanned, setIsUserCurrentlyBanned] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [isCheckingBan, setIsCheckingBan] = useState(false);
  const [banMessage, setBanMessage] = useState("");
  
  const typingTimeoutRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const banCheckIntervalRef = useRef<number | null>(null);

  const currentUserIsStreamer = isStreamer;

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


  const checkUserBan = useCallback(async () => {
  if (!user) {
    console.log('checkUserBan: Нет пользователя');
    setIsUserCurrentlyBanned(false);
    setBanInfo(null);
    setBanMessage("");
    return;
  }
  
  try {
    setIsCheckingBan(true);
    console.log(`Проверяем бан для userId: ${user.id}, channelId: ${channelId}`);
    
    let isBanned = false;
    let banData: BanInfo | null = null;
    let message = "";
    
    try {
      console.log('1. Используем checkAndGetBanStatus');
      const result = await checkAndGetBanStatus(channelId, user.id);
      console.log('checkAndGetBanStatus результат:', result);
      
      isBanned = result.isBanned;
      banData = result.banInfo;
      message = result.message;
    } catch (error1) {
      console.error('Ошибка в checkAndGetBanStatus:', error1);
      
      try {
        console.log('2. Используем isUserBanned');
        isBanned = await isUserBanned(channelId, user.id);
        console.log('isUserBanned результат:', isBanned);
        
        if (isBanned) {
          console.log('3. Получаем banInfo');
          banData = await getUserBanInfo(channelId, user.id);
          console.log('getUserBanInfo результат:', banData);
          
          if (banData) {
            message = formatBanMessage(banData);
          } else {
            message = "Вы заблокированы в этом чате";
          }
        }
      } catch (error2) {
        console.error('Ошибка в старых функциях:', error2);
      }
    }
    
    console.log(`Итог проверки бана: isBanned=${isBanned}, banInfo=`, banData);
    
    setIsUserCurrentlyBanned(isBanned);
    setBanInfo(banData);
    
    if (isBanned) {
      const finalMessage = message || formatBanMessage(banData) || "Вы заблокированы в этом чате";
      console.log('Устанавливаем сообщение о бане:', finalMessage);
      setBanMessage(finalMessage);
      setError(finalMessage);
    } else {
      console.log('Пользователь не забанен');
      setBanMessage("");
      if (error.includes("") || error.includes("заблокирован") || error.includes("забанен")) {
        setError("");
      }
    }
  } catch (error) {
    console.error('Критическая ошибка проверки бана:', error);
    setError("Ошибка при проверке статуса блокировки");
  } finally {
    setIsCheckingBan(false);
  }
}, [channelId, user, error]);

  const getBanMessageText = useCallback((banData: BanInfo | null): string => {
    return formatBanMessage(banData);
  }, []);


  const updateBanInfo = async () => {
    await checkUserBan();
  };


  const loadModerators = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoadingModerators(true);
      const mods = await getChannelModerators(channelId);
      setModerators(mods);
      
      const isUserModerator = 
        mods.some(m => m.userId === user?.id) || 
        localStorage.getItem(`isModerator_${channelId}`) === 'true';
      
      setCurrentUserIsModerator(isUserModerator);
      
      console.log('Loaded moderators. Current user is moderator:', isUserModerator);
    } catch (error) {
      console.error('Ошибка загрузки модераторов:', error);
    } finally {
      setIsLoadingModerators(false);
    }
  }, [channelId, user]);


  const handleAddModerator = async (username: string) => {
    try {
      await addChannelModerator(channelId, username);
      await loadModerators();
      setError(`${username} назначен модератором`);
      setTimeout(() => setError(""), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка при добавлении модератора');
      setTimeout(() => setError(""), 5000);
    }
  };

  const handleRemoveModerator = async (userId: number) => {
    try {
      await removeChannelModerator(channelId, userId);
      await loadModerators();
      setError('Модератор снят');
      setTimeout(() => setError(""), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка при удалении модератора');
      setTimeout(() => setError(""), 5000);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      await deleteChatMessage(messageId);
      setError('Сообщение удалено');
      setTimeout(() => setError(""), 3000);
    } catch (err: any) {
      setError(err.message || 'Ошибка при удалении сообщения');
      setTimeout(() => setError(""), 5000);
    }
  };


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || !user) {
      if (!user) {
        setError("Войдите, чтобы писать в чат");
        setTimeout(() => setError(""), 3000);
      }
      return;
    }

    if (isUserCurrentlyBanned) {
      const message = banMessage || getBanMessageText(banInfo);
      setError(message);
      setInput("");
      return;
    }

    try {
      await sendChatMessage(channelId, input);
      setInput("");
      setUsersTyping([]);
    } catch (err: any) {
      if (err.message.includes("забанен") || err.message.includes("ban") || 
          err.message.includes("blocked") || err.message.includes("заблокирован")) {
        await checkUserBan();
        setInput("");
      } else {
        console.log('SignalR failed, trying REST...');
        try {
          await sendChatMessageRest(channelId, input);
          setInput("");
          setUsersTyping([]);
        } catch (restError: any) {
          if (restError.message.includes("забанен") || restError.message.includes("ban") || 
              restError.message.includes("blocked") || restError.message.includes("заблокирован")) {
            await checkUserBan();
            setInput("");
          } else {
            setError(restError.message || "Не удалось отправить сообщение");
            setTimeout(() => setError(""), 5000);
          }
        }
      }
    }
  };


  useEffect(() => {
    let mounted = true;
    let unsubscribes: Array<() => void> = [];
    let initialized = false;

    const initializeChat = async () => {
      if (initialized) return;
      initialized = true;

      try {
        const isGuest = !user;
        console.log(`Initializing chat for ${isGuest ? 'guest' : 'user'}: ${user?.username || 'anonymous'}`);

        if (user) {
          await loadModerators();
          await checkUserBan();
        }

        console.log("Chat connection ready");
        setIsConnected(true);

        try {
          await joinChannelChat(channelId);
          console.log(`Joined channel ${channelId}`);
          
          if (user) {
            await syncUserPermissions(channelId);
          }
        } catch (joinError) {
          console.warn("Join channel warning:", joinError);
        }
   const unsubscribeUserUnbanned = onUserUnbanned((data) => {
      if (!mounted) return;
      if (data.channelId === channelId) {
        console.log('User unbanned event:', data);
        
       
        if (data.userId === user?.id) {
          console.log('Current user unbanned, checking status...');
          checkUserBan(); 
        }
      }
    });
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

        const unsubscribeHistory = onChatHistoryLoaded((history: ChatMessage[]) => {
          if (!mounted) return;
          console.log(`Loaded ${history.length} messages`);
          setMessages(history.map(toChatMessageWithDate));
          setTimeout(scrollToBottom, 200);
        });

        const unsubscribeDeleted = onMessageDeleted(({ messageId }) => {
          if (!mounted) return;
          console.log(`Message deleted: ${messageId}`);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, isDeleted: true, message: "Сообщение удалено" }
                : msg
            )
          );
        });

        const unsubscribeError = onChatError((errorMsg: string) => {
          if (!mounted) return;
          console.error("Chat error:", errorMsg);
          
          if (errorMsg.includes("забанен") || errorMsg.includes("ban") || 
              errorMsg.includes("blocked") || errorMsg.includes("заблокирован")) {
            if (user) {
              checkUserBan();
            }
          }
          
          setError(errorMsg);
          setTimeout(() => setError(""), 5000);
        });

        const unsubscribePermissionsUpdated = onUserPermissionsUpdated((data) => {
          if (!mounted) return;
          if (data.channelId === channelId) {
            console.log('User permissions updated:', data);
            
            if (data.userId === user?.id) {
              setCurrentUserIsModerator(data.isModerator);
              
              setMessages(prev => prev.map(msg => 
                msg.userId === user.id 
                  ? { ...msg, isModerator: data.isModerator } 
                  : msg
              ));
              
              if (data.isModerator) {
                localStorage.setItem(`isModerator_${channelId}`, 'true');
                setError('Вы теперь модератор!');
              } else {
                localStorage.removeItem(`isModerator_${channelId}`);
                setError('Вы больше не модератор');
              }
              setTimeout(() => setError(''), 5000);
            }
          }
        });

        const unsubscribeModeratorAdded = onUserModeratorAdded((data) => {
          if (!mounted) return;
          if (data.channelId === channelId) {
            console.log('User became moderator:', data);
            
            setModerators(prev => {
              const alreadyExists = prev.some(m => m.userId === data.userId);
              if (alreadyExists) return prev;
              
              return [...prev, {
                userId: data.userId,
                username: data.username,
                avatarUrl: '',
                addedAt: new Date().toISOString(),
                addedByUsername: user?.username || 'admin'
              }];
            });
            
            if (data.userId === user?.id) {
              setCurrentUserIsModerator(true);
              setError(`Вы назначены модератором!`);
              setTimeout(() => setError(''), 5000);
              
              syncUserPermissions(channelId).catch(console.error);
            }
            
            loadModerators();
          }
        });

        const unsubscribeModeratorRemoved = onUserModeratorRemoved((data) => {
          if (!mounted) return;
          if (data.channelId === channelId) {
            console.log('User removed from moderators:', data);
            
            if (data.userId === user?.id) {
              setCurrentUserIsModerator(false);
              setError('Вы больше не модератор');
              setTimeout(() => setError(''), 5000);
            }
            
            loadModerators();
          }
        });

        const unsubscribeUserBanned = onUserBanned((data) => {
          if (!mounted) return;
          if (data.channelId === channelId) {
            console.log('User banned:', data);
            
            if (data.userId === user?.id) {
              checkUserBan();
            }
          }
        });

        unsubscribes = [
          unsubscribeMessage,
          unsubscribeHistory,
          unsubscribeDeleted,
          unsubscribeError,
          unsubscribePermissionsUpdated,
          unsubscribeModeratorAdded,
          unsubscribeModeratorRemoved,
          unsubscribeUserBanned,
          unsubscribeUserUnbanned
        ];

      } catch (err: any) {
        console.error("Chat initialization error:", err);
        
        if (!user) {
          setIsConnected(true);
          setError("Режим просмотра. Войдите, чтобы писать в чат.");
        } else {
          setError(err.message || "Не удалось подключиться к чату");
          setIsConnected(false);
        }
      }
    };

    const initTimer = setTimeout(() => {
      initializeChat();
    }, 100);

    return () => {
      mounted = false;
      initialized = false;
      clearTimeout(initTimer);
      
      unsubscribes.forEach(unsub => unsub());
      clearChatSubscriptions();
      
      if (user) {
        leaveChannelChat(channelId).catch(console.error);
      }
      
      if (banCheckIntervalRef.current) {
        clearInterval(banCheckIntervalRef.current);
        banCheckIntervalRef.current = null;
      }
    };
  }, [channelId, scrollToBottom, user, isStreamer, loadModerators, checkUserBan]);


  useEffect(() => {
    if (!user || !channelId) return;
    
    const checkStatuses = async () => {
      try {
        const { checkUserIsModerator } = await import('../../services/chatModerationService');
        const isMod = await checkUserIsModerator(channelId);
        
        if (isMod !== currentUserIsModerator) {
          console.log('Moderator status changed (periodic check), reloading...');
          loadModerators();
        }
        
        if (isUserCurrentlyBanned) {
          await checkUserBan();
        }
      } catch (error) {
        console.error('Error checking statuses:', error);
      }
    };

    const intervalId = setInterval(checkStatuses, 30000);
    
    return () => clearInterval(intervalId);
  }, [user, channelId, currentUserIsModerator, loadModerators, isUserCurrentlyBanned, checkUserBan]);


  useEffect(() => {
    if (!isUserCurrentlyBanned) return;
    
    if (banCheckIntervalRef.current) {
      clearInterval(banCheckIntervalRef.current);
    }
    
    banCheckIntervalRef.current = window.setInterval(async () => {
      await checkUserBan();
    }, 60000);
    
    return () => {
      if (banCheckIntervalRef.current) {
        clearInterval(banCheckIntervalRef.current);
        banCheckIntervalRef.current = null;
      }
    };
  }, [isUserCurrentlyBanned, checkUserBan]);


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

 
  const getTimeRemaining = () => {
    if (!banInfo?.expiresAt || banInfo.isPermanent) return null;
    
    const expiresAt = new Date(banInfo.expiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Бан истек";
    
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      return `${diffDays} д. ${remainingHours} ч.`;
    } else {
      return `${diffHours} ч.`;
    }
  };

  return (
    <div className="chat-container">
      {}
      <div className="chat-header">
        <div className="header-left">
          <div className="channel-info">
            <span className="channel-icon"></span>
            <h3 className="channel-name">{channelName}</h3>
            {currentUserIsStreamer && (
              <span className="streamer-badge" title="Вы владелец канала">
                Владелец
              </span>
            )}
            {currentUserIsModerator && !currentUserIsStreamer && (
              <span className="moderator-badge" title="Вы модератор">
                Модератор
              </span>
            )}
            {!user && (
              <span className="guest-badge" title="Гостевой режим - только просмотр">
                Только просмотр
              </span>
            )}
            {isUserCurrentlyBanned && (
              <span className="banned-badge" title="Вы забанены в этом чате">
               Забанен
              </span>
            )}
          </div>
          <div className={`connection-status ${isConnected ? "connected" : "disconnected"}`}>
            <div className="status-pulse"></div>
            <span className="status-text">
              {isConnected 
                ? user 
                  ? isUserCurrentlyBanned ? "Чат подключен (только просмотр)" : "Чат подключен"
                  : "Чат подключен (только просмотр)"
                : "Чат отключен"}
            </span>
          </div>
        </div>
        {!isConnected && (
          <button onClick={() => window.location.reload()} className="reconnect-btn">
            Переподключиться
          </button>
        )}
      </div>

      {}
      {isUserCurrentlyBanned && (
        <div className="chat-error banned-error">
          <div className="ban-message-header">
            <span className="ban-icon"></span>
            <strong>Вы заблокированы в этом чате</strong>
          </div>
          
          <div className="ban-message-details">
            <div className="ban-message-text">
              Вы заблокированы в этом чате до {banInfo?.expiresAt ? 
                new Date(banInfo.expiresAt).toLocaleDateString('ru-RU', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                }) + ' в ' + new Date(banInfo.expiresAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '...'}
              {banInfo?.reason && ` (Причина: ${banInfo.reason})`}
            </div>
            
            {banInfo && (
              <div className="ban-details-grid">
                {}
                {banInfo.reason && (
                  <div className="ban-detail-item">
                    <span className="ban-detail-label">Причина</span>
                    <span className="ban-detail-value highlight">{banInfo.reason}</span>
                  </div>
                )}
                
                {}
                {banInfo.expiresAt && !banInfo.isPermanent && (
                  <div className="ban-detail-item">
                    <span className="ban-detail-label">Дата разбана</span>
                    <span className="ban-detail-value">
                      {new Date(banInfo.expiresAt).toLocaleDateString('ru-RU', { 
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}, {new Date(banInfo.expiresAt).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
                
                {}
                {banInfo.isPermanent ? (
                  <div className="ban-detail-item">
                    <span className="ban-detail-label">Тип блокировки</span>
                    <span className="ban-detail-value highlight">Навсегда</span>
                  </div>
                ) : (
                  <div className="ban-detail-item">
                    <span className="ban-detail-label">Тип блокировки</span>
                    <span className="ban-detail-value">Временная</span>
                  </div>
                )}
                
                {}
                {banInfo.bannedByUsername && (
                  <div className="ban-detail-item">
                    <span className="ban-detail-label">Заблокировал</span>
                    <span className="ban-detail-value">{banInfo.bannedByUsername}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Блок с оставшимся временем и кнопкой обновления */}
            <div className="ban-countdown">
              <div className="time-remaining">
                <span className="time-remaining-label">Осталось</span>
                <span className="time-remaining-value">
                  {getTimeRemaining() || (banInfo?.isPermanent ? '∞' : '...')}
                </span>
              </div>
              
              <button 
                onClick={updateBanInfo}
                className="refresh-ban-btn"
                disabled={isCheckingBan}
                title="Обновить статус блокировки"
              >
                {isCheckingBan ? (
                  <>
                    <span className="spinner"></span>
                    Обновление...
                  </>
                ) : (
                  <>
                    Обновить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ОБЫЧНЫЕ СООБЩЕНИЯ ОБ ОШИБКАХ ========== */}
      {error && !isUserCurrentlyBanned && !error.includes("🚫") && (
        <div className="chat-error">
          {error}
        </div>
      )}

      {/* ========== ИНДИКАТОР НАБОРА ТЕКСТА ========== */}
      {usersTyping.length > 0 && (
        <div className="typing-indicator">
          <span>
            {usersTyping.join(", ")} {usersTyping.length === 1 ? "печатает..." : "печатают..."}
          </span>
        </div>
      )}

      {/* ========== ОБЛАСТЬ СООБЩЕНИЙ ========== */}
      <div className="chat-messages">
        {Object.entries(groupedMessages).map(([dateKey, dateMessages]) => (
          <div key={`date-group-${dateKey}`}>
            {dateKey !== "unknown" && (
              <div className="date-divider">
                <span className="divider-text">{formatDate(new Date(dateKey))}</span>
              </div>
            )}
            {dateMessages.map((msg: ChatMessageWithDate) => {
              const isOwnMessage = msg.userId === user?.id;
              const messageIsModerator = Boolean(
                msg.isModerator || 
                (msg.userId === user?.id ? currentUserIsModerator : false) ||
                moderators.some(m => m.userId === msg.userId && m.userId !== channelOwnerId)
              );
              
              return (
                <div
                  key={`message-${msg.id}`}
                  className={`message ${msg.isSystemMessage ? "system" : ""} ${
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
                          {msg.isStreamer && <span className="role-badge streamer-badge">👑</span>}
                          {messageIsModerator && !msg.isStreamer && <span className="role-badge moderator-badge">🛡️</span>}
                        </span>
                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                      </div>
                      
                      <UserMenu
                        messageUserId={msg.userId || 0}
                        messageUsername={msg.username}
                        isModerator={messageIsModerator || false}
                        isStreamer={msg.isStreamer || false}
                        channelId={channelId}
                        channelOwnerId={channelOwnerId}
                        currentUserIsStreamer={currentUserIsStreamer}
                        currentUserIsModerator={currentUserIsModerator}
                        onMessageDelete={handleDeleteMessage}
                        messageId={msg.id}
                        onAddModerator={handleAddModerator}
                        onRemoveModerator={handleRemoveModerator}
                      />
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
        {messages.length === 0 && <div className="no-messages">Здесь пока нет сообщений</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* ========== ПОЛЕ ВВОДА ========== */}
      <form onSubmit={handleSendMessage} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (user && !isUserCurrentlyBanned) handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            !user ? "Войдите, чтобы писать в чат" :
            isUserCurrentlyBanned ? "Вы забанены в этом чате" :
            "Отправить сообщение..."
          }
          disabled={!user || !isConnected || isUserCurrentlyBanned}
          maxLength={500}
          title={
            !user ? "Гостям запрещено писать в чат" :
            isUserCurrentlyBanned ? "Вы забанены в этом чате" :
            ""
          }
        />
        <button 
          type="submit" 
          disabled={!input.trim() || !user || !isConnected || isUserCurrentlyBanned}
          title={
            !user ? "Требуется авторизация" :
            isUserCurrentlyBanned ? "Вы забанены в этом чате" :
            ""
          }
        >
          Отправить
        </button>
      </form>
    </div>
  );
}