const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { initWorker } = require("./mediasoup");
const { getOrCreateRoom, rooms, removeRoom, getAllRooms, cleanupEmptyRooms } = require("./rooms");
const BackendIntegration = require("./backend-integration");

(async () => {
  const worker = await initWorker();
  const backend = new BackendIntegration();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { 
    cors: { 
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Health check endpoint для C# API
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mediasoup: worker ? 'ready' : 'not_ready',
      activeRooms: rooms.size,
      message: 'SFU server is running'
    });
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      server: 'SFU', 
      port: 3000,
      rooms: rooms.size,
      uptime: process.uptime()
    });
  });

  app.get('/api/rooms', (req, res) => {
    const roomsInfo = getAllRooms();
    res.json({
      success: true,
      count: rooms.size,
      rooms: roomsInfo
    });
  });

  app.post('/api/room/:channelId/stop', (req, res) => {
    const { channelId } = req.params;
    const room = rooms.get(channelId);
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        error: "Room not found" 
      });
    }
    
    try {
      room.stopStream();
      
      io.to(`channel:${channelId}`).emit("streamStopped", { 
        channelId, 
        sessionId: room.sessionId,
        reason: "admin_stopped" 
      });
      
      res.json({ 
        success: true, 
        message: `Stream ${channelId} stopped successfully` 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  app.delete('/api/room/:channelId', (req, res) => {
    const { channelId } = req.params;
    const removed = removeRoom(channelId);
    
    if (removed) {
      res.json({ 
        success: true, 
        message: `Room ${channelId} removed` 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: "Room not found" 
      });
    }
  });

  const broadcastViewersUpdate = (channelId) => {
    const room = rooms.get(channelId);
    if (!room) return;
    
    const viewersCount = room.viewersCount;
    console.log(`[Room ${channelId}] Broadcasting viewers update: ${viewersCount} viewers`);
    
    io.to(`channel:${channelId}`).emit('viewersUpdated', {
      channelId: channelId,
      count: viewersCount,
      timestamp: Date.now()
    });
  };

  io.on("connection", socket => {
    console.log("Connected:", socket.id);

    socket.emit("connected", { 
      socketId: socket.id,
      message: "Connected to SFU server"
    });

    socket.on("joinChannel", async ({ channelId }, cb) => {
      try {
        console.log(`${socket.id} joining channel ${channelId}`);
        
        const room = await getOrCreateRoom(channelId, worker);
        
        await socket.join(`channel:${channelId}`);
        
        room.addViewer(socket.id);
        
        await backend.notifyViewerJoined(channelId, socket.id);
        
        broadcastViewersUpdate(channelId);
        
        console.log(`${socket.id} joined channel ${channelId} (viewers: ${room.viewersCount})`);
        
        if (cb) cb({ success: true, viewersCount: room.viewersCount });
      } catch (error) {
        console.error(`Error joining channel for ${socket.id}:`, error.message);
        if (cb) cb({ error: error.message });
      }
    });

    socket.on("getRouterRtpCapabilities", async ({ channelId }, cb) => {
      try {
        console.log(`${socket.id} requested RTP capabilities for channel ${channelId}`);
        const room = await getOrCreateRoom(channelId, worker);
        cb(room.router.rtpCapabilities);
      } catch (error) {
        console.error(`Error getting RTP capabilities for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    socket.on("createWebRtcTransport", async ({ channelId, isProducer = false }, cb) => {
      try {
        console.log(`${socket.id} creating transport for channel ${channelId} (${isProducer ? 'producer' : 'consumer'})`);
        const room = await getOrCreateRoom(channelId, worker);
        const transport = await room.createTransport(socket.id);
        
        if (isProducer) {
          await socket.join(`channel:${channelId}`);
        }
        
        cb({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        });
      } catch (error) {
        console.error(`Error creating transport for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    socket.on("connectTransport", async ({ channelId, transportId, dtlsParameters }, cb) => {
      try {
        console.log(`${socket.id} connecting transport ${transportId}`);
        const room = rooms.get(channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        await room.connectTransport(transportId, dtlsParameters);
        cb({ success: true });
      } catch (error) {
        console.error(`Error connecting transport for ${socket.id}:`, error.message);
        cb({ success: false, error: error.message });
      }
    });

    socket.on("produce", async (data, cb) => {
      try {
        console.log(`${socket.id} producing for channel ${data.channelId}, kind: ${data.kind}`);
        const room = rooms.get(data.channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        
        await socket.join(`channel:${data.channelId}`);
        
        const producer = await room.createProducer({ 
          ...data, 
          socketId: socket.id 
        });
        
        io.to(`channel:${data.channelId}`).emit("streamStarted", { 
          channelId: data.channelId, 
          sessionId: data.sessionId,
          streamerSocketId: socket.id
        });
        
        await backend.notifyStreamStarted(data.channelId, data.sessionId, null);
        
        console.log(`Producer ${producer.id} created for channel ${data.channelId}`);
        cb({ id: producer.id });
      } catch (error) {
        console.error(`Error producing for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Остановить стрим
    socket.on("stopStream", async ({ channelId, sessionId }, cb) => {
      try {
        console.log(`${socket.id} stopping stream for channel ${channelId}, session: ${sessionId}`);
        
        const room = rooms.get(channelId);
        if (!room) {
          console.log(`Room ${channelId} not found`);
          return cb({ success: false, error: "Room not found" });
        }

        if (room.streamerSocketId !== socket.id) {
          console.log(`${socket.id} is not the streamer for channel ${channelId}`);
          return cb({ success: false, error: "Not authorized to stop this stream" });
        }

        room.stopStream();

        io.to(`channel:${channelId}`).emit("streamStopped", { 
          channelId, 
          sessionId,
          reason: "streamer_stopped",
          stoppedBy: socket.id
        });

        await backend.notifyStreamStopped(channelId, sessionId, null, "streamer_stopped");

        console.log(`Stream ${channelId} stopped by ${socket.id}`);
        cb({ success: true });
      } catch (error) {
        console.error(`Error stopping stream for ${socket.id}:`, error.message);
        cb({ success: false, error: error.message });
      }
    });

    socket.on("streamerPing", ({ channelId, sessionId }) => {
      const room = rooms.get(channelId);
      if (room) {
        room.updatePing();
      }
    });

    socket.on("viewerPing", ({ channelId }) => {
      const room = rooms.get(channelId);
      if (room) {
        room.updateViewerPing(socket.id);
        console.log(`Viewer ${socket.id} ping for channel ${channelId}`);
      }
    });

    socket.on("consume", async (data, cb) => {
      try {
        console.log(`${socket.id} consuming for channel ${data.channelId}`);
        const room = rooms.get(data.channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        
        if (!room.isViewerInRoom(socket.id)) {
          await socket.join(`channel:${data.channelId}`);
          room.addViewer(socket.id);
          broadcastViewersUpdate(data.channelId);
          await backend.notifyViewerJoined(data.channelId, socket.id);
        }
        
        const consumers = await room.createConsumers({ 
          ...data, 
          socketId: socket.id 
        });
        
        console.log(`Created ${consumers.length} consumers for ${socket.id}`);
        cb(consumers);
      } catch (error) {
        console.error(`Error consuming for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    socket.on("checkStream", async ({ channelId }, cb) => {
      try {
        const room = rooms.get(channelId);
        if (!room) {
          return cb({
            isLive: false,
            viewersCount: 0,
            exists: false
          });
        }
        
        cb({
          isLive: room.isLive(),
          viewersCount: room.viewersCount,
          exists: true,
          sessionId: room.sessionId,
          streamerSocketId: room.streamerSocketId
        });
      } catch (error) {
        console.error(`Error checking stream for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    socket.on("leaveStream", async ({ channelId }) => {
      console.log(`${socket.id} leaving stream ${channelId}`);
      const room = rooms.get(channelId);
      if (room) {
        room.removeViewer(socket.id);
        socket.leave(`channel:${channelId}`);
        
        await backend.notifyViewerLeft(channelId, socket.id);
        
        broadcastViewersUpdate(channelId);
        
        room.closeSocket(socket.id);
      }
    });

    socket.on("getViewerCount", ({ channelId }, cb) => {
      const room = rooms.get(channelId);
      if (!room) {
        return cb({ count: 0 });
      }
      cb({ count: room.viewersCount });
    });

    socket.on("requestViewerCount", ({ channelId }, cb) => {
      const room = rooms.get(channelId);
      if (!room) {
        return cb({ count: 0 });
      }
      
      const count = room.viewersCount;
      cb({ count });
      
      broadcastViewersUpdate(channelId);
    });

    // Обработка отключения
    socket.on("disconnect", async (reason) => {
      console.log(`Disconnected: ${socket.id}, reason: ${reason}`);
      
      for (const [channelId, room] of rooms.entries()) {
        if (room.hasViewer(socket.id)) {
          room.removeViewer(socket.id);
          
          await backend.notifyViewerLeft(channelId, socket.id);
          
          broadcastViewersUpdate(channelId);
        }
        
        room.closeSocket(socket.id);
        
        if (room.transports.size === 0 && 
            room.producers.size === 0 && 
            room.consumers.size === 0 &&
            !room.isStreaming) {
          
          removeRoom(channelId);
        }
      }
    });

    socket.on("error", (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  setInterval(() => {
    cleanupEmptyRooms();
  }, 60000); 


  setInterval(() => {
    console.log(`Active rooms: ${rooms.size}`);
    for (const [channelId, room] of rooms.entries()) {
      if (room.isStreaming) {
        const info = room.getStreamInfo();
        console.log(`${channelId}: ${info.producersCount} producers, ${info.viewersCount} viewers, uptime: ${Math.floor(info.uptime / 1000)}s`);
        
        broadcastViewersUpdate(channelId);
      }
    }
  }, 30000); 

  server.listen(3000, () => {
    console.log("SFU listening on :3000");
    console.log("Health check: http://localhost:3000/health");
    console.log("Rooms API: http://localhost:3000/api/rooms");
  });


  process.on('SIGINT', () => {
    console.log('Shutting down SFU server...');
    

    for (const [channelId, room] of rooms.entries()) {
      if (room.isStreaming) {
        room.stopStream();
        io.to(`channel:${channelId}`).emit("streamStopped", { 
          channelId, 
          sessionId: room.sessionId,
          reason: "server_shutdown" 
        });
      }
      room.destroy();
    }
    

    io.close();
    

    server.close(() => {
      console.log('SFU server stopped');
      process.exit(0);
    });
  });
})();