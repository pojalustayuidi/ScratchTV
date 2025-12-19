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

  // Также для простого health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      server: 'SFU', 
      port: 3000,
      rooms: rooms.size,
      uptime: process.uptime()
    });
  });

  // Статистика всех комнат
  app.get('/api/rooms', (req, res) => {
    const roomsInfo = getAllRooms();
    res.json({
      success: true,
      count: rooms.size,
      rooms: roomsInfo
    });
  });

  // Принудительная остановка стрима
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
      
      // Уведомляем всех о завершении стрима
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

  // Удаление комнаты
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

  // Вспомогательная функция для отправки обновлений зрителей
  const broadcastViewersUpdate = (channelId) => {
    const room = rooms.get(channelId);
    if (!room) return;
    
    const viewersCount = room.viewersCount;
    console.log(`[Room ${channelId}] 📢 Broadcasting viewers update: ${viewersCount} viewers`);
    
    // Отправляем обновление только в комнату канала
    io.to(`channel:${channelId}`).emit('viewersUpdated', {
      channelId: channelId,
      count: viewersCount,
      timestamp: Date.now()
    });
  };

  io.on("connection", socket => {
    console.log("🔌 Connected:", socket.id);

    // Отправляем подтверждение подключения
    socket.emit("connected", { 
      socketId: socket.id,
      message: "Connected to SFU server"
    });

    // Новое: Зритель присоединяется к каналу
    socket.on("joinChannel", async ({ channelId }, cb) => {
      try {
        console.log(`👤 ${socket.id} joining channel ${channelId}`);
        
        const room = await getOrCreateRoom(channelId, worker);
        
        // Добавляем сокет в комнату Socket.IO
        await socket.join(`channel:${channelId}`);
        
        // Обновляем счетчик зрителей в объекте Room
        room.addViewer(socket.id);
        
        // Оповещаем бэкенд
        await backend.notifyViewerJoined(channelId, socket.id);
        
        // Отправляем обновление всем в комнате
        broadcastViewersUpdate(channelId);
        
        console.log(`✅ ${socket.id} joined channel ${channelId} (viewers: ${room.viewersCount})`);
        
        if (cb) cb({ success: true, viewersCount: room.viewersCount });
      } catch (error) {
        console.error(`❌ Error joining channel for ${socket.id}:`, error.message);
        if (cb) cb({ error: error.message });
      }
    });

    // Получить возможности RTP маршрутизатора
    socket.on("getRouterRtpCapabilities", async ({ channelId }, cb) => {
      try {
        console.log(`📡 ${socket.id} requested RTP capabilities for channel ${channelId}`);
        const room = await getOrCreateRoom(channelId, worker);
        cb(room.router.rtpCapabilities);
      } catch (error) {
        console.error(`❌ Error getting RTP capabilities for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Создать WebRTC-транспорт
    socket.on("createWebRtcTransport", async ({ channelId, isProducer = false }, cb) => {
      try {
        console.log(`🚚 ${socket.id} creating transport for channel ${channelId} (${isProducer ? 'producer' : 'consumer'})`);
        const room = await getOrCreateRoom(channelId, worker);
        const transport = await room.createTransport(socket.id);
        
        // Если это стример, добавляем в комнату
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
        console.error(`❌ Error creating transport for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Подключить транспорт
    socket.on("connectTransport", async ({ channelId, transportId, dtlsParameters }, cb) => {
      try {
        console.log(`🔌 ${socket.id} connecting transport ${transportId}`);
        const room = rooms.get(channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        await room.connectTransport(transportId, dtlsParameters);
        cb({ success: true });
      } catch (error) {
        console.error(`❌ Error connecting transport for ${socket.id}:`, error.message);
        cb({ success: false, error: error.message });
      }
    });

    // Создать producer (видео/аудио)
    socket.on("produce", async (data, cb) => {
      try {
        console.log(`🎥 ${socket.id} producing for channel ${data.channelId}, kind: ${data.kind}`);
        const room = rooms.get(data.channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        
        // Стример уже должен быть в комнате, но на всякий случай добавляем
        await socket.join(`channel:${data.channelId}`);
        
        const producer = await room.createProducer({ 
          ...data, 
          socketId: socket.id 
        });
        
        // Уведомляем всех о начале стрима
        io.to(`channel:${data.channelId}`).emit("streamStarted", { 
          channelId: data.channelId, 
          sessionId: data.sessionId,
          streamerSocketId: socket.id
        });
        
        // Уведомляем бэкенд
        await backend.notifyStreamStarted(data.channelId, data.sessionId, null);
        
        console.log(`✅ Producer ${producer.id} created for channel ${data.channelId}`);
        cb({ id: producer.id });
      } catch (error) {
        console.error(`❌ Error producing for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Остановить стрим
    socket.on("stopStream", async ({ channelId, sessionId }, cb) => {
      try {
        console.log(`🛑 ${socket.id} stopping stream for channel ${channelId}, session: ${sessionId}`);
        
        const room = rooms.get(channelId);
        if (!room) {
          console.log(`❌ Room ${channelId} not found`);
          return cb({ success: false, error: "Room not found" });
        }

        // Проверяем, является ли этот сокет стримером
        if (room.streamerSocketId !== socket.id) {
          console.log(`❌ ${socket.id} is not the streamer for channel ${channelId}`);
          return cb({ success: false, error: "Not authorized to stop this stream" });
        }

        // Останавливаем стрим
        room.stopStream();

        // Уведомляем всех зрителей
        io.to(`channel:${channelId}`).emit("streamStopped", { 
          channelId, 
          sessionId,
          reason: "streamer_stopped",
          stoppedBy: socket.id
        });

        // Уведомляем бэкенд
        await backend.notifyStreamStopped(channelId, sessionId, null, "streamer_stopped");

        console.log(`✅ Stream ${channelId} stopped by ${socket.id}`);
        cb({ success: true });
      } catch (error) {
        console.error(`❌ Error stopping stream for ${socket.id}:`, error.message);
        cb({ success: false, error: error.message });
      }
    });

    // Пинг от стримера
    socket.on("streamerPing", ({ channelId, sessionId }) => {
      const room = rooms.get(channelId);
      if (room) {
        room.updatePing();
      }
    });

    // Пинг от зрителя
    socket.on("viewerPing", ({ channelId }) => {
      const room = rooms.get(channelId);
      if (room) {
        // Обновляем время последней активности зрителя
        room.updateViewerPing(socket.id);
        console.log(`👁️ Viewer ${socket.id} ping for channel ${channelId}`);
      }
    });

    // Создать consumers для данного socket
    socket.on("consume", async (data, cb) => {
      try {
        console.log(`👁️ ${socket.id} consuming for channel ${data.channelId}`);
        const room = rooms.get(data.channelId);
        if (!room) {
          throw new Error("Room not found");
        }
        
        // Зритель присоединяется к комнате при первом потреблении
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
        
        console.log(`✅ Created ${consumers.length} consumers for ${socket.id}`);
        cb(consumers);
      } catch (error) {
        console.error(`❌ Error consuming for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Проверка стрима
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
        console.error(`❌ Error checking stream for ${socket.id}:`, error.message);
        cb({ error: error.message });
      }
    });

    // Зритель покинул стрим
    socket.on("leaveStream", async ({ channelId }) => {
      console.log(`🚪 ${socket.id} leaving stream ${channelId}`);
      const room = rooms.get(channelId);
      if (room) {
        // Удаляем зрителя из комнаты
        room.removeViewer(socket.id);
        socket.leave(`channel:${channelId}`);
        
        // Оповещаем бэкенд
        await backend.notifyViewerLeft(channelId, socket.id);
        
        // Обновляем счетчик для остальных
        broadcastViewersUpdate(channelId);
        
        // Закрываем ресурсы
        room.closeSocket(socket.id);
      }
    });

    // Получить количество зрителей
    socket.on("getViewerCount", ({ channelId }, cb) => {
      const room = rooms.get(channelId);
      if (!room) {
        return cb({ count: 0 });
      }
      cb({ count: room.viewersCount });
    });

    // Запросить обновление счетчика зрителей
    socket.on("requestViewerCount", ({ channelId }, cb) => {
      const room = rooms.get(channelId);
      if (!room) {
        return cb({ count: 0 });
      }
      
      const count = room.viewersCount;
      cb({ count });
      
      // Также отправляем обновление всем в комнате
      broadcastViewersUpdate(channelId);
    });

    // Обработка отключения
    socket.on("disconnect", async (reason) => {
      console.log(`❌ Disconnected: ${socket.id}, reason: ${reason}`);
      
      // Закрываем все комнаты для этого сокета
      for (const [channelId, room] of rooms.entries()) {
        if (room.hasViewer(socket.id)) {
          // Удаляем зрителя
          room.removeViewer(socket.id);
          
          // Оповещаем бэкенд
          await backend.notifyViewerLeft(channelId, socket.id);
          
          // Обновляем счетчик для остальных
          broadcastViewersUpdate(channelId);
        }
        
        room.closeSocket(socket.id);
        
        // Если комната стала пустой, удаляем её
        if (room.transports.size === 0 && 
            room.producers.size === 0 && 
            room.consumers.size === 0 &&
            !room.isStreaming) {
          
          removeRoom(channelId);
        }
      }
    });

    // Обработка ошибок
    socket.on("error", (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });

  // Запускаем периодическую очистку пустых комнат
  setInterval(() => {
    cleanupEmptyRooms();
  }, 60000); // Каждую минуту

  // Мониторинг активности комнат
  setInterval(() => {
    console.log(`📊 Active rooms: ${rooms.size}`);
    for (const [channelId, room] of rooms.entries()) {
      if (room.isStreaming) {
        const info = room.getStreamInfo();
        console.log(`  📍 ${channelId}: ${info.producersCount} producers, ${info.viewersCount} viewers, uptime: ${Math.floor(info.uptime / 1000)}s`);
        
        // Периодически отправляем обновления счетчика
        broadcastViewersUpdate(channelId);
      }
    }
  }, 30000); // Каждые 30 секунд

  server.listen(3000, () => {
    console.log("🚀 SFU listening on :3000");
    console.log("📍 Health check: http://localhost:3000/health");
    console.log("📍 Rooms API: http://localhost:3000/api/rooms");
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('🛑 Shutting down SFU server...');
    
    // Останавливаем все стримы
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
    
    // Закрываем Socket.IO
    io.close();
    
    // Закрываем сервер
    server.close(() => {
      console.log('✅ SFU server stopped');
      process.exit(0);
    });
  });
})();