namespace TwitchClone.Api.DTOs.Channel
{
    public class ChannelResponse
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Name { get; set; } = null!;
        public string? Description { get; set; }
        public string? PreviewUrl { get; set; }
        public bool IsLive { get; set; }
        public int Viewers { get; set; }
        public int PeakViewers { get; set; }
        public int TotalStreamTime { get; set; }
        public DateTime? LastStreamEndedAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public string Username { get; set; } = null!;
        public string? AvatarUrl { get; set; }
    }
}