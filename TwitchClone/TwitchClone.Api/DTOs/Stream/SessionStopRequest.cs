using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Stream
{
    public class SessionStopRequest
    {
        [Required(ErrorMessage = "SessionId обязателен")]
        public string SessionId { get; set; } = null!;
    }
}