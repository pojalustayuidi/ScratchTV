import { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { 
  getSFUSocket, 
  startPingInterval,
  stopPingInterval,
  endStream
} from "../../services/socketIOService";

interface Props {
  channelId: number;
  stream: MediaStream | null;
  onStreamStarted?: (sessionId: string) => void;
  onStreamEnded?: () => void;
}


export default function StreamerVideo({ channelId, stream, onStreamStarted, onStreamEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const transportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("Ожидание потока");
  const [sessionId, setSessionId] = useState<string>("");

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

  const connectToSFU = async (stream: MediaStream) => {
  setStatus("Подключение...");

  const socket = getSFUSocket();
  if (!socket?.connected) {
    setStatus("Ошибка: нет подключения");
    return;
  }

  try {
    // Генерация sessionId
    const currentSessionId = generateSessionId();
    setSessionId(currentSessionId);

    // 1. Получаем RTP capabilities с передачей channelId
    const rtpCapabilities = await new Promise<any>((resolve, reject) => {
      socket.emit("getRouterRtpCapabilities", { channelId }, (data: any) => {
        if (data?.error) {
          reject(new Error(data.message || "SFU returned error"));
          return;
        }
        resolve(data);
      });
    });

      // 2. Создаем устройство
      deviceRef.current = new mediasoupClient.Device();
      await deviceRef.current.load({ routerRtpCapabilities: rtpCapabilities });

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
  
      const transport = deviceRef.current.createSendTransport({
        id: transportData.id,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
      });

      transportRef.current = transport;

      // 4. Подключаем транспорт
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
  console.log(`🔗 Connecting transport ${transport.id}...`);
  
  socket.emit("connectTransport", { 
    transportId: transport.id, 
    dtlsParameters,
    channelId
  }, (res: any) => {
    if (res?.error) {
      const errorMsg = res.message || res.error;
      console.error(`❌ Transport connect error for ${transport.id}:`, errorMsg);
      errback(new Error(errorMsg));
    } else {
      console.log(`✅ Transport ${transport.id} connected successfully`);
      callback();
    }
  });
});

      // 5. Создаем продюсера
      transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        socket.emit("produce", { 
          channelId, 
          transportId: transport.id, 
          kind, 
          rtpParameters,
          sessionId: currentSessionId
        }, (res: any) => {
          if (res?.error) errback(new Error(res.error));
          else callback({ id: res.id });
        });
      });

      // 6. Отправляем треки (ПРОСТО!)
      const tracks = stream.getTracks();
      for (const track of tracks) {
        // ВАЖНО: без сложных параметров!
        const producer = await transport.produce({ 
          track
        });
        producerRef.current = producer;
      }

      // 7. Устанавливаем статус
      setIsStreaming(true);
      setStatus("✅ Трансляция активна");
      
      if (onStreamStarted) {
        onStreamStarted(currentSessionId);
      }
      
      startPingInterval(channelId, currentSessionId);

    } catch (err: any) {
      console.error("❌ Ошибка подключения:", err);
      setStatus("Ошибка подключения");
    }
  };

  const handleEndStream = () => {
    if (producerRef.current) {
      producerRef.current.close();
      producerRef.current = null;
    }
    
    if (transportRef.current) {
      transportRef.current.close();
      transportRef.current = null;
    }
    
    if (sessionId) {
      endStream(channelId, sessionId);
      stopPingInterval();
    }
    
    setIsStreaming(false);
    setStatus("Трансляция завершена");
    
    if (onStreamEnded) {
      onStreamEnded();
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "8px" }}>
      <h3>Стример</h3>
      <div>Статус: {status}</div>
      <div>Канал: {channelId}</div>
      
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline
        width={720}
        style={{ border: "2px solid #ccc", backgroundColor: "#000" }}
      />
      
      {isStreaming ? (
        <button onClick={handleEndStream} style={{ marginTop: "10px" }}>
          🛑 Завершить трансляцию
        </button>
      ) : (
        <button onClick={() => stream && connectToSFU(stream)} style={{ marginTop: "10px" }}>
          ▶️ Начать трансляцию
        </button>
      )}
    </div>
  );
}