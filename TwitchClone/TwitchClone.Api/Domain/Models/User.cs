namespace TwitchClone.Domain.Models
{
    public class User
    {
        public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public string? Bio { get; set; }
        public string ChatColor { get; set; } = "#FFFFFF";
        public bool IsVerified { get; set; } = false;
        public bool IsAdmin { get; set; } = false;
        public bool IsModerator { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
