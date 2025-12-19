namespace TwitchClone.Api.DTOs.Channel
{
    public class ChannelUpdateRequest
    {
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? PreviewUrl { get; set; }
    }
}
