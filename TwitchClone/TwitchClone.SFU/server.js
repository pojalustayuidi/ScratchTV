const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

const {
  setWorker,
  getOrCreateRoom,
  getRoom,
  getRoomByTransport,
  closeRoom,
  getAllRooms,
  Room
} = require("./rooms");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Инициализация mediasoup worker
let mediasoupWorker = null;

(async () => {
  try {
    mediasoupWorker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 40000,
      rtcMaxPort: 49999
    });
    
    console.log("✅ Mediasoup worker created (PID:", mediasoupWorker.pid, ")");
    setWorker(mediasoupWorker);
    
    // Создаем тестовую комнату при запуске
    const defaultRoom = await getOrCreateRoom(0);
    console.log(`✅ Default room (0) initialized with router: ${!!defaultRoom.router}`);
    
  } catch (err) {
    console.error("❌ Failed to initialize mediasoup:", err);
    process.exit(1);
  }
})();

// Вспомогательная функция для безопасного вызова callback
const safeCallback = (callback, data) => {
  if (typeof callback === 'function') {
    callback(data);
  }
};

io.on("connection", (socket) => {
  console.log("🔌 Connected", socket.id);

  // ---------------- RTP CAPS ----------------
  socket.on("getRouterRtpCapabilities", async (data, callback) => {
    try {
      const { channelId } = data || { channelId: 0 };
      console.log(`📊 getRouterRtpCapabilities for channel ${channelId}`);
      
      const room = await getOrCreateRoom(channelId);

      if (!room?.router?.rtpCapabilities) {
        throw new Error("Router RTP capabilities not ready");
      }

      console.log(`✅ Returning RTP capabilities for channel ${channelId}`);
      safeCallback(callback, room.router.rtpCapabilities);
    } catch (err) {
      console.error("❌ getRouterRtpCapabilities error:", err);
      safeCallback(callback, {
        error: true,
        message: err.message
      });
    }
  });

  // ---------------- TRANSPORT ----------------
  socket.on("createWebRtcTransport", async (data, callback) => {
    try {
      const { channelId, isProducer } = data;
      console.log(`🔄 createWebRtcTransport: channelId=${channelId}, isProducer=${isProducer}, socket=${socket.id}`);
      
      const room = await getOrCreateRoom(channelId);
      console.log(`✅ Room ${room.channelId} ready`);

      const transport = await room.createTransport(socket.id);
      
      const response = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters
      };
      
      console.log(`✅ Transport created: ${transport.id} for room ${room.channelId}`);
      safeCallback(callback, response);
    } catch (err) {
      console.error("❌ createWebRtcTransport error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  socket.on("connectTransport", async (data, callback) => {
    try {
      const { transportId, dtlsParameters, channelId = 0 } = data;
      
      console.log(`🔍 connectTransport: transportId=${transportId}, channelId=${channelId}, socket=${socket.id}`);
      
      // Сначала пробуем найти комнату по transportId
      let room = getRoomByTransport(transportId);
      
      if (room) {
        console.log(`✅ Found room by transportId: ${room.channelId}`);
      } else {
        // Если не нашли по transportId, пробуем по channelId
        console.log(`🔍 Transport not found in map, trying by channelId: ${channelId}`);
        room = await getOrCreateRoom(channelId);
        
        // Проверяем, есть ли транспорт в этой комнате
        if (!room.transports.has(transportId)) {
          console.log(`❌ Transport ${transportId} not found in room ${channelId}`);
          console.log(`   ├─ Room ${channelId} has transports:`, Array.from(room.transports.keys()));
          console.log(`   └─ All rooms:`, getAllRooms().map(r => ({ channel: r.channelId, transports: Array.from(r.transports.keys()) })));
          throw new Error(`Transport ${transportId} not found in room ${channelId}`);
        }
      }
      
      if (!room) {
        throw new Error(`Room not found for transport ${transportId} or channel ${channelId}`);
      }
      
      console.log(`🔗 Connecting transport ${transportId} in room ${room.channelId}`);
      await room.connectTransport(transportId, dtlsParameters);
      
      console.log(`✅ Transport ${transportId} connected successfully`);
      safeCallback(callback, { success: true });
      
    } catch (err) {
      console.error("❌ connectTransport error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- PRODUCE ----------------
  socket.on("produce", async (data, callback) => {
    try {
      const {
        channelId,
        transportId,
        kind,
        rtpParameters,
        sessionId
      } = data;

      console.log(`🎬 produce: channelId=${channelId}, transportId=${transportId}, kind=${kind}, sessionId=${sessionId}`);

      if (!sessionId) {
        safeCallback(callback, { error: "Missing sessionId" });
        return;
      }

      const room = await getOrCreateRoom(channelId);
      console.log(`✅ Room ${room.channelId} ready for produce`);

      const producer = await room.createProducer({
        transportId,
        kind,
        rtpParameters,
        sessionId
      });

      console.log(`✅ Producer created: ${producer.id} for session ${sessionId}, kind: ${kind}`);
      
      // Уведомляем всех о начале стрима
      io.emit("streamStarted", { channelId, sessionId });
      console.log(`📢 Broadcast streamStarted for channel ${channelId}`);
      
      safeCallback(callback, { id: producer.id });
    } catch (err) {
      console.error("❌ produce error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- CONSUME ----------------
  socket.on("consume", async (data, callback) => {
    try {
      const { channelId, transportId, rtpCapabilities } = data;
      console.log(`👁️ consume: channelId=${channelId}, transportId=${transportId}, socket=${socket.id}`);
      
      const room = await getOrCreateRoom(channelId);
      console.log(`✅ Room ${room.channelId} ready, producers: ${room.producers.size}`);

      const consumerData = await room.createConsumers({
        transportId,
        rtpCapabilities,
        socketId: socket.id
      });

      console.log(`✅ Created ${consumerData.length} consumers for socket ${socket.id}`);
      safeCallback(callback, consumerData);
    } catch (err) {
      console.error("❌ consume error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- CHECK STREAM ----------------
  socket.on("checkStream", async (data, callback) => {
    try {
      const { channelId } = data;
      const room = await getOrCreateRoom(channelId);
      
      const isLive = room.producers.size > 0;
      const viewersCount = room.consumers.size;
      
      console.log(`🔍 checkStream: channelId=${channelId}, isLive=${isLive}, viewers=${viewersCount}`);
      
      safeCallback(callback, {
        isLive,
        viewersCount,
        channelId
      });
    } catch (err) {
      console.error("❌ checkStream error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- STREAM PING ----------------
  socket.on("streamPing", async (data, callback) => {
    try {
      const { channelId, sessionId } = data;
      console.log(`📡 streamPing: channelId=${channelId}, sessionId=${sessionId}`);
      
      const room = await getOrCreateRoom(channelId);
      
      if (room && room.sessionId === sessionId) {
        room.lastActivity = Date.now();
        console.log(`✅ Stream ping received for session ${sessionId}`);
        safeCallback(callback, { success: true });
      } else {
        console.log(`❌ Invalid stream ping: session mismatch`);
        safeCallback(callback, { error: "Invalid session" });
      }
    } catch (err) {
      console.error("❌ streamPing error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- VIEWER PING ----------------
  socket.on("viewerPing", async (data, callback) => {
    try {
      const { channelId } = data;
      console.log(`👁️ viewerPing: channelId=${channelId}`);
      
      const room = await getOrCreateRoom(channelId);
      
      if (room) {
        room.lastActivity = Date.now();
        
        const viewersCount = room.consumers.size;
        io.emit("viewersUpdated", {
          channelId,
          count: viewersCount,
          timestamp: Date.now()
        });
        
        console.log(`✅ Viewer ping received, viewers: ${viewersCount}`);
        safeCallback(callback, { success: true });
      } else {
        console.log(`❌ Viewer ping: room not found`);
        safeCallback(callback, { error: "Room not found" });
      }
    } catch (err) {
      console.error("❌ viewerPing error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- END STREAM ----------------
  socket.on("endStream", async (data, callback) => {
    try {
      const { channelId, sessionId } = data;
      console.log(`🛑 endStream: channelId=${channelId}, sessionId=${sessionId}`);
      
      const room = await getOrCreateRoom(channelId);
      
      if (room && room.sessionId === sessionId) {
        for (const producer of room.producers.values()) {
          try { producer.close(); } catch {}
        }
        room.producers.clear();
        
        io.emit("streamStopped", { channelId, sessionId });
        console.log(`✅ Stream ended for channel ${channelId}`);
      }
      
      safeCallback(callback, { success: true });
    } catch (err) {
      console.error("❌ endStream error:", err);
      safeCallback(callback, { error: err.message });
    }
  });

  // ---------------- DISCONNECT ----------------
  socket.on("disconnect", () => {
    console.log("❌ Disconnected", socket.id);
    
    for (const room of getAllRooms()) {
      room.closeSocket(socket.id);
      
      for (const [transportId, transport] of room.transports.entries()) {
        if (transport.appData?.socketId === socket.id) {
          try { transport.close(); } catch {}
          room.transports.delete(transportId);
          console.log(`🛑 Transport ${transportId} closed for socket ${socket.id}`);
        }
      }
    }
  });

  // Обработка ошибок
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log("🚀 SFU running at http://localhost:3000");
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down SFU...');
  
  if (mediasoupWorker) {
    mediasoupWorker.close();
  }
  
  process.exit(0);
});
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const mediasoup = require('mediasoup');
// const cors = require('cors');

// const app = express();
// app.use(cors({
//   origin: ["http://localhost:5172", "http://localhost:5173", "http://localhost:3000"],
//   credentials: true
// }));
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: ["http://localhost:5172", "http://localhost:5173", "http://localhost:3000"],
//     methods: ["GET", "POST"],
//     credentials: true
//   },
//   transports: ['websocket', 'polling'],
//   allowEIO3: true,
//   pingTimeout: 60000,
//   pingInterval: 25000
// });

// const CONFIG = {
//   STREAM_TIMEOUT_MS: 60000,
//   VIEWER_CLEANUP_INTERVAL: 30000
// };

// let worker = null;
// let router = null;

// const peers = new Map();
// const liveProducers = new Map();
// const viewers = new Map();
// const viewerSession = new Map();

// class PeerInfo {
//   constructor(socketId) {
//     this.socketId = socketId;
//     this.transports = new Map();
//     this.producers = new Map();
//     this.consumers = new Map();
//     this.channelId = null;
//     this.userId = null;
//     this.connectedAt = Date.now();
//     this.lastHeartbeat = Date.now();
//     this.isStreamer = false;
//   }
// }

// class ProducerInfo {
//   constructor(channelId, producerId, socketId, sessionId, kind) {
//     this.channelId = channelId;
//     this.producerId = producerId;
//     this.socketId = socketId;
//     this.sessionId = sessionId;
//     this.kind = kind;
//     this.createdAt = Date.now();
//     this.lastPing = Date.now();
//     this.active = true;
//   }
// }

// class ViewerSession {
//   constructor(channelId, socketId, userId = null) {
//     this.channelId = channelId;
//     this.socketId = socketId;
//     this.userId = userId;
//     this.joinedAt = Date.now();
//     this.lastActivity = Date.now();
//     this.consumerIds = new Set();
//     this.transportIds = new Set();
//   }
// }

// async function initializeMediasoup() {
//   console.log('Initializing mediasoup...');
  
//   worker = await mediasoup.createWorker({
//     logLevel: 'warn',
//     rtcMinPort: 10000,
//     rtcMaxPort: 20000
//   });

//   router = await worker.createRouter({
//     mediaCodecs: [
//       { 
//         kind: 'audio', 
//         mimeType: 'audio/opus', 
//         clockRate: 48000, 
//         channels: 2 
//       },
//       { 
//         kind: 'video', 
//         mimeType: 'video/VP8', 
//         clockRate: 90000 
//       }
//     ]
//   });

//   worker.on('died', (error) => {
//     console.error('Mediasoup worker died:', error);
//     process.exit(1);
//   });

//   console.log('Mediasoup initialized');
// }

// class ViewerManager {
//   static addViewer(channelId, socketId, userId = null) {
//     if (!viewers.has(channelId)) {
//       viewers.set(channelId, new Set());
//     }
//     viewers.get(channelId).add(socketId);

//     viewerSession.set(socketId, new ViewerSession(channelId, socketId, userId));

//     const producerInfo = liveProducers.get(channelId);
//     if (producerInfo) {
//       const viewerCount = this.getViewerCount(channelId);
//       io.to(producerInfo.socketId).emit('viewerCountUpdate', { 
//         channelId, 
//         count: viewerCount 
//       });
//     }

//     return true;
//   }

//   static removeViewer(socketId) {
//     const session = viewerSession.get(socketId);
//     if (!session) return false;

//     const { channelId } = session;
    
//     if (viewers.has(channelId)) {
//       viewers.get(channelId).delete(socketId);
//       if (viewers.get(channelId).size === 0) {
//         viewers.delete(channelId);
//       }
//     }

//     viewerSession.delete(socketId);

//     const producerInfo = liveProducers.get(channelId);
//     if (producerInfo) {
//       io.to(producerInfo.socketId).emit('viewerCountUpdate', { 
//         channelId, 
//         count: this.getViewerCount(channelId) 
//       });
//     }

//     return true;
//   }

//   static getViewerCount(channelId) {
//     return viewers.has(channelId) ? viewers.get(channelId).size : 0;
//   }

//   static updateViewerActivity(socketId) {
//     const session = viewerSession.get(socketId);
//     if (session) {
//       session.lastActivity = Date.now();
//     }
//   }

//   static cleanupOldViewers() {
//     const now = Date.now();
//     for (const [socketId, session] of viewerSession.entries()) {
//       if (now - session.lastActivity > CONFIG.STREAM_TIMEOUT_MS) {
//         this.removeViewer(socketId);
//       }
//     }
//   }
// }

// function cleanupOldStreams() {
//   const now = Date.now();
//   for (const [channelId, producerInfo] of liveProducers.entries()) {
//     if (now - producerInfo.lastPing > CONFIG.STREAM_TIMEOUT_MS) {
//       console.log(`Removing stale stream: ${channelId}`);
      
//       const peer = peers.get(producerInfo.socketId);
//       if (peer) {
//         const producer = peer.producers.get(producerInfo.producerId);
//         if (producer) {
//           producer.close();
//         }
//       }
      
//       io.to(`channel_${channelId}`).emit('streamStopped', { channelId });
//       liveProducers.delete(channelId);
//       viewers.delete(channelId);
//     }
//   }
// }

// io.on('connection', (socket) => {
//   console.log(`Client connected: ${socket.id}`);
//   peers.set(socket.id, new PeerInfo(socket.id));

//   // Отправляем подтверждение подключения
//   socket.emit('connected', { 
//     socketId: socket.id,
//     message: 'Connected to SFU server' 
//   });

//   socket.on('getRouterRtpCapabilities', (data, callback) => {
//     console.log(`📡 getRouterRtpCapabilities from ${socket.id}`);
//     if (!router) {
//       console.error('❌ Router not initialized');
//       return callback({ error: 'Router not initialized' });
//     }
//     callback(router.rtpCapabilities);
//   });

//   socket.on('createWebRtcTransport', async (data, callback) => {
//     console.log(`🚚 createWebRtcTransport from ${socket.id}, data:`, data);
    
//     try {
//       // Устанавливаем значение по умолчанию для isProducer
//       // Если data null или undefined, используем false
//       let isProducer = false;
//       if (data && typeof data === 'object') {
//         isProducer = Boolean(data.isProducer);
//       }
      
//       console.log(`Creating transport for ${socket.id} (isProducer: ${isProducer})`);
      
//       const transport = await router.createWebRtcTransport({
//         listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
//         enableUdp: true,
//         enableTcp: true,
//         preferUdp: true
//       });
      
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         console.error(`❌ Peer not found for socket ${socket.id}`);
//         transport.close();
//         callback({ error: 'Peer not found' });
//         return;
//       }
      
//       peer.transports.set(transport.id, transport);
//       peer.isStreamer = isProducer;

//       transport.on('dtlsstatechange', (state) => {
//         console.log(`[${socket.id}] DTLS state: ${state}`);
//       });
      
//       transport.on('iceconnectionstatechange', (state) => {
//         console.log(`[${socket.id}] ICE connection state: ${state}`);
//         if (['closed','failed','disconnected'].includes(state)) {
//           ViewerManager.removeViewer(socket.id);
//         }
//       });
      
//       transport.on('close', () => {
//         console.log(`[${socket.id}] Transport ${transport.id} closed`);
//         const peer = peers.get(socket.id);
//         if (peer) {
//           peer.transports.delete(transport.id);
//         }
//       });

//       transport.on('icestatechange', (state) => {
//         console.log(`[${socket.id}] ICE state: ${state}`);
//       });

//       callback({
//         id: transport.id,
//         iceParameters: transport.iceParameters,
//         iceCandidates: transport.iceCandidates,
//         dtlsParameters: transport.dtlsParameters
//       });
      
//       console.log(`✅ Transport ${transport.id} created for ${socket.id} (isProducer: ${isProducer})`);
//     } catch (err) { 
//       console.error('❌ Error creating transport:', err);
//       callback({ error: err.message || 'Unknown error creating transport' }); 
//     }
//   });

//   socket.on('connectTransport', async (data, callback) => {
//     console.log(`🔌 connectTransport from ${socket.id}`, data);
    
//     try {
//       if (!data || !data.transportId || !data.dtlsParameters) {
//         console.error('❌ Missing required parameters for connectTransport');
//         return callback({ error: 'Missing required parameters' });
//       }
      
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         console.error(`❌ Peer not found for socket ${socket.id}`);
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         console.error(`❌ Transport ${data.transportId} not found for socket ${socket.id}`);
//         return callback({ error: 'Transport not found' });
//       }
      
//       await transport.connect({ dtlsParameters: data.dtlsParameters });
//       callback({ success: true });
//       console.log(`✅ Transport ${data.transportId} connected for ${socket.id}`);
//     } catch (err) { 
//       console.error('❌ Error connecting transport:', err);
//       callback({ error: err.message }); 
//     }
//   });

//   socket.on('produce', async (data, callback) => {
//     console.log(`🎥 produce from ${socket.id}`, data);
    
//     try {
//       if (!data || !data.channelId || !data.transportId || !data.kind || !data.rtpParameters) {
//         console.error('❌ Missing required parameters for produce');
//         return callback({ error: 'Missing required parameters' });
//       }
      
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         console.error(`❌ Peer not found for socket ${socket.id}`);
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         console.error(`❌ Transport ${data.transportId} not found for socket ${socket.id}`);
//         return callback({ error: 'Transport not found' });
//       }
      
//       const producer = await transport.produce({ 
//         kind: data.kind, 
//         rtpParameters: data.rtpParameters 
//       });
      
//       peer.producers.set(producer.id, producer);
//       peer.channelId = data.channelId;
//       peer.userId = data.userId || null;
//       peer.isStreamer = true;

//       // Закрываем старый producer для этого канала
//       const oldProducerInfo = liveProducers.get(data.channelId);
//       if (oldProducerInfo) {
//         console.log(`🔄 Replacing old stream for channel ${data.channelId}`);
//         const oldPeer = peers.get(oldProducerInfo.socketId);
//         if (oldPeer) {
//           const oldProducer = oldPeer.producers.get(oldProducerInfo.producerId);
//           if (oldProducer) {
//             oldProducer.close();
//           }
//         }
//         liveProducers.delete(data.channelId);
//       }

//       liveProducers.set(data.channelId, new ProducerInfo(
//         data.channelId, 
//         producer.id, 
//         socket.id, 
//         data.sessionId || 'no-session',
//         data.kind
//       ));

//       socket.join(`channel_${data.channelId}`);
//       io.to(`channel_${data.channelId}`).emit('streamStarted', { 
//         channelId: data.channelId 
//       });

//       producer.on('close', () => {
//         console.log(`❌ Producer ${producer.id} closed for channel ${data.channelId}`);
//         liveProducers.delete(data.channelId);
//         io.to(`channel_${data.channelId}`).emit('streamStopped', { 
//           channelId: data.channelId 
//         });
//         const channelViewers = viewers.get(data.channelId);
//         if (channelViewers) {
//           channelViewers.forEach(vsid => {
//             ViewerManager.removeViewer(vsid);
//           });
//         }
//       });

//       producer.on('transportclose', () => {
//         console.log(`❌ Producer ${producer.id} transport closed`);
//       });

//       callback({ 
//         id: producer.id, 
//         sessionId: data.sessionId || 'no-session' 
//       });
      
//       console.log(`✅ Producer ${producer.id} created for channel ${data.channelId} by ${socket.id}`);
//     } catch (err) { 
//       console.error('❌ Error in produce:', err);
//       callback({ error: err.message }); 
//     }
//   });

//   socket.on('consume', async (data, callback) => {
//     console.log(`👁️ consume from ${socket.id}`, data);
    
//     try {
//       if (!data || !data.channelId || !data.transportId || !data.rtpCapabilities) {
//         console.error('❌ Missing required parameters for consume');
//         return callback({ error: 'Missing required parameters' });
//       }
      
//       const producerInfo = liveProducers.get(data.channelId);
//       if (!producerInfo) {
//         console.log(`⏸️ No stream for channel ${data.channelId}`);
//         return callback({ error: 'Stream not live' });
//       }

//       const streamerPeer = peers.get(producerInfo.socketId);
//       if (!streamerPeer) {
//         console.log(`❌ Streamer ${producerInfo.socketId} not found`);
//         liveProducers.delete(data.channelId);
//         return callback({ error: 'Streamer disconnected' });
//       }

//       const producer = streamerPeer.producers.get(producerInfo.producerId);
//       if (!producer || producer.closed) {
//         console.log(`❌ Producer ${producerInfo.producerId} closed`);
//         liveProducers.delete(data.channelId);
//         return callback({ error: 'Producer closed' });
//       }

//       const peer = peers.get(socket.id);
//       if (!peer) {
//         console.error(`❌ Peer not found for socket ${socket.id}`);
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         console.error(`❌ Transport ${data.transportId} not found for socket ${socket.id}`);
//         return callback({ error: 'Transport not found' });
//       }

//       if (!router.canConsume({ 
//         producerId: producerInfo.producerId, 
//         rtpCapabilities: data.rtpCapabilities 
//       })) {
//         console.log(`❌ Cannot consume due to codec mismatch for ${socket.id}`);
//         return callback({ error: 'Cannot consume' });
//       }

//       const consumer = await transport.consume({
//         producerId: producerInfo.producerId,
//         rtpCapabilities: data.rtpCapabilities,
//         paused: false
//       });

//       peer.consumers.set(consumer.id, consumer);
//       peer.channelId = data.channelId;
//       peer.userId = data.userId || null;

//       ViewerManager.addViewer(data.channelId, socket.id, data.userId || null);
//       socket.join(`channel_${data.channelId}`);

//       const session = viewerSession.get(socket.id);
//       if (session) {
//         session.consumerIds.add(consumer.id);
//         session.transportIds.add(data.transportId);
//         session.lastActivity = Date.now();
//       }

//       socket.emit('streamStarted', { 
//         channelId: data.channelId 
//       });

//       consumer.on('producerclose', () => {
//         console.log(`❌ Consumer ${consumer.id} producer closed`);
//         consumer.close();
//         socket.emit('streamStopped', { 
//           channelId: data.channelId 
//         });
//         ViewerManager.removeViewer(socket.id);
//       });

//       consumer.on('transportclose', () => {
//         console.log(`❌ Consumer ${consumer.id} transport closed`);
//       });

//       callback({
//         id: consumer.id,
//         producerId: producerInfo.producerId,
//         kind: consumer.kind,
//         rtpParameters: consumer.rtpParameters,
//         type: consumer.type
//       });
      
//       console.log(`✅ Consumer ${consumer.id} created for ${socket.id} on channel ${data.channelId}`);
//     } catch (err) { 
//       console.error('❌ Error in consume:', err);
//       callback({ error: err.message }); 
//     }
//   });

//   socket.on('checkStream', (data, callback) => {
//     console.log(`🔍 checkStream for channel ${data?.channelId} from ${socket.id}`);
    
//     if (!data || !data.channelId) {
//       return callback({ 
//         isLive: false, 
//         viewersCount: 0, 
//         error: 'Channel ID required' 
//       });
//     }
    
//     const producerInfo = liveProducers.get(data.channelId);
//     const isLive = !!producerInfo;
//     const viewerCount = ViewerManager.getViewerCount(data.channelId);
//     callback({ 
//       isLive, 
//       viewersCount: viewerCount, 
//       producerExists: isLive 
//     });
//   });

//   socket.on('resumeConsumer', async (data, callback) => {
//     try {
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         return callback({ error: 'Peer not found' });
//       }
      
//       const consumer = peer.consumers.get(data.consumerId);
//       if (!consumer) {
//         return callback({ error: 'Consumer not found' });
//       }
      
//       await consumer.resume();
//       callback({ success: true });
//     } catch (err) {
//       console.error('❌ Error resuming consumer:', err);
//       callback({ error: err.message });
//     }
//   });

//   socket.on('ping', () => {
//     const peer = peers.get(socket.id);
//     if (peer) {
//       peer.lastHeartbeat = Date.now();
      
//       if (peer.channelId && peer.isStreamer) {
//         const producerInfo = liveProducers.get(peer.channelId);
//         if (producerInfo) {
//           producerInfo.lastPing = Date.now();
//         }
//       }
      
//       const session = viewerSession.get(socket.id);
//       if (session) {
//         session.lastActivity = Date.now();
//       }
//     }
//     socket.emit('pong', { timestamp: Date.now() });
//   });

//   socket.on('leaveChannel', (data) => {
//     console.log(`🚪 ${socket.id} leaving channel ${data?.channelId}`);
    
//     if (data && data.channelId) {
//       ViewerManager.removeViewer(socket.id);
//       socket.leave(`channel_${data.channelId}`);
//     }
//   });

//   socket.on('disconnect', (reason) => {
//     console.log(`❌ Client disconnected: ${socket.id}, reason: ${reason}`);
    
//     const peer = peers.get(socket.id);
//     if (peer) {
//       if (peer.isStreamer && peer.channelId) {
//         const producerInfo = liveProducers.get(peer.channelId);
//         if (producerInfo) {
//           console.log(`🛑 Streamer disconnected, removing stream for ${peer.channelId}`);
//           liveProducers.delete(peer.channelId);
//           io.to(`channel_${peer.channelId}`).emit('streamStopped', { 
//             channelId: peer.channelId 
//           });
//         }
//       }
      
//       peer.transports.forEach(t => {
//         try {
//           t.close();
//         } catch (e) {
//           console.error(`Error closing transport:`, e);
//         }
//       });
      
//       peer.producers.forEach(p => {
//         try {
//           p.close();
//         } catch (e) {
//           console.error(`Error closing producer:`, e);
//         }
//       });
      
//       peer.consumers.forEach(c => {
//         try {
//           c.close();
//         } catch (e) {
//           console.error(`Error closing consumer:`, e);
//         }
//       });
      
//       ViewerManager.removeViewer(socket.id);
//     }
    
//     peers.delete(socket.id);
//     viewerSession.delete(socket.id);
//   });
// });

// // Очистка старых стримов и зрителей
// setInterval(() => {
//   cleanupOldStreams();
//   ViewerManager.cleanupOldViewers();
// }, CONFIG.VIEWER_CLEANUP_INTERVAL);

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({
//     status: 'ok',
//     peers: peers.size,
//     liveStreams: liveProducers.size,
//     activeViewers: viewerSession.size,
//     worker: worker ? 'alive' : 'dead',
//     router: router ? 'ready' : 'not_ready'
//   });
// });

// async function startServer() {
//   try {
//     await initializeMediasoup();
    
//     server.listen(3001, '0.0.0.0', () => {
//       console.log('='.repeat(50));
//       console.log('🚀 SFU Server running on port 3001');
//       console.log('🌐 Health check: http://localhost:3001/health');
//       console.log('='.repeat(50));
//     });
//   } catch (error) {
//     console.error('❌ Failed to start server:', error);
//     process.exit(1);
//   }
// }

// startServer();
// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const mediasoup = require('mediasoup');
// const axios = require('axios'); // Для интеграции с C# бэкендом

// const app = express();
// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: ["http://localhost:5172", "http://localhost:5173", "http://localhost:3000"],
//     methods: ["GET", "POST"],
//     credentials: true
//   },
//   transports: ['websocket', 'polling'],
//   allowEIO3: true,
//   pingTimeout: 60000,
//   pingInterval: 25000
// });

// // Конфигурация
// const CONFIG = {
//   BACKEND_API_URL: 'http://localhost:5172',
//   STREAM_TIMEOUT_MS: 45000, // 45 секунд
//   VIEWER_CLEANUP_INTERVAL: 30000, // 30 секунд
// };

// // Глобальные переменные
// let worker = null;
// let router = null;

// // Структуры данных
// const peers = new Map(); // socket.id -> PeerInfo
// const liveProducers = new Map(); // channelId -> ProducerInfo
// const viewers = new Map(); // channelId -> Set(socket.id)
// const viewerSession = new Map(); // socket.id -> ViewerSession

// // Типы данных
// class PeerInfo {
//   constructor(socketId) {
//     this.socketId = socketId;
//     this.transports = new Map(); // transportId -> Transport
//     this.producers = new Map(); // producerId -> Producer
//     this.consumers = new Map(); // consumerId -> Consumer
//     this.channelId = null;
//     this.userId = null;
//   }
// }

// class ProducerInfo {
//   constructor(channelId, producerId, socketId, sessionId) {
//     this.channelId = channelId;
//     this.producerId = producerId;
//     this.socketId = socketId;
//     this.sessionId = sessionId;
//     this.createdAt = Date.now();
//     this.lastPing = Date.now();
//   }
// }

// class ViewerSession {
//   constructor(channelId, socketId, userId = null) {
//     this.channelId = channelId;
//     this.socketId = socketId;
//     this.userId = userId;
//     this.joinedAt = Date.now();
//     this.lastActivity = Date.now();
//     this.consumerIds = new Set();
//   }
// }

// // Инициализация mediasoup
// async function initializeMediasoup() {
//   try {
//     console.log('🔄 Инициализация Mediasoup...');
    
//     worker = await mediasoup.createWorker({
//       logLevel: 'warn',
//       rtcMinPort: 10000,
//       rtcMaxPort: 20000
//     });
    
//     console.log('✅ Mediasoup worker создан');
    
//     router = await worker.createRouter({
//       mediaCodecs: [
//         {
//           kind: 'audio',
//           mimeType: 'audio/opus',
//           clockRate: 48000,
//           channels: 2
//         },
//         {
//           kind: 'video',
//           mimeType: 'video/VP8',
//           clockRate: 90000,
//           parameters: {
//             'x-google-start-bitrate': 1000
//           }
//         },
//         {
//           kind: 'video',
//           mimeType: 'video/H264',
//           clockRate: 90000,
//           parameters: {
//             'packetization-mode': 1,
//             'profile-level-id': '42e01f',
//             'level-asymmetry-allowed': 1
//           }
//         }
//       ]
//     });
    
//     console.log('✅ Mediasoup router создан');
    
//     worker.on('died', (error) => {
//       console.error('❌ Mediasoup worker умер:', error);
//       process.exit(1);
//     });
    
//     return true;
//   } catch (error) {
//     console.error('❌ Ошибка инициализации mediasoup:', error);
//     return false;
//   }
// }

// // Интеграция с C# бэкендом
// class BackendIntegration {
//   static async notifyViewerJoined(channelId, socketId, userId = null) {
//     try {
//       const response = await axios.post(`${CONFIG.BACKEND_API_URL}/api/sfu/channel/${channelId}/viewer-joined`, {
//         connectionId: socketId,
//         userId: userId
//       });
      
//       if (response.data.success) {
//         console.log(`✅ Уведомлен бэкенд о подключении зрителя: channel=${channelId}, viewer=${socketId}`);
//         return response.data.viewersCount;
//       }
//     } catch (error) {
//       console.error(`❌ Ошибка уведомления бэкенда о подключении зрителя:`, error.message);
//     }
//     return null;
//   }

//   static async notifyViewerLeft(channelId, socketId) {
//     try {
//       const response = await axios.post(`${CONFIG.BACKEND_API_URL}/api/sfu/channel/${channelId}/viewer-left`, {
//         connectionId: socketId
//       });
      
//       if (response.data.success) {
//         console.log(`✅ Уведомлен бэкенд об отключении зрителя: channel=${channelId}, viewer=${socketId}`);
//         return response.data.viewersCount;
//       }
//     } catch (error) {
//       console.error(`❌ Ошибка уведомления бэкенда об отключении зрителя:`, error.message);
//     }
//     return null;
//   }

//   static async checkStreamStatus(channelId) {
//     try {
//       const response = await axios.get(`${CONFIG.BACKEND_API_URL}/api/sfu/channel/${channelId}/status`);
//       return response.data;
//     } catch (error) {
//       console.error(`❌ Ошибка проверки статуса стрима:`, error.message);
//       return { success: false, isActive: false };
//     }
//   }

//   static async resetChannelViewers(channelId) {
//     try {
//       const response = await axios.post(`${CONFIG.BACKEND_API_URL}/api/viewers/channel/${channelId}/reset`);
//       return response.data.success;
//     } catch (error) {
//       console.error(`❌ Ошибка сброса зрителей:`, error.message);
//       return false;
//     }
//   }
// }

// // Управление зрителями в SFU
// class ViewerManager {
//   static addViewer(channelId, socketId, userId = null) {
//     if (!viewers.has(channelId)) {
//       viewers.set(channelId, new Set());
//     }
    
//     viewers.get(channelId).add(socketId);
    
//     // Создаем сессию зрителя
//     viewerSession.set(socketId, new ViewerSession(channelId, socketId, userId));
    
//     console.log(`👁️ Зритель добавлен: channel=${channelId}, socket=${socketId}, userId=${userId}`);
//     console.log(`   Всего зрителей на канале ${channelId}: ${this.getViewerCount(channelId)}`);
    
//     // Уведомляем бэкенд
//     BackendIntegration.notifyViewerJoined(channelId, socketId, userId);
    
//     // Отправляем обновление всем подключенным к каналу
//     this.broadcastViewerCount(channelId);
//   }

//   static removeViewer(socketId) {
//     const session = viewerSession.get(socketId);
//     if (!session) return;

//     const { channelId } = session;
    
//     // Удаляем из списка зрителей канала
//     if (viewers.has(channelId)) {
//       viewers.get(channelId).delete(socketId);
      
//       // Если зрителей не осталось, очищаем запись
//       if (viewers.get(channelId).size === 0) {
//         viewers.delete(channelId);
//       }
//     }
    
//     // Удаляем сессию
//     viewerSession.delete(socketId);
    
//     console.log(`👁️ Зритель удален: channel=${channelId}, socket=${socketId}`);
//     console.log(`   Осталось зрителей на канале ${channelId}: ${this.getViewerCount(channelId)}`);
    
//     // Уведомляем бэкенд
//     BackendIntegration.notifyViewerLeft(channelId, socketId);
    
//     // Отправляем обновление
//     this.broadcastViewerCount(channelId);
//   }

//   static getViewerCount(channelId) {
//     return viewers.has(channelId) ? viewers.get(channelId).size : 0;
//   }

//   static getViewerSockets(channelId) {
//     return viewers.has(channelId) ? Array.from(viewers.get(channelId)) : [];
//   }

//   static broadcastViewerCount(channelId) {
//     const count = this.getViewerCount(channelId);
    
//     // Отправляем всем, кто слушает этот канал
//     io.to(`channel_${channelId}`).emit('viewersUpdated', {
//       channelId,
//       count,
//       timestamp: Date.now()
//     });
    
//     // Также отправляем стримеру
//     const producerInfo = liveProducers.get(channelId);
//     if (producerInfo) {
//       io.to(producerInfo.socketId).emit('viewerCountUpdate', {
//         channelId,
//         count,
//         timestamp: Date.now()
//       });
//     }
//   }

//   static cleanupOldViewers() {
//     const now = Date.now();
//     const timeout = CONFIG.STREAM_TIMEOUT_MS;
    
//     for (const [socketId, session] of viewerSession.entries()) {
//       if (now - session.lastActivity > timeout) {
//         console.log(`🧹 Удаление неактивного зрителя: ${socketId}`);
//         this.removeViewer(socketId);
//       }
//     }
//   }
// }

// // Обработка подключений Socket.IO
// io.on('connection', (socket) => {
//   console.log(`✅ [${socket.id}] Клиент подключен`);
  
//   // Инициализируем пира
//   peers.set(socket.id, new PeerInfo(socket.id));
  
//   // 1. Получить RTP capabilities
//   socket.on('getRouterRtpCapabilities', (data, callback) => {
//     console.log(`📡 [${socket.id}] Запрос RTP capabilities`);
    
//     if (!router) {
//       console.error(`❌ [${socket.id}] Router не инициализирован`);
//       if (typeof callback === 'function') {
//         return callback({ error: 'Router not initialized' });
//       }
//       return;
//     }
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для getRouterRtpCapabilities`);
//       return socket.emit('error', { error: 'No callback provided' });
//     }
    
//     try {
//       const capabilities = router.rtpCapabilities;
//       console.log(`✅ [${socket.id}] Отправляю RTP capabilities`);
//       callback(capabilities);
//     } catch (error) {
//       console.error(`❌ [${socket.id}] Ошибка RTP capabilities:`, error);
//       callback({ error: error.message });
//     }
//   });
  
//   // 2. Создать транспорт
//   socket.on('createWebRtcTransport', async (data, callback) => {
//     console.log(`📡 [${socket.id}] Запрос createWebRtcTransport:`, data);
    
//     if (!router) {
//       console.error(`❌ [${socket.id}] Router не инициализирован`);
//       if (typeof callback === 'function') {
//         return callback({ error: 'Router not initialized' });
//       }
//       return;
//     }
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для createWebRtcTransport`);
//       return socket.emit('error', { error: 'No callback provided' });
//     }
    
//     try {
//       const transport = await router.createWebRtcTransport({
//         listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
//         enableUdp: true,
//         enableTcp: true,
//         preferUdp: true,
//         initialAvailableOutgoingBitrate: 1000000,
//         appData: data || {}
//       });
      
//       const peer = peers.get(socket.id);
//       if (peer) {
//         peer.transports.set(transport.id, transport);
//       }
      
//       // Обработчики событий транспорта
//       transport.on('dtlsstatechange', (dtlsState) => {
//         console.log(`[${transport.id}] DTLS state: ${dtlsState}`);
//       });
      
//       transport.on('iceconnectionstatechange', (iceState) => {
//         console.log(`[${transport.id}] ICE state: ${iceState}`);
        
//         // Если ICE соединение закрыто, удаляем зрителя
//         if (iceState === 'closed' || iceState === 'failed' || iceState === 'disconnected') {
//           const session = viewerSession.get(socket.id);
//           if (session) {
//             ViewerManager.removeViewer(socket.id);
//           }
//         }
//       });
      
//       transport.on('close', () => {
//         console.log(`[${transport.id}] Transport closed`);
//         const peer = peers.get(socket.id);
//         if (peer) {
//           peer.transports.delete(transport.id);
//         }
//       });
      
//       console.log(`✅ [${socket.id}] Транспорт создан: ${transport.id}`);
      
//       callback({
//         id: transport.id,
//         iceParameters: transport.iceParameters,
//         iceCandidates: transport.iceCandidates,
//         dtlsParameters: transport.dtlsParameters
//       });
//     } catch (error) {
//       console.error(`❌ [${socket.id}] Ошибка создания транспорта:`, error);
//       callback({ error: error.message });
//     }
//   });
  
//   // 3. Подключить транспорт
//   socket.on('connectTransport', async (data, callback) => {
//     console.log(`📡 [${socket.id}] connectTransport:`, data);
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для connectTransport`);
//       return;
//     }
    
//     try {
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         return callback({ error: `Transport ${data.transportId} not found` });
//       }
      
//       await transport.connect({ dtlsParameters: data.dtlsParameters });
//       console.log(`✅ [${socket.id}] Транспорт подключен: ${data.transportId}`);
//       callback({ success: true });
//     } catch (error) {
//       console.error(`❌ [${socket.id}] Ошибка подключения транспорта:`, error);
//       callback({ error: error.message });
//     }
//   });
  
//   // 4. Produce (стример)
//   socket.on('produce', async (data, callback) => {
//     console.log(`🎥 [${socket.id}] Produce запрос для канала: ${data.channelId}`);
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для produce`);
//       return socket.emit('error', { error: 'No callback provided' });
//     }
    
//     try {
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         return callback({ error: `Transport ${data.transportId} not found` });
//       }
      
//       // Сохраняем информацию о канале и пользователе
//       peer.channelId = data.channelId;
//       peer.userId = data.userId || null;
      
//       // Создаем producer
//       const producer = await transport.produce({
//         kind: data.kind,
//         rtpParameters: data.rtpParameters
//       });
      
//       peer.producers.set(producer.id, producer);
      
//       // Удаляем старый producer для этого канала, если есть
//       const oldProducerInfo = liveProducers.get(data.channelId);
//       if (oldProducerInfo) {
//         const oldPeer = peers.get(oldProducerInfo.socketId);
//         if (oldPeer) {
//           const oldProducer = oldPeer.producers.get(oldProducerInfo.producerId);
//           if (oldProducer) {
//             console.log(`⏹️ Закрытие старого producer: ${oldProducer.id}`);
//             oldProducer.close();
//             oldPeer.producers.delete(oldProducerInfo.producerId);
//           }
//         }
//         // Очищаем старых зрителей при смене стримера
//         ViewerManager.broadcastViewerCount(data.channelId);
//       }
      
//       // Сохраняем новый producer
//       liveProducers.set(data.channelId, new ProducerInfo(
//         data.channelId,
//         producer.id,
//         socket.id,
//         data.sessionId || 'no-session'
//       ));
      
//       console.log(`✅ [${socket.id}] Producer создан: ${producer.id} для канала ${data.channelId}`);
      
//       // Добавляем стримера в комнату канала
//       socket.join(`channel_${data.channelId}`);
      
//       // Уведомляем всех о начале стрима
//       socket.to(`channel_${data.channelId}`).emit('streamStarted', { 
//         channelId: data.channelId,
//         sessionId: data.sessionId || 'no-session'
//       });
      
//       // Обработчики событий producer
//       producer.on('transportclose', () => {
//         console.log(`[${producer.id}] Transport closed`);
//       });
      
//       producer.on('close', () => {
//         console.log(`[${producer.id}] Producer closed`);
//         const producerInfo = liveProducers.get(data.channelId);
//         if (producerInfo && producerInfo.producerId === producer.id) {
//           // Уведомляем всех о завершении стрима
//           io.to(`channel_${data.channelId}`).emit('streamStopped', { 
//             channelId: data.channelId 
//           });
          
//           // Очищаем всех зрителей этого канала
//           const channelViewers = viewers.get(data.channelId);
//           if (channelViewers) {
//             channelViewers.forEach(viewerSocketId => {
//               ViewerManager.removeViewer(viewerSocketId);
//             });
//           }
          
//           // Уведомляем бэкенд о сбросе зрителей
//           BackendIntegration.resetChannelViewers(data.channelId);
          
//           liveProducers.delete(data.channelId);
//           viewers.delete(data.channelId);
//         }
        
//         // Удаляем из пира
//         const peer = peers.get(socket.id);
//         if (peer) {
//           peer.producers.delete(producer.id);
//         }
//       });
      
//       callback({
//         id: producer.id,
//         sessionId: data.sessionId || 'no-session'
//       });
//     } catch (error) {
//       console.error(`❌ [${socket.id}] Ошибка produce:`, error);
//       callback({ error: error.message });
//     }
//   });
  
//   // 5. Consume (зритель)
//   socket.on('consume', async (data, callback) => {
//     console.log(`👁️ [${socket.id}] Consume запрос для канала: ${data.channelId}`);
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для consume`);
//       return socket.emit('error', { error: 'No callback provided' });
//     }
    
//     try {
//       // Проверяем, есть ли активный стрим
//       const producerInfo = liveProducers.get(data.channelId);
//       if (!producerInfo) {
//         console.log(`[${socket.id}] Стрим не активен: ${data.channelId}`);
//         return callback({ error: 'Stream not live' });
//       }
      
//       const peer = peers.get(socket.id);
//       if (!peer) {
//         return callback({ error: 'Peer not found' });
//       }
      
//       const transport = peer.transports.get(data.transportId);
//       if (!transport) {
//         return callback({ error: `Transport ${data.transportId} not found` });
//       }
      
//       // Проверяем возможность потребления
//       if (!router.canConsume({ 
//         producerId: producerInfo.producerId, 
//         rtpCapabilities: data.rtpCapabilities 
//       })) {
//         console.log(`[${socket.id}] Несовместимые RTP capabilities`);
//         return callback({ error: 'Cannot consume due to codec mismatch' });
//       }
      
//       // Создаем consumer
//       const consumer = await transport.consume({
//         producerId: producerInfo.producerId,
//         rtpCapabilities: data.rtpCapabilities,
//         paused: false
//       });
      
//       peer.consumers.set(consumer.id, consumer);
//       console.log(`✅ [${socket.id}] Consumer создан: ${consumer.id}`);
      
//       // Регистрируем зрителя
//       peer.channelId = data.channelId;
//       peer.userId = data.userId || null;
      
//       // Добавляем зрителя в систему
//       ViewerManager.addViewer(data.channelId, socket.id, data.userId || null);
      
//       // Добавляем consumer в сессию зрителя
//       const session = viewerSession.get(socket.id);
//       if (session) {
//         session.consumerIds.add(consumer.id);
//         session.lastActivity = Date.now();
//       }
      
//       // Добавляем зрителя в комнату канала
//       socket.join(`channel_${data.channelId}`);
      
//       // Обработчики событий consumer
//       consumer.on('transportclose', () => {
//         console.log(`[${consumer.id}] Transport closed`);
//       });
      
//       consumer.on('producerclose', () => {
//         console.log(`[${consumer.id}] Producer closed`);
//         consumer.close();
//         socket.emit('streamStopped', { channelId: data.channelId });
        
//         // Удаляем зрителя
//         ViewerManager.removeViewer(socket.id);
//       });
      
//       consumer.on('close', () => {
//         console.log(`[${consumer.id}] Consumer closed`);
        
//         // Удаляем из сессии зрителя
//         const session = viewerSession.get(socket.id);
//         if (session) {
//           session.consumerIds.delete(consumer.id);
//         }
        
//         // Удаляем из пира
//         const peer = peers.get(socket.id);
//         if (peer) {
//           peer.consumers.delete(consumer.id);
//         }
//       });
      
//       callback({
//         id: consumer.id,
//         producerId: producerInfo.producerId,
//         kind: consumer.kind,
//         rtpParameters: consumer.rtpParameters,
//         type: consumer.type
//       });
//     } catch (error) {
//       console.error(`❌ [${socket.id}] Ошибка consume:`, error);
//       callback({ error: error.message });
//     }
//   });
  
//   // 6. Проверить активен ли стрим
//   socket.on('checkStream', (data, callback) => {
//     console.log(`🔍 [${socket.id}] checkStream:`, data);
    
//     if (typeof callback !== 'function') {
//       console.error(`❌ [${socket.id}] Нет callback для checkStream`);
//       return;
//     }
    
//     const isLive = liveProducers.has(data.channelId);
//     const viewerCount = ViewerManager.getViewerCount(data.channelId);
    
//     console.log(`[${socket.id}] Стрим ${data.channelId} активен: ${isLive}, зрителей: ${viewerCount}`);
    
//     callback({ 
//       isLive,
//       viewersCount: viewerCount,
//       producerExists: isLive
//     });
//   });
  
//   // 7. Зритель покинул стрим
//   socket.on('viewerLeave', (data) => {
//     console.log(`🚪 [${socket.id}] Зритель покинул стрим:`, data);
//     ViewerManager.removeViewer(socket.id);
//   });
  
//   // 8. Пинг от зрителя (keep-alive)
//   socket.on('viewerPing', (data) => {
//     const session = viewerSession.get(socket.id);
//     if (session) {
//       session.lastActivity = Date.now();
//     }
//   });
  
//   // 9. Пинг от стримера (keep-alive)
//   socket.on('streamerPing', (data) => {
//     const producerInfo = liveProducers.get(data.channelId);
//     if (producerInfo && producerInfo.socketId === socket.id) {
//       producerInfo.lastPing = Date.now();
//     }
//   });
  
//   // 10. Запрос количества зрителей
//   socket.on('getViewerCount', (data, callback) => {
//     const count = ViewerManager.getViewerCount(data.channelId);
    
//     if (typeof callback === 'function') {
//       callback({ count });
//     } else {
//       socket.emit('viewerCountResponse', { 
//         channelId: data.channelId, 
//         count 
//       });
//     }
//   });
  
//   // 11. Отключение клиента
//   socket.on('disconnect', (reason) => {
//     console.log(`❌ [${socket.id}] Отключен:`, reason);
    
//     // Если это был стример, завершаем стрим
//     const peer = peers.get(socket.id);
//     if (peer && peer.channelId) {
//       const producerInfo = liveProducers.get(peer.channelId);
//       if (producerInfo && producerInfo.socketId === socket.id) {
//         console.log(`⏹️ [${socket.id}] Стример отключился, завершаем стрим: ${peer.channelId}`);
        
//         // Уведомляем всех о завершении стрима
//         io.to(`channel_${peer.channelId}`).emit('streamStopped', { 
//           channelId: peer.channelId 
//         });
        
//         // Очищаем всех зрителей
//         const channelViewers = viewers.get(peer.channelId);
//         if (channelViewers) {
//           channelViewers.forEach(viewerSocketId => {
//             ViewerManager.removeViewer(viewerSocketId);
//           });
//         }
        
//         // Уведомляем бэкенд
//         BackendIntegration.resetChannelViewers(peer.channelId);
        
//         liveProducers.delete(peer.channelId);
//         viewers.delete(peer.channelId);
//       }
//     }
    
//     // Удаляем зрителя (если был зрителем)
//     ViewerManager.removeViewer(socket.id);
    
//     // Очищаем ресурсы пира
//     if (peer) {
//       // Закрываем все транспорты
//       peer.transports.forEach(transport => {
//         console.log(`[${socket.id}] Закрытие транспорта: ${transport.id}`);
//         transport.close();
//       });
      
//       // Закрываем все producers
//       peer.producers.forEach(producer => {
//         console.log(`[${socket.id}] Закрытие producer: ${producer.id}`);
//         producer.close();
//       });
      
//       // Закрываем все consumers
//       peer.consumers.forEach(consumer => {
//         console.log(`[${socket.id}] Закрытие consumer: ${consumer.id}`);
//         consumer.close();
//       });
//     }
    
//     // Удаляем пира
//     peers.delete(socket.id);
//     viewerSession.delete(socket.id);
//   });
  
//   // 12. Обработка ошибок
//   socket.on('error', (error) => {
//     console.error(`❌ [${socket.id}] Socket error:`, error);
//   });
// });

// // Функция для очистки устаревших стримов
// function cleanupOldStreams() {
//   const now = Date.now();
//   const timeout = CONFIG.STREAM_TIMEOUT_MS;
  
//   for (const [channelId, producerInfo] of liveProducers.entries()) {
//     if (now - producerInfo.lastPing > timeout) {
//       console.log(`🧹 Удаление устаревшего стрима: ${channelId}`);
      
//       // Закрываем producer
//       const peer = peers.get(producerInfo.socketId);
//       if (peer) {
//         const producer = peer.producers.get(producerInfo.producerId);
//         if (producer) {
//           producer.close();
//         }
//       }
      
//       // Уведомляем всех
//       io.to(`channel_${channelId}`).emit('streamStopped', { 
//         channelId 
//       });
      
//       // Очищаем зрителей
//       const channelViewers = viewers.get(channelId);
//       if (channelViewers) {
//         channelViewers.forEach(viewerSocketId => {
//           ViewerManager.removeViewer(viewerSocketId);
//         });
//       }
      
//       // Уведомляем бэкенд
//       BackendIntegration.resetChannelViewers(channelId);
      
//       liveProducers.delete(channelId);
//       viewers.delete(channelId);
//     }
//   }
// }

// // Health endpoint
// app.get('/health', (req, res) => {
//   const healthData = {
//     status: 'ok',
//     mediasoup: !!router,
//     timestamp: new Date().toISOString(),
//     connections: io.engine?.clientsCount || 0,
//     liveStreams: liveProducers.size,
//     totalViewers: Array.from(viewers.values()).reduce((sum, set) => sum + set.size, 0),
//     memoryUsage: process.memoryUsage()
//   };
  
//   console.log('📊 Health check:', healthData);
//   res.json(healthData);
// });

// // Статистика SFU
// app.get('/stats', (req, res) => {
//   const stats = {
//     peers: peers.size,
//     liveProducers: liveProducers.size,
//     viewers: Array.from(viewers.entries()).map(([channelId, socketIds]) => ({
//       channelId,
//       count: socketIds.size,
//       viewers: Array.from(socketIds)
//     })),
//     activeChannels: Array.from(liveProducers.keys()),
//     routerCodecs: router ? router.rtpCapabilities.codecs : null
//   };
  
//   res.json(stats);
// });

// // Сброс всех стримов (только для админов)
// app.post('/admin/reset', (req, res) => {
//   console.log('🔄 Принудительный сброс всех стримов');
  
//   // Закрываем все producers
//   liveProducers.forEach((producerInfo, channelId) => {
//     io.to(`channel_${channelId}`).emit('streamStopped', { channelId });
//   });
  
//   // Очищаем все данные
//   liveProducers.clear();
//   viewers.clear();
//   viewerSession.clear();
  
//   // Очищаем peers (но оставляем подключения)
//   peers.forEach(peer => {
//     peer.transports.clear();
//     peer.producers.clear();
//     peer.consumers.clear();
//     peer.channelId = null;
//   });
  
//   res.json({ success: true, message: 'All streams reset' });
// });

// // Главная страница
// app.get('/', (req, res) => {
//   res.send(`
//     <html>
//       <head>
//         <title>SFU Server with Viewer Counter</title>
//         <style>
//           body { font-family: Arial, sans-serif; padding: 20px; }
//           .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
//           .ok { background: #d4edda; color: #155724; }
//           .error { background: #f8d7da; color: #721c24; }
//           .info { background: #d1ecf1; color: #0c5460; }
//           button { padding: 10px 20px; margin: 5px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
//           table { border-collapse: collapse; width: 100%; margin: 20px 0; }
//           th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
//           th { background-color: #f2f2f2; }
//         </style>
//       </head>
//       <body>
//         <h1>SFU Server with Viewer Counter</h1>
//         <div id="status" class="status">Загрузка...</div>
        
//         <h2>Active Streams</h2>
//         <div id="streams"></div>
        
//         <h2>Statistics</h2>
//         <div id="stats"></div>
        
//         <button onclick="refreshStats()">Refresh Stats</button>
//         <button onclick="resetAll()" style="background: #dc3545;">Reset All Streams</button>
        
//         <script>
//           async function refreshStats() {
//             try {
//               const [healthRes, statsRes] = await Promise.all([
//                 fetch('/health'),
//                 fetch('/stats')
//               ]);
              
//               const health = await healthRes.json();
//               const stats = await statsRes.json();
              
//               // Обновляем статус
//               document.getElementById('status').innerHTML = \`
//                 <strong>Status:</strong> \${health.status}<br>
//                 <strong>Mediasoup:</strong> \${health.mediasoup ? '✅ Ready' : '❌ Not ready'}<br>
//                 <strong>Connections:</strong> \${health.connections}<br>
//                 <strong>Live streams:</strong> \${health.liveStreams}<br>
//                 <strong>Total viewers:</strong> \${health.totalViewers}<br>
//                 <strong>Memory:</strong> \${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB / \${Math.round(health.memoryUsage.heapTotal / 1024 / 1024)}MB<br>
//                 <strong>Time:</strong> \${new Date(health.timestamp).toLocaleTimeString()}
//               \`;
//               document.getElementById('status').className = health.status === 'ok' ? 'status ok' : 'status error';
              
//               // Обновляем стримы
//               let streamsHTML = '<table><tr><th>Channel ID</th><th>Producer Socket</th><th>Session ID</th><th>Viewers</th><th>Uptime</th></tr>';
              
//               if (stats.activeChannels && stats.activeChannels.length > 0) {
//                 stats.activeChannels.forEach(channelId => {
//                   const channelStats = stats.viewers.find(v => v.channelId == channelId);
//                   streamsHTML += \`<tr>
//                     <td>\${channelId}</td>
//                     <td>\${stats.liveProducers[channelId]?.socketId || 'N/A'}</td>
//                     <td>\${stats.liveProducers[channelId]?.sessionId || 'N/A'}</td>
//                     <td>\${channelStats ? channelStats.count : 0}</td>
//                     <td>N/A</td>
//                   </tr>\`;
//                 });
//               } else {
//                 streamsHTML += '<tr><td colspan="5">No active streams</td></tr>';
//               }
//               streamsHTML += '</table>';
//               document.getElementById('streams').innerHTML = streamsHTML;
              
//               // Обновляем статистику
//               document.getElementById('stats').innerHTML = \`
//                 <p><strong>Total Peers:</strong> \${stats.peers}</p>
//                 <p><strong>Active Channels:</strong> \${stats.activeChannels?.length || 0}</p>
//               \`;
              
//             } catch (error) {
//               document.getElementById('status').innerHTML = '❌ Error fetching stats';
//               document.getElementById('status').className = 'status error';
//             }
//           }
          
//           async function resetAll() {
//             if (confirm('Are you sure you want to reset all streams?')) {
//               const response = await fetch('/admin/reset', { method: 'POST' });
//               const result = await response.json();
//               alert(result.message);
//               refreshStats();
//             }
//           }
          
//           // Автоматическое обновление каждые 10 секунд
//           setInterval(refreshStats, 10000);
//           refreshStats();
//         </script>
//       </body>
//     </html>
//   `);
// });

// // Запуск сервера
// async function startServer() {
//   try {
//     // Инициализируем mediasoup
//     await initializeMediasoup();
    
//     // Запускаем периодическую очистку
//     setInterval(() => {
//       cleanupOldStreams();
//       ViewerManager.cleanupOldViewers();
//     }, 30000); // Каждые 30 секунд
    
//     server.listen(3001, '0.0.0.0', () => {
//       console.log('✅ SFU сервер запущен на порту 3001');
//       console.log('📍 http://localhost:3001');
//       console.log('📍 http://localhost:3001/health');
//       console.log('📍 http://localhost:3001/stats');
//       console.log('\n📊 Интеграция с C# бэкендом:', CONFIG.BACKEND_API_URL);
//     });
//   } catch (error) {
//     console.error('❌ Ошибка запуска сервера:', error);
//     process.exit(1);
//   }
// }

// // Graceful shutdown
// process.on('SIGINT', () => {
//   console.log('🛑 Завершение работы SFU...');
  
//   // Очищаем все стримы
//   liveProducers.forEach((producerInfo, channelId) => {
//     io.to(`channel_${channelId}`).emit('streamStopped', { channelId });
//   });
  
//   // Закрываем все соединения
//   io.close();
  
//   // Закрываем mediasoup
//   if (worker) {
//     worker.close();
//   }
  
//   server.close(() => {
//     console.log('✅ SFU остановлен');
//     process.exit(0);
//   });
// });

// // Запускаем сервер
// startServer();

// module.exports = {
//   io,
//   server,
//   peers,
//   liveProducers,
//   viewers,
//   ViewerManager,
//   BackendIntegration
