import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import {
  getSFUSocket,
  startSFUConnection,
  onViewersCountUpdate as subscribeToViewerCount,
  requestViewerCount,
  sendViewerPing
} from "../../services/socketIOService";

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
  const connectingRef = useRef(false);

  const [status, setStatus] = useState("Инициализация...");
  const [viewersCount, setViewersCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    const text = `${new Date().toLocaleTimeString()} | ${msg}`;
    console.log(`[Viewer ${channelId}]`, text);
    setLogs(l => [...l.slice(-15), text]);
  };

  // ПРОСТАЯ ФУНКЦИЯ присоединения к каналу
  const joinChannelRoom = () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    
    log(`Отправляем joinChannel для канала ${channelId}`);
    socket.emit("joinChannel", { channelId }, (response: any) => {
      if (response?.error) {
        log(`⚠️ Не удалось присоединиться: ${response.error}`);
      } else {
        log(`✅ Присоединились к каналу ${channelId}`);
      }
    });
  };

  const closeResources = () => {
    log("🧹 Очистка ресурсов");

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
    }

    if (viewerPingIntervalRef.current) {
      clearInterval(viewerPingIntervalRef.current);
      viewerPingIntervalRef.current = null;
    }

    setStatus("Ожидание стрима");
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
      log(`🔎 Проверяем стрим в канале ${channelId}`);

      // 1. Проверяем активность стрима
      const streamInfo = await new Promise<any>((resolve) => {
        socket.emit("checkStream", { channelId }, resolve);
      });

      log(`Результат проверки: ${JSON.stringify(streamInfo)}`);

      if (!streamInfo?.isLive) {
        setStatus("Стрим не активен");
        connectingRef.current = false;
        
        // Все равно присоединяемся к комнате для получения обновлений
        joinChannelRoom();
        return;
      }

      log(`✅ Стрим активен, подключаемся...`);

      // 2. Получаем RTP capabilities
      const rtpCaps = await new Promise<any>((resolve) => {
        socket.emit("getRouterRtpCapabilities", { channelId }, resolve);
      });
      log("RTP Capabilities получены");

      // 3. Создаем устройство
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCaps });
      deviceRef.current = device;

      // 4. Создаем транспорт
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
              log("❌ Transport connect error: " + res.error); 
              errback(new Error(res.error)); 
            } else { 
              log("✅ Transport подключен"); 
              callback(); 
            }
          }
        );
      });

      // 5. Создаем consumers (получаем видеопоток)
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

      // 6. Собираем медиапоток
      const mediaStream = new MediaStream();

      for (const info of consumersData) {
        const consumer = await transport.consume(info);
        consumersRef.current.set(consumer.id, consumer);
        mediaStream.addTrack(consumer.track);
        await consumer.resume();
        log(`📹 Добавлен трек: ${consumer.kind} (id: ${consumer.id})`);
      }

      // 7. Воспроизводим видео
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
          log("🎬 Видео воспроизводится");
        } catch (error) {
          log("⚠️ Нужно взаимодействие для воспроизведения видео");
          setStatus("Нажмите на видео для воспроизведения");
        }
      }

      // 8. Запускаем пинги и присоединяемся к комнате
      joinChannelRoom();
      
      viewerPingIntervalRef.current = window.setInterval(
        () => {
          sendViewerPing(channelId);
          log("📡 Ping отправлен");
        },
        10000
      );

      setStatus("🔴 LIVE");
      log("🎥 Успешно подключились к стриму");

    } catch (e: any) {
      log(`❌ Ошибка подключения: ${e.message}`);
      console.error("Полная ошибка:", e);
      closeResources();
      
      // Пытаемся переподключиться через 3 секунды
      reconnectTimeoutRef.current = window.setTimeout(() => {
        log("🔄 Пробуем переподключиться...");
        connectToStream();
      }, 3000);
    } finally {
      connectingRef.current = false;
    }
  };

  useEffect(() => {
    log(`Инициализация для канала ${channelId}`);
    
    startSFUConnection();
    const socket = getSFUSocket();
    socketRef.current = socket;

    // Подписываемся на обновления счетчика зрителей
    const unsub = subscribeToViewerCount(channelId, (count: number) => {
      log(`📊 Обновление счетчика: ${count} зрителей`);
      setViewersCount(count);
      onViewersCountUpdate?.(count);
    });

    // Обработчик начала стрима
    const handleStreamStarted = ({ channelId: startedChannelId }: any) => { 
      if (startedChannelId === channelId) {
        log("🎬 Получено событие начала стрима");
        connectToStream(); 
      }
    };
    
    // Обработчик завершения стрима
    const handleStreamStopped = ({ channelId: stoppedChannelId, reason }: any) => { 
      if (stoppedChannelId === channelId) { 
        log(`⏹️ Стрим завершен: ${reason || 'неизвестно'}`);
        closeResources(); 
        onStreamEnded?.(); 
        setStatus(`Трансляция завершена`);
      }
    };

    socket.on("streamStarted", handleStreamStarted);
    socket.on("streamStopped", handleStreamStopped);

    // Обработчик подключения к сокету
    const handleSocketConnect = () => {
      log("✅ Подключились к SFU");
      
      // Проверяем стрим сразу при подключении
      socket.emit("checkStream", { channelId }, (response: any) => {
        if (response?.isLive) {
          log("🔎 Стрим активен, подключаемся...");
          connectToStream();
        } else {
          log("⏸️ Стрим неактивен");
          setStatus("Стрим не активен");
          // Присоединяемся к комнате для получения обновлений
          joinChannelRoom();
        }
      });
    };

    socket.on("connect", handleSocketConnect);

    // Если уже подключены - сразу проверяем
    if (socket.connected) {
      handleSocketConnect();
    }

    return () => {
      log("🧹 Очистка компонента");
      unsub();
      closeResources();
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (viewerPingIntervalRef.current) {
        clearInterval(viewerPingIntervalRef.current);
      }
      
      // Отписываемся от событий
      if (socket) {
        socket.off("streamStarted", handleStreamStarted);
        socket.off("streamStopped", handleStreamStopped);
        socket.off("connect", handleSocketConnect);
      }
    };
  }, [channelId]);

  return (
    <div style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "8px" }}>
      <h3>Зритель (Канал: {channelId})</h3>
      <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
        <div>👁️ <strong>{viewersCount}</strong> зрителей</div>
        <div>📡 Статус: <strong>{status}</strong></div>
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{ 
          width: "100%", 
          background: "#000",
          borderRadius: "5px",
          maxHeight: "400px"
        }}
      />

      {logs.length > 0 && (
        <div style={{ marginTop: "15px" }}>
          <details>
            <summary style={{ cursor: "pointer", color: "#666" }}>
              Логи подключения ({logs.length})
            </summary>
            <pre style={{ 
              background: "#f5f5f5", 
              padding: "10px", 
              borderRadius: "5px",
              maxHeight: "200px",
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