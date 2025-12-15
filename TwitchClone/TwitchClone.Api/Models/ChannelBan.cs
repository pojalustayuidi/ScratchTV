using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

public class ChannelBan
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        public int ChannelId { get; set; }
        
        [ForeignKey("ChannelId")]
        public virtual Channel Channel { get; set; } = null!;
        
        [Required]
        public int UserId { get; set; }
        
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;
        
        [Required]
        public int ModeratorId { get; set; }
        
        [ForeignKey("ModeratorId")]
        public virtual User Moderator { get; set; } = null!;
        
        [MaxLength(200)]
        public string Reason { get; set; } = string.Empty;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime ExpiresAt { get; set; }
        
        [NotMapped]
        public bool IsPermanent => ExpiresAt == DateTime.MaxValue;
    }
