namespace TwitchClone.Api.DTOs.Subscription
{
    public class SubscriptionStatusResponse
    {
        public bool IsSubscribed { get; set; }
        public DateTime? SubscribedAt { get; set; }
        public int ChannelId { get; set; }
        public string ChannelName { get; set; } = null!;
    }
}