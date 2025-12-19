namespace TwitchClone.Api.DTOs.SFU
{
    public class SfuViewerEventDto
    {
        public int ChannelId { get; set; }
        public string ConnectionId { get; set; } = null!;
        public int? UserId { get; set; }
    }
}
