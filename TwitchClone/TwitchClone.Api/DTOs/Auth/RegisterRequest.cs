using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Auth
{
    public class RegisterRequest
    {
        [Required(ErrorMessage = "Username обязателен")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email обязателен")]
        [EmailAddress(ErrorMessage = "Некорректный email")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password обязателен")]
        public string Password { get; set; } = string.Empty;
    }
}
