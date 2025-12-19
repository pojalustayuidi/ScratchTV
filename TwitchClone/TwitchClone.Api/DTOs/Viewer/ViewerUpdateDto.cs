namespace TwitchClone.Api.DTOs
{
    public class ViewerUpdateDto
    {
        public int ChannelId { get; set; }
        public string? SocketId { get; set; }
        public int? UserId { get; set; }
    }
}
