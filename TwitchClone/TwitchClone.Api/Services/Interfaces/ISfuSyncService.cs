namespace TwitchClone.Api.Services
{
    public interface ISfuSyncService
    {
        Task<bool> IsStreamActiveInSfu(int channelId);
        Task<int> GetViewersFromSfu(int channelId);
        Task<bool> NotifySfuStreamStarted(int channelId, string sessionId);
        Task<bool> NotifySfuStreamStopped(int channelId, string? sessionId);
        Task SyncViewerCounts(int channelId);
         Task<bool> CheckSfuHealth();
    }   
}