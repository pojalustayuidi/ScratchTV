namespace TwitchClone.Api.DTOs.Chat
{
    public class BanInfoResponse
    {
        public int UserId { get; set; }
        public int ChannelId { get; set; }
        public string Reason { get; set; } = string.Empty;
        public int BannedBy { get; set; }
        public DateTime BannedAt { get; set; }
        public DateTime ExpiresAt { get; set; }
        public bool IsPermanent { get; set; }
        public string BannedByUsername { get; set; } = string.Empty;
    }
}