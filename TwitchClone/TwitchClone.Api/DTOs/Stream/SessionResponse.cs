namespace TwitchClone.Api.DTOs.Stream
{
    public class SessionResponse
    {
        public string SessionId { get; set; } = null!;
        public DateTime StartedAt { get; set; }
        public DateTime? EndedAt { get; set; }
        public bool IsActive { get; set; }
        public int ChannelId { get; set; }
        public int Viewers { get; set; } 
    }
}
