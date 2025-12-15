    namespace TwitchClone.Api.Models
    {
        public class Subscription
        {
            public int Id { get; set; }

            public int SubscriberId { get; set; }
            public User Subscriber { get; set; } = null!;

            public int ChannelId { get; set; }
            public Channel Channel { get; set; } = null!;

            public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        }
    }
