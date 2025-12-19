namespace TwitchClone.Api.DTOs.Viewer
{
    public class ViewerConnectionResponse
    {
        public string ConnectionId { get; set; } = null!;
        public int? UserId { get; set; }
        public string? Username { get; set; }
        public DateTime ConnectedAt { get; set; }
        public DateTime LastActivity { get; set; }
        public TimeSpan WatchDuration { get; set; }
    }
}
