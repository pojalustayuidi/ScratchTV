using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

namespace TwitchClone.Domain.Models
{
    public class ChannelModerator
    {
        public int Id { get; set; }
        public int ChannelId { get; set; }
        public int UserId { get; set; }
        public int AddedByUserId { get; set; }
        public DateTime AddedAt { get; set; } = DateTime.UtcNow;

         [ForeignKey("UserId")]
        public User User { get; set; } = null!;
        
        [ForeignKey("AddedByUserId")]
        public User AddedByUser { get; set; } = null!;
        
        [ForeignKey("ChannelId")]
        public Channel Channel { get; set; } = null!;
    }
}
