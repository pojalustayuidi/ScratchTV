using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Chat
{
    public class ChatMessageRequest
    {
        [Required(ErrorMessage = "Сообщение обязательно")]
        [MinLength(1, ErrorMessage = "Сообщение не может быть пустым")]
        [MaxLength(500, ErrorMessage = "Максимум 500 символов")]
        public string Message { get; set; } = string.Empty;

        [Required]
        public int ChannelId { get; set; }
    }
}
