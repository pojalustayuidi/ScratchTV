namespace TwitchClone.Api.DTOs.Subscription
{
    public class SubscribersCountResponse
    {
        public int ChannelId { get; set; }
        public int Count { get; set; }       
        public DateTime UpdatedAt { get; set; }
    }
}