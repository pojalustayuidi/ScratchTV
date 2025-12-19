using System;

namespace TwitchClone.Api.DTOs.Chat
{
    public class ChannelBanResponse
    {
        public int Id { get; set; }
        public int ChannelId { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = null!;
        public string Reason { get; set; } = null!;
        public DateTime CreatedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
        public string ModeratorName { get; set; } = null!;
        public bool IsActive => DateTime.UtcNow < ExpiresAt;
    }
}
