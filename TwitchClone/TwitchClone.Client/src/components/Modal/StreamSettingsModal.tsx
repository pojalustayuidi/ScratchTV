import { useState, useEffect, useRef } from "react";
import { type ChannelData } from "../../api/auth";
import "./StreamSettingsModal.css";
import { startStreamSession, stopStreamSession } from "../../api/channel";
import { 
  getStreamSession, 
  saveStreamSession, 
  removeStreamSession 
} from "../../services/socketIOService";
import {
  getChannelBans,
  unbanUser,
  type BanInfo
} from "../../services/chatModerationService";

interface StreamSettingsModalProps {
  isOpen: boolean;
  channel: ChannelData;
  onClose: () => void;
  onSave: (updatedChannel: ChannelData) => void;
  onStartStream?: (channel: ChannelData, stream: MediaStream, sessionId: string) => void;
  onEndStream?: (channelId: number) => void;
}

export default function StreamSettingsModal({
  isOpen,
  channel,
  onClose,
  onSave,
  onStartStream,
  onEndStream,
}: StreamSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"Info" | "Video" | "Chat" | "Moderation" | "Monetization">("Info");
  const [modalState, setModalState] = useState<ChannelData>(channel);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<"camera" | "screen" | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const [bans, setBans] = useState<BanInfo[]>([]);
  const [isLoadingBans, setIsLoadingBans] = useState(false);
  const [banSearch, setBanSearch] = useState("");
  const [selectedBans, setSelectedBans] = useState<number[]>([]);
  const [isUnbanning, setIsUnbanning] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen) {
        setModalState(channel);
        setIsStarting(false);
        setIsStreaming(channel.isLive || false);
        
        const storedSession = getStreamSession(channel.id);
        if (storedSession) {
            setCurrentSessionId(storedSession.sessionId);
        } else {
            if (!channel.isLive) {
                const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                setCurrentSessionId(newSessionId);
                saveStreamSession(channel.id, newSessionId);
            }
        }
        
        if (activeTab === "Moderation") {
            loadBans();
        }
    } else {
        if (videoStream && !modalState.isLive) {
            stopPreview();
        }
        setSelectedSource(null);
    }
  }, [isOpen, channel, activeTab]); 

  useEffect(() => {
    if (isOpen && activeTab === "Moderation") {
      loadBans();
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    setIsStreaming(modalState.isLive);
  }, [modalState.isLive]);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(e => console.error("Ошибка воспроизведения:", e));
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [videoStream]);

  const loadBans = async () => {
    try {
      setIsLoadingBans(true);
      const bansList = await getChannelBans(channel.id);
      setBans(bansList);
    } catch (error) {
      console.error('Ошибка загрузки банов:', error);
    } finally {
      setIsLoadingBans(false);
    }
  };

  const handleUnbanUser = async (userId: number, username: string) => {
    if (!confirm(`Вы уверены, что хотите разбанить пользователя ${username}?`)) {
      return;
    }

    try {
      setIsUnbanning(true);
      await unbanUser(channel.id, userId);
      
      setBans(prev => prev.filter(ban => ban.userId !== userId));
      setSelectedBans(prev => prev.filter(id => id !== userId));
      
      alert(`Пользователь ${username} успешно разбанен!`);
    } catch (error: any) {
      console.error('Ошибка разбана:', error);
      alert(`Ошибка разбана: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setIsUnbanning(false);
    }
  };

  const handleBulkUnban = async () => {
    if (selectedBans.length === 0) {
      alert('Выберите пользователей для разбана');
      return;
    }

    const selectedUsernames = bans
      .filter(ban => selectedBans.includes(ban.userId))
      .map(ban => `"${ban.bannedByUsername || 'Неизвестно'}"`)
      .join(', ');

    if (!confirm(`Вы уверены, что хотите разбанить выбранных пользователей (${selectedUsernames})?`)) {
      return;
    }

    try {
      setIsUnbanning(true);
      
      for (const userId of selectedBans) {
        await unbanUser(channel.id, userId);
      }
      
      setBans(prev => prev.filter(ban => !selectedBans.includes(ban.userId)));
      setSelectedBans([]);
      
      alert(`Успешно разбанено ${selectedBans.length} пользователей!`);
    } catch (error: any) {
      console.error('Ошибка массового разбана:', error);
      alert(`Ошибка разбана: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setIsUnbanning(false);
    }
  };

  const handleSelectAllBans = () => {
    if (selectedBans.length === bans.length) {
      setSelectedBans([]);
    } else {
      setSelectedBans(bans.map(ban => ban.userId));
    }
  };

  const filteredBans = bans.filter(ban => {
    if (!banSearch) return true;
    
    const searchLower = banSearch.toLowerCase();
    return (
      (ban.bannedByUsername?.toLowerCase().includes(searchLower)) ||
      (ban.reason?.toLowerCase().includes(searchLower))
    );
  });

  const stopPreview = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => {
        track.stop();
      });
      setVideoStream(null);
    }
  };

  const handlePreview = async (source: "camera" | "screen") => {
    if (isStreaming) {
      alert("Невозможно изменить источник во время трансляции");
      return;
    }

    try {
      setSelectedSource(source);
      stopPreview();
      
      let stream: MediaStream;
      if (source === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } else {
        stream = await (navigator.mediaDevices as any).getDisplayMedia({ 
          video: {
            displaySurface: "monitor",
            frameRate: { ideal: 30 }
          }, 
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
      }
      setVideoStream(stream);
    } catch (err) {
      console.error("Ошибка получения потока:", err);
      setVideoStream(null);
      setSelectedSource(null);
      
      const error = err as Error;
      
      if (error.name === "NotAllowedError") {
        alert("Доступ к медиаустройствам запрещен. Разрешите доступ в настройках браузера.");
      } else if (error.name === "NotFoundError") {
        alert("Медиаустройства не найдены. Проверьте подключение камеры/микрофона.");
      } else {
        alert("Не удалось получить доступ к медиаустройствам: " + error.message);
      }
    }
  };

  const handleStartStream = async () => {
    if (!videoStream || !onStartStream) {
      console.log("Недостаточно данных:", { videoStream, onStartStream });
      return;
    }

    if (isStreaming) {
      alert("Трансляция уже активна");
      return;
    }

    setIsStarting(true);

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setCurrentSessionId(sessionId);
        saveStreamSession(channel.id, sessionId);
      }

      const result = await startStreamSession(channel.id, sessionId);
      
      const clonedStream = new MediaStream();
      videoStream.getTracks().forEach(track => {
        clonedStream.addTrack(track.clone());
      });

      const updatedChannel = { ...modalState, isLive: true };
      setModalState(updatedChannel);
      setIsStreaming(true);
      
      onStartStream(updatedChannel, clonedStream, sessionId);
      onSave(updatedChannel);
      
      setTimeout(() => {
        onClose();
      }, 500);
      
    } catch (err: any) {
      console.error("Не удалось начать трансляцию:", err);
      alert("Ошибка запуска трансляции: " + err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndStream = async () => {
    if (!currentSessionId || !onEndStream) {
      console.error("No session ID or onEndStream callback");
      return;
    }

    if (!confirm("Вы уверены, что хотите завершить трансляцию?")) {
      return;
    }

    try {
      onEndStream(channel.id);
      
      await stopStreamSession(channel.id, currentSessionId);
      removeStreamSession(channel.id);
      
      if (videoStream) {
        videoStream.getTracks().forEach(track => {
          track.stop();
        });
        setVideoStream(null);
      }
      
      const updatedChannel = { ...modalState, isLive: false };
      setModalState(updatedChannel);
      setIsStreaming(false);
      setSelectedSource(null);
      setCurrentSessionId(null);
      
      onSave(updatedChannel);
      onClose();
      
    } catch (err: any) {
      console.error("Ошибка завершения трансляции:", err);
      alert("Ошибка завершения трансляции: " + err.message);
      
      const updatedChannel = { ...modalState, isLive: false };
      setModalState(updatedChannel);
      setIsStreaming(false);
      onSave(updatedChannel);
    }
  };

  const handleSave = () => {
    onSave(modalState);
    onClose();
  };

  const formatBanTime = (dateString: string | null) => {
    if (!dateString) return 'Навсегда';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Истёк';
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `через ${diffDays} дн.`;
    } else if (diffHours > 0) {
      return `через ${diffHours} ч.`;
    } else {
      return 'менее часа';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="twitch-modal-overlay">
      <div className="twitch-modal-container">
        <div className="twitch-modal-header">
          <div className="twitch-modal-header-content">
            <div className="twitch-modal-header-icon">
              {isStreaming ? "🔴" : "⚙️"}
            </div>
            <div>
              <h2 className="twitch-modal-title">
                {isStreaming ? "Управление трансляцией" : "Настройки трансляции"}
              </h2>
              <p className="twitch-modal-subtitle">
                {channel.name} • {isStreaming ? "Трансляция активна" : "Готовимся к стриму"}
              </p>
            </div>
          </div>
          <button className="twitch-close-btn" onClick={onClose}>
            <span>×</span>
          </button>
        </div>

       <div className="twitch-modal-tabs">
  {[
    { id: "Info", icon: "📋", label: "Основное" },
    { id: "Video", icon: "🎥", label: "Видео" },
    { id: "Chat", icon: "💬", label: "Чат" },
    { id: "Moderation", icon: "🛡️", label: "Модерация" },
    { id: "Monetization", icon: "💰", label: "Монетизация" }
  ].map((tab) => {
    const isDisabledDuringStream = isStreaming && 
      (tab.id === "Video" || tab.id === "Monetization");
    
    return (
      <button
        key={tab.id}
        className={`twitch-tab-btn ${activeTab === tab.id ? "active" : ""}`}
        onClick={() => setActiveTab(tab.id as any)}
        disabled={isDisabledDuringStream}
      >
        <span className="twitch-tab-icon">{tab.icon}</span>
        <span className="twitch-tab-label">{tab.label}</span>
        {isDisabledDuringStream && (
          <span className="twitch-tab-badge"></span>
        )}
      </button>
    );
  })}
</div>

        <div className="twitch-modal-content">
          {activeTab === "Info" && (
            <div className="twitch-tab-panel">
              <div className="twitch-section">
                <h3 className="twitch-section-title">Информация о трансляции</h3>
                
                <div className="twitch-form-group">
                  <label className="twitch-form-label">
                    <span className="twitch-form-label-icon">📝</span>
                    Название трансляции
                  </label>
                  <input
                    type="text"
                    className="twitch-input"
                    value={modalState.name}
                    onChange={(e) => setModalState({ ...modalState, name: e.target.value })}
                    disabled={isStreaming}
                    placeholder="Введите название трансляции..."
                  />
                </div>

                <div className="twitch-form-group">
                  <label className="twitch-form-label">
                    <span className="twitch-form-label-icon">📄</span>
                    Описание
                  </label>
                  <textarea
                    className="twitch-textarea"
                    value={modalState.description || ""}
                    onChange={(e) => setModalState({ ...modalState, description: e.target.value })}
                    disabled={isStreaming}
                    placeholder="Расскажите о вашей трансляции..."
                    rows={4}
                  />
                </div>
              </div>

              <div className="twitch-section">
                <h3 className="twitch-section-title">Статус трансляции</h3>
                <div className={`twitch-status-card ${isStreaming ? "live" : "offline"}`}>
                  <div className="twitch-status-icon">
                    {isStreaming ? "🔴" : "⏸️"}
                  </div>
                  <div className="twitch-status-content">
                    <div className="twitch-status-title">
                      {isStreaming ? "Трансляция активна" : "Трансляция остановлена"}
                    </div>
                    <div className="twitch-status-subtitle">
                      {isStreaming 
                        ? "Вы в прямом эфире" 
                        : "Начните трансляцию во вкладке 'Видео'"}
                    </div>
                    {currentSessionId && (
                      <div className="twitch-session-id">
                        <span className="twitch-session-label">ID сессии:</span>
                        <code className="twitch-session-code">
                          {currentSessionId.substring(0, 24)}...
                        </code>
                      </div>
                    )}
                  </div>
                  {isStreaming && (
                    <button 
                      onClick={handleEndStream} 
                      className="twitch-end-stream-btn"
                    >
                      <span className="twitch-btn-icon">🛑</span>
                      Завершить трансляцию
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "Video" && (
            <div className="twitch-tab-panel">
              {isStreaming ? (
                <div className="twitch-stream-active-card">
                  <div className="twitch-stream-active-icon">
                    <div className="twitch-live-pulse">🔴</div>
                  </div>
                  <h3 className="twitch-stream-active-title">Трансляция активна</h3>
                  <p className="twitch-stream-active-text">
                    Вы сейчас в прямом эфире. Для управления трансляцией перейдите во вкладку "Основное".
                  </p>
                </div>
              ) : (
                <>
                  <div className="twitch-section">
                    <h3 className="twitch-section-title">Источник трансляции</h3>
                    <div className="twitch-source-buttons">
                      <button
                        className={`twitch-source-btn ${selectedSource === "camera" ? "active" : ""}`}
                        onClick={() => handlePreview("camera")}
                        disabled={isStarting}
                      >
                        <div className="twitch-source-icon">📷</div>
                        <div className="twitch-source-label">Камера</div>
                        <div className="twitch-source-desc">Трансляция с веб-камеры</div>
                      </button>
                      
                      <button
                        className={`twitch-source-btn ${selectedSource === "screen" ? "active" : ""}`}
                        onClick={() => handlePreview("screen")}
                        disabled={isStarting}
                      >
                        <div className="twitch-source-icon">🖥️</div>
                        <div className="twitch-source-label">Экран</div>
                        <div className="twitch-source-desc">Демонстрация экрана</div>
                      </button>
                    </div>
                  </div>

                  {videoStream && (
                    <>
                      <div className="twitch-section">
                        <h3 className="twitch-section-title">Предпросмотр</h3>
                        <div className="twitch-preview-container">
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            muted 
                            className="twitch-preview-video"
                          />
                          <div className="twitch-preview-status">
                            <span className="twitch-preview-status-icon">✅</span>
                            <span className="twitch-preview-status-text">
                              {selectedSource === "camera" 
                                ? "Камера и микрофон готовы" 
                                : "Демонстрация экрана готова"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="twitch-section">
                        <button
                          disabled={isStarting}
                          onClick={handleStartStream}
                          className="twitch-start-stream-btn"
                        >
                          {isStarting ? (
                            <>
                              <span className="twitch-spinner"></span>
                              Запуск трансляции...
                            </>
                          ) : (
                            <>
                              <span className="twitch-btn-icon">🚀</span>
                              Начать трансляцию
                            </>
                          )}
                        </button>
                        
                        <div className="twitch-stream-hint">
                          <span className="twitch-hint-icon">💡</span>
                          После запуска вы сможете управлять трансляцией во вкладке "Основное"
                        </div>
                      </div>
                    </>
                  )}
                  
                  {!selectedSource && !videoStream && (
                    <div className="twitch-empty-state">
                      <div className="twitch-empty-icon">📹</div>
                      <h4 className="twitch-empty-title">Выберите источник трансляции</h4>
                      <p className="twitch-empty-text">
                        Нажмите на кнопку выше для выбора камеры или демонстрации экрана
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "Chat" && (
            <div className="twitch-tab-panel">
              <div className="twitch-section">
                <h3 className="twitch-section-title">Настройки чата</h3>
                <div className="twitch-chat-settings-card">
                  <div className="twitch-chat-status">
                    <div className={`twitch-chat-status-indicator ${isStreaming ? "active" : ""}`}>
                      {isStreaming ? "🟢" : "⚫"}
                    </div>
                    <div>
                      <div className="twitch-chat-status-title">
                        {isStreaming ? "Чат активен" : "Чат неактивен"}
                      </div>
                      <div className="twitch-chat-status-desc">
                        {isStreaming 
                          ? "Зрители могут отправлять сообщения" 
                          : "Запустите трансляцию для активации чата"}
                      </div>
                    </div>
                  </div>
                  
                  <div className="twitch-chat-stats">
                    <div className="twitch-chat-stat">
                      <div className="twitch-chat-stat-value">{bans.length}</div>
                      <div className="twitch-chat-stat-label">Активных банов</div>
                    </div>
                    <div className="twitch-chat-stat">
                      <div className="twitch-chat-stat-value">
                        {isStreaming ? "Вкл" : "Выкл"}
                      </div>
                      <div className="twitch-chat-stat-label">Режим подписчиков</div>
                    </div>
                    <div className="twitch-chat-stat">
                      <div className="twitch-chat-stat-value">
                        {isStreaming ? "Вкл" : "Выкл"}
                      </div>
                      <div className="twitch-chat-stat-label">Медленный режим</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Moderation" && (
            <div className="twitch-tab-panel">
              <div className="twitch-section">
                <div className="twitch-moderation-header">
                  <div>
                    <h3 className="twitch-section-title">Управление банами</h3>
                    <p className="twitch-section-subtitle">
                      Всего банов: {bans.length} • Постоянных: {bans.filter(b => b.isPermanent).length}
                    </p>
                  </div>
                  <div className="twitch-moderation-actions">
                    <div className="twitch-search-box">
                      <span className="twitch-search-icon"></span>
                      <input
                        type="text"
                        placeholder="Поиск по имени или причине..."
                        value={banSearch}
                        onChange={(e) => setBanSearch(e.target.value)}
                        className="twitch-search-input"
                      />
                    </div>
                    {filteredBans.length > 0 && (
                      <button
                        onClick={handleBulkUnban}
                        disabled={selectedBans.length === 0 || isUnbanning}
                        className="twitch-bulk-unban-btn"
                      >
                        <span className="twitch-btn-icon">✅</span>
                        Разбанить ({selectedBans.length})
                      </button>
                    )}
                  </div>
                </div>

                {isLoadingBans ? (
                  <div className="twitch-loading-state">
                    <div className="twitch-spinner-large"></div>
                    <p>Загрузка списка банов...</p>
                  </div>
                ) : (
                  <>
                    {filteredBans.length > 0 && (
                      <div className="twitch-select-all">
                        <label className="twitch-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedBans.length === filteredBans.length && filteredBans.length > 0}
                            onChange={handleSelectAllBans}
                            className="twitch-checkbox"
                          />
                          <span className="twitch-checkbox-custom"></span>
                          Выбрать все ({selectedBans.length}/{filteredBans.length})
                        </label>
                      </div>
                    )}

                    {filteredBans.length === 0 ? (
                      <div className="twitch-empty-state">
                        <div className="twitch-empty-icon">
                          {banSearch ? "🔍" : "🎉"}
                        </div>
                        <h4 className="twitch-empty-title">
                          {banSearch ? "Ничего не найдено" : "Нет активных банов"}
                        </h4>
                        <p className="twitch-empty-text">
                          {banSearch 
                            ? "Попробуйте изменить поисковый запрос" 
                            : "Все пользователи могут писать в чат"}
                        </p>
                      </div>
                    ) : (
                      <div className="twitch-bans-list">
                        {filteredBans.map((ban) => (
                          <div
                            key={ban.userId}
                            className={`twitch-ban-card ${selectedBans.includes(ban.userId) ? "selected" : ""}`}
                          >
                            <div className="twitch-ban-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedBans.includes(ban.userId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBans([...selectedBans, ban.userId]);
                                  } else {
                                    setSelectedBans(selectedBans.filter(id => id !== ban.userId));
                                  }
                                }}
                                className="twitch-checkbox"
                              />
                              <span className="twitch-checkbox-custom"></span>
                            </div>
                            
                            <div className="twitch-ban-content">
                              <div className="twitch-ban-header">
                                <div className="twitch-ban-user">
                                  <div className="twitch-ban-avatar">
                                    {ban.bannedByUsername?.[0] || "?"}
                                  </div>
                                  <div>
                                    <div className="twitch-ban-username">
                                      {ban.bannedByUsername || `Пользователь #${ban.userId}`}
                                    </div>
                                    <div className="twitch-ban-time">
                                      {ban.isPermanent ? (
                                        <span className="twitch-ban-permanent">🚫 Навсегда</span>
                                      ) : (
                                        <span className="twitch-ban-temporary">
                                          ⏳ Истекает {formatBanTime(ban.expiresAt)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="twitch-ban-actions">
                                  <button
                                    onClick={() => handleUnbanUser(ban.userId, ban.bannedByUsername || `#${ban.userId}`)}
                                    disabled={isUnbanning}
                                    className="twitch-unban-btn"
                                  >
                                    <span className="twitch-btn-icon">✅</span>
                                    Разбанить
                                  </button>
                                </div>
                              </div>
                              
                              <div className="twitch-ban-details">
                                <div className="twitch-ban-reason">
                                  <strong>Причина:</strong> {ban.reason || "Не указана"}
                                </div>
                                <div className="twitch-ban-meta">
                                  <span className="twitch-ban-date">
                                    📅 {new Date(ban.bannedAt).toLocaleString('ru-RU')}
                                  </span>
                                  {ban.expiresAt && !ban.isPermanent && (
                                    <span className="twitch-ban-expires">
                                      ⏰ До: {new Date(ban.expiresAt).toLocaleString('ru-RU')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "Monetization" && (
            <div className="twitch-tab-panel">
              <div className="twitch-section">
                <h3 className="twitch-section-title">Настройки монетизации</h3>
                <div className="twitch-monetization-card">
                  <div className="twitch-monetization-status">
                    <div className={`twitch-monetization-status-indicator ${isStreaming ? "active" : ""}`}>
                      {isStreaming ? "💰" : "🔒"}
                    </div>
                    <div>
                      <div className="twitch-monetization-status-title">
                        {isStreaming ? "Монетизация доступна" : "Монетизация отключена"}
                      </div>
                      <div className="twitch-monetization-status-desc">
                        {isStreaming 
                          ? "Настройки монетизации активны" 
                          : "Запустите трансляцию для включения монетизации"}
                      </div>
                    </div>
                  </div>
                  
                  <div className="twitch-monetization-features">
                    <div className="twitch-monetization-feature">
                      <div className="twitch-feature-icon">⭐</div>
                      <div>
                        <div className="twitch-feature-title">Подписки</div>
                        <div className="twitch-feature-status">
                          {isStreaming ? "✅ Доступны" : "❌ Недоступны"}
                        </div>
                      </div>
                    </div>
                    
                    <div className="twitch-monetization-feature">
                      <div className="twitch-feature-icon">💎</div>
                      <div>
                        <div className="twitch-feature-title">Донаты</div>
                        <div className="twitch-feature-status">
                          {isStreaming ? "✅ Включены" : "❌ Выключены"}
                        </div>
                      </div>
                    </div>
                    
                    <div className="twitch-monetization-feature">
                      <div className="twitch-feature-icon">🎁</div>
                      <div>
                        <div className="twitch-feature-title">Bit-апплодисменты</div>
                        <div className="twitch-feature-status">
                          {isStreaming ? "✅ Активны" : "❌ Неактивны"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="twitch-modal-footer">
          <button 
            className="twitch-btn-secondary" 
            onClick={onClose}
          >
            <span className="twitch-btn-icon">←</span>
            Закрыть
          </button>
          
          <button 
            className="twitch-btn-primary" 
            onClick={handleSave}
          >
            <span className="twitch-btn-icon">💾</span>
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>
  );
}