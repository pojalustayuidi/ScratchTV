import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let pingInterval: number | null = null;

interface SubscriptionCache {
  [key: string]: {
    subscribed: boolean;
    timestamp: number;
  }
}

let subscriptionCache: SubscriptionCache = {};
const CACHE_TTL = 5 * 60 * 1000; 

const cleanupCache = () => {
  const now = Date.now();
  Object.keys(subscriptionCache).forEach(key => {
    if (now - subscriptionCache[key].timestamp > CACHE_TTL) {
      delete subscriptionCache[key];
    }
  });
};

export const startSFUConnection = () => {
  if (!socket) {
    socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("SFU connected:", socket?.id);
      restoreSubscriptions();
    });

    socket.on("disconnect", (reason) => {
      console.log("SFU disconnected:", reason);
      if (reason === "io server disconnect") {
        setTimeout(() => {
          if (socket) socket.connect();
        }, 1000);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("SFU connection error:", error.message);
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    socket.on("reconnect", () => {
      console.log("Socket reconnected, restoring state...");
      restoreSubscriptions();
    });

    setInterval(cleanupCache, 10 * 60 * 1000);
  }
  return socket;
};

const restoreSubscriptions = () => {
  if (!socket?.connected) return;
  
  Object.keys(subscriptionCache).forEach(channelId => {
    const cached = subscriptionCache[channelId];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Restoring subscription to channel ${channelId}`);
      socket?.emit("joinChannel", { channelId: parseInt(channelId) }, (response: any) => {
        if (response?.error) {
          console.log(`Failed to restore subscription: ${response.error}`);
        } else {
          console.log(`Restored subscription to channel ${channelId}`);
        }
      });
    }
  });
};

export const getSFUSocket = () => {
  if (!socket || !socket.connected) {
    console.warn("SFU socket not connected, reconnecting...");
    return startSFUConnection();
  }
  return socket;
};

export const joinChannel = (channelId: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const s = getSFUSocket();
    if (!s?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }
    
    console.log(`Joining channel ${channelId}`);
    
    s.emit("joinChannel", { channelId }, (response: any) => {
      if (response?.error) {
        console.error(`Failed to join channel ${channelId}:`, response.error);
        reject(new Error(response.error));
      } else {
        subscriptionCache[channelId] = {
          subscribed: true,
          timestamp: Date.now()
        };
        console.log(`Joined channel ${channelId}`);
        resolve();
      }
    });
  });
};

export const leaveChannel = (channelId: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const s = getSFUSocket();
    if (!s?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }
    
    console.log(`Leaving channel ${channelId}`);
    
    s.emit("leaveChannel", { channelId }, (response: any) => {
      if (response?.error) {
        console.error(`Failed to leave channel ${channelId}:`, response.error);
        reject(new Error(response.error));
      } else {
        delete subscriptionCache[channelId];
        console.log(`Left channel ${channelId}`);
        resolve();
      }
    });
  });
};

export const onStreamResumed = (callback: (data: { channelId: number, sessionId: string }) => void) => {
  const s = getSFUSocket();
  const listener = (data: any) => {
    if (data && data.channelId) callback(data);
  };
  s?.on("streamResumed", listener);
  return () => s?.off("streamResumed", listener);
};

export const onStreamStarted = (callback: (data: { channelId: number, sessionId: string }) => void) => {
  const s = getSFUSocket();
  const listener = (data: any) => {
    if (data && data.channelId) callback(data);
  };
  s?.on("streamStarted", listener);
  return () => s?.off("streamStarted", listener);
};

export const onStreamStopped = (callback: (data: { 
  channelId: number, 
  sessionId?: string,
  reason?: string,
  stoppedBy?: string 
}) => void) => {
  const s = getSFUSocket();
  const listener = (data: any) => {
    if (data && data.channelId) callback(data);
  };
  s?.on("streamStopped", listener);
  return () => s?.off("streamStopped", listener);
};

export const onProducerClosed = (callback: (data: { channelId: number }) => void) => {
  const s = getSFUSocket();
  const listener = (data: any) => {
    if (data && data.channelId) callback(data);
  };
  s?.on("producerClosed", listener);
  return () => s?.off("producerClosed", listener);
};

export const onSubscribersUpdated = (
  channelId: number, 
  callback: (data: { channelId: number, subscribersCount: number }) => void
) => {
  const s = getSFUSocket();
  
  const listener = (data: any) => {
    if (data?.channelId === channelId) {
      callback(data);
    }
  };
  
  s?.on("subscribersUpdated", listener);
  s?.on("subscriptionUpdate", listener);
  s?.on("SubscribersUpdated", listener);
  
  return () => {
    s?.off("subscribersUpdated", listener);
    s?.off("subscriptionUpdate", listener);
    s?.off("SubscribersUpdated", listener);
  };
};

export const startPingInterval = (channelId: number, sessionId: string) => {
  if (pingInterval) clearInterval(pingInterval);
  
  let lastPingTime = Date.now();
  let pingTimeout: number | null = null;
  
  const sendPing = () => {
    if (!socket?.connected) {
      console.warn("Socket not connected, skipping ping");
      return;
    }
    
    lastPingTime = Date.now();
    
    socket.emit("streamerPing", { channelId, sessionId }, (response: any) => {
      if (response?.error) {
        console.error("Ping error:", response.error);
      } else {
        console.log("Ping acknowledged");
      }
    });
    
    if (pingTimeout) clearTimeout(pingTimeout);
    pingTimeout = window.setTimeout(() => {
      const timeSincePing = Date.now() - lastPingTime;
      if (timeSincePing > 15000) {
        console.warn("Ping timeout, checking connection...");
        if (socket && !socket.connected) {
          console.log("Reconnecting socket...");
          socket.connect();
        }
      }
    }, 5000);
  };
  
  sendPing();
  
  pingInterval = window.setInterval(sendPing, 10000);
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
    socket.emit("viewerPing", { channelId }, (response: any) => {
      if (response?.error) {
        console.error("Viewer ping error:", response.error);
      }
    });
  }
};

export const onViewersCountUpdate = (channelId: number, callback: (count: number) => void) => {
  const s = getSFUSocket();
  if (!s) return () => {};
  
  const listener = (data: { channelId: number; count: number; timestamp?: number }) => {
    if (data.channelId === channelId) {
      console.log(`Viewers count update for channel ${channelId}: ${data.count}`);
      callback(data.count);
    }
  };
  
  s.on("viewersUpdated", listener);
  s.on("viewerCountUpdate", listener);
  s.on("ViewersUpdated", listener);
  s.on("streamViewers", listener);
  
  return () => {
    s.off("viewersUpdated", listener);
    s.off("viewerCountUpdate", listener);
    s.off("ViewersUpdated", listener);
    s.off("streamViewers", listener);
  };
};

export const requestViewerCount = (channelId: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    const s = getSFUSocket();
    if (!s?.connected) {
      console.warn("Socket not connected, returning cached value");
      const cacheKey = `viewers_${channelId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        resolve(parseInt(cached));
        return;
      }
      resolve(0);
      return;
    }
    
    s.emit("checkStream", { channelId }, (response: any) => {
      if (response?.error) {
        console.error("Error getting viewer count:", response.error);
        reject(new Error(response.error));
      } else {
        const count = response.viewersCount || response.count || 0;
        
        const cacheKey = `viewers_${channelId}`;
        localStorage.setItem(cacheKey, count.toString());
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
        
        setTimeout(() => {
          localStorage.removeItem(cacheKey);
          localStorage.removeItem(`${cacheKey}_timestamp`);
        }, 30000);
        
        resolve(count);
      }
    });
  });
};

