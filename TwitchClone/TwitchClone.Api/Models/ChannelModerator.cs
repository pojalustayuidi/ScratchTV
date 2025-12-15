using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using TwitchClone.Api.Models;

  public class ChannelModerator
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
        
        public DateTime AddedAt { get; set; } = DateTime.UtcNow;
        
        [Required]
        public int AddedByUserId { get; set; }
        
        [ForeignKey("AddedByUserId")]
        public virtual User AddedByUser { get; set; } = null!;
    }
