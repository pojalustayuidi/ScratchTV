namespace TwitchClone.Api.DTOs.SFU
{
    public class SfuStreamStatusDto
    {
        public int ChannelId { get; set; }
        public bool IsLive { get; set; }
        public string? SessionId { get; set; }
        public int Viewers { get; set; }
        public DateTime Timestamp { get; set; }
    }
}