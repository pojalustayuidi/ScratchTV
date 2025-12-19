namespace TwitchClone.Api.DTOs.SFU
{
    public class SfuViewerCountDto
    {
        public int ChannelId { get; set; }
        public int Count { get; set; }
        public int Unique { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
