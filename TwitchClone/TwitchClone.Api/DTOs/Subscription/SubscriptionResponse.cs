namespace TwitchClone.Api.DTOs.Subscriptions
{
    public class SubscriptionResponse
    {
        public int SubscriberId { get; set; }
        public string SubscriberUsername { get; set; } = null!;
        public int ChannelId { get; set; }
        public string ChannelName { get; set; } = null!;
        public DateTime SubscribedAt { get; set; }
    }
}
