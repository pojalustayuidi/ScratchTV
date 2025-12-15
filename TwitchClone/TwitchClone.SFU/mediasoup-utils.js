// import { worker } from "./worker.js";

// export function createRouter() {
//     return worker.createRouter({
//         mediaCodecs: [
//             {
//                 kind: "audio",
//                 mimeType: "audio/opus",
//                 clockRate: 48000,
//                 channels: 2
//             },
//             {
//                 kind: "video",
//                 mimeType: "video/VP8",
//                 clockRate: 90000
//             }
//         ]
//     });
// }

// export async function createWebRtcTransport(router) {
//     const transport = await router.createWebRtcTransport({
//         listenIps: [{ 
//             ip: "0.0.0.0", 
//             announcedIp: null 
//         }],
//         enableUdp: true,
//         enableTcp: true,
//         preferUdp: true
//     });
    
//     return {
//         id: transport.id,
//         iceParameters: transport.iceParameters,
//         iceCandidates: transport.iceCandidates,
//         dtlsParameters: transport.dtlsParameters,
//         connect: async (params) => await transport.connect(params),
//         produce: async (opts) => await transport.produce(opts),
//         consume: async (opts) => await transport.consume(opts),
//         close: () => transport.close()
//     };
// }