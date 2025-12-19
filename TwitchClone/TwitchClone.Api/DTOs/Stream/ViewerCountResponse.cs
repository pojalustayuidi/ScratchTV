
namespace TwitchClone.Api.DTOs.Stream
{
    public class ViewerCountResponse
    {
        public int ChannelId { get; set; }
        public int Count { get; set; }
        public int UniqueUsers { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
