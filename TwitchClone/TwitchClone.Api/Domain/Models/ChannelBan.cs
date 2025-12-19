using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

namespace TwitchClone.Domain.Models
{
    public class ChannelBan
    {
        public int Id { get; set; }
        public int ChannelId { get; set; }
        public int UserId { get; set; }
        public int ModeratorId { get; set; }
        public string Reason { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresAt { get; set; }
        public bool IsPermanent => ExpiresAt == DateTime.MaxValue;

        [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("ModeratorId")]
        public User Moderator { get; set; } = null!;
        
        [ForeignKey("ChannelId")]
        public Channel Channel { get; set; } = null!;
    }
}
