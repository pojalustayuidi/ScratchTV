using TwitchClone.Api.Models;

namespace TwitchClone.Api.Services
{
    public interface IChannelService
    {

        Task<Channel?> GetByUserId(int userId);
        Task<Channel?> GetById(int channelId);
        Task<Channel> CreateChannelForUser(int userId, string username);
        Task UpdateChannel(int channelId, string? name, string? description, string? previewUrl);
        
   
        Task<bool> StartStreamSession(int channelId, string sessionId);
        Task<bool> UpdateStreamPing(int channelId);
        Task<bool> StopStreamSession(int channelId, string? sessionId = null);
        Task<(bool IsActive, string? SessionId)> GetActiveSession(int channelId);
        Task<bool> IsChannelLive(int channelId);
        

        Task<DateTime?> GetSessionStartTime(int channelId);
        Task<DateTime?> GetLastPing(int channelId);
        Task<int> GetViewerCount(int channelId);
        Task ResetViewers(int channelId);
        Task<Channel?> ForceStopStreamBySession(int channelId, string sessionId);
        Task UpdateChannelViewers(int channelId, int viewersCount);
        

        Task<List<int>> GetChannelsWithExpiredStreams();
        Task<int> CleanupExpiredStreams();
    }
}