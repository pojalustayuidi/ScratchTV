export class SfuSignalRClient {
    constructor(aspNetSignalRUrl) {
        this.connection = null;
        this.aspNetSignalRUrl = aspNetSignalRUrl;
        this.isConnected = false;
    }
    
    async connect() {
        try {
            console.log(`Connecting to ASP.NET SignalR at ${this.aspNetSignalRUrl}`);
            
            try {
                const testResponse = await fetch(this.aspNetSignalRUrl.replace('/sfuhub', '/health'));
                console.log(`ASP.NET health check: ${testResponse.status}`);
            } catch (testErr) {
                console.log(`Cannot reach ASP.NET at ${this.aspNetSignalRUrl}`);
            }
            
            this.connection = new HubConnectionBuilder()
                .withUrl(this.aspNetSignalRUrl, {
                    skipNegotiation: true,
                    transport: 1 
                })
                .configureLogging(LogLevel.Information)
                .build();
            
           
            this.connection.onclose(() => {
                console.log("🔌 SignalR connection closed");
                this.isConnected = false;
            });
            
            await this.connection.start();
            this.isConnected = true;
            console.log("SignalR connected to ASP.NET");
            return true;
        } catch (err) {
            console.error("SignalR connection failed:", err.message);
            this.isConnected = false;
            return false;
        }
    }
    async notifyViewerConnected(channelId, connectionId, userId = null) {
        try {
            if (!this.isConnected || !this.connection) {
                console.log("SignalR not connected, skipping viewer connected notification");
                return false;
            }
            
            await this.connection.invoke("ViewerConnectedToVideo", 
                channelId, connectionId, userId);
            console.log(`Notified ASP.NET about viewer connected: channel=${channelId}, conn=${connectionId}`);
            return true;
        } catch (err) {
            console.error("Failed to notify viewer connected:", err.message);
            return false;
        }
    }
    
    async notifyViewerDisconnected(channelId, connectionId) {
        try {
            if (!this.isConnected || !this.connection) {
                console.log("SignalR not connected, skipping viewer disconnected notification");
                return false;
            }
            
            await this.connection.invoke("ViewerDisconnectedFromVideo", 
                channelId, connectionId);
            console.log(`Notified ASP.NET about viewer disconnected: channel=${channelId}, conn=${connectionId}`);
            return true;
        } catch (err) {
            console.error("Failed to notify viewer disconnected:", err.message);
            return false;
        }
    }
    
    async notifyStreamStarted(channelId, sessionId) {
        try {
            if (!this.isConnected || !this.connection) {
                console.log("SignalR not connected, skipping stream started notification");
                return false;
            }
            
            await this.connection.invoke("StreamStartedInSfu", 
                channelId, sessionId);
            console.log(`Notified ASP.NET about stream started: channel=${channelId}, session=${sessionId}`);
            return true;
        } catch (err) {
            console.error("Failed to notify stream started:", err.message);
            return false;
        }
    }
    
    async notifyStreamStopped(channelId, sessionId) {
        try {
            if (!this.isConnected || !this.connection) {
                console.log("SignalR not connected, skipping stream stopped notification");
                return false;
            }
            
            await this.connection.invoke("StreamStoppedInSfu", 
                channelId, sessionId);
            console.log(`Notified ASP.NET about stream stopped: channel=${channelId}, session=${sessionId}`);
            return true;
        } catch (err) {
            console.error("Failed to notify stream stopped:", err.message);
            return false;
        }
    }
}