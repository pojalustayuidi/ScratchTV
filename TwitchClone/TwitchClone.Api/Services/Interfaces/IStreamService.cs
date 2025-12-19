namespace TwitchClone.Api.Services
{
    public interface IStreamService
    {
        Task StartStreamAsync(int channelId);
        Task StopStreamAsync(int channelId);
        Task IncrementViewersAsync(int channelId);
        Task DecrementViewersAsync(int channelId);
        Task<bool> IsStreamActive(int channelId);
        Task<string?> GetCurrentSessionId(int channelId);
    }
}