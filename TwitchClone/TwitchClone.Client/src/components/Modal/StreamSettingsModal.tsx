// components/Modal/StreamSettingsModal.tsx
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isOpen) {
      setModalState(channel);
      setIsStarting(false);
      
      // Проверяем сохраненную сессию при открытии модалки
      const storedSessionId = getStreamSession(channel.id);
      if (storedSessionId) {
        setCurrentSessionId(storedSessionId);
        console.log("Найдена сохраненная сессия:", storedSessionId);
      } else {
        // Создаем новую сессию заранее
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setCurrentSessionId(newSessionId);
        saveStreamSession(channel.id, newSessionId);
      }
    } else {
      // При закрытии модалки останавливаем превью ТОЛЬКО если не запущен стрим
      if (videoStream && !modalState.isLive) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      setSelectedSource(null);
    }
  }, [isOpen, channel]);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(e => console.error("Ошибка воспроизведения:", e));
    }
  }, [videoStream]);

  // Запуск превью для камеры/экрана
  const handlePreview = async (source: "camera" | "screen") => {
    try {
      setSelectedSource(source);
      
      // Останавливаем предыдущий стрим если есть и стрим не запущен
      if (videoStream && !modalState.isLive) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      
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

  const handleStartStream = async () => {
    if (!videoStream || !onStartStream || !currentSessionId) {
      console.log("Недостаточно данных:", { videoStream, onStartStream, currentSessionId });
      return;
    }

    if (modalState.isLive) {
      alert("Трансляция уже активна");
      return;
    }

    setIsStarting(true);

    try {
      // Клонируем поток, чтобы он продолжал работать после закрытия модалки
      const clonedStream = new MediaStream();
      videoStream.getTracks().forEach(track => {
        clonedStream.addTrack(track.clone());
      });

      console.log("Начинаем сессию в бэкенде...");
      await startStreamSession(channel.id, currentSessionId);
      console.log("Сессия начата в бэкенде:", currentSessionId);
      
      // Передаем КЛОНИРОВАННЫЙ поток и sessionId
      onStartStream(modalState, clonedStream, currentSessionId);

      // Обновляем локальный state
      const updatedChannel = { ...modalState, isLive: true };
      setModalState(updatedChannel);
      onSave(updatedChannel);
      
      // Закрываем модалку после успешного запуска
      setTimeout(() => {
        onClose();
      }, 500);
      
      console.log("Трансляция начата с сессией:", currentSessionId);
    } catch (err: any) {
      console.error("Не удалось начать трансляцию:", err);
      alert("Ошибка запуска трансляции: " + err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndStream = async () => {
    if (!currentSessionId || !onEndStream) return;

    try {
      // Завершаем сессию в бэкенде
      await stopStreamSession(channel.id, currentSessionId);
      
      // Удаляем сессию из localStorage
      removeStreamSession(channel.id);
      
      // Останавливаем медиапоток превью
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      
      // Обновляем состояние
      const updatedChannel = { ...modalState, isLive: false };
      setModalState(updatedChannel);
      onSave(updatedChannel);
      
      // Уведомляем родительский компонент
      onEndStream(channel.id);
      
      setSelectedSource(null);
      console.log("Трансляция завершена");
    } catch (err) {
      console.error("Ошибка завершения трансляции:", err);
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
          <h2>Настройки стрима</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {["Info", "Video", "Chat", "Monetization"].map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab as any)}
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
                />
              </label>

              <label>
                Описание:
                <textarea
                  value={modalState.description}
                  onChange={(e) => setModalState({ ...modalState, description: e.target.value })}
                />
              </label>

              <div className="session-info">
                <p><strong>ID сессии:</strong> {currentSessionId?.substring(0, 20)}...</p>
                <p><strong>Статус:</strong> {modalState.isLive ? "🟢 LIVE" : "⏸️ Оффлайн"}</p>
                
                {modalState.isLive ? (
                  <button 
                    onClick={handleEndStream} 
                    className="end-stream-btn"
                    style={{
                      marginTop: "10px",
                      padding: "8px 16px",
                      background: "#ff4444",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      width: "100%"
                    }}
                  >
                    🛑 Завершить трансляцию
                  </button>
                ) : (
                  <p style={{ color: "#666", fontStyle: "italic" }}>
                    Перейдите во вкладку "Video" для запуска трансляции
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "Video" && (
            <div className="tab-panel">
              <div className="video-preview-section">
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                    Источник трансляции:
                  </label>
                  <select 
                    value={selectedSource || ""} 
                    onChange={(e) => handlePreview(e.target.value as "camera" | "screen")}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc"
                    }}
                    disabled={modalState.isLive || isStarting}
                  >
                    <option value="">-- Выберите источник --</option>
                    <option value="camera">📷 Камера</option>
                    <option value="screen">🖥️ Экран</option>
                  </select>
                </div>

                {videoStream && (
                  <>
                    <div style={{ marginBottom: "10px" }}>
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
                          borderRadius: "4px",
                          maxHeight: "300px"
                        }}
                      />
                    </div>
                    
                    <div style={{ 
                      padding: "10px", 
                      background: "#f0f9ff", 
                      borderRadius: "4px",
                      marginBottom: "15px"
                    }}>
                      <div style={{ color: "green", marginBottom: "5px" }}>
                        ✓ Поток активен: {videoStream.getTracks().length} треков
                      </div>
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        {selectedSource === "camera" 
                          ? "Камера и микрофон готовы к трансляции" 
                          : "Демонстрация экрана готова к трансляции"}
                      </div>
                    </div>
                    
                    <div className="stream-controls">
                      <button
                        disabled={!videoStream || modalState.isLive || isStarting}
                        onClick={handleStartStream}
                        className="start-stream-btn"
                        style={{
                          width: "100%",
                          padding: "12px",
                          background: modalState.isLive ? "#ccc" : "#4CAF50",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "16px",
                          fontWeight: "bold",
                          cursor: modalState.isLive || isStarting ? "not-allowed" : "pointer",
                          opacity: modalState.isLive || isStarting ? 0.7 : 1
                        }}
                      >
                        {isStarting ? "Запуск..." : 
                         modalState.isLive ? "Трансляция активна" : 
                         "🚀 Начать трансляцию"}
                      </button>
                    </div>
                  </>
                )}
                
                {!videoStream && selectedSource && (
                  <div style={{ 
                    padding: "20px", 
                    textAlign: "center", 
                    background: "#fff3cd",
                    borderRadius: "4px",
                    border: "1px solid #ffeaa7"
                  }}>
                    <div style={{ fontSize: "18px", marginBottom: "10px" }}>📹</div>
                    <div>Разрешите доступ к {selectedSource === "camera" ? "камере и микрофону" : "экрану"}</div>
                    <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                      Браузер запросит разрешение...
                    </div>
                  </div>
                )}
                
                {!selectedSource && (
                  <div style={{ 
                    padding: "40px", 
                    textAlign: "center", 
                    background: "#f8f9fa",
                    borderRadius: "4px",
                    border: "1px dashed #dee2e6"
                  }}>
                    <div style={{ fontSize: "48px", marginBottom: "15px" }}>📹</div>
                    <div style={{ fontSize: "16px", marginBottom: "10px", color: "#495057" }}>
                      Выберите источник трансляции
                    </div>
                    <div style={{ fontSize: "14px", color: "#6c757d" }}>
                      Начните с выбора "Камера" или "Экран" из списка выше
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "Chat" && (
            <div className="tab-panel">
              <h3>Настройки чата</h3>
              <p>Режим чата: Открытый для всех</p>
              <p>Модераторы: Нет</p>
              <p style={{ fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                Настройки чата будут доступны после запуска трансляции
              </p>
            </div>
          )}

          {activeTab === "Monetization" && (
            <div className="tab-panel">
              <h3>Монетизация</h3>
              <p>Подписки: Не настроены</p>
              <p>Донаты: Отключены</p>
              <p style={{ fontSize: "12px", color: "#666", fontStyle: "italic" }}>
                Настройки монетизации будут доступны после запуска трансляции
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            className="cancel-btn" 
            onClick={onClose}
            style={{
              padding: "8px 20px",
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "10px"
            }}
          >
            Закрыть
          </button>
          
          {modalState.isLive && (
            <button 
              className="save-btn" 
              onClick={handleSave}
              style={{
                padding: "8px 20px",
                background: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Сохранить изменения
            </button>
          )}
        </div>
      </div>
    </div>
  );
}