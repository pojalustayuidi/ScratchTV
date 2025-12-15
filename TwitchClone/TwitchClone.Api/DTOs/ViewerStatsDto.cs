namespace TwitchClone.Api.DTOs;

public class ViewerStatsDto
{
    public int ChannelId { get; set; }
    public int TotalViewers { get; set; }
    public int UniqueUsers { get; set; }
    public List<string> ConnectionIds { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}