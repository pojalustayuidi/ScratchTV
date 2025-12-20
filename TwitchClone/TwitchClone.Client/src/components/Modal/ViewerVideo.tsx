import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import {
  getSFUSocket,
  startSFUConnection,
  onViewersCountUpdate as subscribeToViewerCount,
  requestViewerCount,
  sendViewerPing
} from "../../services/socketIOService";
import "./ViewerVideo.css";

interface Props {
  channelId: number;
  sessionId?: string | null;
  onStreamEnded?: () => void;
  onViewersCountUpdate?: (count: number) => void;
}

export default function ViewerVideo({
  channelId,
  sessionId,
  onStreamEnded,
  onViewersCountUpdate
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const transportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumersRef = useRef<Map<string, mediasoupClient.types.Consumer>>(new Map());
  const socketRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const viewerPingIntervalRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [status, setStatus] = useState("Инициализация...");
  const [viewersCount, setViewersCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [bitrate, setBitrate] = useState<string>("0 kbps");
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor">("good");
  const [buffering, setBuffering] = useState(false);
  const [isStreamLive, setIsStreamLive] = useState(false);

  const log = (msg: string) => {
    const text = `${new Date().toLocaleTimeString()} | ${msg}`;
    console.log(`[Viewer ${channelId}]`, text);
    setLogs(l => [...l.slice(-15), text]);
  };

  const startStatsMonitoring = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = window.setInterval(async () => {
      try {
        if (consumersRef.current.size === 0) return;
        
        const consumer = Array.from(consumersRef.current.values())[0];
        if (!consumer) return;
        
        const statsMap = await consumer.getStats();
        const statsArray = Array.from(statsMap.values());
        
        const videoStats = statsArray.find(
          (stat: any) => 
            stat.type === "inbound-rtp" && 
            stat.kind === "video" &&
            typeof stat.bitrate === "number"
        );
        
        if (videoStats && videoStats.bitrate) {
          const mbps = (videoStats.bitrate / 1024 / 1024).toFixed(1);
          setBitrate(`${mbps} Mbps`);
          
          const packetsLost = videoStats.packetsLost || 0;
          const jitter = videoStats.jitter || 0;
          
          if (packetsLost > 15 || jitter > 0.05) {
            setConnectionQuality("poor");
          } else if (packetsLost > 5 || jitter > 0.02) {
            setConnectionQuality("fair");
          } else {
            setConnectionQuality("good");
          }
        }
      } catch (error) {
        console.error("Ошибка при получении статистики:", error);
      }
    }, 3000);
  };

  const joinChannelRoom = () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    
    log(`Отправляем joinChannel для канала ${channelId}`);
    socket.emit("joinChannel", { channelId }, (response: any) => {
      if (response?.error) {
        log(`Не удалось присоединиться: ${response.error}`);
      } else {
        log(`Присоединились к каналу ${channelId}`);
      }
    });
  };

  const closeResources = () => {
    log("Очистка ресурсов");

    consumersRef.current.forEach(c => { 
      try { c.close(); } catch {} 
    });
    consumersRef.current.clear();

    if (transportRef.current) {
      try { transportRef.current.close(); } catch {}
      transportRef.current = null;
    }

    deviceRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onplaying = null;
      videoRef.current.onwaiting = null;
    }

    if (viewerPingIntervalRef.current) {
      clearInterval(viewerPingIntervalRef.current);
      viewerPingIntervalRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    setIsPlaying(false);
    setIsStreamLive(false);
    setStatus("Стрим не активен");
    setBitrate("0 kbps");
    setConnectionQuality("good");
  };

  const connectToStream = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    const socket = socketRef.current;
    if (!socket?.connected) {
      connectingRef.current = false;
      setStatus("Ошибка подключения к SFU");
      return;
    }

    try {
      log(`Проверяем стрим в канале ${channelId}`);

      const streamInfo = await new Promise<any>((resolve) => {
        socket.emit("checkStream", { channelId }, resolve);
      });

      log(`Результат проверки: ${JSON.stringify(streamInfo)}`);

      if (!streamInfo?.isLive) {
        setIsStreamLive(false);
        setStatus("Стрим не активен");
        connectingRef.current = false;
        
        joinChannelRoom();
        return;
      }

      log(`Стрим активен, подключаемся...`);
      setIsStreamLive(true);
      setStatus("Подключение...");

      const rtpCaps = await new Promise<any>((resolve) => {
        socket.emit("getRouterRtpCapabilities", { channelId }, resolve);
      });
      log("RTP Capabilities получены");

      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCaps });
      deviceRef.current = device;

      const transportData = await new Promise<any>((resolve) => {
        socket.emit("createWebRtcTransport", { channelId }, resolve);
      });

      const transport = device.createRecvTransport(transportData);
      transportRef.current = transport;

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socket.emit(
          "connectTransport",
          { channelId, transportId: transport.id, dtlsParameters },
          (res: any) => {
            if (res?.error) { 
              log("Transport connect error: " + res.error); 
              errback(new Error(res.error)); 
            } else { 
              log("Transport подключен"); 
              callback(); 
            }
          }
        );
      });

      const consumersData = await new Promise<any[]>((resolve) => {
        socket.emit("consume", {
          channelId,
          transportId: transport.id,
          rtpCapabilities: device.rtpCapabilities
        }, resolve);
      });
      
      log(`Получено потребителей: ${consumersData.length}`);

      if (!consumersData.length) {
        throw new Error("Нет доступных видеопотоков");
      }

      const mediaStream = new MediaStream();

      for (const info of consumersData) {
        const consumer = await transport.consume(info);
        consumersRef.current.set(consumer.id, consumer);
        mediaStream.addTrack(consumer.track);
        await consumer.resume();
        log(`Добавлен трек: ${consumer.kind} (id: ${consumer.id})`);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        videoRef.current.onplaying = () => {
          setIsPlaying(true);
          setBuffering(false);
          log("Видео воспроизводится");
        };
        
        videoRef.current.onwaiting = () => {
          setBuffering(true);
          log("Видео буферизируется...");
        };
        
        try {
          await videoRef.current.play();
          setStatus("LIVE");
          log("Видео воспроизводится");
        } catch (error: any) {
          log(`Автовоспроизведение заблокировано: ${error.message}`);
          // Не показываем "Нажмите для воспроизведения", просто оставляем LIVE статус
          setStatus("LIVE");
        }
      }

      joinChannelRoom();
      
      viewerPingIntervalRef.current = window.setInterval(
        () => {
          sendViewerPing(channelId);
          log("Ping отправлен");
        },
        10000
      );

      startStatsMonitoring();
      log("Успешно подключились к стриму");

    } catch (e: any) {
      log(`Ошибка подключения: ${e.message}`);
      console.error("Полная ошибка:", e);
      closeResources();
      
      reconnectTimeoutRef.current = window.setTimeout(() => {
        log("Пробуем переподключиться...");
        connectToStream();
      }, 3000);
    } finally {
      connectingRef.current = false;
    }
  };

  const getQualityColor = () => {
    switch (connectionQuality) {
      case "good": return "#00B26C";
      case "fair": return "#FFD748";
      case "poor": return "#EB0400";
      default: return "#00B26C";
    }
  };

  const getQualityText = () => {
    switch (connectionQuality) {
      case "good": return "Хорошее";
      case "fair": return "Среднее";
      case "poor": return "Плохое";
      default: return "Хорошее";
    }
  };

  useEffect(() => {
    log(`Инициализация для канала ${channelId}`);
    
    startSFUConnection();
    const socket = getSFUSocket();
    socketRef.current = socket;

    const unsub = subscribeToViewerCount(channelId, (count: number) => {
      log(`Обновление счетчика: ${count} зрителей`);
      setViewersCount(count);
      onViewersCountUpdate?.(count);
    });

    const handleStreamStarted = ({ channelId: startedChannelId }: any) => { 
      if (startedChannelId === channelId) {
        log("Получено событие начала стрима");
        connectToStream(); 
      }
    };
    
    const handleStreamStopped = ({ channelId: stoppedChannelId, reason }: any) => { 
      if (stoppedChannelId === channelId) { 
        log(`Стрим завершен: ${reason || 'неизвестно'}`);
        closeResources(); 
        onStreamEnded?.(); 
        setIsStreamLive(false);
        setStatus(`Стрим не активен`);
      }
    };

    socket.on("streamStarted", handleStreamStarted);
    socket.on("streamStopped", handleStreamStopped);

    const handleSocketConnect = () => {
      log("Подключились к SFU");
      
      socket.emit("checkStream", { channelId }, (response: any) => {
        if (response?.isLive) {
          log("Стрим активен, подключаемся...");
          connectToStream();
        } else {
          log("Стрим неактивен");
          setIsStreamLive(false);
          setStatus("Стрим не активен");
          joinChannelRoom();
        }
      });
    };

    socket.on("connect", handleSocketConnect);

    if (socket.connected) {
      handleSocketConnect();
    }

    return () => {
      log("Очистка компонента");
      unsub();
      closeResources();
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (viewerPingIntervalRef.current) {
        clearInterval(viewerPingIntervalRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      
      if (socket) {
        socket.off("streamStarted", handleStreamStarted);
        socket.off("streamStopped", handleStreamStopped);
        socket.off("connect", handleSocketConnect);
      }
    };
  }, [channelId]);

  return (
    <div className="viewer-video-container">
      <div className="viewer-header">
        <div className="viewer-title">
          <h3>
            <span className="viewer-title-text">Прямой эфир</span>
            <span className={`viewer-status ${status === 'LIVE' ? 'live' : 'offline'}`}>
              <span className="status-dot"></span>
              {status}
            </span>
          </h3>
        </div>
        <div className="channel-info">
          <span className="channel-label">Канал ID:</span>
          <span className="channel-value">{channelId}</span>
        </div>
      </div>

      <div className="video-wrapper">
        {!isStreamLive ? (
          <div className="preview-overlay">
            <div className="preview-content">
              {status === 'Инициализация...' || status === 'Подключение...' ? (
                <>
                  <div className="preview-icon">⚡</div>
                  <div className="preview-text">ПОДКЛЮЧЕНИЕ...</div>
                  <div className="preview-hint">Устанавливаем соединение с сервером</div>
                </>
              ) : (
                <>
                  <div className="preview-icon">⏸️</div>
                  <div className="preview-text">СТРИМ НЕ АКТИВЕН</div>
                  <div className="preview-hint">Ожидайте начала трансляции</div>
                </>
              )}
            </div>
          </div>
        ) : null}
        
        {buffering && (
          <div className="buffering-overlay">
            <div className="buffering-spinner"></div>
            <div className="buffering-text">БУФЕРИЗАЦИЯ...</div>
          </div>
        )}
        
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls
          className="viewer-video"
          style={{ display: isStreamLive ? 'block' : 'none' }}
        />
        
        {status === 'LIVE' && (
          <div className="live-overlay">
            <div className="live-badge">
              <span className="live-dot"></span>
              LIVE
            </div>
          </div>
        )}
      </div>

      <div className="viewer-info-panel">
        <div className="info-header">
          <h4>Информация о просмотре</h4>
          <div className="status-message">
            {status === 'LIVE' ? 'Трансляция в прямом эфире' : status}
          </div>
        </div>
        
        <div className="stream-stats">
          <div className="stat-item">
            <span className="stat-label">Зрители онлайн</span>
            <span className={`stat-value ${viewersCount > 0 ? 'online' : 'offline'}`}>
              👁️ {viewersCount}
            </span>
          </div>
          
          {isStreamLive && (
            <>
              <div className="stat-item">
                <span className="stat-label">Качество потока</span>
                <span 
                  className="stat-value"
                  style={{ color: getQualityColor() }}
                >
                  {connectionQuality === "good" ? "✅ " : 
                   connectionQuality === "fair" ? "⚠️ " : "❌ "}
                  {getQualityText()}
                </span>
              </div>
              
              <div className="stat-item">
                <span className="stat-label">Битрейт</span>
                <span className="stat-value">{bitrate}</span>
              </div>
              
              <div className="stat-item">
                <span className="stat-label">Состояние</span>
                <span className="stat-value">
                  {isPlaying ? "▶️ Воспроизведение" : "⏸️ Пауза"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="viewer-controls">
        <div className="buttons">
          <button 
            className="control-btn refresh-btn"
            onClick={connectToStream}
            disabled={connectingRef.current}
          >
            <span className="btn-icon">🔄</span>
            Обновить поток
          </button>
          <button 
            className="control-btn logs-btn" 
            onClick={() => setShowLogs(!showLogs)}
          >
            <span className="btn-icon">{showLogs ? '📋' : '📊'}</span>
            {showLogs ? 'Скрыть логи' : 'Показать логи'}
          </button>
        </div>
        
        {status === 'LIVE' && (
          <div className="stream-hints">
            <div className="hint-item success">
              <span className="hint-icon">✅</span>
              <span className="hint-text">
                Вы подключены к прямому эфиру. Задержка: ~2-3 секунды
              </span>
            </div>
          </div>
        )}
        
        {buffering && (
          <div className="stream-hints">
            <div className="hint-item warning">
              <span className="hint-icon">⏳</span>
              <span className="hint-text">
                Идет буферизация видео. Проверьте скорость интернета
              </span>
            </div>
          </div>
        )}
      </div>

      {showLogs && logs.length > 0 && (
        <div className="logs-panel">
          <div className="logs-header">
            <h5>Логи подключения</h5>
            <button 
              className="logs-clear-btn"
              onClick={() => setLogs([])}
            >
              Очистить
            </button>
          </div>
          <div className="logs-content">
            {logs.map((log, index) => (
              <div key={index} className="log-entry">
                <span className="log-time">{log.split('|')[0]}</span>
                <span className="log-message">{log.split('|')[1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}