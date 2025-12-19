using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;

namespace TwitchClone.Api.Services.Implementations
{
    public class ChannelService : IChannelService
    {
        private readonly AppDbContext _db;
        private readonly ILogger<ChannelService> _logger;
        private const int STREAM_TIMEOUT_SECONDS = 45;

        public ChannelService(AppDbContext db, ILogger<ChannelService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<Channel?> GetByUserId(int userId)
        {
            return await _db.Channels
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.UserId == userId);
        }

        public async Task<Channel?> GetById(int channelId)
        {
            return await _db.Channels
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == channelId);
        }

        public async Task<bool> StartStreamSession(int channelId, string sessionId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found when starting stream", channelId);
                    return false;
                }

                // Check if there's already an active session
                if (!string.IsNullOrEmpty(channel.CurrentSessionId) && channel.IsLive)
                {
                    _logger.LogWarning("Channel {ChannelId} already has active session {CurrentSessionId}", 
                        channelId, channel.CurrentSessionId);
                    
                    // Force stop previous session
                    await StopStreamSession(channelId, channel.CurrentSessionId);
                }

                channel.IsLive = true;
                channel.CurrentSessionId = sessionId;
                channel.SessionStartedAt = DateTime.UtcNow;
                channel.LastPingAt = DateTime.UtcNow;
                channel.Viewers = 0;
                channel.LastStreamEndedAt = null;

                await _db.SaveChangesAsync();
                
