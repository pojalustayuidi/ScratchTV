import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getChannelByNickname, type ChannelData } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import { checkSubscription, subscribe, unsubscribe } from "../../api/subscription";

import ChannelNotFound from "./ChannelNotFound";
import StreamSettingsModal from "../../components/Modal/StreamSettingsModal";
import Chat from "../../components/Chat/Chat";

import "./Channel.css";
import StreamerVideo from "../../components/Modal/StreamerVideo";
import ViewerVideo from "../../components/Modal/ViewerVideo";
import { 
  startSFUConnection, 
  onViewersCountUpdate, 
  requestViewerCount,
  onStreamStarted,
  onStreamStopped
} from "../../services/socketIOService";
import { startChatConnection } from "../../services/signalrService";

export default function ChannelPage() {
  const { nickname } = useParams<{ nickname: string }>();
  const { user } = useAuth();

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  const [showStreamEndedAlert, setShowStreamEndedAlert] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);
  const [viewersCount, setViewersCount] = useState<number>(0);
  const [isOwner, setIsOwner] = useState(false);

  // Проверяем владельца
  useEffect(() => {
    setIsOwner(user?.username === nickname);
  }, [user, nickname]);

  // Загрузка канала при монтировании
  useEffect(() => {
    if (!nickname) return;
    const loadChannel = async () => {
      setLoading(true);
      try {
        const data = await getChannelByNickname(nickname);
        if (data.success) {
          setChannel(data);
        } else {
          setError(data.message || "Не удалось загрузить канал");
        }
      } catch {
        setError("Ошибка сервера");
      } finally {
        setLoading(false);
      }
    };
    loadChannel();
  }, [nickname]);

  // Проверка подписки
  useEffect(() => {
    if (!channel || !user) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    checkSubscription(channel.id, token)
      .then((r) => setSubscribed(r.subscribed))
      .catch(() => {});
  }, [channel, user]);

  // Подключение Socket.IO / SFU и Chat
  useEffect(() => {
    startSFUConnection();
    startChatConnection();
  }, []);

  // Реальное время: счетчик зрителей и статус стрима
  useEffect(() => {
    if (!channel) return;

    // Подписка на счетчик зрителей
    const unsubscribeViewers = onViewersCountUpdate(channel.id, (count: number) => {
      setViewersCount(count);
      setChannel(prev => prev ? { ...prev, viewers: count } : prev);
    });

    // Обработчики начала/окончания стрима
    const handleStreamStartedCallback = (data: { channelId: number; sessionId: string }) => {
      if (data.channelId !== channel.id) return;
      setChannel(prev => prev ? { ...prev, isLive: true } : prev);
      setStreamSessionId(data.sessionId);
    };

    const handleStreamStoppedCallback = () => {
      setChannel(prev => prev ? { ...prev, isLive: false } : prev);
      setStream(null);
      setStreamSessionId(null);

      if (!isOwner) {
        setShowStreamEndedAlert(true);
        let countdown = 10;
        setRefreshCountdown(countdown);
        const interval = window.setInterval(() => {
          countdown--;
          setRefreshCountdown(countdown);
          if (countdown <= 0) {
            window.clearInterval(interval);
            window.location.reload();
          }
        }, 1000);
      }
    };

    // Подписка
    const unsubscribeStarted = onStreamStarted(handleStreamStartedCallback);
    const unsubscribeStopped = onStreamStopped(handleStreamStoppedCallback);

    // Запрос текущего количества зрителей
    requestViewerCount(channel.id)
      .then(count => {
        setViewersCount(count);
        setChannel(prev => prev ? { ...prev, viewers: count } : prev);
        if (count > 0) setChannel(prev => prev ? { ...prev, isLive: true } : prev);
      })
      .catch(() => {});

    return () => {
      if (unsubscribeViewers) unsubscribeViewers();
      if (unsubscribeStarted) unsubscribeStarted();
      if (unsubscribeStopped) unsubscribeStopped();
    };
  }, [channel?.id, isOwner]);

  // Обработчик подписки
  const handleSubscribe = async () => {
    const token = localStorage.getItem("token");
    if (!token || !channel) return;
    try {
      if (subscribed) {
        await unsubscribe(channel.id, token);
        setSubscribed(false);
      } else {
        await subscribe(channel.id, token);
        setSubscribed(true);
      }
    } catch {}
  };

  // Обработчики стрима стримера
  const handleStartStream = (channelData: ChannelData, stream: MediaStream, sessionId: string) => {
    setStream(stream);
    setStreamSessionId(sessionId);
    setChannel({ ...channelData, isLive: true });
    setIsModalOpen(false);
  };
  
  const handleStreamEnded = () => {
    setStream(null);
    setStreamSessionId(null);
    if (channel) setChannel({ ...channel, isLive: false });
  };

  // Закрытие алерта о завершении стрима
  const closeStreamEndedAlert = () => {
    setShowStreamEndedAlert(false);
    setRefreshCountdown(null);
  };

  if (loading) return <div className="channel-loading">Загрузка канала...</div>;
  if (error === "Пользователь не найден") return <ChannelNotFound />;
  if (error) return <div className="channel-error">{error}</div>;
  if (!channel) return <ChannelNotFound />;

  return (
    <div className="channel-page">
      {/* Alert о завершении стрима */}
      {showStreamEndedAlert && !isOwner && (
        <div className="stream-ended-alert">
          <div className="alert-content">
            <div className="alert-icon">⏸️</div>
            <div className="alert-text">
              <h4>Трансляция завершена</h4>
              <p>Страница обновится через {refreshCountdown} секунд</p>
            </div>
            <div className="alert-actions">
              <button className="btn primary" onClick={() => window.location.reload()}>
                Обновить сейчас
              </button>
              <button className="btn secondary" onClick={closeStreamEndedAlert}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Шапка канала */}
      <div className="channel-header">
        <div className="channel-info-top">
          <div className="channel-avatar-container">
            <img
              src={channel.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${channel.name}&backgroundColor=9146ff`}
              alt={channel.name}
              className="channel-avatar"
            />
            <div className={`live-indicator ${channel.isLive ? 'live' : 'offline'}`}>
              <span className="indicator-dot"></span>
              {channel.isLive ? 'LIVE' : 'OFFLINE'}
            </div>
          </div>
          
          <div className="channel-info-main">
            <div className="channel-name-wrapper">
              <h1 className="channel-name">{channel.name}</h1>
              <div className="channel-badges">
                {isOwner && <span className="badge owner">ВЛАДЕЛЕЦ</span>}
                {channel.isLive && <span className="badge live">LIVE</span>}
              </div>
            </div>
            
            <div className="channel-stats">
              <div className="stat">
                <span className="stat-value">{viewersCount}</span>
                <span className="stat-label">зрителей</span>
              </div>
              <div className="stat">
                <span className="stat-value">{channel.subscribersCount}</span>
                <span className="stat-label">подписчиков</span>
              </div>
              {isOwner && channel.isLive && streamSessionId && (
                <div className="stat session-id">
                  <span className="stat-label">ID:</span>
                  <span className="stat-value" title={streamSessionId}>
                    {streamSessionId.substring(0, 8)}...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="channel-actions">
          {isOwner ? (
            <div className="streamer-actions">
              <button 
                className={`btn stream-btn ${channel.isLive ? 'live' : ''}`}
                onClick={() => setIsModalOpen(true)}
              >
                {channel.isLive ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19H8V21H16V19H18V21C18 22.1 17.1 23 16 23H8C6.9 23 6 22.1 6 21V19ZM18 17H6C4.9 17 4 16.1 4 15V5C4 3.9 4.9 3 6 3H10L12 5H18C19.1 5 20 5.9 20 7V15C20 16.1 19.1 17 18 17Z"/>
                    </svg>
                    Управление стримом
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 10.48V6C18 4.9 17.1 4 16 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H16C17.1 20 18 19.1 18 18V13.52L22 17.5V6.5L18 10.48Z"/>
                    </svg>
                    Начать стрим
                  </>
                )}
              </button>
              
              {channel.isLive && (
                <button className="btn secondary" onClick={() => window.location.reload()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
                  </svg>
                  Обновить
                </button>
              )}
            </div>
          ) : (
            <button 
              className={`btn subscribe-btn ${subscribed ? 'subscribed' : ''}`}
              onClick={handleSubscribe}
            >
              {subscribed ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z"/>
                  </svg>
                  Подписан
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
                  </svg>
                  Подписаться
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Основное содержимое: видео и чат */}
      <div className="channel-content">
        {/* Левая часть - видео и описание */}
        <div className="channel-left">
          {/* Видеоплеер - ОБНОВЛЕННЫЙ КОНТЕЙНЕР */}
          <div className="video-container">
            {isOwner ? (
              <StreamerVideo 
                channelId={channel.id} 
                stream={stream} 
                onStreamStarted={setStreamSessionId}
                onStreamEnded={handleStreamEnded} 
              />
            ) : (
              <div className="viewer-video-wrapper">
                <ViewerVideo 
                  channelId={channel.id} 
                  onStreamEnded={handleStreamEnded} 
                  onViewersCountUpdate={setViewersCount} 
                />
              </div>
            )}
            
            {/* Офлайн баннер */}
            {!channel.isLive && !isOwner && (
              <div className="offline-overlay">
                <div className="offline-content">
                  <div className="offline-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#9146FF">
                      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"/>
                    </svg>
                  </div>
                  <h3>Стрим офлайн</h3>
                  <p>В данный момент трансляция не ведется</p>
                  {viewersCount > 0 && (
                    <div className="viewers-waiting">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z"/>
                      </svg>
                      {viewersCount} зрителей в ожидании
                    </div>
                  )}
                  <button 
                    className="btn primary" 
                    onClick={() => window.location.reload()}
                  >
                    Проверить снова
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Описание канала */}
          <div className="description-section">
            <h3>О канале</h3>
            <div className="description-content">
              <p>{channel.description || "Описание канала пока отсутствует."}</p>
              <div className="description-meta">
                <div className="meta-item">
                  <span className="meta-label">Категория:</span>
                  <span className="meta-value">Just Chatting</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Язык:</span>
                  <span className="meta-value">Русский</span>
                </div>
                {isOwner && (
                  <button className="edit-description">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z"/>
                    </svg>
                    Редактировать
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Правая часть - чат */}
        <div className="channel-right">
          <div className="chat-container">
            <Chat channelId={channel.id} channelName={channel.name} isStreamer={isOwner} />
          </div>
        </div>
      </div>

      {/* Модалка настроек стрима */}
      <StreamSettingsModal
        isOpen={isModalOpen}
        channel={channel}
        onClose={() => setIsModalOpen(false)}
        onSave={(updated) => setChannel(updated)}
        onStartStream={handleStartStream}
        onEndStream={handleStreamEnded}
      />
    </div>
  );
}