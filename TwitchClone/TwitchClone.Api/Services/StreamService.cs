public class StreamService : IStreamService
{
    private readonly IChannelRepository _channelRepository;

    public StreamService(IChannelRepository channelRepository)
    {
        _channelRepository = channelRepository;
    }

    public async Task StartStreamAsync(int channelId)
    {
        var channel = await _channelRepository.GetByIdAsync(channelId);
        if (channel == null) throw new Exception("Channel not found");
        channel.IsLive = true;
        channel.Viewers = 0;
        await _channelRepository.UpdateAsync(channel);
    }

    public async Task StopStreamAsync(int channelId)
    {
        var channel = await _channelRepository.GetByIdAsync(channelId);
        if (channel == null) throw new Exception("Channel not found");
        channel.IsLive = false;
        channel.Viewers = 0;
        await _channelRepository.UpdateAsync(channel);
    }

    public async Task IncrementViewersAsync(int channelId)
    {
        var channel = await _channelRepository.GetByIdAsync(channelId);
        if (channel == null) throw new Exception("Channel not found");
        channel.Viewers++;
        await _channelRepository.UpdateAsync(channel);
    }

    public async Task DecrementViewersAsync(int channelId)
    {
        var channel = await _channelRepository.GetByIdAsync(channelId);
        if (channel == null) throw new Exception("Channel not found");
        channel.Viewers = Math.Max(0, channel.Viewers - 1);
        await _channelRepository.UpdateAsync(channel);
    }
}
