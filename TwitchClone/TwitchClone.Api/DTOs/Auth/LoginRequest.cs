using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Auth
{
    public class LoginRequest
    {
        [Required(ErrorMessage = "Username обязателен")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password обязателен")]
        public string Password { get; set; } = string.Empty;
    }
}
