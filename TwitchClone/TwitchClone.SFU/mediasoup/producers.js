// Управление producer (стример)


export async function createProducer({ room, transportId, kind, rtpParameters, socket }) {
const transport = room.transports.get(transportId);
if (!transport) throw new Error("Transport not found");


const producer = await transport.produce({ kind, rtpParameters });


room.producer = producer;


producer.on("transportclose", () => {
room.producer = null;
});


producer.on("close", () => {
room.producer = null;
});


return producer;
}