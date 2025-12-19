using TwitchClone.Api.Models;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services
{
    public interface ISubscriptionService
    {
        Task<bool> Subscribe(int subscriberId, int channelId);
        Task<bool> Unsubscribe(int subscriberId, int channelId);
        Task<bool> IsSubscribed(int subscriberId, int channelId);
        Task<List<Channel>> GetUserSubscriptions(int userId);
        Task<List<User>> GetChannelSubscribers(int channelId);
        Task<int> GetSubscriberCount(int channelId);
    }
}