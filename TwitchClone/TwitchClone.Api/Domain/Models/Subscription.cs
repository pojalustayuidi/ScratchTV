// Domain/Models/Subscription.cs
using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

namespace TwitchClone.Domain.Models
{
    public class Subscription
    {
        public int Id { get; set; }
        public int SubscriberId { get; set; }
        public int ChannelId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        // Навигационные свойства
        [ForeignKey("SubscriberId")]
        public User Subscriber { get; set; } = null!;
        
        [ForeignKey("ChannelId")]
        public Channel Channel { get; set; } = null!;
    }
}