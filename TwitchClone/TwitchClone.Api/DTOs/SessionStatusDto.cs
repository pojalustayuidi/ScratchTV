   public class SessionStatusDto
    {
        public bool IsLive { get; set; }
        public string? SessionId { get; set; }
        public bool CanResume { get; set; }
        public DateTime? LastPing { get; set; }
    }