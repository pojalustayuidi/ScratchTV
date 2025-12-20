

using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services.Implementations
{
    public class SubscriptionService : ISubscriptionService
    {
        private readonly AppDbContext _db;

        public SubscriptionService(AppDbContext db)
        {
            _db = db;
        }

       public async Task<bool> Subscribe(int subscriberId, int channelId)
{
    var channel = await _db.Channels.FindAsync(channelId);
    if (channel == null)
        throw new ArgumentException("Канал не найден");

    if (subscriberId == channel.UserId)
        throw new ArgumentException("Нельзя подписаться на свой канал");

    var exists = await _db.Subscriptions
        .AnyAsync(s => s.SubscriberId == subscriberId && s.ChannelId == channelId);

    if (exists) return false;

    _db.Subscriptions.Add(new Subscription
    {
        SubscriberId = subscriberId,
        ChannelId = channelId,
        CreatedAt = DateTime.UtcNow
    });


    channel.SubscribersCount = await _db.Subscriptions
        .CountAsync(s => s.ChannelId == channelId);
    
    await _db.SaveChangesAsync();
    return true;
}

public async Task<bool> Unsubscribe(int subscriberId, int channelId)
{
    var sub = await _db.Subscriptions
        .FirstOrDefaultAsync(s => s.SubscriberId == subscriberId && s.ChannelId == channelId);

    if (sub == null) return false;

    _db.Subscriptions.Remove(sub);
    await _db.SaveChangesAsync();


    var channel = await _db.Channels.FindAsync(channelId);
    if (channel != null)
    {
        channel.SubscribersCount = await _db.Subscriptions
            .CountAsync(s => s.ChannelId == channelId);
        await _db.SaveChangesAsync();
    }
    
    return true;
}
        public async Task<bool> IsSubscribed(int subscriberId, int channelId)
        {
            return await _db.Subscriptions
                .AnyAsync(s => s.SubscriberId == subscriberId && s.ChannelId == channelId);
        }

        public async Task<List<Channel>> GetUserSubscriptions(int userId)
        {
            return await _db.Subscriptions
                .Where(s => s.SubscriberId == userId)
                .Select(s => s.Channel)
                .Include(c => c.User)
                .ToListAsync();
        }

        public async Task<List<User>> GetChannelSubscribers(int channelId)
        {
            return await _db.Subscriptions
                .Where(s => s.ChannelId == channelId)
                .Select(s => s.Subscriber)
                .ToListAsync();
        }

        public async Task<int> GetSubscriberCount(int channelId)
        {
            return await _db.Subscriptions
                .CountAsync(s => s.ChannelId == channelId);
        }
    }
}