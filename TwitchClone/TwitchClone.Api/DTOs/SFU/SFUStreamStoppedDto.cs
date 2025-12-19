namespace TwitchClone.Api.DTOs.SFU
{
    public class SFUStreamStoppedDto
    {
        public int ChannelId { get; set; }
        public string SessionId { get; set; } = null!;
        public DateTime StoppedAt { get; set; }
    }
}
