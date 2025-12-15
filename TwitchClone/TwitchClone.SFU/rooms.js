const rooms = new Map();
const transportToRoom = new Map();

let worker = null;

class Room {
    constructor(channelId, worker) {
        this.channelId = channelId;
        this.worker = worker;

        this.router = null;

        this.transports = new Map(); // transportId -> transport
        this.producers = new Map();  // kind -> producer
        this.consumers = new Map();  // socketId -> Map<consumerId, consumer>

        this.sessionId = null;
        this.lastActivity = Date.now();
    }

    async init() {
        if (this.router) {
            return; // Уже инициализирован
        }

        this.router = await this.worker.createRouter({
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000
                }
            ]
        });

        console.log(`✅ Router created for channel ${this.channelId}`);
    }

   async createTransport(socketId = null) {
    if (!this.router) {
        await this.init();
    }

    const transport = await this.router.createWebRtcTransport({
        listenIps: [{ ip: '127.0.0.1', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: { 
            socketId,
            roomId: this.channelId,
            createdAt: Date.now()
        }
    });

    this.transports.set(transport.id, transport);
    transportToRoom.set(transport.id, this);

    // Добавляем логирование при создании
    console.log(`✅ Transport created: ${transport.id}`);
    console.log(`   ├─ Room: ${this.channelId}`);
    console.log(`   ├─ Socket: ${socketId}`);
    console.log(`   └─ Total transports in room: ${this.transports.size}`);

    transport.on('close', () => {
        this.transports.delete(transport.id);
        transportToRoom.delete(transport.id);
        console.log(`🛑 Transport ${transport.id} closed`);
    });

    return transport;
}

async connectTransport(transportId, dtlsParameters) {
    console.log(`🔍 Looking for transport ${transportId} in room ${this.channelId}`);
    console.log(`   ├─ Available transports:`, Array.from(this.transports.keys()));
    
    const transport = this.transports.get(transportId);
    if (!transport) {
        console.log(`❌ Transport ${transportId} NOT FOUND in room ${this.channelId}`);
        throw new Error(`Transport ${transportId} not found in room ${this.channelId}`);
    }

    try {
        console.log(`🔗 Connecting transport ${transportId}...`);
        await transport.connect({ dtlsParameters });
        console.log(`✅ Transport ${transportId} connected in room ${this.channelId}`);
    } catch (err) {
        console.error(`❌ Failed to connect transport ${transportId}:`, err);
        throw err;
    }
}

    async createProducer({ transportId, kind, rtpParameters, sessionId }) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }

        const producer = await transport.produce({ 
            kind, 
            rtpParameters 
        });

        this.producers.set(kind, producer);
        this.sessionId = sessionId;

        producer.on('close', () => {
            this.producers.delete(kind);
            console.log(`🛑 Producer closed: ${producer.id} [${kind}]`);
        });

        console.log(`🎬 Producer created [${kind}] ${producer.id} for session ${sessionId}`);
        return producer;
    }

    async createConsumers({ transportId, rtpCapabilities, socketId }) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }

        const result = [];

        for (const producer of this.producers.values()) {
            if (!this.router.canConsume({
                producerId: producer.id,
                rtpCapabilities
            })) {
                console.log(`⚠️ Cannot consume producer ${producer.id} [${producer.kind}]`);
                continue;
            }

            const consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: false
            });

            if (!this.consumers.has(socketId)) {
                this.consumers.set(socketId, new Map());
            }

            this.consumers.get(socketId).set(consumer.id, consumer);

            consumer.on('close', () => {
                this.consumers.get(socketId)?.delete(consumer.id);
                console.log(`🛑 Consumer closed: ${consumer.id} for socket ${socketId}`);
            });

            result.push({
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                type: consumer.type
            });
        }

        console.log(`✅ Created ${result.length} consumers for socket ${socketId}`);
        return result;
    }

    closeSocket(socketId) {
        const map = this.consumers.get(socketId);
        if (!map) return;

        for (const consumer of map.values()) {
            try { 
                consumer.close(); 
                console.log(`🛑 Closed consumer ${consumer.id} for socket ${socketId}`);
            } catch (err) {
                console.error(`❌ Error closing consumer ${consumer.id}:`, err);
            }
        }

        this.consumers.delete(socketId);
        console.log(`✅ Socket ${socketId} resources cleaned up in room ${this.channelId}`);
    }

    close() {
        console.log(`🛑 Closing room ${this.channelId}...`);
        
        // Закрываем consumers
        for (const [socketId, map] of this.consumers.entries()) {
            for (const consumer of map.values()) {
                try { consumer.close(); } catch {}
            }
        }
        this.consumers.clear();

        // Закрываем producers
        for (const producer of this.producers.values()) {
            try { producer.close(); } catch {}
        }
        this.producers.clear();

        // Закрываем transports
        for (const transport of this.transports.values()) {
            try { transport.close(); } catch {}
        }
        this.transports.clear();

        // Закрываем router
        if (this.router) {
            try { 
                this.router.close(); 
                this.router = null;
            } catch {}
        }

        console.log(`✅ Room ${this.channelId} closed`);
    }
}

exports.setWorker = (w) => {
    worker = w;
    console.log("✅ Worker set in rooms module");
};

exports.getOrCreateRoom = async (channelId) => {
    let room = rooms.get(channelId);
    
    if (room) {
        // Если комната есть, но роутер не создан - создаем
        if (!room.router) {
            await room.init();
        }
        return room;
    }

    if (!worker) {
        throw new Error("Mediasoup worker not initialized");
    }

    room = new Room(channelId, worker);
    await room.init();
    rooms.set(channelId, room);

    console.log(`🆕 Room created for channel ${channelId}`);
    return room;
};

exports.getRoom = (channelId) => {
    return rooms.get(channelId) || null;
};

exports.getRoomByTransport = (transportId) => {
    return transportToRoom.get(transportId) || null;
};

exports.closeRoom = (channelId) => {
    const room = rooms.get(channelId);
    if (!room) return;

    room.close();
    rooms.delete(channelId);
};

exports.getAllRooms = () => {
    return Array.from(rooms.values());
};

exports.Room = Room;