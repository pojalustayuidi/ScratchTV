// services/signalrService.ts
import { HubConnectionBuilder, HubConnection, HubConnectionState } from "@microsoft/signalr";

let chatConnection: HubConnection | null = null;
let connectionState: HubConnectionState = HubConnectionState.Disconnected;
let connectionAttempts = 0;
const maxConnectionAttempts = 5;

// Добавляем события для UI
const connectionListeners: Array<(state: HubConnectionState) => void> = [];

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

export const getConnectionState = (): HubConnectionState => {
  return connectionState;
};

export const isChatConnected = (): boolean => {
  return connectionState === HubConnectionState.Connected;
};

export const startChatConnection = async (): Promise<HubConnection | null> => {
  // Если уже подключаемся или подключены, возвращаем существующее соединение
  if (chatConnection && (
    connectionState === HubConnectionState.Connected ||
    connectionState === HubConnectionState.Connecting ||
    connectionState === HubConnectionState.Reconnecting
  )) {
    return chatConnection;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    console.warn("No token for chat connection");
    return null;
  }

  // Сбрасываем счетчик попыток если было полное отключение
  if (connectionState === HubConnectionState.Disconnected) {
    connectionAttempts = 0;
  }

  // Проверяем лимит попыток
  if (connectionAttempts >= maxConnectionAttempts) {
    console.error("Max connection attempts reached");
    return null;
  }

  connectionAttempts++;
  
  try {
    // Если есть старое соединение - останавливаем
    if (chatConnection) {
      console.log("🛑 Stopping old chat connection");
      await chatConnection.stop();
      chatConnection = null;
    }

    notifyStateChange(HubConnectionState.Connecting);

    chatConnection = new HubConnectionBuilder()
      .withUrl("http://localhost:5172/chatHub", {
        accessTokenFactory: () => token,
        withCredentials: true,
        skipNegotiation: true,
        transport: 1 // WebSockets only
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
          console.log(`Chat hub reconnecting in ${delay}ms...`);
          return delay;
        }
      })
      .build();

    // ТОЛЬКО обработчики состояния соединения
    chatConnection.onclose((error) => {
      console.log("🔌 Chat hub disconnected", error);
      notifyStateChange(HubConnectionState.Disconnected);
    });

    chatConnection.onreconnecting((error) => {
      console.log("Chat hub reconnecting", error);
      notifyStateChange(HubConnectionState.Reconnecting);
    });

    chatConnection.onreconnected((connectionId) => {
      console.log("✅ Chat hub reconnected:", connectionId);
      connectionAttempts = 0;
      notifyStateChange(HubConnectionState.Connected);
    });

    await chatConnection.start();
    console.log("✅ Chat hub connected successfully");
    connectionAttempts = 0;
    notifyStateChange(HubConnectionState.Connected);
    
    return chatConnection;
  } catch (err) {
    console.error("❌ Chat hub connection failed:", err);
    chatConnection = null;
    notifyStateChange(HubConnectionState.Disconnected);
    return null;
  }
};

// Безопасный вызов метода хаба
export const invokeChatHubMethod = async <T>(
  methodName: string, 
  ...args: any[]
): Promise<T> => {
  if (!chatConnection) {
    throw new Error("Chat connection not established. Call startChatConnection first.");
  }

  if (connectionState !== HubConnectionState.Connected) {
    console.warn(`⚠️ Connection state is ${connectionState}, trying to invoke ${methodName}`);
    
    // Пробуем переподключиться если не подключены
    if (connectionState === HubConnectionState.Disconnected) {
      console.log("🔄 Attempting to reconnect...");
      const newConnection = await startChatConnection();
      if (!newConnection) {
        throw new Error("Failed to reconnect to chat server");
      }
    } else {
      throw new Error(`Cannot send data, connection is ${connectionState}. Please wait...`);
    }
  }

  try {
    console.log(`📤 Invoking chat method: ${methodName}`, args);
    const result = await chatConnection.invoke(methodName, ...args);
    console.log(`✅ Method ${methodName} invoked successfully`);
    return result;
  } catch (error: any) {
    console.error(`❌ Failed to invoke ${methodName}:`, error);
    
    if (error.message.includes("connection is not in the 'Connected' State")) {
      console.log("🔄 Connection lost, attempting to reconnect...");
      const newConnection = await startChatConnection();
      if (!newConnection) {
        throw new Error("Connection lost and reconnection failed");
      }
      
      // Пробуем снова после переподключения
      try {
        return await chatConnection.invoke(methodName, ...args);
      } catch (retryError: any) {
        throw new Error(`Failed after reconnection: ${retryError.message}`);
      }
    }
    
    throw error;
  }
};

export const getChatConnection = (): HubConnection | null => {
  return chatConnection;
};

export const stopChatConnection = async (): Promise<void> => {
  try {
    if (chatConnection) {
      await chatConnection.stop();
      chatConnection = null;
      notifyStateChange(HubConnectionState.Disconnected);
      console.log("✅ Chat hub stopped");
    }
  } catch (err) {
    console.error("❌ Failed to stop chat connection:", err);
  }
};