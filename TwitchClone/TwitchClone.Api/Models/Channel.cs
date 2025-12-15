// Models/Channel.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

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
        
        [MaxLength(255)]
        public string? PreviewUrl { get; set; }

        // Новые поля для управления сессиями
        [MaxLength(100)]
        public string? CurrentSessionId { get; set; }
        
        public DateTime? SessionStartedAt { get; set; }
        
        public DateTime? LastPingAt { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Дополнительные поля для статистики
        public int PeakViewers { get; set; } = 0;
        
        public int TotalStreamTime { get; set; } = 0; // в секундах
        
        public DateTime? LastStreamEndedAt { get; set; }
    }
}