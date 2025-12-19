
namespace TwitchClone.Api.DTOs.Chat
{
    public class ChannelModeratorResponse
    {
        public int UserId { get; set; }
        public string Username { get; set; } = null!;
        public string? AvatarUrl { get; set; }
        public DateTime AddedAt { get; set; }
        public string AddedByUsername { get; set; } = null!;
    }
}
