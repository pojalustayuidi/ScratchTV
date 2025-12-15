// Управление consumer (зрители)


export async function createConsumer({ room, transportId, rtpCapabilities, socket }) {
if (!room.producer) throw new Error("No active producer");


if (!room.router.canConsume({
producerId: room.producer.id,
rtpCapabilities
})) {
throw new Error("Router cannot consume this producer");
}


const transport = room.transports.get(transportId);
if (!transport) throw new Error("Transport not found");


const consumer = await transport.consume({
producerId: room.producer.id,
rtpCapabilities,
paused: false
});


room.consumers.set(consumer.id, consumer);
room.viewers.add(socket.id);


socket.emit("viewersUpdated", {
channelId: room.channelId,
count: room.viewers.size
});


consumer.on("transportclose", () => {
room.consumers.delete(consumer.id);
room.viewers.delete(socket.id);
});


consumer.on("producerclose", () => {
room.consumers.delete(consumer.id);
room.viewers.delete(socket.id);
socket.emit("streamStopped", { channelId: room.channelId });
});


return {
id: consumer.id,
producerId: room.producer.id,
kind: consumer.kind,
rtpParameters: consumer.rtpParameters
};
}