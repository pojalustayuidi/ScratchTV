using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Auth
{
    public class UserProfileUpdateDto
    {
        [EmailAddress(ErrorMessage = "Некорректный email")]
        public string? Email { get; set; }
        public string? AvatarUrl { get; set; }
        public string? ChatColor { get; set; }
    }
}