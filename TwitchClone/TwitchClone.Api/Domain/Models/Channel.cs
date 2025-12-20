// Models/Channel.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Models
{
    public class Channel
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [ForeignKey("User")]
        public int UserId { get; set; }
        public User User { get; set; } = null!;

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = null!;

        [MaxLength(500)]
        public string? Description { get; set; }

        public bool IsLive { get; set; } = false;
        
        public int Viewers { get; set; } = 0;
        public int SubscribersCount { get; set; } = 0; 
        [MaxLength(255)]
        public string? PreviewUrl { get; set; }

        [MaxLength(100)]
        public string? CurrentSessionId { get; set; }
        
        public DateTime? SessionStartedAt { get; set; }
        
        public DateTime? LastPingAt { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public int PeakViewers { get; set; } = 0;
        
        public int TotalStreamTime { get; set; } = 0; 
        
        public DateTime? LastStreamEndedAt { get; set; }
    }
}