import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { 
  endStream,
  getSFUSocket, 
  startPingInterval,
  stopPingInterval,
  onViewersCountUpdate as subscribeToViewerCount,
  requestViewerCount
} from "../../services/socketIOService";
import "./StreamerVideo.css";

interface Props {
  channelId: number;
  stream: MediaStream | null;
  onStreamStarted?: (sessionId: string) => void;
  onStreamEnded?: () => void;
  onViewersCountUpdate?: (count: number) => void;
}

export default function StreamerVideo({ 
  channelId, 
  stream, 
  onStreamStarted, 
  onStreamEnded,
  onViewersCountUpdate
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const transportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("Ожидание потока");
  const [sessionId, setSessionId] = useState<string>("");
  const [viewersCount, setViewersCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [bitrate, setBitrate] = useState<string>("0 kbps");
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor">("good");

  const log = (msg: string) => {
    const text = `${new Date().toLocaleTimeString()} | ${msg}`;
    console.log(`[Streamer ${channelId}]`, text);
    setLogs(l => [...l.slice(-10), text]);
  };

  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  useEffect(() => {
    if (!stream) return;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }

    connectToSFU(stream);

    return () => {
      handleEndStream();
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [stream]);

  useEffect(() => {
    const unsub = subscribeToViewerCount(channelId, (count: number) => {
      log(`Обновление счетчика: ${count} зрителей`);
      setViewersCount(count);
      onViewersCountUpdate?.(count);
    });

    if (isStreaming) {
      requestViewerCount(channelId).then(count => {
        setViewersCount(count);
        onViewersCountUpdate?.(count);
      }).catch(() => {});
    }

    return () => {
      unsub();
    };
  }, [channelId, isStreaming, onViewersCountUpdate]);

  const startStatsMonitoring = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = window.setInterval(async () => {
      try {
        if (!producerRef.current) return;
        
        const statsMap = await producerRef.current.getStats();
        
        const statsArray = Array.from(statsMap.values());
        
        const videoStats = statsArray.find(
          (stat: any) => 
            stat.type === "outbound-rtp" && 
            stat.kind === "video" &&
            typeof stat.bitrate === "number"
        );
        
        if (videoStats && videoStats.bitrate) {
          const mbps = (videoStats.bitrate / 1024 / 1024).toFixed(1);
          setBitrate(`${mbps} Mbps`);
          
          const packetsLost = videoStats.packetsLost || 0;
          if (packetsLost > 10) {
            setConnectionQuality("poor");
          } else if (packetsLost > 5) {
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

  const connectToSFU = async (stream: MediaStream) => {
    setStatus("Подключение...");
    log("Начинаем подключение к SFU");

    const socket = getSFUSocket();
    if (!socket?.connected) {
      setStatus("Ошибка: нет подключения");
      log("Нет подключения к SFU");
      return;
    }

    try {
      const currentSessionId = generateSessionId();
      setSessionId(currentSessionId);
      log(`Создан sessionId: ${currentSessionId}`);

      const rtpCapabilities = await new Promise<any>((resolve, reject) => {
        socket.emit("getRouterRtpCapabilities", { channelId }, (data: any) => {
          if (data?.error) {
            reject(new Error(data.message || "SFU returned error"));
            return;
          }
          resolve(data);
        });
      });
      log("RTP capabilities получены");

      deviceRef.current = new mediasoupClient.Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      log("Устройство создано");

      const transportData = await new Promise<any>((resolve, reject) => {
        socket.emit("createWebRtcTransport", { 
          channelId,  
          isProducer: true
        }, (data: any) => {
          if (data?.error) reject(data.error);
          else resolve(data);
        });
      });
      log(`Транспорт создан: ${transportData.id}`);

      const transport = deviceRef.current.createSendTransport({
        id: transportData.id,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
      });

      transportRef.current = transport;

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        log(`Подключаем транспорт ${transport.id}...`);
        
        socket.emit("connectTransport", { 
          transportId: transport.id, 
          dtlsParameters,
          channelId
        }, (res: any) => {
          if (res?.error) {
            const errorMsg = res.message || res.error;
            log(`Ошибка подключения транспорта: ${errorMsg}`);
            errback(new Error(errorMsg));
          } else {
            log(`Транспорт подключен успешно`);
            callback();
          }
        });
      });

      transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        log(`Создаем producer для ${kind}`);
        socket.emit("produce", { 
          channelId, 
          transportId: transport.id, 
          kind, 
          rtpParameters,
          sessionId: currentSessionId
        }, (res: any) => {
          if (res?.error) {
            log(`Ошибка создания producer: ${res.error}`);
            errback(new Error(res.error));
          } else {
            log(`Producer создан: ${res.id}`);
            callback({ id: res.id });
          }
        });
      });

      const tracks = stream.getTracks();
      log(`Отправляем ${tracks.length} треков`);
      
      for (const track of tracks) {
        try {
          const producer = await transport.produce({ track });
          producerRef.current = producer;
          log(`Трек отправлен: ${track.kind} (id: ${producer.id})`);
        } catch (error: any) {
          log(`Ошибка отправки трека ${track.kind}: ${error.message}`);
        }
      }

      setIsStreaming(true);
      setStatus("LIVE");
      log("Трансляция запущена");
      
      if (onStreamStarted) {
        onStreamStarted(currentSessionId);
      }
      
      startPingInterval(channelId, currentSessionId);
      startStatsMonitoring();

      setTimeout(() => {
        requestViewerCount(channelId).then(count => {
          log(`Начальное количество зрителей: ${count}`);
          setViewersCount(count);
          onViewersCountUpdate?.(count);
        }).catch(() => {});
      }, 1000);

    } catch (err: any) {
      log(`Ошибка подключения: ${err.message}`);
      console.error("Полная ошибка:", err);
      setStatus("Ошибка подключения");
    }
  };

  const handleEndStream = () => {
    log("Завершаем трансляцию...");
    
    if (producerRef.current) {
      producerRef.current.close();
      producerRef.current = null;
      log("Producer закрыт");
    }
    
    if (transportRef.current) {
      transportRef.current.close();
      transportRef.current = null;
      log("Транспорт закрыт");
    }
    
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    
    if (sessionId) {
      endStream(channelId, sessionId);
      stopPingInterval();
      log(`Трансляция ${sessionId} остановлена`);
    }
    
    setIsStreaming(false);
    setViewersCount(0);
    setStatus("Оффлайн");
    setBitrate("0 kbps");
    setConnectionQuality("good");
    
    if (onStreamEnded) {
      onStreamEnded();
    }
    
    if (onViewersCountUpdate) {
      onViewersCountUpdate(0);
    }
  };

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    log("Session ID скопирован в буфер");
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

  return (
    <div className="streamer-video-container">
      <div className="streamer-header">
        <div className="streamer-title">
          <h3>
            <span className="stream-title-text">Прямой эфир</span>
            <span className={`stream-status ${isStreaming ? 'live' : 'offline'}`}>
              <span className="status-dot"></span>
              {isStreaming ? "LIVE" : status}
            </span>
          </h3>
        </div>
        <div className="channel-info">
          <span className="channel-label">Канал ID:</span>
          <span className="channel-value">{channelId}</span>
        </div>
      </div>

      <div className="video-wrapper">
        {!stream ? (
          <div className="preview-overlay">
            <div className="preview-content">
              <div className="preview-icon">🎥</div>
              <div className="preview-text">НЕТ ВИДЕОПОТОКА</div>
              <div className="preview-hint">Подключите камеру или экран для начала трансляции</div>
            </div>
          </div>
        ) : !isStreaming ? (
          <div className="preview-overlay">
            <div className="preview-content">
              <div className="preview-icon">⚡</div>
              <div className="preview-text">ГОТОВ К ТРАНСЛЯЦИИ</div>
              <div className="preview-hint">Нажмите "Начать трансляцию" для запуска</div>
            </div>
          </div>
        ) : null}
        
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="streamer-video"
        />

        {isStreaming && (
          <div className="live-overlay">
            <div className="live-badge">
              <span className="live-dot"></span>
              LIVE
            </div>
          </div>
        )}
      </div>

      <div className="stream-info-panel">
        <div className="info-header">
          <h4>Информация о трансляции</h4>
          <div className="status-message">
            {isStreaming ? "Трансляция активна" : "Трансляция не запущена"}
          </div>
        </div>
        
        <div className="stream-stats">
          <div className="stat-item">
            <span className="stat-label">Зрители</span>
            <span className={`stat-value ${viewersCount > 0 ? 'online' : 'offline'}`}>
              👁️ {viewersCount}
            </span>
          </div>
          
          <div className="stat-item">
            <span className="stat-label">Качество</span>
            <span 
              className="stat-value"
              style={{ color: getQualityColor() }}
            >
              {connectionQuality === "good" ? " " : 
               connectionQuality === "fair" ? " " : ""}
              {getQualityText()}
            </span>
          </div>
          
          <div className="stat-item">
            <span className="stat-label">Битрейт</span>
            <span className="stat-value">{bitrate}</span>
          </div>
          
          {sessionId && (
            <div className="stat-item session-id" onClick={copySessionId}>
              <span className="stat-label">ID трансляции</span>
              <span className="stat-value" title="Нажмите для копирования">
                {sessionId.substring(0, 20)}...
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="stream-controls">
        {isStreaming ? (
          <div className="streaming-controls">
            <button className="control-btn end-btn" onClick={handleEndStream}>
              <span className="btn-icon">🛑</span>
              Завершить трансляцию
            </button>
            <button 
              className="control-btn stats-btn" 
              onClick={() => setShowLogs(!showLogs)}
            >
              <span className="btn-icon">{showLogs ? '📋' : '📊'}</span>
              {showLogs ? 'Скрыть логи' : 'Показать логи'}
            </button>
          </div>
        ) : (
          <button 
            className={`control-btn start-btn ${!stream ? 'disabled' : ''}`}
            onClick={() => stream && connectToSFU(stream)}
            disabled={!stream}
          >
            <span className="btn-icon">▶️</span>
            Начать трансляцию
          </button>
        )}
        
        {!stream && (
          <div className="stream-hints">
            <div className="hint-item warning">
              <span className="hint-icon">⚠️</span>
              <span className="hint-text">Видеопоток не обнаружен. Проверьте подключение камеры или разрешения экрана.</span>
            </div>
          </div>
        )}
        
        {isStreaming && (
          <div className="stream-hints">
            <div className="hint-item success">
              <span className="hint-icon">✅</span>
              <span className="hint-text">Трансляция успешно запущена и доступна зрителям.</span>
            </div>
          </div>
        )}
      </div>

      {showLogs && logs.length > 0 && (
        <div className="logs-panel">
          <div className="logs-header">
            <h5>Логи трансляции</h5>
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