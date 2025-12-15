    namespace TwitchClone.Api.DTOs.Subscription
    {
        public class SubscriptionResponse
        {
            public int ChannelId { get; set; }
            public string ChannelName { get; set; } = null!;
            public string? ChannelAvatarUrl { get; set; }
            public DateTime SubscribedAt { get; set; }
            public bool IsChannelLive { get; set; }
            public int ChannelViewers { get; set; }
        }
    }