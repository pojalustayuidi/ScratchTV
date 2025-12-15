using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Hubs
{
    public class StreamHub : Hub
    {
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ChannelService _channelService;
        private readonly IStreamService _streamService;
        private readonly SfuSyncService _sfuSync;
        private readonly ILogger<StreamHub> _logger;

        private static readonly Dictionary<int, StreamSession> _streamSessions = new();

        private class StreamSession
        {
            public string ConnectionId { get; set; } = null!;
            public string SessionId { get; set; } = null!;
            public DateTime LastPing { get; set; }
            public bool IsActive { get; set; }
        }

        public StreamHub(
            IViewerTrackerService viewerTracker,
            ChannelService channelService,
            IStreamService streamService,
            SfuSyncService sfuSync,
            ILogger<StreamHub> logger)
        {
            _viewerTracker = viewerTracker;
            _channelService = channelService;
            _streamService = streamService;
            _sfuSync = sfuSync;
            _logger = logger;
        }

        public override async Task OnConnectedAsync()
        {
            try
            {
                var httpContext = Context.GetHttpContext();
                var channelIdStr = httpContext?.Request.Query["channelId"];
                
                if (!string.IsNullOrEmpty(channelIdStr) && int.TryParse(channelIdStr, out int channelId))
                {
                    // Добавляем в группу канала для broadcast сообщений
                    await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");
                    
                    _logger.LogDebug($"Client connected: {Context.ConnectionId} to channel {channelId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OnConnectedAsync");
            }
            
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            try
            {
                // Удаляем из трекера зрителей
                await _viewerTracker.RemoveViewer(Context.ConnectionId);
                
                // Удаляем из сессий стримеров
                var streamerEntry = _streamSessions.FirstOrDefault(x => x.Value.ConnectionId == Context.ConnectionId);
                if (streamerEntry.Key != 0)
                {
                    _streamSessions.Remove(streamerEntry.Key);
                    _logger.LogInformation($"Streamer disconnected from channel {streamerEntry.Key}");
                }
                
                _logger.LogDebug($"Client disconnected: {Context.ConnectionId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OnDisconnectedAsync");
            }
            
            await base.OnDisconnectedAsync(exception);
        }

        // ===============================
        // STREAMER METHODS
        // ===============================
        public async Task JoinAsStreamer(int channelId, string sessionId)
        {
            try
            {
                var userId = GetUserIdFromContext();
                if (!userId.HasValue)
                {
                    await Clients.Caller.SendAsync("Error", "Authentication required");
                    return;
                }

                // Проверяем владение каналом
                var channel = await _channelService.GetById(channelId);
                if (channel == null || channel.UserId != userId.Value)
                {
                    await Clients.Caller.SendAsync("Error", "Channel not found or access denied");
                    return;
                }

                // Проверяем, можно ли восстановить существующую сессию
                var sfuActive = await _sfuSync.IsStreamActiveInSfu(channelId);
                var (isActive, existingSessionId) = await _channelService.GetActiveSession(channelId);
                
                // Если SFU уже транслирует, но с другой сессией
                if (sfuActive && channel.CurrentSessionId != sessionId)
                {
                    // Принудительно останавливаем старую сессию в SFU
                    await _sfuSync.NotifySfuStreamStopped(channelId, channel.CurrentSessionId);
                }
                
                if (isActive && existingSessionId == sessionId)
                {
                    // Восстанавливаем существующую сессию
                    _streamSessions[channelId] = new StreamSession
                    {
                        ConnectionId = Context.ConnectionId,
                        SessionId = sessionId,
                        LastPing = DateTime.UtcNow,
                        IsActive = true
                    };
                    
                    await _channelService.UpdateStreamPing(channelId);
                    
                    await Clients.Caller.SendAsync("SessionResumed", new
                    {
                        SessionId = sessionId,
                        ChannelId = channelId,
                        Message = "Session resumed"
                    });
                    
                    _logger.LogInformation($"Streamer session resumed: channel={channelId}, session={sessionId}");
                }
                else
                {
                    // Начинаем новую сессию
                    var newSessionId = Guid.NewGuid().ToString();
                    await _channelService.StartStreamSession(channelId, newSessionId);
                    
                    _streamSessions[channelId] = new StreamSession
                    {
                        ConnectionId = Context.ConnectionId,
                        SessionId = newSessionId,
                        LastPing = DateTime.UtcNow,
                        IsActive = true
                    };
                    
                    // Очищаем старых зрителей
                    await _viewerTracker.ClearChannelViewers(channelId);
                    
                    // Уведомляем SFU о начале стрима
                    await _sfuSync.NotifySfuStreamStarted(channelId, newSessionId);
                    
                    await Clients.Caller.SendAsync("NewSessionStarted", new
                    {
                        SessionId = newSessionId,
                        ChannelId = channelId,
                        Message = "New stream session started",
                        SfuNotified = true
                    });
                    
                    // Уведомляем всех о начале стрима
                    await Clients.Group($"channel_{channelId}").SendAsync("StreamStarted", new
                    {
                        ChannelId = channelId,
                        SessionId = newSessionId,
                        StartedAt = DateTime.UtcNow,
                        Source = "StreamHub"
                    });
                    
                    _logger.LogInformation($"New stream session started: channel={channelId}, session={newSessionId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in JoinAsStreamer for channel {channelId}");
                await Clients.Caller.SendAsync("Error", "Internal server error");
            }
        }




        public async Task StreamerPing(int channelId)
        {
            try
            {
                if (_streamSessions.TryGetValue(channelId, out var session))
                {
                    if (session.ConnectionId == Context.ConnectionId)
                    {
                        session.LastPing = DateTime.UtcNow;
                        await _channelService.UpdateStreamPing(channelId);

                        // Также пингуем SFU через синхронизацию
                        await _sfuSync.SyncViewerCounts(channelId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in StreamerPing for channel {channelId}");
            }
        }

        public async Task EndStream(int channelId)
        {
            try
            {
                var userId = GetUserIdFromContext();
                if (!userId.HasValue) return;

                var channel = await _channelService.GetById(channelId);
                if (channel == null || channel.UserId != userId.Value) return;

                // Получаем текущую сессию
                var sessionId = channel.CurrentSessionId;
                
                // Завершаем сессию в ASP.NET
                await _channelService.StopStreamSession(channelId);
                
                // Завершаем сессию в SFU
                if (!string.IsNullOrEmpty(sessionId))
                {
                    await _sfuSync.NotifySfuStreamStopped(channelId, sessionId);
                }
                
                // Очищаем зрителей
                await _viewerTracker.ClearChannelViewers(channelId);
                
                // Удаляем из активных сессий
                _streamSessions.Remove(channelId);
                
                // Уведомляем всех о завершении стрима
                await Clients.Group($"channel_{channelId}").SendAsync("StreamStopped", new
                {
                    ChannelId = channelId,
                    SessionId = sessionId,
                    StoppedAt = DateTime.UtcNow,
                    Message = "Stream ended"
                });
                
                _logger.LogInformation($"Stream ended: channel={channelId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in EndStream for channel {channelId}");
            }
        }

        // ===============================
        // VIEWER METHODS
        // ===============================
        public async Task JoinAsViewer(int channelId)
        {
            try
            {
                var userId = GetUserIdFromContext();
                
                // Проверяем, активен ли стрим
                var isLive = await _channelService.IsChannelLive(channelId);
                if (!isLive)
                {
                    await Clients.Caller.SendAsync("StreamNotActive");
                    return;
                }
                
                // Добавляем в группу (на всякий случай)
                await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");
                
                // Регистрируем как зрителя
                var success = await _viewerTracker.AddViewer(channelId, Context.ConnectionId, userId);
                
                if (success)
                {
                    // Отправляем текущий счетчик зрителю
                    var count = _viewerTracker.GetViewerCount(channelId);
                    await Clients.Caller.SendAsync("ViewerJoined", new
                    {
                        ChannelId = channelId,
                        Count = count,
                        YourConnectionId = Context.ConnectionId,
                        SfuWsUrl = "ws://localhost:3000",
                        Instructions = "Connect to SFU WebSocket to receive video stream"
                    });
                    
                    _logger.LogDebug($"Viewer joined: channel={channelId}, connection={Context.ConnectionId}");
                }
                else
                {
                    await Clients.Caller.SendAsync("Error", "Failed to join as viewer");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in JoinAsViewer for channel {channelId}");
                await Clients.Caller.SendAsync("Error", "Internal server error");
            }
        }

        public async Task LeaveAsViewer(int channelId)
        {
            try
            {
                await _viewerTracker.RemoveViewer(Context.ConnectionId);
                await Clients.Caller.SendAsync("ViewerLeft", new
                {
                    ChannelId = channelId,
                    Message = "You left the stream"
                });
                
                _logger.LogDebug($"Viewer left: channel={channelId}, connection={Context.ConnectionId}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in LeaveAsViewer for channel {channelId}");
            }
        }

        public async Task RequestViewerCount(int channelId)
        {
            try
            {
                var count = _viewerTracker.GetViewerCount(channelId);
                var uniqueCount = _viewerTracker.GetUniqueUserCount(channelId);
                var sfuCount = await _sfuSync.GetViewersFromSfu(channelId);
                
                await Clients.Caller.SendAsync("CurrentViewerCount", new
                {
                    ChannelId = channelId,
                    Count = count,
                    UniqueCount = uniqueCount,
                    SfuCount = sfuCount,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in RequestViewerCount for channel {channelId}");
            }
        }

        // ===============================
        // SFU CONNECTION METHODS
        // ===============================
        public async Task GetSfuConnectionInfo(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                
                if (!isActive)
                {
                    await Clients.Caller.SendAsync("SfuInfo", new
                    {
                        ChannelId = channelId,
                        IsLive = false,
                        Message = "Stream is not active"
                    });
                    return;
                }
                
                // Информация для подключения к SFU
                await Clients.Caller.SendAsync("SfuInfo", new
                {
                    ChannelId = channelId,
                    IsLive = true,
                    SessionId = sessionId,
                    WsUrl = "ws://localhost:3000", // URL вашего Node.js SFU
                    IceServers = new[]
                    {
                        new { urls = "stun:stun.l.google.com:19302" },
                        new { urls = "stun:global.stun.twilio.com:3478" }
                    },
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in GetSfuConnectionInfo for channel {channelId}");
            }
        }

        // ===============================
        // UTILITY METHODS
        // ===============================
        public async Task GetStreamStatus(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var viewerCount = _viewerTracker.GetViewerCount(channelId);
                var sfuActive = await _sfuSync.IsStreamActiveInSfu(channelId);
                var sfuViewers = await _sfuSync.GetViewersFromSfu(channelId);
                
                await Clients.Caller.SendAsync("StreamStatus", new
                {
                    ChannelId = channelId,
                    IsLive = isActive || sfuActive,
                    SessionId = sessionId,
                    ViewerCount = viewerCount,
                    SfuActive = sfuActive,
                    SfuViewers = sfuViewers,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in GetStreamStatus for channel {channelId}");
            }
        }

        private int? GetUserIdFromContext()
        {
            try
            {
                var httpContext = Context.GetHttpContext();
                var userIdClaim = httpContext?.User.FindFirst(ClaimTypes.NameIdentifier);
                if (userIdClaim != null && int.TryParse(userIdClaim.Value, out var userId))
                    return userId;
                return null;
            }
            catch
            {
                return null;
            }
        }
    }
}