import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { 
  endStream,
  getSFUSocket, 
  startPingInterval,
  stopPingInterval,
  onViewersCountUpdate as subscribeToViewerCount, // ДОБАВЛЕНО
  requestViewerCount // ДОБАВЛЕНО
} from "../../services/socketIOService";

interface Props {
  channelId: number;
  stream: MediaStream | null;
  onStreamStarted?: (sessionId: string) => void;
  onStreamEnded?: () => void;
  onViewersCountUpdate?: (count: number) => void; // ДОБАВЛЕНО
}

export default function StreamerVideo({ 
  channelId, 
  stream, 
  onStreamStarted, 
  onStreamEnded,
  onViewersCountUpdate // ДОБАВЛЕНО
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const transportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("Ожидание потока");
  const [sessionId, setSessionId] = useState<string>("");
  const [viewersCount, setViewersCount] = useState(0); // ДОБАВЛЕНО
  const [logs, setLogs] = useState<string[]>([]); // ДОБАВЛЕНО

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
    };
  }, [stream]);

  useEffect(() => {
    // Подписываемся на обновления счетчика зрителей
    const unsub = subscribeToViewerCount(channelId, (count: number) => {
      log(`📊 Обновление счетчика: ${count} зрителей`);
      setViewersCount(count);
      onViewersCountUpdate?.(count);
    });

    // Запрашиваем текущее количество при монтировании
    if (isStreaming) {
      requestViewerCount(channelId).then(count => {
        setViewersCount(count);
        onViewersCountUpdate?.(count);
      }).catch(() => {});
    }

    return () => {
      unsub();
    };
  }, [channelId, isStreaming]);

  const connectToSFU = async (stream: MediaStream) => {
    setStatus("Подключение...");
    log("Начинаем подключение к SFU");

    const socket = getSFUSocket();
    if (!socket?.connected) {
      setStatus("Ошибка: нет подключения");
      log("❌ Нет подключения к SFU");
      return;
    }

    try {
      // Генерация sessionId
      const currentSessionId = generateSessionId();
      setSessionId(currentSessionId);
      log(`Создан sessionId: ${currentSessionId}`);

      // 1. Получаем RTP capabilities
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

      // 2. Создаем устройство
      deviceRef.current = new mediasoupClient.Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });
      log("Устройство создано");

      // 3. Создаем транспорт
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

      // 4. Подключаем транспорт
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        log(`Подключаем транспорт ${transport.id}...`);
        
        socket.emit("connectTransport", { 
          transportId: transport.id, 
          dtlsParameters,
          channelId
        }, (res: any) => {
          if (res?.error) {
            const errorMsg = res.message || res.error;
            log(`❌ Ошибка подключения транспорта: ${errorMsg}`);
            errback(new Error(errorMsg));
          } else {
            log(`✅ Транспорт подключен успешно`);
            callback();
          }
        });
      });

      // 5. Создаем продюсера
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
            log(`❌ Ошибка создания producer: ${res.error}`);
            errback(new Error(res.error));
          } else {
            log(`✅ Producer создан: ${res.id}`);
            callback({ id: res.id });
          }
        });
      });

      // 6. Отправляем треки
      const tracks = stream.getTracks();
      log(`Отправляем ${tracks.length} треков`);
      
      for (const track of tracks) {
        try {
          const producer = await transport.produce({ track });
          producerRef.current = producer;
          log(`🎥 Трек отправлен: ${track.kind} (id: ${producer.id})`);
        } catch (error: any) {
          log(`❌ Ошибка отправки трека ${track.kind}: ${error.message}`);
        }
      }

      // 7. Устанавливаем статус
      setIsStreaming(true);
      setStatus("✅ Трансляция активна");
      log("Трансляция запущена");
      
      if (onStreamStarted) {
        onStreamStarted(currentSessionId);
      }
      
      startPingInterval(channelId, currentSessionId);
      
      // Запрашиваем начальное количество зрителей
      setTimeout(() => {
        requestViewerCount(channelId).then(count => {
          log(`📊 Начальное количество зрителей: ${count}`);
          setViewersCount(count);
          onViewersCountUpdate?.(count);
        }).catch(() => {});
      }, 1000);

    } catch (err: any) {
      log(`❌ Ошибка подключения: ${err.message}`);
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
    
    if (sessionId) {
      endStream(channelId, sessionId);
      stopPingInterval();
      log(`Трансляция ${sessionId} остановлена`);
    }
    
    setIsStreaming(false);
    setViewersCount(0);
    setStatus("Трансляция завершена");
    
    if (onStreamEnded) {
      onStreamEnded();
    }
    
    if (onViewersCountUpdate) {
      onViewersCountUpdate(0);
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "8px" }}>
      <h3>Стример (Канал: {channelId})</h3>
      <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
        <div>Статус: <strong>{status}</strong></div>
        <div>👁️ <strong>{viewersCount}</strong> зрителей</div>
        {sessionId && (
          <div title={sessionId}>
            ID: <code>{sessionId.substring(0, 8)}...</code>
          </div>
        )}
      </div>
      
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline
        width={720}
        style={{ 
          border: "2px solid #ccc", 
          backgroundColor: "#000",
          borderRadius: "5px",
          marginBottom: "10px"
        }}
      />
      
      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        {isStreaming ? (
          <button 
            onClick={handleEndStream} 
            style={{ 
              padding: "10px 20px", 
              background: "#ff4444",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            🛑 Завершить трансляцию
          </button>
        ) : (
          <button 
            onClick={() => stream && connectToSFU(stream)} 
            style={{ 
              padding: "10px 20px", 
              background: "#9146FF",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
            disabled={!stream}
          >
            ▶️ Начать трансляцию
          </button>
        )}
      </div>

      {logs.length > 0 && (
        <div style={{ marginTop: "15px" }}>
          <details>
            <summary style={{ cursor: "pointer", color: "#666", fontSize: "14px" }}>
              Логи трансляции ({logs.length})
            </summary>
            <pre style={{ 
              background: "#f5f5f5", 
              padding: "10px", 
              borderRadius: "5px",
              maxHeight: "150px",
              overflowY: "auto",
              fontSize: "11px",
              marginTop: "5px"
            }}>
              {logs.join("\n")}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}