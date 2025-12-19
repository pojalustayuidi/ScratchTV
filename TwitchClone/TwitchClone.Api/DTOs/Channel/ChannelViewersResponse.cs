namespace TwitchClone.Api.DTOs.Channel
{
    public class ChannelViewersResponse
    {
        public int ChannelId { get; set; }
        public int Viewers { get; set; }
        public int UniqueUsers { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
