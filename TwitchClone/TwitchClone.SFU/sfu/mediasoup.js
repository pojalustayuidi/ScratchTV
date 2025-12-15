const mediasoup = require("mediasoup");

let worker;
let router;

async function startMediasoup() {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      { kind: "video", mimeType: "video/VP8", clockRate: 90000 }
    ]
  });
}

async function createWebRtcTransport() {
  return router.createWebRtcTransport({
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  });
}

module.exports = {
  startMediasoup,
  createWebRtcTransport,
  getRouter: () => router
};