export const stopStream = (channelId: number, sessionId: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const socket = getSFUSocket();
    if (!socket?.connected) {
      console.warn("Socket not connected, attempting to stop stream anyway");
      startSFUConnection();
      setTimeout(() => {
        const retrySocket = getSFUSocket();
        if (!retrySocket?.connected) {
          resolve(false);
          return;
        }
        retrySocket.emit("stopStream", { channelId, sessionId });
        resolve(true);
      }, 1000);
      return;
    }
    
    console.log(`Stopping stream on SFU: channel=${channelId}, session=${sessionId}`);
    
    const timeout = setTimeout(() => {
      console.log("⚠️ Stop stream timeout, forcing cleanup");
      resolve(true);
    }, 5000);
    
    socket.emit("stopStream", { 
      channelId, 
      sessionId 
    }, (response: any) => {
      clearTimeout(timeout);
      
      if (response?.error) {
        console.error(`Error stopping stream:`, response.error);
        reject(new Error(response.error));
      } else if (response?.success) {
        console.log(`Stream stopped successfully on SFU`);
        resolve(true);
      } else {
        console.log(`No response from server, assuming stream stopped`);
        resolve(true);
      }
    });
  });
};

export const endStream = (channelId: number, sessionId: string) => {
  console.warn("endStream is deprecated, use stopStream instead");
  stopStream(channelId, sessionId)
    .then(success => {
      if (!success) {
        console.warn("Stream stop may not have been confirmed");
      }
    })
    .catch(error => {
      console.error("Failed to stop stream:", error);
    });
};

export const getStreamSession = (channelId: number): { sessionId: string, timestamp: number } | null => {
  const sessionStr = localStorage.getItem(`stream_session_${channelId}`);
  const timestampStr = localStorage.getItem(`stream_session_${channelId}_timestamp`);
  
  if (!sessionStr || !timestampStr) return null;
  
  const timestamp = parseInt(timestampStr);
  const age = Date.now() - timestamp;
  
  if (age > 60 * 60 * 1000) {
    localStorage.removeItem(`stream_session_${channelId}`);
    localStorage.removeItem(`stream_session_${channelId}_timestamp`);
    return null;
  }
  
  return { sessionId: sessionStr, timestamp };
};

export const saveStreamSession = (channelId: number, sessionId: string) => {
  localStorage.setItem(`stream_session_${channelId}`, sessionId);
  localStorage.setItem(`stream_session_${channelId}_timestamp`, Date.now().toString());
  console.log(`Saved session ${sessionId} for channel ${channelId}`);
};

export const removeStreamSession = (channelId: number) => {
  localStorage.removeItem(`stream_session_${channelId}`);
  localStorage.removeItem(`stream_session_${channelId}_timestamp`);
  console.log(`Removed session for channel ${channelId}`);
};

export const getStreamSource = (channelId: number): "camera" | "screen" | null => {
  const source = localStorage.getItem(`stream_source_${channelId}`);
  return source === "camera" || source === "screen" ? source as "camera" | "screen" : null;
};

export const saveStreamSource = (channelId: number, source: "camera" | "screen") => {
  localStorage.setItem(`stream_source_${channelId}`, source);
};

export const removeStreamSource = (channelId: number) => {
  localStorage.removeItem(`stream_source_${channelId}`);
};

export const startAllConnections = () => {
  try {
    startSFUConnection();
    console.log("All connections started");
  } catch (error) {
    console.error("Failed to start connections:", error);
    setTimeout(startAllConnections, 2000);
  }
};

export const getConnectionStatus = () => {
  if (!socket) return "disconnected";
  if (socket.connected) return "connected";
  if (socket.disconnected) return "disconnected";
  return "connecting";
};

export const reconnect = () => {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
};

export const cleanupAll = () => {
  stopPingInterval();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  subscriptionCache = {};
  console.log("All WebSocket connections cleaned up");
};