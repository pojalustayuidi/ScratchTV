using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;

namespace TwitchClone.Api.Services.Implementations
{
    public class StreamService : IStreamService
    {
        private readonly AppDbContext _db;

        public StreamService(AppDbContext db)
        {
            _db = db;
        }

        public async Task StartStreamAsync(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) 
                throw new ArgumentException("Channel not found");
            
            channel.IsLive = true;
            channel.Viewers = 0;
            await _db.SaveChangesAsync();
        }

        public async Task StopStreamAsync(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) 
                throw new ArgumentException("Channel not found");
            
            channel.IsLive = false;
            channel.Viewers = 0;
            await _db.SaveChangesAsync();
        }

        public async Task IncrementViewersAsync(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) 
                throw new ArgumentException("Channel not found");
            
            channel.Viewers++;
            await _db.SaveChangesAsync();
        }

        public async Task DecrementViewersAsync(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            if (channel == null) 
                throw new ArgumentException("Channel not found");
            
            channel.Viewers = Math.Max(0, channel.Viewers - 1);
            await _db.SaveChangesAsync();
        }

        public async Task<bool> IsStreamActive(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            return channel?.IsLive ?? false;
        }

        public async Task<string?> GetCurrentSessionId(int channelId)
        {
            var channel = await _db.Channels.FindAsync(channelId);
            return channel?.CurrentSessionId;
        }
    }
}