using TwitchClone.Api.Models;

public interface IChannelRepository
{
    Task<Channel?> GetByIdAsync(int channelId);
    Task UpdateAsync(Channel channel);
}
