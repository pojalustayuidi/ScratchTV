import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let pingInterval: number | null = null;

// ИСПРАВЛЕНО: Используем правильный URL (порт 3000 для Node.js SFU)
export const startSFUConnection = () => {
  if (!socket) {
    socket = io("http://localhost:3000", { // БЫЛО 3001
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("✅ SFU connected:", socket?.id);
    });

    socket.on("disconnect", () => {
      console.log("❌ SFU disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("❌ SFU connection error:", error.message);
    });
  }
  return socket;
};

export const getSFUSocket = () => {
  if (!socket || !socket.connected) {
    console.warn("SFU socket not connected, reconnecting...");
    return startSFUConnection();
  }
  return socket;
};

// Новые события для сессий
export const onStreamResumed = (callback: (data: { channelId: number, sessionId: string }) => void) => {
  const s = getSFUSocket();
  s?.on("streamResumed", callback);
  return () => s?.off("streamResumed", callback);
};

export const onStreamStarted = (callback: (data: { channelId: number, sessionId: string }) => void) => {
  const s = getSFUSocket();
  s?.on("streamStarted", callback);
  return () => s?.off("streamStarted", callback);
};

export const onStreamStopped = (callback: (data: { 
  channelId: number, 
  sessionId?: string,
  reason?: string,
  stoppedBy?: string 
}) => void) => {
  const s = getSFUSocket();
  s?.on("streamStopped", callback);
  return () => s?.off("streamStopped", callback);
};

export const onProducerClosed = (callback: (data: { channelId: number }) => void) => {
  const s = getSFUSocket();
  s?.on("producerClosed", callback);
  return () => s?.off("producerClosed", callback);
};

// Функция для отправки пингов
export const startPingInterval = (channelId: number, sessionId: string) => {
  if (pingInterval) clearInterval(pingInterval);
  
  pingInterval = window.setInterval(() => {
    const socket = getSFUSocket();
    socket?.emit("streamerPing", { channelId, sessionId });
  }, 10000);
};

export const stopPingInterval = () => {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
};

export const sendViewerPing = (channelId: number) => {
  const socket = getSFUSocket();
  if (socket?.connected) {
    socket.emit("viewerPing", { channelId });
  }
};

// Подписка на обновления счетчика зрителей
export const onViewersCountUpdate = (channelId: number, callback: (count: number) => void) => {
  const s = getSFUSocket();
  if (!s) return () => {};
  
  const listener = (data: { channelId: number; count: number; timestamp?: number }) => {
    if (data.channelId === channelId) {
      callback(data.count);
    }
  };
  
  s.on("viewersUpdated", listener);
  s.on("viewerCountUpdate", listener);
  s.on("ViewersUpdated", listener); // Добавляем разные варианты
  
  // Возвращаем функцию для отписки
  return () => {
    s.off("viewersUpdated", listener);
    s.off("viewerCountUpdate", listener);
    s.off("ViewersUpdated", listener);
  };
};

// Запрос текущего количества зрителей
export const requestViewerCount = (channelId: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    const s = getSFUSocket();
    if (!s?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }
    
    s.emit("checkStream", { channelId }, (response: any) => {
      if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.viewersCount || response.count || 0);
      }
    });
  });
};

// Функция для явного завершения трансляции на SFU
export const stopStream = (channelId: number, sessionId: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const socket = getSFUSocket();
    if (!socket?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }
    
    console.log(`🛑 Stopping stream on SFU: channel=${channelId}, session=${sessionId}`);
    
    socket.emit("stopStream", { 
      channelId, 
      sessionId 
    }, (response: any) => {
      if (response?.error) {
        console.error(`❌ Error stopping stream:`, response.error);
        reject(new Error(response.error));
      } else if (response?.success) {
        console.log(`✅ Stream stopped successfully on SFU`);
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};

// Устаревшая функция - оставляем для обратной совместимости
export const endStream = (channelId: number, sessionId: string) => {
  console.warn("⚠️ endStream is deprecated, use stopStream instead");
  stopStream(channelId, sessionId).catch(console.error);
};

// Получение сессии из localStorage
export const getStreamSession = (channelId: number): string | null => {
  return localStorage.getItem(`stream_session_${channelId}`);
};

// Сохранение сессии в localStorage
export const saveStreamSession = (channelId: number, sessionId: string) => {
  localStorage.setItem(`stream_session_${channelId}`, sessionId);
};

// Удаление сессии из localStorage
export const removeStreamSession = (channelId: number) => {
  localStorage.removeItem(`stream_session_${channelId}`);
};

// Получение источника из localStorage
export const getStreamSource = (channelId: number): "camera" | "screen" | null => {
  const source = localStorage.getItem(`stream_source_${channelId}`);
  return source === "camera" || source === "screen" ? source as "camera" | "screen" : null;
};

// Сохранение источника в localStorage
export const saveStreamSource = (channelId: number, source: "camera" | "screen") => {
  localStorage.setItem(`stream_source_${channelId}`, source);
};

// Удаление источника из localStorage
export const removeStreamSource = (channelId: number) => {
  localStorage.removeItem(`stream_source_${channelId}`);
};

// Объединение всех подключений
export const startAllConnections = () => {
  startSFUConnection();
  // Chat connection будет запущен когда понадобится токен
};