using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Models;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Channel> Channels => Set<Channel>();
        public DbSet<Subscription> Subscriptions => Set<Subscription>();
        public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
        public DbSet<ChannelModerator> ChannelModerators => Set<ChannelModerator>();
        public DbSet<ChannelBan> ChannelBans => Set<ChannelBan>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.Username).IsUnique();
                entity.HasIndex(u => u.Email).IsUnique();
                
                entity.Property(u => u.Username).HasMaxLength(50);
                entity.Property(u => u.Email).HasMaxLength(100);
                entity.Property(u => u.PasswordHash).HasMaxLength(255);
                entity.Property(u => u.AvatarUrl).HasMaxLength(500);
                entity.Property(u => u.Bio).HasMaxLength(1000);
                entity.Property(u => u.ChatColor).HasMaxLength(7);
                
         
                entity.Property(u => u.CreatedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
            });

  
            modelBuilder.Entity<Channel>(entity =>
            {
                entity.HasIndex(c => c.Name).IsUnique();
                entity.HasIndex(c => c.UserId).IsUnique();
                entity.HasIndex(c => c.IsLive);
                entity.HasIndex(c => c.LastPingAt);
                
                entity.Property(c => c.Name).HasMaxLength(100);
                entity.Property(c => c.Description).HasMaxLength(500);
                entity.Property(c => c.PreviewUrl).HasMaxLength(255);
                entity.Property(c => c.CurrentSessionId).HasMaxLength(100);
                
                entity.Property(c => c.CreatedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
                
                entity.Property(c => c.LastPingAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
    
                entity.HasOne(c => c.User)
                    .WithOne()
                    .HasForeignKey<Channel>(c => c.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

 
            modelBuilder.Entity<Subscription>(entity =>
            {
                entity.HasIndex(s => new { s.SubscriberId, s.ChannelId }).IsUnique();
                
                entity.Property(s => s.CreatedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
                
       
                entity.HasOne(s => s.Subscriber)
                    .WithMany()
                    .HasForeignKey(s => s.SubscriberId)
                    .OnDelete(DeleteBehavior.Restrict);
                
                entity.HasOne(s => s.Channel)
                    .WithMany()
                    .HasForeignKey(s => s.ChannelId)
                    .OnDelete(DeleteBehavior.Cascade);
            });


            modelBuilder.Entity<ChatMessage>(entity =>
            {
                entity.HasIndex(m => m.ChannelId);
                entity.HasIndex(m => m.Timestamp);
                entity.HasIndex(m => new { m.ChannelId, m.Timestamp });
                
                entity.Property(m => m.Message).HasMaxLength(500);
                
                entity.Property(m => m.Timestamp)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
                

                entity.HasOne(m => m.User)
                    .WithMany()
                    .HasForeignKey(m => m.UserId)
                    .OnDelete(DeleteBehavior.SetNull);
                    
                entity.HasOne(m => m.DeletedByUser)
                    .WithMany()
                    .HasForeignKey(m => m.DeletedByUserId)
                    .OnDelete(DeleteBehavior.SetNull);
                    
                entity.HasOne(m => m.Channel)
                    .WithMany()
                    .HasForeignKey(m => m.ChannelId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

  
            modelBuilder.Entity<ChannelModerator>(entity =>
            {
                entity.HasIndex(m => new { m.ChannelId, m.UserId }).IsUnique();
                
                entity.Property(m => m.AddedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
                
   
                entity.HasOne(m => m.User)
                    .WithMany()
                    .HasForeignKey(m => m.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                    
                entity.HasOne(m => m.AddedByUser)
                    .WithMany()
                    .HasForeignKey(m => m.AddedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);
                    
                entity.HasOne(m => m.Channel)
                    .WithMany()
                    .HasForeignKey(m => m.ChannelId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

   
            modelBuilder.Entity<ChannelBan>(entity =>
            {
                entity.HasIndex(b => new { b.ChannelId, b.UserId });
                entity.HasIndex(b => b.ExpiresAt);
                
                entity.Property(b => b.Reason).HasMaxLength(500);
                
                entity.Property(b => b.CreatedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
                    .HasColumnType("timestamp with time zone");
                
   
                entity.HasOne(b => b.User)
                    .WithMany()
                    .HasForeignKey(b => b.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                    
                entity.HasOne(b => b.Moderator)
                    .WithMany()
                    .HasForeignKey(b => b.ModeratorId)
                    .OnDelete(DeleteBehavior.Restrict);
                    
                entity.HasOne(b => b.Channel)
                    .WithMany()
                    .HasForeignKey(b => b.ChannelId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
        
    
    }
}