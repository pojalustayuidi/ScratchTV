namespace TwitchClone.Api.DTOs.Auth
{
    public class LoginResponse
    {
         public int Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public string ChatColor { get; set; } = "#FFFFFF";
        public bool IsAdmin { get; set; } = false;
        public bool IsModerator { get; set; } = false;
    }
}
