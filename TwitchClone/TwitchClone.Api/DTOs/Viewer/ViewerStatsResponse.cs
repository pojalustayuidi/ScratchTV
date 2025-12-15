namespace TwitchClone.Api.DTOs.Viewer
{
    public class ViewerStatsResponse
    {
        public int ChannelId { get; set; }
        public int TotalViewers { get; set; }
        public int UniqueUsers { get; set; }
        public List<string> ConnectionIds { get; set; } = new();
        public DateTime UpdatedAt { get; set; }
        public Dictionary<string, int> ViewersByMinute { get; set; } = new();
        public int PeakViewers { get; set; }
        public TimeSpan AverageWatchTime { get; set; }
    }
}