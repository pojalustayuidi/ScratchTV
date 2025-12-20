const axios = require('axios');

class BackendIntegration {
  constructor(baseURL = 'http://localhost:5172') {
    this.baseURL = baseURL;
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async notifyStreamStarted(channelId, sessionId, userId, metadata = {}) {
    try {
      await this.axiosInstance.post('/api/sfu/stream/started', {
        channelId,
        sessionId,
        userId,
        timestamp: new Date().toISOString(),
        metadata
      });
      console.log(`Backend notified about stream start: ${channelId}`);
      return true;
    } catch (error) {
      console.error(`Error notifying backend about stream start:`, error.message);
      return false;
    }
  }

  async notifyStreamStopped(channelId, sessionId, userId, reason = 'manual') {
    try {
      await this.axiosInstance.post('/api/sfu/stream/stopped', {
        channelId,
        sessionId,
        userId,
        reason,
        timestamp: new Date().toISOString()
      });
      console.log(`Backend notified about stream stop: ${channelId}`);
      return true;
    } catch (error) {
      console.error(`Error notifying backend about stream stop:`, error.message);
      return false;
    }
  }

  async notifyViewerJoined(channelId, socketId, userId = null) {
    try {
      await this.axiosInstance.post('/api/sfu/viewer/joined', {
        channelId,
        connectionId: socketId,
        userId,
        timestamp: new Date().toISOString()
      });
      console.log(`Backend notified about viewer joined: ${socketId}`);
      return true;
    } catch (error) {
      console.error(`Error notifying backend about viewer joined:`, error.message);
      return false;
    }
  }

  async notifyViewerLeft(channelId, socketId) {
    try {
      await this.axiosInstance.post('/api/sfu/viewer/left', {
        channelId,
        connectionId: socketId,
        timestamp: new Date().toISOString()
      });
      console.log(`Backend notified about viewer left: ${socketId}`);
      return true;
    } catch (error) {
      console.error(`Error notifying backend about viewer left:`, error.message);
      return false;
    }
  }

  async validateStreamToken(channelId, token) {
    try {
      const response = await this.axiosInstance.post('/api/sfu/validate-token', {
        channelId,
        token
      });
      return response.data.valid;
    } catch (error) {
      console.error(`Error validating token:`, error.message);
      return false;
    }
  }

  async getStreamInfo(channelId) {
    try {
      const response = await this.axiosInstance.get(`/api/stream/${channelId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting stream info:`, error.message);
      return null;
    }
  }
}

module.exports = BackendIntegration;