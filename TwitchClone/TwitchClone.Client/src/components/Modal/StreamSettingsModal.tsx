import { useState, useEffect, useRef } from "react";
import { type ChannelData } from "../../api/auth";
import "./StreamSettingsModal.css";
import { startStreamSession, stopStreamSession } from "../../api/channel";
import { 
  getStreamSession, 
  saveStreamSession, 
  removeStreamSession 
} from "../../services/socketIOService";

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
  const [activeTab, setActiveTab] = useState<"Info" | "Video" | "Chat" | "Monetization">("Info");
  const [modalState, setModalState] = useState<ChannelData>(channel);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<"camera" | "screen" | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Инициализация модалки
  useEffect(() => {
    if (isOpen) {
      setModalState(channel);
      setIsStarting(false);
      setIsStreaming(channel.isLive || false);
      
      // Проверяем сохраненную сессию при открытии модалки
      const storedSessionId = getStreamSession(channel.id);
      if (storedSessionId) {
        setCurrentSessionId(storedSessionId);
        console.log("Найдена сохраненная сессия:", storedSessionId);
      } else {
        // Создаем новую сессию только если не стримим
        if (!channel.isLive) {
          const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          setCurrentSessionId(newSessionId);
          saveStreamSession(channel.id, newSessionId);
        }
      }
    } else {
      // При закрытии модалки останавливаем превью ТОЛЬКО если не запущен стрим
      if (videoStream && !modalState.isLive) {
        stopPreview();
      }
      setSelectedSource(null);
    }
  }, [isOpen, channel]);

  // Обновляем isStreaming при изменении modalState.isLive
  useEffect(() => {
    setIsStreaming(modalState.isLive);
  }, [modalState.isLive]);

  // Управление видео элементом
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(e => console.error("Ошибка воспроизведения:", e));
    } else if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [videoStream]);

  // Остановка превью
  const stopPreview = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => {
        track.stop();
      });
      setVideoStream(null);
    }
  };

  // Запуск превью для камеры/экрана
  const handlePreview = async (source: "camera" | "screen") => {
    if (isStreaming) {
      alert("Невозможно изменить источник во время трансляции");
      return;
    }

    try {
      setSelectedSource(source);
      
      // Останавливаем предыдущий стрим если есть
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
      console.log("Поток получен:", stream.id, "Треков:", stream.getTracks().length);
    } catch (err) {
      console.error("Ошибка получения потока:", err);
      setVideoStream(null);
      setSelectedSource(null);
      
      // Приводим err к типу Error
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

  // В методе handleStartStream:
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
    // Создаем sessionId если его нет
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentSessionId(sessionId);
      saveStreamSession(channel.id, sessionId);
    }

    console.log("Начинаем сессию в бэкенде...");
    
    // Используем правильный API вызов
    const result = await startStreamSession(channel.id, sessionId);
    console.log("Сессия начата в бэкенде:", result);
    
    // Клонируем поток для передачи
    const clonedStream = new MediaStream();
    videoStream.getTracks().forEach(track => {
      clonedStream.addTrack(track.clone());
    });

    // Обновляем локальный state перед передачей
    const updatedChannel = { ...modalState, isLive: true };
    setModalState(updatedChannel);
    setIsStreaming(true);
    
    // Передаем КЛОНИРОВАННЫЙ поток и sessionId
    onStartStream(updatedChannel, clonedStream, sessionId);

    // Обновляем родительский компонент
    onSave(updatedChannel);
    
    console.log("Трансляция начата с сессией:", sessionId);
    
    // Закрываем модалку после успешного запуска
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

// В методе handleEndStream:
const handleEndStream = async () => {
  if (!currentSessionId || !onEndStream) {
    console.error("No session ID or onEndStream callback");
    return;
  }

  if (!confirm("Вы уверены, что хотите завершить трансляцию?")) {
    return;
  }

  try {
    console.log("🛑 Начинаем завершение трансляции...");
    
    // 1. Уведомляем родительский компонент о завершении стрима
    onEndStream(channel.id);
    
    // 2. Завершаем сессию в бэкенде
    console.log("Отправляем запрос на остановку сессии в бэкенде...");
    await stopStreamSession(channel.id, currentSessionId);
    
    // 3. Удаляем сессию из localStorage
    removeStreamSession(channel.id);
    
    // 4. Останавливаем медиапоток превью
    if (videoStream) {
      console.log("Останавливаем медиапоток превью...");
      videoStream.getTracks().forEach(track => {
        track.stop();
      });
      setVideoStream(null);
    }
    
    // 5. Обновляем состояние
    const updatedChannel = { ...modalState, isLive: false };
    setModalState(updatedChannel);
    setIsStreaming(false);
    setSelectedSource(null);
    setCurrentSessionId(null);
    
    // 6. Обновляем родительский компонент
    onSave(updatedChannel);
    
    // 7. Закрываем модалку
    setTimeout(() => {
      onClose();
    }, 1000);
    
    console.log("✅ Трансляция успешно завершена");
    
  } catch (err: any) {
    console.error("❌ Ошибка завершения трансляции:", err);
    alert("Ошибка завершения трансляции: " + err.message);
    
    // Пытаемся хотя бы очистить локальное состояние
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>{isStreaming ? "Управление стримом" : "Настройки стрима"}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {["Info", "Video", "Chat", "Monetization"].map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab as any)}
              disabled={isStreaming && tab !== "Info"}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="modal-content">
          {activeTab === "Info" && (
            <div className="tab-panel">
              <label>
                Название стрима:
                <input
                  type="text"
                  value={modalState.name}
                  onChange={(e) => setModalState({ ...modalState, name: e.target.value })}
                  disabled={isStreaming}
                />
              </label>

              <label>
                Описание:
                <textarea
                  value={modalState.description || ""}
                  onChange={(e) => setModalState({ ...modalState, description: e.target.value })}
                  disabled={isStreaming}
                />
              </label>

              <div className="session-info">
                <p><strong>ID сессии:</strong> {currentSessionId?.substring(0, 20)}...</p>
                <p><strong>Статус:</strong> {isStreaming ? "🟢 LIVE" : "⏸️ Оффлайн"}</p>
                
                {isStreaming ? (
                  <button 
                    onClick={handleEndStream} 
                    className="end-stream-btn"
                    style={{
                      marginTop: "10px",
                      padding: "12px 20px",
                      background: "#ff4444",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      width: "100%",
                      fontSize: "16px",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    <span>🛑</span>
                    Завершить трансляцию
                  </button>
                ) : (
                  <p style={{ color: "#666", fontStyle: "italic", marginTop: "10px" }}>
                    Перейдите во вкладку "Video" для запуска трансляции
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "Video" && (
            <div className="tab-panel">
              <div className="video-preview-section">
                {isStreaming ? (
                  <div style={{ 
                    padding: "40px 20px", 
                    textAlign: "center",
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    border: "2px solid #28a745"
                  }}>
                    <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎥</div>
                    <h3 style={{ color: "#28a745", marginBottom: "10px" }}>Трансляция активна</h3>
                    <p>Сейчас идет прямая трансляция</p>
                    <p style={{ fontSize: "14px", color: "#666", marginTop: "10px" }}>
                      Для управления трансляцией перейдите во вкладку "Info"
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: "15px" }}>
                      <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                        Источник трансляции:
                      </label>
                      <select 
                        value={selectedSource || ""} 
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value) {
                            handlePreview(value as "camera" | "screen");
                          } else {
                            setSelectedSource(null);
                            stopPreview();
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: "6px",
                          border: "1px solid #ccc",
                          fontSize: "14px"
                        }}
                        disabled={isStarting}
                      >
                        <option value="">-- Выберите источник --</option>
                        <option value="camera">📷 Камера</option>
                        <option value="screen">🖥️ Экран</option>
                      </select>
                    </div>

                    {videoStream && (
                      <>
                        <div style={{ marginBottom: "15px" }}>
                          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                            Превью:
                          </label>
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            muted 
                            width="100%"
                            style={{ 
                              border: "2px solid #4CAF50", 
                              backgroundColor: "#000",
                              borderRadius: "6px",
                              maxHeight: "300px",
                              objectFit: "contain"
                            }}
                          />
                        </div>
                        
                        <div style={{ 
                          padding: "15px", 
                          background: "#e8f5e9", 
                          borderRadius: "6px",
                          marginBottom: "20px",
                          border: "1px solid #c8e6c9"
                        }}>
                          <div style={{ color: "#2e7d32", marginBottom: "5px", fontWeight: "bold" }}>
                            ✓ Поток активен: {videoStream.getTracks().length} треков
                          </div>
                          <div style={{ fontSize: "13px", color: "#4caf50" }}>
                            {selectedSource === "camera" 
                              ? "Камера и микрофон готовы к трансляции" 
                              : "Демонстрация экрана готова к трансляции"}
                          </div>
                        </div>
                        
                        <div className="stream-controls">
                          <button
                            disabled={!videoStream || isStarting}
                            onClick={handleStartStream}
                            className="start-stream-btn"
                            style={{
                              width: "100%",
                              padding: "14px",
                              background: isStarting ? "#ccc" : "#4CAF50",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "16px",
                              fontWeight: "bold",
                              cursor: isStarting ? "not-allowed" : "pointer",
                              opacity: isStarting ? 0.7 : 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                              transition: "all 0.2s"
                            }}
                            onMouseEnter={(e) => {
                              if (!isStarting) e.currentTarget.style.background = "#45a049";
                            }}
                            onMouseLeave={(e) => {
                              if (!isStarting) e.currentTarget.style.background = "#4CAF50";
                            }}
                          >
                            {isStarting ? (
                              <>
                                <span className="spinner"></span>
                                Запуск трансляции...
                              </>
                            ) : (
                              <>
                                <span>🚀</span>
                                Начать трансляцию
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                    
                    {!videoStream && selectedSource && (
                      <div style={{ 
                        padding: "30px", 
                        textAlign: "center", 
                        background: "#fff3cd",
                        borderRadius: "6px",
                        border: "1px solid #ffeaa7"
                      }}>
                        <div style={{ fontSize: "24px", marginBottom: "15px" }}>📹</div>
                        <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
                          Ожидание разрешения...
                        </div>
                        <div style={{ fontSize: "14px", color: "#856404" }}>
                          Разрешите доступ к {selectedSource === "camera" ? "камере и микрофону" : "экрану"}
                        </div>
                      </div>
                    )}
                    
                    {!selectedSource && !isStreaming && (
                      <div style={{ 
                        padding: "60px 20px", 
                        textAlign: "center", 
                        background: "#f8f9fa",
                        borderRadius: "8px",
                        border: "2px dashed #dee2e6"
                      }}>
                        <div style={{ fontSize: "64px", marginBottom: "20px", opacity: 0.6 }}>📹</div>
                        <div style={{ fontSize: "18px", marginBottom: "10px", color: "#495057" }}>
                          Выберите источник трансляции
                        </div>
                        <div style={{ fontSize: "14px", color: "#6c757d" }}>
                          Начните с выбора "Камера" или "Экран" из списка выше
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "Chat" && (
            <div className="tab-panel">
              <h3>Настройки чата</h3>
              <div style={{ marginBottom: "15px" }}>
                <div style={{ 
                  padding: "15px",
                  background: "#f8f9fa",
                  borderRadius: "6px",
                  border: "1px solid #dee2e6"
                }}>
                  <p><strong>Режим чата:</strong> {isStreaming ? "Открытый для всех" : "Неактивен"}</p>
                  <p><strong>Модераторы:</strong> Нет</p>
                  {isStreaming && (
                    <p style={{ fontSize: "13px", color: "#28a745", marginTop: "10px" }}>
                      ✓ Чат активен и доступен для зрителей
                    </p>
                  )}
                </div>
              </div>
              <p style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>
                {isStreaming 
                  ? "Настройки чата можно изменить во время трансляции" 
                  : "Настройки чата будут доступны после запуска трансляции"}
              </p>
            </div>
          )}

          {activeTab === "Monetization" && (
            <div className="tab-panel">
              <h3>Монетизация</h3>
              <div style={{ marginBottom: "15px" }}>
                <div style={{ 
                  padding: "15px",
                  background: "#f8f9fa",
                  borderRadius: "6px",
                  border: "1px solid #dee2e6"
                }}>
                  <p><strong>Подписки:</strong> {isStreaming ? "Доступны" : "Не настроены"}</p>
                  <p><strong>Донаты:</strong> {isStreaming ? "Включены" : "Отключены"}</p>
                  {isStreaming && (
                    <p style={{ fontSize: "13px", color: "#28a745", marginTop: "10px" }}>
                      ✓ Монетизация активна
                    </p>
                  )}
                </div>
              </div>
              <p style={{ fontSize: "13px", color: "#666", fontStyle: "italic" }}>
                {isStreaming 
                  ? "Настройки монетизации можно изменить" 
                  : "Настройки монетизации будут доступны после запуска трансляции"}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="cancel-btn" 
            onClick={onClose}
            style={{
              padding: "10px 24px",
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              marginRight: "10px",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#5a6268"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#6c757d"}
          >
            Закрыть
          </button>
          
          <button 
            className="save-btn" 
            onClick={handleSave}
            style={{
              padding: "10px 24px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#0056b3"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#007bff"}
          >
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>
  );
}