                _logger.LogInformation("Stream session started: Channel={ChannelId}, Session={SessionId}", 
                    channelId, sessionId);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error starting stream session for channel {ChannelId}", channelId);
                return false;
            }
        }

        public async Task<bool> UpdateStreamPing(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found for ping update", channelId);
                    return false;
                }

                if (!channel.IsLive || string.IsNullOrEmpty(channel.CurrentSessionId))
                {
                    _logger.LogWarning("Channel {ChannelId} is not live for ping update", channelId);
                    return false;
                }

                channel.LastPingAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                
                _logger.LogDebug("Stream ping updated: Channel={ChannelId}, Time={Time}", 
                    channelId, DateTime.UtcNow);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating stream ping for channel {ChannelId}", channelId);
                return false;
            }
        }

        public async Task<bool> StopStreamSession(int channelId, string? sessionId = null)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found when stopping stream", channelId);
                    return false;
                }

                // Если передана конкретная sessionId, проверяем её
                if (sessionId != null && channel.CurrentSessionId != sessionId)
                {
                    _logger.LogWarning("Session mismatch: Channel={ChannelId}, Expected={Expected}, Actual={Actual}", 
                        channelId, sessionId, channel.CurrentSessionId);
                    return false;
                }

                // Если канал не в прямом эфире, просто очищаем данные
                if (!channel.IsLive)
                {
                    _logger.LogDebug("Channel {ChannelId} is not live, but clearing session data", channelId);
                    channel.CurrentSessionId = null;
                    channel.SessionStartedAt = null;
                    channel.LastPingAt = null;
                    channel.LastStreamEndedAt = DateTime.UtcNow;
                    channel.Viewers = 0;
                    await _db.SaveChangesAsync();
                    return true;
                }

                // ВАЖНО: Сохраняем время начала сессии для расчета длительности
                var sessionStartTime = channel.SessionStartedAt;
                
                channel.IsLive = false;
                channel.CurrentSessionId = null;
                channel.SessionStartedAt = null;
                channel.LastPingAt = null;
                channel.LastStreamEndedAt = DateTime.UtcNow;
                channel.Viewers = 0; // Сбрасываем зрителей при остановке стрима
                
                // Рассчитываем длительность стрима и обновляем общее время
                if (sessionStartTime.HasValue)
                {
                    var duration = (int)(DateTime.UtcNow - sessionStartTime.Value).TotalSeconds;
                    channel.TotalStreamTime += duration;
                    
                    _logger.LogInformation("Stream session ended: Channel={ChannelId}, Duration={Duration}s, TotalTime={TotalTime}s", 
                        channelId, duration, channel.TotalStreamTime);
                }
                else
                {
                    _logger.LogWarning("Session start time was null for channel {ChannelId}", channelId);
                }

                await _db.SaveChangesAsync();
                
                _logger.LogInformation("Stream session stopped: Channel={ChannelId}, Session={SessionId}", 
                    channelId, sessionId ?? "any");
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping stream session for channel {ChannelId}", channelId);
                return false;
            }
        }

        public async Task<(bool IsActive, string? SessionId)> GetActiveSession(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogDebug("Channel {ChannelId} not found when checking active session", channelId);
                    return (false, null);
                }

                var hasActiveSession = channel.IsLive && 
                                      !string.IsNullOrEmpty(channel.CurrentSessionId) &&
                                      channel.LastPingAt.HasValue &&
                                      channel.LastPingAt.Value > DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);

                // Если сессия просрочена, автоматически завершаем её
                if (channel.IsLive && !hasActiveSession && !string.IsNullOrEmpty(channel.CurrentSessionId))
                {
                    _logger.LogWarning("Auto-stopping expired session: Channel={ChannelId}, LastPing={LastPing}", 
                        channelId, channel.LastPingAt);
                    
                    await StopStreamSession(channelId, channel.CurrentSessionId);
                    return (false, null);
                }

                return (hasActiveSession, hasActiveSession ? channel.CurrentSessionId : null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting active session for channel {ChannelId}", channelId);
                return (false, null);
            }
        }

        public async Task<bool> IsChannelLive(int channelId)
        {
            try
            {
                var (isActive, _) = await GetActiveSession(channelId);
                return isActive;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking if channel {ChannelId} is live", channelId);
                return false;
            }
        }

        public async Task<Channel> CreateChannelForUser(int userId, string username)
        {
            var channel = new Channel
            {
                UserId = userId,
                Name = username,
                Description = "Описание канала пока пустое",
                IsLive = false,
                Viewers = 0,
                CreatedAt = DateTime.UtcNow
            };

            _db.Channels.Add(channel);
            await _db.SaveChangesAsync();
            
            _logger.LogInformation("Channel created: User={UserId}, Channel={ChannelId}, Name={Name}", 
                userId, channel.Id, username);
            
            return channel;
        }

        public async Task UpdateChannel(int channelId, string? name, string? description, string? previewUrl)
        {
            try
            {
                var channel = await GetById(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found for update", channelId);
                    return;
                }

                if (!string.IsNullOrWhiteSpace(name))
                    channel.Name = name;

                if (description != null)
                    channel.Description = description;

                if (previewUrl != null)
                    channel.PreviewUrl = previewUrl;

                await _db.SaveChangesAsync();
                
                _logger.LogDebug("Channel updated: Channel={ChannelId}, Name={Name}", channelId, name);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating channel {ChannelId}", channelId);
                throw;
            }
        }

        public async Task<DateTime?> GetSessionStartTime(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                return channel?.SessionStartedAt;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting session start time for channel {ChannelId}", channelId);
                return null;
            }
        }

        public async Task<DateTime?> GetLastPing(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                return channel?.LastPingAt;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting last ping for channel {ChannelId}", channelId);
                return null;
            }
        }

        public async Task<int> GetViewerCount(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                return channel?.Viewers ?? 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting viewer count for channel {ChannelId}", channelId);
                return 0;
            }
        }

        public async Task ResetViewers(int channelId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found when resetting viewers", channelId);
                    return;
                }

                channel.Viewers = 0;
                await _db.SaveChangesAsync();
                
                _logger.LogDebug("Viewers reset for channel {ChannelId}", channelId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting viewers for channel {ChannelId}", channelId);
            }
        }

        public async Task<Channel?> ForceStopStreamBySession(int channelId, string sessionId)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found for force stop", channelId);
                    return null;
                }

                // Если sessionId не совпадает, возвращаем null
                if (channel.CurrentSessionId != sessionId)
                {
                    _logger.LogWarning("Session mismatch for force stop: Channel={ChannelId}, Expected={Expected}, Actual={Actual}", 
                        channelId, sessionId, channel.CurrentSessionId);
                    return null;
                }

                await StopStreamSession(channelId, sessionId);
                return channel;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error force-stopping stream for channel {ChannelId}", channelId);
                return null;
            }
        }

        public async Task UpdateChannelViewers(int channelId, int viewersCount)
        {
            try
            {
                var channel = await _db.Channels.FindAsync(channelId);
                if (channel == null) 
                {
                    _logger.LogWarning("Channel {ChannelId} not found for viewer update", channelId);
                    return;
                }

                channel.Viewers = viewersCount;
                
                // Update peak viewers
                if (viewersCount > channel.PeakViewers)
                {
                    channel.PeakViewers = viewersCount;
                    _logger.LogDebug("New peak viewers for channel {ChannelId}: {PeakViewers}", 
                        channelId, viewersCount);
                }
                
                await _db.SaveChangesAsync();
                
                _logger.LogDebug("Viewers updated for channel {ChannelId}: {Viewers}", 
                    channelId, viewersCount);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating viewers for channel {ChannelId}", channelId);
            }
        }

        // NEW: Method to get all channels with expired streams
        public async Task<List<int>> GetChannelsWithExpiredStreams()
        {
            try
            {
                var expiredCutoff = DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);
                
                var expiredChannels = await _db.Channels
                    .Where(c => c.IsLive && 
                               c.LastPingAt.HasValue && 
                               c.LastPingAt.Value < expiredCutoff)
                    .Select(c => c.Id)
                    .ToListAsync();

                _logger.LogDebug("Found {Count} channels with expired streams", expiredChannels.Count);
                return expiredChannels;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting channels with expired streams");
                return new List<int>();
            }
        }

        // NEW: Method to clean up all expired streams
        public async Task<int> CleanupExpiredStreams()
        {
            try
            {
                var expiredChannels = await GetChannelsWithExpiredStreams();
                int cleanedCount = 0;

                foreach (var channelId in expiredChannels)
                {
                    var success = await StopStreamSession(channelId);
                    if (success) cleanedCount++;
                }

                if (cleanedCount > 0)
                {
                    _logger.LogInformation("Cleaned up {Count} expired streams", cleanedCount);
                }

                return cleanedCount;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning up expired streams");
                return 0;
            }
        }
    }
}