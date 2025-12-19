// mediasoup.js
const mediasoup = require("mediasoup");

let worker;

async function initWorker() {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: 40000,
    rtcMaxPort: 49999
  });

  worker.on("died", () => {
    console.error("❌ Mediasoup worker died");
    process.exit(1);
  });

  console.log("✅ Mediasoup worker started:", worker.pid);
  return worker;
}

module.exports = { initWorker };
