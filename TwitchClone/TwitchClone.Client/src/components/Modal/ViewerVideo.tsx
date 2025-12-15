import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { 
  getSFUSocket, 
  startSFUConnection,
  onViewersCountUpdate as subscribeToViewerCount,
  requestViewerCount,
  sendViewerPing // Добавляем импорт
} from "../../services/socketIOService";

interface Props {
  channelId: number;
  onStreamEnded?: () => void;
  onViewersCountUpdate?: (count: number) => void;
}

export default function ViewerVideo({ channelId, onStreamEnded, onViewersCountUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("Инициализация...");
  const [viewersCount, setViewersCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const transportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumerRef = useRef<mediasoupClient.types.Consumer | null>(null);
  const socketRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const viewerPingIntervalRef = useRef<number | null>(null);
  const connectingRef = useRef(false);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `${timestamp}: ${msg}`;
    console.log(logMsg);
    setLogs(prev => [...prev.slice(-10), logMsg]);
  };

  // ------------------------------
  // Очистка ресурсов
  // ------------------------------
  const closeResources = () => {
    addLog("🧹 Закрытие ресурсов...");
    
    // Закрываем consumer
    if (consumerRef.current) {
        try {
            consumerRef.current.close();
            addLog(`Consumer закрыт: ${consumerRef.current.id}`);
        } catch (err) {
            addLog("⚠️ Ошибка закрытия consumer");
        }
        consumerRef.current = null;
    }
    
    // Закрываем транспорт
    if (transportRef.current) {
        try {
            transportRef.current.close();
            addLog(`Транспорт закрыт: ${transportRef.current.id}`);
        } catch (err: any) {
            addLog("⚠️ Ошибка закрытия транспорта");
        }
        transportRef.current = null;
    }
    
    // Очищаем device
    deviceRef.current = null;
    
    // Очищаем видео
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
    
    // Очищаем интервал ping
    if (viewerPingIntervalRef.current) {
      clearInterval(viewerPingIntervalRef.current);
      viewerPingIntervalRef.current = null;
    }
    
    setStatus("Ожидание стрима");
    setIsConnected(false);
    addLog("✅ Ресурсы очищены");
  };

  // ------------------------------
  // Подключение к стриму
  // ------------------------------
  const connectToStream = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    addLog("🔄 Подключение к стриму...");
    setStatus("Подключение к видеопотоку...");

    const socket = socketRef.current;
    if (!socket?.connected) {
      addLog("❌ Socket не подключен");
      connectingRef.current = false;
      return;
    }

    try {
      // Проверка активности стрима
      addLog("Проверяем активность стрима...");
      
      const streamCheck = await new Promise<any>((resolve, reject) => {
        socket.emit("checkStream", { channelId }, (data: any) => {
          if (data?.error) {
            reject(data.error);
          } else {
            resolve(data);
          }
        });
      });

      if (!streamCheck.isLive) {
        addLog("⏸️ Стрим не активен");
        setStatus("Стрим не активен");
        connectingRef.current = false;
        return;
      }

      addLog(`✅ Стрим активен, зрителей: ${streamCheck.viewersCount || 0}`);

      // RTP capabilities - ИСПРАВЛЕНО: передаем channelId
      addLog("Запрашиваем RTP capabilities...");
      const rtpCapabilities = await new Promise<any>((resolve, reject) => {
        socket.emit("getRouterRtpCapabilities", { channelId }, (data: any) => {
          if (!data) {
            reject(new Error("SFU did not return RTP capabilities"));
            return;
          }

          if (data.error) {
            reject(new Error(data.message || "Failed to get RTP capabilities"));
            return;
          }

          if (!data.codecs) {
            reject(new Error("Invalid RTP capabilities structure"));
            return;
          }

          resolve(data);
        });
      });

      // Создаем устройство
      const device = new mediasoupClient.Device();
      try {
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        
        deviceRef.current = device;
        addLog("✅ Устройство загружено");
      } catch (err: any) {
        addLog(`❌ Ошибка загрузки устройства: ${err.message}`);
        throw err;
      }

      // Создаем транспорт (ВАЖНО: передаем channelId и isProducer: false!)
      addLog("Создаем транспорт...");
      const transportData = await new Promise<any>((resolve, reject) => {
        socket.emit("createWebRtcTransport", { 
          channelId: channelId,
          isProducer: false
        }, (data: any) => {
          if (data?.error) {
            reject(data.error);
          } else if (!data?.id) {
            reject("Некорректный ответ от сервера");
          } else {
            resolve(data);
          }
        });
      });

      addLog(`✅ Транспорт создан: ${transportData.id}`);

      const transport = device.createRecvTransport({
        id: transportData.id,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
      });
      transportRef.current = transport;

      // Подключаем транспорт - ИСПРАВЛЕНО: передаем channelId
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        addLog("Подключение транспорта к серверу...");
        
        socket.emit("connectTransport", { 
          transportId: transport.id, 
          dtlsParameters,
          channelId // Добавляем channelId
        }, (res: any) => {
          if (res?.error) {
            addLog(`❌ Ошибка подключения транспорта: ${res.error}`);
            errback(new Error(res.error));
          } else {
            addLog("✅ Транспорт подключен к серверу");
            callback();
          }
        });
      });

      // Обработчик состояния соединения
      transport.on("connectionstatechange", (state) => {
        addLog(`📡 Состояние соединения: ${state}`);
        
        if (state === "disconnected" || state === "failed") {
          addLog("⚠️ Проблемы с соединением транспорта");
          setStatus(`Проблемы с соединением: ${state}`);
        }
      });

      // Запрашиваем consumer - ИСПРАВЛЕНО: передаем socket.id
      addLog("Запрашиваем consumer...");
      
      const consumerData = await new Promise<any>((resolve, reject) => {
        socket.emit("consume", { 
          channelId: channelId,
          rtpCapabilities: device.rtpCapabilities, 
          transportId: transport.id,
          socketId: socket.id // Добавляем socket.id
        }, (data: any) => {
          if (data?.error) {
            reject(data.error);
          } else if (!data) {
            reject("Некорректный ответ от сервера");
          } else {
            resolve(data);
          }
        });
      });

      // Создаем consumer - проверяем массив consumerData
      if (!Array.isArray(consumerData) || consumerData.length === 0) {
        throw new Error("Нет доступных видеопотоков для потребления");
      }

      // Берем первый consumer (обычно video)
      const consumerInfo = consumerData[0];
      const consumer = await transport.consume({
        id: consumerInfo.id,
        producerId: consumerInfo.producerId,
        kind: consumerInfo.kind,
        rtpParameters: consumerInfo.rtpParameters
      });
      consumerRef.current = consumer;
      addLog(`✅ Consumer создан: ${consumer.id}, kind: ${consumer.kind}`);

      // Создаем поток для видео
      const remoteStream = new MediaStream();
      remoteStream.addTrack(consumer.track);
      
      if (videoRef.current) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.muted = true;
        
        try { 
          await videoRef.current.play(); 
          addLog("✅ Видео воспроизводится"); 
        } catch (e: any) { 
          addLog(`❌ Ошибка воспроизведения: ${e.message}`);
        }
      }

      setIsConnected(true);
      setStatus("✅ Стрим активен");
      addLog("🎥 Видеопоток подключен");

      // Запускаем ping для зрителя
      if (viewerPingIntervalRef.current) {
        clearInterval(viewerPingIntervalRef.current);
      }
      viewerPingIntervalRef.current = window.setInterval(() => {
        sendViewerPing(channelId);
      }, 10000);

    } catch (err: any) {
      addLog(`❌ Ошибка подключения: ${err.message || err}`);
      console.error("❌ Полная ошибка подключения:", err);

      setStatus("Ожидание стрима...");
      closeResources();

      // Авто переподключение через 5 секунд
      if (socket?.connected) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = window.setTimeout(() => {
          addLog("🔄 Автоматическое переподключение...");
          connectToStream();
        }, 5000);
      }
    } finally {
      connectingRef.current = false;
    }
  };

  // ------------------------------
  // SFU Socket + real-time viewers
  // ------------------------------
  useEffect(() => {
    if (!channelId) {
      addLog("❌ КРИТИЧЕСКАЯ ОШИБКА: channelId не передан");
      return;
    }

    addLog(`👁️ Начинаем просмотр канала ${channelId}`);
    
    startSFUConnection();
    const socket = getSFUSocket();
    if (!socket) { 
      addLog("❌ Socket не инициализирован"); 
      return; 
    }
    socketRef.current = socket;

    // Счетчик зрителей
    const unsubscribeViewers = subscribeToViewerCount(channelId, (count: number) => {
      setViewersCount(count);
      if (onViewersCountUpdate) {
        onViewersCountUpdate(count);
      }
    });

    // Запрос текущего количества зрителей
    requestViewerCount(channelId)
      .then(count => {
        setViewersCount(count);
        if (onViewersCountUpdate) {
          onViewersCountUpdate(count);
        }
      })
      .catch(err => {
        console.error("Ошибка запроса счетчика зрителей:", err);
      });

    // Подписка на события стрима
    const handleStreamStarted = (data: any) => {
      if (data.channelId === channelId && !transportRef.current) {
        addLog("🎬 Получено уведомление о начале стрима");
        connectToStream();
      }
    };

    const handleStreamStopped = (data: any) => {
      if (data.channelId === channelId) {
        addLog("⏹️ Стрим завершен");
        closeResources();
        setStatus("Стрим завершен");
        if (onStreamEnded) {
          onStreamEnded();
        }
      }
    };

    // Используем правильные функции из socketIOService
    socket.on("streamStarted", handleStreamStarted);
    socket.on("streamStopped", handleStreamStopped);

    // Проверка текущего состояния стрима
    if (socket.connected) {
      addLog("✅ Socket уже подключен, начинаем подключение к стриму");
      connectToStream();
    } else {
      addLog("⏳ Ожидаем подключения Socket...");
      const handleConnect = () => {
        addLog("✅ Socket подключен, начинаем подключение к стриму");
        connectToStream();
      };
      socket.on("connect", handleConnect);
    }

    return () => {
      addLog("🗑️ Компонент размонтируется...");
      
      // Отписываемся от всех событий
      unsubscribeViewers();
      
      if (socketRef.current) {
        socketRef.current.off("streamStarted", handleStreamStarted);
        socketRef.current.off("streamStopped", handleStreamStopped);
        socketRef.current.off("connect");
      }
      
      // Очищаем таймауты
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (viewerPingIntervalRef.current) {
        clearInterval(viewerPingIntervalRef.current);
        viewerPingIntervalRef.current = null;
      }
      
      // Очищаем ресурсы
      closeResources();
    };
  }, [channelId, onStreamEnded, onViewersCountUpdate]);

  const handleManualReconnect = () => {
    addLog("🔄 Ручное переподключение...");
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    closeResources();
    connectToStream();
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "8px" }}>
      <h3 style={{ marginTop: 0 }}>Панель зрителя</h3>
      
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "15px" 
      }}>
        <div style={{ fontSize: "18px" }}>
          👁️ <strong>{viewersCount}</strong> зрителей
        </div>
        <div>
          <strong>Статус:</strong> {status}
        </div>
      </div>
      
      {/* Отладочные логи */}
      <div style={{ 
        backgroundColor: "#f5f5f5", 
        padding: "10px", 
        marginBottom: "15px",
        borderRadius: "4px",
        fontSize: "12px",
        maxHeight: "150px",
        overflow: "auto",
        fontFamily: "monospace"
      }}>
        <strong style={{ display: "block", marginBottom: "5px" }}>Логи:</strong>
        {logs.map((log, i) => (
          <div key={i} style={{ 
            margin: "2px 0", 
            padding: "2px 4px",
            borderRadius: "2px",
            backgroundColor: log.includes("✅") ? "#d4edda" : 
                           log.includes("❌") ? "#f8d7da" : 
                           log.includes("⚠️") ? "#fff3cd" : "transparent",
            color: log.includes("✅") ? "#155724" : 
                  log.includes("❌") ? "#721c24" : 
                  log.includes("⚠️") ? "#856404" : "#666",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}>
            {log}
          </div>
        ))}
      </div>
      
      {/* Видео элемент */}
      <div style={{ position: "relative", marginBottom: "15px", width: "100%",
    height: "100%",
    backgroundColor: "#000",
    overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          controls
          width="100%"
          style={{ 
            border: "2px solid #ccc", 
            backgroundColor: "#000",
            borderRadius: "4px",
            display: isConnected ? "block" : "none"
          }}
        />
        
        {!isConnected && (
          <div style={{ 
            width: "100%", 
            aspectRatio: "16/9",
            backgroundColor: "#000", 
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #ccc",
            borderRadius: "4px"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "10px" }}>⏸️</div>
              <div style={{ fontSize: "18px", marginBottom: "5px" }}>{status}</div>
              <button 
                onClick={handleManualReconnect}
                style={{ 
                  padding: "8px 16px", 
                  backgroundColor: "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Попробовать снова
              </button>
            </div>
          </div>
        )}
        
        {/* Оверлей при просмотре */}
        {isConnected && (
          <div style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            backgroundColor: "rgba(220, 53, 69, 0.9)",
            color: "white",
            padding: "5px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: "bold"
          }}>
            🔴 LIVE
          </div>
        )}
      </div>
      
      {/* Кнопки управления */}
      <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
        <button 
          onClick={handleManualReconnect}
          style={{ 
            padding: "10px 20px", 
            backgroundColor: "#17a2b8",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            flex: 1
          }}
        >
          🔄 Переподключиться к стриму
        </button>
        
        <button 
          onClick={() => window.location.reload()}
          style={{ 
            padding: "10px 20px", 
            backgroundColor: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          ⟳ Обновить страницу
        </button>
      </div>
      
      {/* Информация о подключении */}
      <div style={{ 
        marginTop: "15px", 
        padding: "10px", 
        backgroundColor: "#e9ecef",
        borderRadius: "4px",
        fontSize: "12px"
      }}>
        <strong>Информация о подключении:</strong>
        <div style={{ marginTop: "5px" }}>
          <div>Канал ID: {channelId}</div>
          <div>Статус: {isConnected ? "✅ Подключен" : "❌ Не подключен"}</div>
          <div>Транспорт: {transportRef.current ? "✅ Создан" : "❌ Нет"}</div>
          <div>Consumer: {consumerRef.current ? "✅ Создан" : "❌ Нет"}</div>
          <div>Socket: {socketRef.current?.connected ? "✅ Подключен" : "❌ Отключен"}</div>
        </div>
      </div>
    </div>
  );
}