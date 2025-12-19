using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

namespace TwitchClone.Domain.Models
{
    public class ChatMessage
    {
        public int Id { get; set; }
        public int ChannelId { get; set; }
        public int? UserId { get; set; }
        public string Message { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public bool IsSystemMessage { get; set; } = false;
        public bool IsDeleted { get; set; } = false;
        public DateTime? DeletedAt { get; set; }
        public int? DeletedByUserId { get; set; }
        
         [ForeignKey("UserId")]
        public User? User { get; set; }
        
        [ForeignKey("DeletedByUserId")]
        public User? DeletedByUser { get; set; }
        
        [ForeignKey("ChannelId")]
        public Channel? Channel { get; set; }
    }
}
