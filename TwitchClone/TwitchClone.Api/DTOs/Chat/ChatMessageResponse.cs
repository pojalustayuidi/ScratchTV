namespace TwitchClone.Api.DTOs.Chat
{
    public class ChatMessageResponse
    {
       public int Id { get; set; } // ← Здесь большая буква, но это нормально для DTO
        public int ChannelId { get; set; }
        public int? UserId { get; set; }
        public string Username { get; set; } = null!;
        public string? AvatarUrl { get; set; }
        public string Message { get; set; } = null!;
        public string Color { get; set; } = "#FFFFFF";
        public DateTime Timestamp { get; set; }
        public bool IsSystemMessage { get; set; }
        public bool IsDeleted { get; set; }
        public bool IsModerator { get; set; }
        public bool IsStreamer { get; set; }
    }
}