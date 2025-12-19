namespace TwitchClone.Api.DTOs.Stream
{
    public class SessionStatusResponse
    {
        public bool IsLive { get; set; }
        public string? SessionId { get; set; }
        public bool CanResume { get; set; }
        public DateTime? LastPing { get; set; }
        public DateTime? SessionStartedAt { get; set; }
        public int DurationSeconds { get; set; }
        public int Viewers { get; set; }
    }
}
