using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Hubs
{
    public class SfuHub : Hub
    {
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ChannelService _channelService;
        private readonly SfuSyncService _sfuSync;
        private readonly ILogger<SfuHub> _logger;
        
        public SfuHub(
            IViewerTrackerService viewerTracker,
            ChannelService channelService,
            SfuSyncService sfuSync,
            ILogger<SfuHub> logger)
        {
            _viewerTracker = viewerTracker;
            _channelService = channelService;
            _sfuSync = sfuSync;
            _logger = logger;
        }
        
        // SFU подключается к ASP.NET
        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation($"SFU Node connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }
        
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation($"SFU Node disconnected: {Context.ConnectionId}");
            await base.OnDisconnectedAsync(exception);
        }
        
        // SFU уведомляет о подключении зрителя к видео
        public async Task ViewerConnectedToVideo(int channelId, string connectionId, int? userId = null)
        {
            try
            {
                // Добавляем зрителя с префиксом sfu_
                var sfuConnectionId = $"sfu_{connectionId}";
                await _viewerTracker.AddViewer(channelId, sfuConnectionId, userId);
                
                _logger.LogDebug($"SFU viewer connected: channel={channelId}, conn={connectionId}");
                
                // Уведомляем всех клиентов
                var count = _viewerTracker.GetViewerCount(channelId);
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
                _logger.LogError(ex, $"Error in ViewerConnectedToVideo for channel {channelId}");
            }
        }
        
        // SFU уведомляет об отключении зрителя от видео
        public async Task ViewerDisconnectedFromVideo(int channelId, string connectionId)
        {
            try
            {
                var sfuConnectionId = $"sfu_{connectionId}";
                await _viewerTracker.RemoveViewer(sfuConnectionId);
                
                _logger.LogDebug($"SFU viewer disconnected: channel={channelId}, conn={connectionId}");
                
                // Уведомляем всех клиентов
                var count = _viewerTracker.GetViewerCount(channelId);
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
                _logger.LogError(ex, $"Error in ViewerDisconnectedFromVideo for channel {channelId}");
            }
        }
        
        // SFU уведомляет о начале трансляции
        public async Task StreamStartedInSfu(int channelId, string sessionId)
        {
            try
            {
                // Проверяем, есть ли уже сессия в ASP.NET
                var (isActive, existingSession) = await _channelService.GetActiveSession(channelId);
                
                if (!isActive || existingSession != sessionId)
                {
                    // Обновляем сессию в базе
                    await _channelService.StartStreamSession(channelId, sessionId);
                    
                    _logger.LogInformation($"SFU stream started: channel={channelId}, session={sessionId}");
                    
                    // Уведомляем всех клиентов
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
                _logger.LogError(ex, $"Error in StreamStartedInSfu for channel {channelId}");
            }
        }
        
        // SFU уведомляет о завершении трансляции
        public async Task StreamStoppedInSfu(int channelId, string sessionId)
        {
            try
            {
                await _channelService.StopStreamSession(channelId, sessionId);
                
                // Очищаем зрителей из трекера
                await _viewerTracker.ClearChannelViewers(channelId);
                
                _logger.LogInformation($"SFU stream stopped: channel={channelId}, session={sessionId}");
                
                // Уведомляем всех клиентов
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
                _logger.LogError(ex, $"Error in StreamStoppedInSfu for channel {channelId}");
            }
        }
        
        // Запрос статуса стрима из ASP.NET
        public async Task GetStreamStatus(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var viewers = _viewerTracker.GetViewerCount(channelId);
                
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
                _logger.LogError(ex, $"Error in GetStreamStatus for channel {channelId}");
            }
        }
    }
}