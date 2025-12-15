using System.ComponentModel.DataAnnotations;

namespace TwitchClone.Api.DTOs.Channel
{
    public class ChannelUpdateRequest
    {
        public string? Name { get; set; }

        [MaxLength(1000, ErrorMessage = "Максимум 1000 символов")]
        public string? Description { get; set; }

        [MaxLength(500, ErrorMessage = "Максимум 500 символов")]
        [Url(ErrorMessage = "Некорректный URL")]
        public string? PreviewUrl { get; set; }
    }
}