const BackendNotifier = require("./BackendNotifier");

class StreamLifecycleService {
  static async stop({ channelId, sessionId, reason }) {
    await BackendNotifier.streamStopped({
      channelId,
      sessionId,
      reason
    });
  }
}

module.exports = StreamLifecycleService;
