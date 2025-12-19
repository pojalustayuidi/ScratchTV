namespace TwitchClone.Api.DTOs.Stream
{
    public class StreamSessionDto
    {
        public string SessionId { get; set; } = null!;
        public DateTime StartedAt { get; set; }
        public int Viewers { get; set; }
        public bool IsActive { get; set; }
    }
}