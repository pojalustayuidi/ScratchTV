public interface IStreamService
{
    Task StartStreamAsync(int channelId);
    Task StopStreamAsync(int channelId);
    Task IncrementViewersAsync(int channelId);
    Task DecrementViewersAsync(int channelId);
}
