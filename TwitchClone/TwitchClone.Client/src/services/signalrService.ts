import { HubConnectionBuilder, HubConnection, HubConnectionState } from "@microsoft/signalr";

let chatConnection: HubConnection | null = null;
let connectionState: HubConnectionState = HubConnectionState.Disconnected;
let connectionAttempts = 0;
const maxConnectionAttempts = 3;

const connectionListeners: Array<(state: HubConnectionState) => void> = [];

// Глобальные флаги для предотвращения множественных подключений
let isConnecting = false;
let connectPromise: Promise<HubConnection | null> | null = null;

const notifyStateChange = (state: HubConnectionState) => {
  connectionState = state;
  connectionListeners.forEach(listener => listener(state));
};

export const onConnectionStateChange = (callback: (state: HubConnectionState) => void) => {
  connectionListeners.push(callback);
  return () => {
    const index = connectionListeners.indexOf(callback);
    if (index > -1) connectionListeners.splice(index, 1);
  };
};

export const getConnectionState = (): HubConnectionState => connectionState;
export const isChatConnected = (): boolean => connectionState === HubConnectionState.Connected;

/**
 * startChatConnection
 * @param anonymous - если true, подключаемся без токена (гость)
 */
export const startChatConnection = async (anonymous = false): Promise<HubConnection | null> => {
  // Если уже есть активное подключение, возвращаем его
  if (chatConnection && connectionState === HubConnectionState.Connected) {
    return chatConnection;
  }

  // Если уже происходит подключение, возвращаем существующий промис
  if (isConnecting && connectPromise) {
    return connectPromise;
  }

  // Проверяем токен только для аутентифицированных подключений
  let token: string | null = null;
  let isAnonymous = anonymous;
  
  if (!anonymous) {
    token = localStorage.getItem("token");
    if (!token) {
      console.log("⚠️ No token found, falling back to anonymous connection");
      isAnonymous = true;
    }
  }

  if (connectionAttempts >= maxConnectionAttempts) {
    console.error("❌ Max connection attempts reached");
    notifyStateChange(HubConnectionState.Disconnected);
    return null;
  }

  isConnecting = true;
  connectionAttempts++;

  // Создаем промис подключения
  connectPromise = (async () => {
    try {
      // Если есть старое соединение, но оно не подключено, останавливаем его
      if (chatConnection && connectionState !== HubConnectionState.Connected) {
        try {
          await chatConnection.stop();
        } catch (stopError) {
          console.warn("Warning stopping old connection:", stopError);
        }
        chatConnection = null;
      }

      notifyStateChange(HubConnectionState.Connecting);
      
      console.log(`🔗 Starting ${isAnonymous ? 'guest' : 'authenticated'} chat connection... (attempt ${connectionAttempts})`);

      // Создаем новое соединение
      chatConnection = new HubConnectionBuilder()
        .withUrl("http://localhost:5172/hubs/chat", {
          accessTokenFactory: () => token || "",
          skipNegotiation: true,
          transport: 1 // WebSockets
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: retryContext => {
            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 10000);
          }
        })
        .build();

      // Обработчики событий соединения
      chatConnection.onclose(error => {
        console.log("🔌 Connection closed", error ? `with error: ${error.message}` : "");
        notifyStateChange(HubConnectionState.Disconnected);
        isConnecting = false;
      });

      chatConnection.onreconnecting(error => {
        console.log("🔄 Reconnecting...", error ? `Error: ${error.message}` : "");
        notifyStateChange(HubConnectionState.Reconnecting);
      });

      chatConnection.onreconnected(connectionId => {
        console.log(`✅ Reconnected successfully. Connection ID: ${connectionId}`);
        connectionAttempts = 0;
        notifyStateChange(HubConnectionState.Connected);
        isConnecting = false;
      });

      // Запускаем соединение
      await chatConnection.start();
      
      connectionAttempts = 0;
      notifyStateChange(HubConnectionState.Connected);
      isConnecting = false;
      
      console.log(`✅ Chat connection established (${isAnonymous ? 'guest' : 'authenticated'})`);
      
      return chatConnection;
    } catch (err: any) {
      console.error("❌ Failed to start chat connection:", err);
      
      // Если ошибка авторизации, пробуем подключиться как гость (если ещё не пытались)
      if (!isAnonymous && err.statusCode === 401) {
        console.log("🔄 Authentication failed, trying guest connection...");
        return await startChatConnection(true);
      }
      
      chatConnection = null;
      notifyStateChange(HubConnectionState.Disconnected);
      isConnecting = false;
      return null;
    }
  })();

  return connectPromise;
};

export const invokeChatHubMethod = async <T>(methodName: string, ...args: any[]): Promise<T> => {
  // Если соединения нет или оно отключено, пытаемся подключиться
  if (!chatConnection || connectionState !== HubConnectionState.Connected) {
    console.warn(`⚠️ Connection not ready for ${methodName}, trying to reconnect...`);
    
    const newConnection = await startChatConnection(!localStorage.getItem("token"));
    if (!newConnection) {
      throw new Error("Chat connection not available");
    }
  }

  try {
    console.log(`📤 Invoking ${methodName} with args:`, args);
    const result = await chatConnection!.invoke<T>(methodName, ...args);
    console.log(`✅ ${methodName} successful`);
    return result;
  } catch (err: any) {
    console.error(`❌ Error invoking ${methodName}:`, err);
    
    if (err.message.includes("Гостям запрещено") || 
        err.message.includes("не авторизован") ||
        err.message.includes("гостевом режиме")) {
      throw new Error("Войдите, чтобы использовать эту функцию");
    }
    
    throw err;
  }
};

export const getChatConnection = (): HubConnection | null => chatConnection;

export const stopChatConnection = async (): Promise<void> => {
  if (chatConnection) {
    try {
      await chatConnection.stop();
      console.log("🛑 Chat connection stopped");
    } catch (err) {
      console.error("Error stopping chat connection:", err);
    }
    chatConnection = null;
    notifyStateChange(HubConnectionState.Disconnected);
    isConnecting = false;
    connectPromise = null;
  }
};

// Вспомогательная функция для проверки, является ли пользователь гостем
export const isGuestConnection = (): boolean => {
  const token = localStorage.getItem("token");
  return !token;
};