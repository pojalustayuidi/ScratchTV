using System;

namespace TwitchClone.Api.DTOs.Chat
{
    public class ChannelBanResponse
    {
       public int Id { get; set; }
    public int ChannelId { get; set; }
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string ModeratorName { get; set; } = string.Empty;
    public bool IsPermanent => ExpiresAt == DateTime.MaxValue;
    }
}
