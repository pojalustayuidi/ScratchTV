using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs
{
    public class LoginRequest
    {
        [Required(ErrorMessage = "Username обязателен")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "Пароль обязателен")]
        public string Password { get; set; } = string.Empty;
    }
}