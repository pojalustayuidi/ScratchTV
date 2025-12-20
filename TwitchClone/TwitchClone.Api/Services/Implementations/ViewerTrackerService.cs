using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using TwitchClone.Api.DTOs.Viewer;
using TwitchClone.Api.Hubs;

namespace TwitchClone.Api.Services.Implementations
{
    public class ViewerTrackerService : IViewerTrackerService
    {
        private static readonly ConcurrentDictionary<int, HashSet<string>> _channelConnections = new();
        private static readonly ConcurrentDictionary<string, ViewerInfo> _connectionInfo = new();
        private static readonly ConcurrentDictionary<int, HashSet<int>> _channelUniqueUsers = new();
        
        private readonly IHubContext<StreamHub> _hubContext;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<ViewerTrackerService> _logger;

        public ViewerTrackerService(
            IHubContext<StreamHub> hubContext,
            IServiceScopeFactory scopeFactory,
            ILogger<ViewerTrackerService> logger)
        {
            _hubContext = hubContext;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        public async Task<bool> AddViewer(int channelId, string connectionId, int? userId = null)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var channelService = scope.ServiceProvider.GetRequiredService<IChannelService>();
                
                var isLive = await channelService.IsChannelLive(channelId);
                if (!isLive)
                {
                    _logger.LogWarning("Attempt to add viewer to inactive channel {ChannelId}", channelId);
                    return false;
                }

    
                if (_connectionInfo.TryRemove(connectionId, out var oldInfo))
                {
                    if (_channelConnections.TryGetValue(oldInfo.ChannelId, out var oldViewers))
                    {
                        oldViewers.Remove(connectionId);
                        
                        if (oldInfo.UserId.HasValue && 
                            _channelUniqueUsers.TryGetValue(oldInfo.ChannelId, out var oldUsers))
                        {
                            bool userStillWatching = oldViewers
                                .Any(cid => _connectionInfo.TryGetValue(cid, out var info) && 
                                          info.UserId == oldInfo.UserId);
                            
                            if (!userStillWatching)
                            {
                                oldUsers.Remove(oldInfo.UserId.Value);
                            }
                        }
                    }
                }

                _channelConnections.AddOrUpdate(channelId,
                    new HashSet<string> { connectionId },
                    (key, existingSet) =>
                    {
                        existingSet.Add(connectionId);
                        return existingSet;
                    });

                _connectionInfo[connectionId] = new ViewerInfo
                {
                    ChannelId = channelId,
                    UserId = userId,
                    ConnectionId = connectionId,
                    JoinedAt = DateTime.UtcNow,
                    LastActivity = DateTime.UtcNow
                };

                if (userId.HasValue)
                {
                    _channelUniqueUsers.AddOrUpdate(channelId,
                        new HashSet<int> { userId.Value },
                        (key, existingSet) =>
                        {
                            existingSet.Add(userId.Value);
                            return existingSet;
                        });
                }

                _logger.LogInformation("Viewer added: channel={ChannelId}, connection={ConnectionId}, userId={UserId}", 
                    channelId, connectionId, userId);

                await UpdateViewerCountAndBroadcast(channelId);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding viewer to channel {ChannelId}", channelId);
                return false;
            }
        }

        public async Task<bool> RemoveViewer(string connectionId)
        {
            try
            {
                if (_connectionInfo.TryRemove(connectionId, out var info))
                {
                    var channelId = info.ChannelId;
                    
                    if (_channelConnections.TryGetValue(channelId, out var viewers))
                    {
                        viewers.Remove(connectionId);
                        
                        if (info.UserId.HasValue && 
                            _channelUniqueUsers.TryGetValue(channelId, out var uniqueUsers))
                        {
                            bool userStillWatching = viewers
                                .Any(cid => _connectionInfo.TryGetValue(cid, out var viewerInfo) && 
                                          viewerInfo.UserId == info.UserId);
                            
                            if (!userStillWatching)
                            {
                                uniqueUsers.Remove(info.UserId.Value);
                            }
                        }
                        
                        if (viewers.Count == 0)
                        {
                            _channelConnections.TryRemove(channelId, out _);
                            _channelUniqueUsers.TryRemove(channelId, out _);
                        }
                        
                        _logger.LogInformation("Viewer removed: channel={ChannelId}, connection={ConnectionId}", 
                            channelId, connectionId);
                        
                        await UpdateViewerCountAndBroadcast(channelId);
                        return true;
                    }
                }
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing viewer {ConnectionId}", connectionId);
                return false;
            }
        }

        public int GetViewerCount(int channelId)
        {
            return _channelConnections.TryGetValue(channelId, out var viewers) 
                ? viewers.Count 
                : 0;
        }

