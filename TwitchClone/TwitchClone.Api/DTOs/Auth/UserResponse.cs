namespace TwitchClone.Api.DTOs.Auth
{
    public class UserResponse
    {
        public int Id { get; set; }
        public string Username { get; set; } = null!;
        public string Email { get; set; } = null!;
        public string? AvatarUrl { get; set; }
        public string ChatColor { get; set; } = "#FFFFFF";
        public DateTime CreatedAt { get; set; }
    }
}