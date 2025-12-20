const rooms = new Map();


class Room {
  constructor(channelId, worker) {
    this.channelId = channelId;
    this.worker = worker;
    
    this.router = null;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    
 
    this.viewerSockets = new Set(); 
    this.viewerLastPing = new Map(); 
    
    this.sessionId = null;
    this.lastPing = Date.now();
    this.streamStartTime = null;
    this.isStreaming = false;
    this.streamerSocketId = null;
    
    // Для очистки неактивных ресурсов
    this.inactivityTimeout = 45000; 
    this.cleanupTimer = null;
  }

  async init() {
    if (this.router) return;

    this.router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000
        }
      ]
    });

    console.log(`Router created for channel ${this.channelId}`);
  }

  async createTransport(socketId) {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: { socketId, channelId: this.channelId }
    });

    this.transports.set(transport.id, transport);

    transport.on("close", () => {
      console.log(`[Room ${this.channelId}] Transport ${transport.id} closed`);
      this.transports.delete(transport.id);
    });

    transport.on("iceconnectionstatechange", (state) => {
      console.log(`[Room ${this.channelId}] ICE state: ${state} for transport ${transport.id}`);
    });

    return transport;
  }

  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");
    await transport.connect({ dtlsParameters });
  }

  // Добавить зрителя
  addViewer(socketId) {
    this.viewerSockets.add(socketId);
    this.viewerLastPing.set(socketId, Date.now());
    console.log(`[Room ${this.channelId}] Viewer added: ${socketId} (total: ${this.viewerSockets.size})`);
  } removeViewer(socketId) {
    this.viewerSockets.delete(socketId);
    this.viewerLastPing.delete(socketId);
    console.log(`[Room ${this.channelId}] Viewer removed: ${socketId} (total: ${this.viewerSockets.size})`);
  }


  hasViewer(socketId) {
    return this.viewerSockets.has(socketId);
  }

  // Обновить пинг зрителя
  updateViewerPing(socketId) {
    if (this.hasViewer(socketId)) {
      this.viewerLastPing.set(socketId, Date.now());
    }
  }

  isViewerInRoom(socketId) {
    return this.hasViewer(socketId);
  }

  get viewersCount() {
    return this.viewerSockets.size;
  }
  async createProducer({ transportId, kind, rtpParameters, sessionId, socketId }) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    const producer = await transport.produce({ kind, rtpParameters });
    this.producers.set(producer.id, producer);
    this.sessionId = sessionId;
    this.streamStartTime = Date.now();
    this.isStreaming = true;
    this.streamerSocketId = socketId;
    
    this.lastPing = Date.now();
    
    this.startCleanupTimer();

    producer.on("close", () => {
      console.log(`[Room ${this.channelId}] Producer ${producer.id} closed`);
      this.producers.delete(producer.id);
      
      if (this.producers.size === 0) {
        this.stopStream();
      }
    });

    producer.on("transportclose", () => {
      console.log(`[Room ${this.channelId}] Producer transport closed`);
    });

    return producer;
  }

  stopStream() {
    if (!this.isStreaming) return false;
    
    console.log(`[Room ${this.channelId}] Stopping stream explicitly`);
    
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Закрываем всех producers
    for (const [producerId, producer] of this.producers.entries()) {
      try {
        producer.close();
      } catch (error) {
        console.error(`[Room ${this.channelId}] Error closing producer ${producerId}:`, error.message);
      }
    }
    
    this.producers.clear();
    this.isStreaming = false;
    this.streamStartTime = null;
    this.streamerSocketId = null;
    
    this.cleanupViewers();
    
    return true;
  }

  async createConsumers({ transportId, rtpCapabilities, socketId }) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    const result = [];
    
    if (this.producers.size === 0) {
      console.log(`[Room ${this.channelId}] No active producers for consumption`);
      return result;
    }

    for (const producer of this.producers.values()) {
      if (!this.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.log(`[Room ${this.channelId}] Cannot consume producer ${producer.id} - codec mismatch`);
        continue;
      }

      try {
        const consumer = await transport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: false
        });

        if (!this.consumers.has(socketId)) {
          this.consumers.set(socketId, new Map());
        }

        this.consumers.get(socketId).set(consumer.id, consumer);

        consumer.on("close", () => {
          console.log(`[Room ${this.channelId}] Consumer ${consumer.id} closed`);
          this.consumers.get(socketId)?.delete(consumer.id);
          
          // Если у сокета не осталось consumers, удаляем запись
          if (this.consumers.get(socketId)?.size === 0) {
            this.consumers.delete(socketId);
          }
        });

        consumer.on("producerclose", () => {
          console.log(`[Room ${this.channelId}] Consumer ${consumer.id} - producer closed`);
          consumer.close();
        });

        result.push({
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        });
      } catch (error) {
        console.error(`[Room ${this.channelId}] Error creating consumer:`, error.message);
      }
    }

    return result;
  }

  closeSocket(socketId) {
    console.log(`[Room ${this.channelId}] Closing socket ${socketId}`);
    
    if (socketId === this.streamerSocketId) {
      this.stopStream();
    }
    
    const consumerMap = this.consumers.get(socketId);
    if (consumerMap) {
      for (const consumer of consumerMap.values()) {
        try {
          consumer.close();
        } catch (error) {
          console.error(`[Room ${this.channelId}] Error closing consumer:`, error.message);
        }
      }
      this.consumers.delete(socketId);
    }
    
    for (const [transportId, transport] of this.transports.entries()) {
      if (transport.appData.socketId === socketId) {
        try {
          transport.close();
        } catch (error) {
          console.error(`[Room ${this.channelId}] Error closing transport:`, error.message);
        }
        this.transports.delete(transportId);
      }
    }
  }

  cleanupViewers() {
    let closedCount = 0;
    for (const [socketId, consumerMap] of this.consumers.entries()) {
      for (const [consumerId, consumer] of consumerMap.entries()) {
        try {
          consumer.close();
          closedCount++;
        } catch (error) {
          console.error(`[Room ${this.channelId}] Error closing consumer ${consumerId}:`, error.message);
        }
      }
      consumerMap.clear();
    }
    this.consumers.clear();
    
    console.log(`[Room ${this.channelId}] Closed ${closedCount} consumers`);
    return closedCount;
  }

  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    
    this.cleanupTimer = setTimeout(() => {
      this.checkAndCleanup();
    }, this.inactivityTimeout);
  }

  checkAndCleanup() {
    if (!this.isStreaming) return;
    
    const now = Date.now();
    const inactiveTime = now - this.lastPing;
    
    if (inactiveTime > this.inactivityTimeout) {
      console.log(`[Room ${this.channelId}] Stream inactive for ${Math.floor(inactiveTime / 1000)}s, cleaning up`);
      this.stopStream();
      this.cleanupTimer = null;
    } else {
      this.cleanupTimer = setTimeout(() => {
        this.checkAndCleanup();
      }, this.inactivityTimeout - inactiveTime);
    }
  }

  updatePing() {
    this.lastPing = Date.now();
    
    if (this.isStreaming) {
      this.startCleanupTimer();
    }
  }

  getStreamInfo() {
    return {
      channelId: this.channelId,
      isLive: this.isLive(),
      producersCount: this.producers.size,
      viewersCount: this.viewersCount,
      sessionId: this.sessionId,
      streamerSocketId: this.streamerSocketId,
      uptime: this.streamStartTime ? Date.now() - this.streamStartTime : 0,
      lastPing: this.lastPing,
      lastPingAgo: Date.now() - this.lastPing
    };
  }

  get viewersCount() {
    return this.consumers.size;
  }

  isLive() {
    return this.producers.size > 0 && this.isStreaming;
  }

  destroy() {
    console.log(`[Room ${this.channelId}] Destroying room`);
    
    if (this.isStreaming) {
      this.stopStream();
    }
    
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    for (const [transportId, transport] of this.transports.entries()) {
      try {
        transport.close();
      } catch (error) {
        console.error(`[Room ${this.channelId}] Error closing transport ${transportId}:`, error.message);
      }
    }
    this.transports.clear();
    
    if (this.router) {
      this.router.close();
      this.router = null;
    }
  }
}

async function getOrCreateRoom(channelId, worker) {
  let room = rooms.get(channelId);
  if (!room) {
    room = new Room(channelId, worker);
    await room.init();
    rooms.set(channelId, room);
    console.log(`Room created for channel ${channelId}`);
  }
  return room;
}

function removeRoom(channelId) {
  const room = rooms.get(channelId);
  if (room) {
    room.destroy();
    rooms.delete(channelId);
    console.log(`Room removed for channel ${channelId}`);
    return true;
  }
  return false;
}

function getAllRooms() {
  const roomsInfo = [];
  for (const [channelId, room] of rooms.entries()) {
    roomsInfo.push(room.getStreamInfo());
  }
  return roomsInfo;
}

function cleanupEmptyRooms() {
  let removedCount = 0;
  for (const [channelId, room] of rooms.entries()) {
    if (room.transports.size === 0 && 
        room.producers.size === 0 && 
        room.consumers.size === 0 &&
        !room.isStreaming) {
      
      removeRoom(channelId);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} empty rooms`);
  }
  
  return removedCount;
}

module.exports = { 
  getOrCreateRoom, 
  rooms,
  removeRoom,
  getAllRooms,
  cleanupEmptyRooms 
};