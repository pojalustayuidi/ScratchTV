// Models/User.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TwitchClone.Api.Models
{
    public class User
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(50)]
        public string Username { get; set; } = string.Empty;
        
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;
        
        [Required]
        public string PasswordHash { get; set; } = string.Empty;
        
        public string? AvatarUrl { get; set; }
        
        public string? Bio { get; set; }
        
        [MaxLength(7)]
        public string ChatColor { get; set; } = "#FFFFFF"; // ← НОВОЕ ПОЛЕ!
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        public bool IsVerified { get; set; } = false;
        
        // Навигационные свойства
        public virtual Channel? Channel { get; set; }
        public virtual ICollection<Subscription> Subscriptions { get; set; } = new List<Subscription>();
    }
}