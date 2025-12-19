using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Auth
{
    public class UserProfileUpdateDto
    {
        [EmailAddress(ErrorMessage = "Некорректный email")]
        public string? Email { get; set; }

        public string? AvatarUrl { get; set; }

        [MaxLength(7, ErrorMessage = "Неверный формат цвета")]
        public string? ChatColor { get; set; }
    }
}
