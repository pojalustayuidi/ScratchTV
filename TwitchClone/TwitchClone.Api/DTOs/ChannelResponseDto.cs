   public class ChannelResponseDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = null!;
        public string? AvatarUrl { get; set; }
        public string? Description { get; set; }
        public int Viewers { get; set; }
        public bool IsLive { get; set; }
        public string? PreviewUrl { get; set; }
        public int SubscribersCount { get; set; }
    }