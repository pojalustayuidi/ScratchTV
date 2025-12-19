// Hubs/SfuHub.cs
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Hubs
{
    public class SfuHub : Hub
    {
        private readonly IViewerTrackerService _viewerTrackerService;
        private readonly IChannelService _channelService;
        private readonly ISfuSyncService _sfuSyncService;
        private readonly ILogger<SfuHub> _logger;
        
        public SfuHub(
            IViewerTrackerService viewerTrackerService,
            IChannelService channelService,
            ISfuSyncService sfuSyncService,
            ILogger<SfuHub> logger)
        {
            _viewerTrackerService = viewerTrackerService;
            _channelService = channelService;
            _sfuSyncService = sfuSyncService;
            _logger = logger;
        }
        
        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation("SFU Node connected: {ConnectionId}", Context.ConnectionId);
            await base.OnConnectedAsync();
        }
        
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation("SFU Node disconnected: {ConnectionId}", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
        }
        
        public async Task ViewerConnectedToVideo(int channelId, string connectionId, int? userId = null)
        {
            try
            {
                var sfuConnectionId = $"sfu_{connectionId}";
                await _viewerTrackerService.AddViewer(channelId, sfuConnectionId, userId);
                
                _logger.LogDebug("SFU viewer connected: channel={ChannelId}, conn={ConnectionId}", 
                    channelId, connectionId);
                
                var count = _viewerTrackerService.GetViewerCount(channelId);
                await Clients.Group($"channel_{channelId}").SendAsync("ViewersUpdated", new
                {
                    ChannelId = channelId,
                    Count = count,
                    Source = "SFU",
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in ViewerConnectedToVideo for channel {ChannelId}", channelId);
            }
        }
        
        public async Task ViewerDisconnectedFromVideo(int channelId, string connectionId)
        {
            try
            {
                var sfuConnectionId = $"sfu_{connectionId}";
                await _viewerTrackerService.RemoveViewer(sfuConnectionId);
                
                _logger.LogDebug("SFU viewer disconnected: channel={ChannelId}, conn={ConnectionId}", 
                    channelId, connectionId);
                
                var count = _viewerTrackerService.GetViewerCount(channelId);
                await Clients.Group($"channel_{channelId}").SendAsync("ViewersUpdated", new
                {
                    ChannelId = channelId,
                    Count = count,
                    Source = "SFU",
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in ViewerDisconnectedFromVideo for channel {ChannelId}", channelId);
            }
        }
        
        public async Task StreamStartedInSfu(int channelId, string sessionId)
        {
            try
            {
                var (isActive, existingSession) = await _channelService.GetActiveSession(channelId);
                
                if (!isActive || existingSession != sessionId)
                {
                    await _channelService.StartStreamSession(channelId, sessionId);
                    
                    _logger.LogInformation("SFU stream started: channel={ChannelId}, session={SessionId}", 
                        channelId, sessionId);
                    
                    await Clients.Group($"channel_{channelId}").SendAsync("StreamStarted", new
                    {
                        ChannelId = channelId,
                        SessionId = sessionId,
                        StartedAt = DateTime.UtcNow,
                        Source = "SFU"
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in StreamStartedInSfu for channel {ChannelId}", channelId);
            }
        }
        
        public async Task StreamStoppedInSfu(int channelId, string sessionId)
        {
            try
            {
                await _channelService.StopStreamSession(channelId, sessionId);
                await _viewerTrackerService.ClearChannelViewers(channelId);
                
                _logger.LogInformation("SFU stream stopped: channel={ChannelId}, session={SessionId}", 
                    channelId, sessionId);
                
                await Clients.Group($"channel_{channelId}").SendAsync("StreamStopped", new
                {
                    ChannelId = channelId,
                    SessionId = sessionId,
                    StoppedAt = DateTime.UtcNow,
                    Source = "SFU"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in StreamStoppedInSfu for channel {ChannelId}", channelId);
            }
        }
        
        public async Task GetStreamStatus(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var viewers = _viewerTrackerService.GetViewerCount(channelId);
                
                await Clients.Caller.SendAsync("StreamStatusResponse", new
                {
                    ChannelId = channelId,
                    IsLive = isActive,
                    SessionId = sessionId,
                    Viewers = viewers,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetStreamStatus for channel {ChannelId}", channelId);
            }
        }
    }
}