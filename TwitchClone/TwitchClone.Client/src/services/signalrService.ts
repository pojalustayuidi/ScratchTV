import { HubConnectionBuilder, HubConnection, HubConnectionState } from "@microsoft/signalr";

let chatConnection: HubConnection | null = null;
let connectionState: HubConnectionState = HubConnectionState.Disconnected;
let connectionAttempts = 0;
const maxConnectionAttempts = 3;

const connectionListeners: Array<(state: HubConnectionState) => void> = [];

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


export const startChatConnection = async (anonymous = false): Promise<HubConnection | null> => {
  if (chatConnection && connectionState === HubConnectionState.Connected) {
    return chatConnection;
  }

  if (isConnecting && connectPromise) {
    return connectPromise;
  }

  let token: string | null = null;
  let isAnonymous = anonymous;
  
  if (!anonymous) {
    token = localStorage.getItem("token");
    if (!token) {
      console.log("No token found, falling back to anonymous connection");
      isAnonymous = true;
    }
  }

  if (connectionAttempts >= maxConnectionAttempts) {
    console.error("Max connection attempts reached");
    notifyStateChange(HubConnectionState.Disconnected);
    return null;
  }

  isConnecting = true;
  connectionAttempts++;

  connectPromise = (async () => {
    try {
      if (chatConnection && connectionState !== HubConnectionState.Connected) {
        try {
          await chatConnection.stop();
        } catch (stopError) {
          console.warn("Warning stopping old connection:", stopError);
        }
        chatConnection = null;
      }

      notifyStateChange(HubConnectionState.Connecting);
      
      console.log(`Starting ${isAnonymous ? 'guest' : 'authenticated'} chat connection... (attempt ${connectionAttempts})`);

      chatConnection = new HubConnectionBuilder()
        .withUrl("http://localhost:5172/hubs/chat", {
          accessTokenFactory: () => token || "",
          skipNegotiation: true,
          transport: 1 
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: retryContext => {
            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 10000);
          }
        })
        .build();

      chatConnection.onclose(error => {
        console.log("Connection closed", error ? `with error: ${error.message}` : "");
        notifyStateChange(HubConnectionState.Disconnected);
        isConnecting = false;
      });

      chatConnection.onreconnecting(error => {
        console.log("Reconnecting...", error ? `Error: ${error.message}` : "");
        notifyStateChange(HubConnectionState.Reconnecting);
      });

      chatConnection.onreconnected(connectionId => {
        console.log(`Reconnected successfully. Connection ID: ${connectionId}`);
        connectionAttempts = 0;
        notifyStateChange(HubConnectionState.Connected);
        isConnecting = false;
      });

      await chatConnection.start();
      
      connectionAttempts = 0;
      notifyStateChange(HubConnectionState.Connected);
      isConnecting = false;
      
      console.log(`Chat connection established (${isAnonymous ? 'guest' : 'authenticated'})`);
      
      return chatConnection;
    } catch (err: any) {
      console.error("Failed to start chat connection:", err);
      
      if (!isAnonymous && err.statusCode === 401) {
        console.log("Authentication failed, trying guest connection...");
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

export const onUserModeratorAdded = (callback: (data: { channelId: number, userId: number, username: string }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("No chat connection for onUserModeratorAdded");
    return () => {};
  }
  
  const eventName = "UserModeratorAdded";
  
  connection.on(eventName, callback);
  
  return () => {
    connection.off(eventName, callback);
  };
};

export const onUserModeratorRemoved = (callback: (data: { channelId: number, userId: number }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("No chat connection for onUserModeratorRemoved");
    return () => {};
  }
  
  const eventName = "UserModeratorRemoved";
  
  connection.on(eventName, callback);
  
  return () => {
    connection.off(eventName, callback);
  };
};

export const onUserBanned = (callback: (data: { channelId: number, userId: number, reason: string, durationHours: number }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("No chat connection for onUserBanned");
    return () => {};
  }
  
  const eventName = "UserBanned";
  
  connection.on(eventName, callback);
  
  return () => {
    connection.off(eventName, callback);
  };
};
export const deleteMessageSignalR = async (messageId: number): Promise<void> => {
  await invokeChatHubMethod<void>("DeleteMessage", messageId);
};

export const banUserSignalR = async (channelId: number, userId: number, reason: string, durationHours: number): Promise<void> => {
  await invokeChatHubMethod<void>("BanUser", channelId, userId, reason, durationHours);
};
export const invokeChatHubMethod = async <T>(methodName: string, ...args: any[]): Promise<T> => {
  if (!chatConnection || connectionState !== HubConnectionState.Connected) {
    console.warn(`Connection not ready for ${methodName}, trying to reconnect...`);
    
    const newConnection = await startChatConnection(!localStorage.getItem("token"));
    if (!newConnection) {
      throw new Error("Chat connection not available");
    }
  }

  try {
    console.log(`Invoking ${methodName} with args:`, args);
    const result = await chatConnection!.invoke<T>(methodName, ...args);
    console.log(`${methodName} successful`);
    return result;
  } catch (err: any) {
    console.error(`Error invoking ${methodName}:`, err);
    
    if (err.message.includes("Гостям запрещено") || 
        err.message.includes("не авторизован") ||
        err.message.includes("гостевом режиме")) {
      throw new Error("Войдите, чтобы использовать эту функцию");
    }
    
    throw err;
  }
};
export const onUserPermissionsUpdated = (callback: (data: { channelId: number, userId: number, isModerator: boolean }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("No chat connection for onUserPermissionsUpdated");
    return () => {};
  }
  
  const eventName = "UserPermissionsUpdated";
  
  connection.on(eventName, callback);
  
  return () => {
    connection.off(eventName, callback);
  };
};
export const onUserUnbanned = (callback: (data: { channelId: number, userId: number, username?: string }) => void) => {
  const connection = getChatConnection();
  if (!connection) {
    console.warn("No chat connection for onUserUnbanned");
    return () => {};
  }
  
  const eventName = "UserUnbanned";
  
  connection.on(eventName, callback);
  
  return () => {
    connection.off(eventName, callback);
  };
};
export const unbanUserSignalR = async (channelId: number, userId: number): Promise<void> => {
  await invokeChatHubMethod<void>("UnbanUser", channelId, userId);
};
export const syncUserPermissions = async (channelId: number): Promise<void> => {
  await invokeChatHubMethod<void>("SyncUserPermissions", channelId);
};
export const getChatConnection = (): HubConnection | null => chatConnection;

export const stopChatConnection = async (): Promise<void> => {
  if (chatConnection) {
    try {
      await chatConnection.stop();
      console.log("Chat connection stopped");
    } catch (err) {
      console.error("Error stopping chat connection:", err);
    }
    chatConnection = null;
    notifyStateChange(HubConnectionState.Disconnected);
    isConnecting = false;
    connectPromise = null;
  }
};

export const isGuestConnection = (): boolean => {
  const token = localStorage.getItem("token");
  return !token;
};