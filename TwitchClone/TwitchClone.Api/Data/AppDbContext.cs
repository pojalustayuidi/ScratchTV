using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Models;

namespace TwitchClone.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Channel> Channels { get; set; } = null!;
        public DbSet<Subscription> Subscriptions { get; set; } = null!;
        public DbSet<ChatMessage> ChatMessages { get; set; } = null!;
        public DbSet<ChannelModerator> ChannelModerators { get; set; } = null!;
        public DbSet<ChannelBan> ChannelBans { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.Username).IsUnique();
                entity.HasIndex(u => u.Email).IsUnique();
            });

            // Channel
            modelBuilder.Entity<Channel>(entity =>
            {
                entity.HasIndex(c => c.Name).IsUnique();
                entity.HasIndex(c => c.UserId).IsUnique();
            });

            // Subscription
            modelBuilder.Entity<Subscription>(entity =>
            {
                entity.HasIndex(s => new { s.SubscriberId, s.ChannelId }).IsUnique();
            });

            // ChatMessage
            modelBuilder.Entity<ChatMessage>(entity =>
            {
                entity.HasIndex(m => m.ChannelId);
                entity.HasIndex(m => m.Timestamp);
            });

            // ChannelModerator
            modelBuilder.Entity<ChannelModerator>(entity =>
            {
                entity.HasIndex(m => new { m.ChannelId, m.UserId }).IsUnique();
            });

            // ChannelBan
            modelBuilder.Entity<ChannelBan>(entity =>
            {
                entity.HasIndex(b => new { b.ChannelId, b.UserId });
                entity.HasIndex(b => b.ExpiresAt);
            });
        }
    }
}