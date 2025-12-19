using TwitchClone.Api.DTOs.Viewer;

namespace TwitchClone.Api.Services
{
    public interface IViewerTrackerService
    {
        Task<bool> AddViewer(int channelId, string connectionId, int? userId = null);
        Task<bool> RemoveViewer(string connectionId);
        Task ClearChannelViewers(int channelId);
        int GetViewerCount(int channelId);
        int GetUniqueUserCount(int channelId);
        Task<int> UpdateViewerCountInDatabase(int channelId);
        Task<int> UpdateViewerCountAndBroadcast(int channelId);
        ViewerStatsResponse GetChannelStats(int channelId); 
        List<string> GetViewerConnectionIds(int channelId);
        Task<int> GetViewerCountFromDatabase(int channelId);
        bool IsUserWatchingChannel(int userId, int channelId);
        
 
        void CleanupOldConnections(TimeSpan maxAge);
    }
}