        public int GetUniqueUserCount(int channelId)
        {
            return _channelUniqueUsers.TryGetValue(channelId, out var users) 
                ? users.Count 
                : 0;
        }

        public async Task<int> UpdateViewerCountInDatabase(int channelId)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var channelService = scope.ServiceProvider.GetRequiredService<IChannelService>();
                
                var count = GetViewerCount(channelId);
                
                var channel = await channelService.GetById(channelId);
                if (channel != null)
                {
                    var currentCount = await channelService.GetViewerCount(channelId);
                    if (currentCount != count)
                    {
                      
                    }
                }
                
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating viewer count in DB for channel {ChannelId}", channelId);
                return 0;
            }
        }

        public async Task<int> UpdateViewerCountAndBroadcast(int channelId)
        {
            try
            {
                var count = GetViewerCount(channelId);
                var uniqueCount = GetUniqueUserCount(channelId);
                
                await UpdateViewerCountInDatabase(channelId);
                
                await _hubContext.Clients.Group($"channel_{channelId}")
                    .SendAsync("ViewersUpdated", new
                    {
                        ChannelId = channelId,
                        Count = count,
                        UniqueCount = uniqueCount,
                        Timestamp = DateTime.UtcNow
                    });
                
                _logger.LogDebug("Viewer count broadcast for channel {ChannelId}: {Count} viewers ({UniqueCount} unique)", 
                    channelId, count, uniqueCount);
                
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error broadcasting viewer count for channel {ChannelId}", channelId);
                return 0;
            }
        }

        public async Task ClearChannelViewers(int channelId)
        {
            try
            {
                if (_channelConnections.TryRemove(channelId, out var viewers))
                {
                    foreach (var connectionId in viewers)
                    {
                        _connectionInfo.TryRemove(connectionId, out _);
                    }
                    
                    _channelUniqueUsers.TryRemove(channelId, out _);
                    
                    await UpdateViewerCountInDatabase(channelId);
                    
                    await _hubContext.Clients.Group($"channel_{channelId}")
                        .SendAsync("ViewersUpdated", new
                        {
                            ChannelId = channelId,
                            Count = 0,
                            UniqueCount = 0,
                            Timestamp = DateTime.UtcNow
                        });
                    
                    _logger.LogInformation("All viewers cleared for channel {ChannelId}", channelId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error clearing viewers for channel {ChannelId}", channelId);
            }
        }

        public ViewerStatsResponse  GetChannelStats(int channelId)
        {
            return new ViewerStatsResponse 
            {
                ChannelId = channelId,
                TotalViewers = GetViewerCount(channelId),
                UniqueUsers = GetUniqueUserCount(channelId),
                ConnectionIds = _channelConnections.TryGetValue(channelId, out var viewers) 
                    ? viewers.ToList() 
                    : new List<string>(),
                UpdatedAt = DateTime.UtcNow,
                ViewersByMinute = new Dictionary<string, int>(),
                PeakViewers = GetViewerCount(channelId), 
                AverageWatchTime = TimeSpan.Zero 
            };
        }

        public List<string> GetViewerConnectionIds(int channelId)
        {
            return _channelConnections.TryGetValue(channelId, out var viewers) 
                ? viewers.ToList() 
                : new List<string>();
        }

        public async Task<int> GetViewerCountFromDatabase(int channelId)
        {
            using var scope = _scopeFactory.CreateScope();
            var channelService = scope.ServiceProvider.GetRequiredService<IChannelService>();
            return await channelService.GetViewerCount(channelId);
        }

        public bool IsUserWatchingChannel(int userId, int channelId)
        {
            return _channelUniqueUsers.TryGetValue(channelId, out var users) && users.Contains(userId);
        }

        public void CleanupOldConnections(TimeSpan maxAge)
        {
            try
            {
                var cutoff = DateTime.UtcNow.Subtract(maxAge);
                var oldConnections = _connectionInfo
                    .Where(kvp => kvp.Value.LastActivity < cutoff)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var connectionId in oldConnections)
                {
                    _connectionInfo.TryRemove(connectionId, out _);
                }
                
                if (oldConnections.Count > 0)
                {
                    _logger.LogInformation("Cleaned up {Count} old connections", oldConnections.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning up old connections");
            }
        }

        private class ViewerInfo
        {
            public int ChannelId { get; set; }
            public int? UserId { get; set; }
            public string ConnectionId { get; set; } = string.Empty;
            public DateTime JoinedAt { get; set; }
            public DateTime LastActivity { get; set; }
        }
    }
}