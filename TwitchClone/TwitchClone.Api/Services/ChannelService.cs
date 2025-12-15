// Services/ChannelService.cs
using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;

namespace TwitchClone.Api.Services
{
    public class ChannelService
    {
        private readonly AppDbContext _db;
        private const int STREAM_TIMEOUT_SECONDS = 45;

        public ChannelService(AppDbContext db)
        {
            _db = db;
        }

        // ===============================
        // GET
        // ===============================
        public async Task<Channel?> GetByUserId(int userId) =>
            await _db.Channels
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.UserId == userId);

        public async Task<Channel?> GetById(int channelId) =>
            await _db.Channels
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == channelId);

        // ===============================
        // STREAM SESSION
        // ===============================
        public async Task<bool> StartStreamSession(int channelId, string sessionId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return false;

            channel.IsLive = true;
            channel.CurrentSessionId = sessionId;
            channel.SessionStartedAt = DateTime.UtcNow;
            channel.LastPingAt = DateTime.UtcNow;
            channel.Viewers = 0;

            await _db.SaveChangesAsync();
            return true;
        }

        public async Task<bool> UpdateStreamPing(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return false;

            // Если сессия уже протухла — не пингуем
            if (channel.LastPingAt != null &&
                channel.LastPingAt < DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS))
            {
                return false;
            }

            channel.LastPingAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return true;
        }

        public async Task<bool> StopStreamSession(int channelId, string? sessionId = null)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return false;

            if (sessionId != null && channel.CurrentSessionId != sessionId)
                return false;

            channel.IsLive = false;
            channel.CurrentSessionId = null;
            channel.SessionStartedAt = null;
            channel.LastPingAt = null;
            channel.Viewers = 0;

            await _db.SaveChangesAsync();
            return true;
        }

        public async Task<(bool IsActive, string? SessionId)> GetActiveSession(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null)
                return (false, null);

            var isActive =
                channel.IsLive &&
                channel.CurrentSessionId != null &&
                channel.LastPingAt != null &&
                channel.LastPingAt > DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);

            return (isActive, isActive ? channel.CurrentSessionId : null);
        }

        // ===============================
        // CHANNEL CRUD
        // ===============================
        public async Task<Channel> CreateChannelForUser(int userId, string username)
        {
            var channel = new Channel
            {
                UserId = userId,
                Name = username,
                Description = "Описание канала пока пустое",
                IsLive = false,
                Viewers = 0
            };

            _db.Channels.Add(channel);
            await _db.SaveChangesAsync();
            await _db.Entry(channel).Reference(c => c.User).LoadAsync();
            return channel;
        }

        public async Task<Channel?> UpdateChannelByChannelId(
            int channelId,
            string? name,
            string? description,
            string? previewUrl)
        {
            var channel = await GetById(channelId);
            if (channel == null) return null;

            if (!string.IsNullOrWhiteSpace(name))
                channel.Name = name;

            channel.Description = description;
            channel.PreviewUrl = previewUrl;

            await _db.SaveChangesAsync();
            return channel;
        }

        public async Task<Channel?> UpdateChannelByUserId(
            int userId,
            string? name,
            string? description,
            string? previewUrl)
        {
            var channel = await GetByUserId(userId);
            if (channel == null) return null;

            if (!string.IsNullOrWhiteSpace(name))
                channel.Name = name;

            channel.Description = description;
            channel.PreviewUrl = previewUrl;

            await _db.SaveChangesAsync();
            return channel;
        }

        // ===============================
        // VIEWERS - ОБНОВЛЕННЫЕ МЕТОДЫ
        // ===============================
        public async Task<int> UpdateChannelViewers(int channelId, int viewersCount)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return 0;

            channel.Viewers = viewersCount;
            await _db.SaveChangesAsync();

            return viewersCount;
        }

        public async Task<int> GetViewersCount(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            return channel?.Viewers ?? 0;
        }

        public async Task ResetViewers(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return;

            channel.Viewers = 0;
            await _db.SaveChangesAsync();
        }

        public async Task<bool> IsChannelLive(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return false;

            return channel.IsLive &&
                   channel.LastPingAt != null &&
                   channel.LastPingAt > DateTime.UtcNow.AddSeconds(-STREAM_TIMEOUT_SECONDS);
        }

        // Метод для синхронизации с трекером
        public async Task<int> SyncViewerCount(int channelId, int liveCount)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) return 0;

            if (channel.Viewers != liveCount)
            {
                channel.Viewers = liveCount;
                await _db.SaveChangesAsync();
            }

            return liveCount;
        }
        public async Task<Channel?> ForceStopStreamBySession(
    int channelId,
    string sessionId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null)
                return null;

            if (channel.CurrentSessionId != sessionId)
                return null;

            channel.CurrentSessionId = null;
            channel.LastPingAt = null;
            channel.Viewers = 0;

            await _db.SaveChangesAsync();
            return channel;
        }


    }
}