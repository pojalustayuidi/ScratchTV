using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Chat
{
    public class AddModeratorRequest
    {
        [Required(ErrorMessage = "Имя пользователя обязательно")]
        public string Username { get; set; } = string.Empty;
    }
}