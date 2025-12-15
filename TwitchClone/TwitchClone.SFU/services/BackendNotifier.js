const axios = require("axios");

class BackendNotifier {
  static async streamStopped({ channelId, sessionId, reason }) {
    await axios.post(
      `${process.env.BACKEND_URL}/api/sfu/stream/stopped`,
      { channelId, sessionId, reason }
    );
  }
}

module.exports = BackendNotifier;
