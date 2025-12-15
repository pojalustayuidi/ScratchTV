namespace TwitchClone.Api.DTOs;
public class ViewersCountDto
{
    public int ChannelId { get; set; }
    public int Count { get; set; }
    public int UniqueViewers { get; set; }
    public bool IsLive { get; set; }
    public DateTime Timestamp { get; set; }
}
