using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using TwitchClone.Api.DTOs;
using TwitchClone.Api.Hubs;

namespace TwitchClone.Api.Services
{
    public interface IViewerTrackerService
    {
        Task<bool> AddViewer(int channelId, string connectionId, int? userId = null);
        Task<bool> RemoveViewer(string connectionId);
        int GetViewerCount(int channelId);
        int GetUniqueUserCount(int channelId);
        Task<int> UpdateViewerCountInDatabase(int channelId);
        Task<int> UpdateViewerCountAndBroadcast(int channelId);
        List<string> GetViewerConnectionIds(int channelId);
        Task ClearChannelViewers(int channelId);
        Task<int> GetViewerCountFromDatabase(int channelId);
        bool IsUserWatchingChannel(int userId, int channelId);
        ViewerStatsDto GetChannelStats(int channelId);
    }

    public class ViewerTrackerService : IViewerTrackerService
    {
        // Основные структуры для хранения
        // channelId -> Set(connectionIds)
        private static readonly ConcurrentDictionary<int, HashSet<string>> _channelConnections = new();
        
        // connectionId -> (channelId, userId, joinedAt)
        private static readonly ConcurrentDictionary<string, ViewerInfo> _connectionInfo = new();
        
        // channelId -> Set(userIds) - для уникальных пользователей
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
                var channelService = scope.ServiceProvider.GetRequiredService<ChannelService>();
                
                // Проверяем, активен ли канал
                var isLive = await channelService.IsChannelLive(channelId);
                if (!isLive)
                {
                    _logger.LogWarning($"Attempt to add viewer to inactive channel {channelId}");
                    return false;
                }

                // Удаляем старую запись, если connectionId уже существует
                if (_connectionInfo.TryRemove(connectionId, out var oldInfo))
                {
                    // Удаляем из старого канала
                    if (_channelConnections.TryGetValue(oldInfo.ChannelId, out var oldViewers))
                    {
                        oldViewers.Remove(connectionId);
                        
                        // Удаляем пользователя из уникальных, если он больше нигде не смотрит этот канал
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

                // Добавляем в новый канал
                _channelConnections.AddOrUpdate(channelId,
                    new HashSet<string> { connectionId },
                    (key, existingSet) =>
                    {
                        existingSet.Add(connectionId);
                        return existingSet;
                    });

                // Сохраняем информацию о подключении
                _connectionInfo[connectionId] = new ViewerInfo
                {
                    ChannelId = channelId,
                    UserId = userId,
                    ConnectionId = connectionId,
                    JoinedAt = DateTime.UtcNow,
                    LastActivity = DateTime.UtcNow
                };

                // Добавляем в уникальных пользователей
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

                _logger.LogInformation($"Viewer added: channel={channelId}, connection={connectionId}, userId={userId}");

                // Обновляем счетчик и уведомляем всех
                await UpdateViewerCountAndBroadcast(channelId);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error adding viewer to channel {channelId}");
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
                        
                        // Удаляем пользователя из уникальных, если он больше нигде не смотрит этот канал
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
                        
                        // Если зрителей не осталось, очищаем структуры
                        if (viewers.Count == 0)
                        {
                            _channelConnections.TryRemove(channelId, out _);
                            _channelUniqueUsers.TryRemove(channelId, out _);
                        }
                        
                        _logger.LogInformation($"Viewer removed: channel={channelId}, connection={connectionId}");
                        
                        // Обновляем счетчик
                        await UpdateViewerCountAndBroadcast(channelId);
                        
                        return true;
                    }
                }
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error removing viewer {connectionId}");
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
                var channelService = scope.ServiceProvider.GetRequiredService<ChannelService>();
                
                var count = GetViewerCount(channelId);
                
                // Обновляем в БД
                var channel = await channelService.GetById(channelId);
                if (channel != null && channel.Viewers != count)
                {
                    channel.Viewers = count;
                    await channelService.UpdateChannelViewers(channelId, count);
                }
                
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error updating viewer count in DB for channel {channelId}");
                return 0;
            }
        }

        public async Task<int> UpdateViewerCountAndBroadcast(int channelId)
        {
            try
            {
                var count = GetViewerCount(channelId);
                var uniqueCount = GetUniqueUserCount(channelId);
                
                // Обновляем в БД
                await UpdateViewerCountInDatabase(channelId);
                
                // Уведомляем всех через SignalR
                await _hubContext.Clients.Group($"channel_{channelId}")
                    .SendAsync("ViewersUpdated", new
                    {
                        ChannelId = channelId,
                        Count = count,
                        UniqueCount = uniqueCount,
                        Timestamp = DateTime.UtcNow
                    });
                
                _logger.LogDebug($"Viewer count broadcast for channel {channelId}: {count} viewers ({uniqueCount} unique)");
                
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error broadcasting viewer count for channel {channelId}");
                return 0;
            }
        }

        public List<string> GetViewerConnectionIds(int channelId)
        {
            return _channelConnections.TryGetValue(channelId, out var viewers) 
                ? viewers.ToList() 
                : new List<string>();
        }

        public async Task ClearChannelViewers(int channelId)
        {
            try
            {
                if (_channelConnections.TryRemove(channelId, out var viewers))
                {
                    // Удаляем все connectionInfo
                    foreach (var connectionId in viewers)
                    {
                        _connectionInfo.TryRemove(connectionId, out _);
                    }
                    
                    // Удаляем уникальных пользователей
                    _channelUniqueUsers.TryRemove(channelId, out _);
                    
                    // Обновляем в БД
                    await UpdateViewerCountInDatabase(channelId);
                    
                    // Уведомляем об очистке
                    await _hubContext.Clients.Group($"channel_{channelId}")
                        .SendAsync("ViewersUpdated", new
                        {
                            ChannelId = channelId,
                            Count = 0,
                            UniqueCount = 0,
                            Timestamp = DateTime.UtcNow
                        });
                    
                    _logger.LogInformation($"All viewers cleared for channel {channelId}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error clearing viewers for channel {channelId}");
            }
        }

        public async Task<int> GetViewerCountFromDatabase(int channelId)
        {
            using var scope = _scopeFactory.CreateScope();
            var channelService = scope.ServiceProvider.GetRequiredService<ChannelService>();
            
            var channel = await channelService.GetById(channelId);
            return channel?.Viewers ?? 0;
        }

        public bool IsUserWatchingChannel(int userId, int channelId)
        {
            if (!_channelUniqueUsers.TryGetValue(channelId, out var users))
                return false;
            
            return users.Contains(userId);
        }

        public ViewerStatsDto GetChannelStats(int channelId)
        {
            return new ViewerStatsDto
            {
                ChannelId = channelId,
                TotalViewers = GetViewerCount(channelId),
                UniqueUsers = GetUniqueUserCount(channelId),
                ConnectionIds = GetViewerConnectionIds(channelId),
                UpdatedAt = DateTime.UtcNow
            };
        }

        // Вспомогательный метод для очистки устаревших подключений
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
                    _logger.LogInformation($"Cleaned up {oldConnections.Count} old connections");
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