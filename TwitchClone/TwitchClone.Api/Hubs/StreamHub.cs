// Hubs/StreamHub.cs
using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Hubs
{
    public class StreamHub : Hub
    {
        private readonly IViewerTrackerService _viewerTrackerService;
        private readonly IChannelService _channelService;
        private readonly IStreamService _streamService;
        private readonly ISfuSyncService _sfuSyncService;
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
            IViewerTrackerService viewerTrackerService,
            IChannelService channelService,
            IStreamService streamService,
            ISfuSyncService sfuSyncService,
            ILogger<StreamHub> logger)
        {
            _viewerTrackerService = viewerTrackerService;
            _channelService = channelService;
            _streamService = streamService;
            _sfuSyncService = sfuSyncService;
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
                    await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");
                    _logger.LogDebug("Client connected: {ConnectionId} to channel {ChannelId}", 
                        Context.ConnectionId, channelId);
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
                await _viewerTrackerService.RemoveViewer(Context.ConnectionId);
                
                var streamerEntry = _streamSessions.FirstOrDefault(x => x.Value.ConnectionId == Context.ConnectionId);
                if (streamerEntry.Key != 0)
                {
                    _streamSessions.Remove(streamerEntry.Key);
                    _logger.LogInformation("Streamer disconnected from channel {ChannelId}", streamerEntry.Key);
                }
                
                _logger.LogDebug("Client disconnected: {ConnectionId}", Context.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OnDisconnectedAsync");
            }
            
            await base.OnDisconnectedAsync(exception);
        }

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

                var channel = await _channelService.GetById(channelId);
                if (channel == null || channel.UserId != userId.Value)
                {
                    await Clients.Caller.SendAsync("Error", "Channel not found or access denied");
                    return;
                }

                var sfuActive = await _sfuSyncService.IsStreamActiveInSfu(channelId);
                var (isActive, existingSessionId) = await _channelService.GetActiveSession(channelId);
                
                if (sfuActive && channel.CurrentSessionId != sessionId)
                {
                    if (!string.IsNullOrEmpty(channel.CurrentSessionId))
                    {
                        await _sfuSyncService.NotifySfuStreamStopped(channelId, channel.CurrentSessionId);
                    }
                }
                
                if (isActive && existingSessionId == sessionId)
                {
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
                    
                    _logger.LogInformation("Streamer session resumed: channel={ChannelId}, session={SessionId}", 
                        channelId, sessionId);
                }
                else
                {
                    var newSessionId = Guid.NewGuid().ToString();
                    await _channelService.StartStreamSession(channelId, newSessionId);
                    
                    _streamSessions[channelId] = new StreamSession
                    {
                        ConnectionId = Context.ConnectionId,
                        SessionId = newSessionId,
                        LastPing = DateTime.UtcNow,
                        IsActive = true
                    };
                    
                    await _viewerTrackerService.ClearChannelViewers(channelId);
                    await _sfuSyncService.NotifySfuStreamStarted(channelId, newSessionId);
                    
                    await Clients.Caller.SendAsync("NewSessionStarted", new
                    {
                        SessionId = newSessionId,
                        ChannelId = channelId,
                        Message = "New stream session started",
                        SfuNotified = true
                    });
                    
                    await Clients.Group($"channel_{channelId}").SendAsync("StreamStarted", new
                    {
                        ChannelId = channelId,
                        SessionId = newSessionId,
                        StartedAt = DateTime.UtcNow,
                        Source = "StreamHub"
                    });
                    
                    _logger.LogInformation("New stream session started: channel={ChannelId}, session={SessionId}", 
                        channelId, newSessionId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in JoinAsStreamer for channel {ChannelId}", channelId);
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
                        await _sfuSyncService.SyncViewerCounts(channelId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in StreamerPing for channel {ChannelId}", channelId);
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

                var sessionId = channel.CurrentSessionId;
                await _channelService.StopStreamSession(channelId);
                
                if (!string.IsNullOrEmpty(sessionId))
                {
                    await _sfuSyncService.NotifySfuStreamStopped(channelId, sessionId);
                }
                
                await _viewerTrackerService.ClearChannelViewers(channelId);
                _streamSessions.Remove(channelId);
                
                await Clients.Group($"channel_{channelId}").SendAsync("StreamStopped", new
                {
                    ChannelId = channelId,
                    SessionId = sessionId,
                    StoppedAt = DateTime.UtcNow,
                    Message = "Stream ended"
                });
                
                _logger.LogInformation("Stream ended: channel={ChannelId}", channelId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in EndStream for channel {ChannelId}", channelId);
            }
        }

        public async Task JoinAsViewer(int channelId)
        {
            try
            {
                var userId = GetUserIdFromContext();
                var isLive = await _channelService.IsChannelLive(channelId);
                
                if (!isLive)
                {
                    await Clients.Caller.SendAsync("StreamNotActive");
                    return;
                }
                
                await Groups.AddToGroupAsync(Context.ConnectionId, $"channel_{channelId}");
                var success = await _viewerTrackerService.AddViewer(channelId, Context.ConnectionId, userId);
                
                if (success)
                {
                    var count = _viewerTrackerService.GetViewerCount(channelId);
                    await Clients.Caller.SendAsync("ViewerJoined", new
                    {
                        ChannelId = channelId,
                        Count = count,
                        YourConnectionId = Context.ConnectionId,
                        SfuWsUrl = "ws://localhost:3000",
                        Instructions = "Connect to SFU WebSocket to receive video stream"
                    });
                    
                    _logger.LogDebug("Viewer joined: channel={ChannelId}, connection={ConnectionId}", 
                        channelId, Context.ConnectionId);
                }
                else
                {
                    await Clients.Caller.SendAsync("Error", "Failed to join as viewer");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in JoinAsViewer for channel {ChannelId}", channelId);
                await Clients.Caller.SendAsync("Error", "Internal server error");
            }
        }

        public async Task LeaveAsViewer(int channelId)
        {
            try
            {
                await _viewerTrackerService.RemoveViewer(Context.ConnectionId);
                await Clients.Caller.SendAsync("ViewerLeft", new
                {
                    ChannelId = channelId,
                    Message = "You left the stream"
                });
                
                _logger.LogDebug("Viewer left: channel={ChannelId}, connection={ConnectionId}", 
                    channelId, Context.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in LeaveAsViewer for channel {ChannelId}", channelId);
            }
        }

        public async Task RequestViewerCount(int channelId)
        {
            try
            {
                var count = _viewerTrackerService.GetViewerCount(channelId);
                var uniqueCount = _viewerTrackerService.GetUniqueUserCount(channelId);
                var sfuCount = await _sfuSyncService.GetViewersFromSfu(channelId);
                
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
                _logger.LogError(ex, "Error in RequestViewerCount for channel {ChannelId}", channelId);
            }
        }

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
                
                await Clients.Caller.SendAsync("SfuInfo", new
                {
                    ChannelId = channelId,
                    IsLive = true,
                    SessionId = sessionId,
                    WsUrl = "ws://localhost:3000",
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
                _logger.LogError(ex, "Error in GetSfuConnectionInfo for channel {ChannelId}", channelId);
            }
        }
public async Task StopStreamManually(int channelId)
{
    try
    {
        var userId = GetUserIdFromContext();
        if (!userId.HasValue)
        {
            await Clients.Caller.SendAsync("Error", "Authentication required");
            return;
        }

        var channel = await _channelService.GetById(channelId);
        if (channel == null || channel.UserId != userId.Value)
        {
            await Clients.Caller.SendAsync("Error", "Channel not found or access denied");
            return;
        }

        var sessionId = channel.CurrentSessionId;
        
        if (!string.IsNullOrEmpty(sessionId))
        {
            await _sfuSyncService.NotifySfuStreamStopped(channelId, sessionId);
        }


        await _channelService.StopStreamSession(channelId, sessionId);


        await _viewerTrackerService.ClearChannelViewers(channelId);


        await Clients.Group($"channel_{channelId}").SendAsync("StreamStopped", new
        {
            ChannelId = channelId,
            SessionId = sessionId,
            StoppedAt = DateTime.UtcNow,
            Message = "Stream stopped manually by streamer",
            StoppedBy = "streamer"
        });

        _logger.LogInformation("Stream stopped manually: channel={ChannelId}, user={UserId}", 
            channelId, userId);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error in StopStreamManually for channel {ChannelId}", channelId);
        await Clients.Caller.SendAsync("Error", "Internal server error");
    }
}
        public async Task GetStreamStatus(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var viewerCount = _viewerTrackerService.GetViewerCount(channelId);
                var sfuActive = await _sfuSyncService.IsStreamActiveInSfu(channelId);
                var sfuViewers = await _sfuSyncService.GetViewersFromSfu(channelId);
                
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
                _logger.LogError(ex, "Error in GetStreamStatus for channel {ChannelId}", channelId);
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