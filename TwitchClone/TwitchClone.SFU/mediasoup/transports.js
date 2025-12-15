export async function createWebRtcTransport(router) {
const transport = await router.createWebRtcTransport({
listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
enableUdp: true,
enableTcp: true,
preferUdp: true
});


return {
id: transport.id,
iceParameters: transport.iceParameters,
iceCandidates: transport.iceCandidates,
dtlsParameters: transport.dtlsParameters,
connect: (params) => transport.connect(params),
produce: (opts) => transport.produce(opts),
consume: (opts) => transport.consume(opts),
close: () => transport.close()
};
}