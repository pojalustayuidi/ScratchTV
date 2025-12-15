using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;

public class ChannelRepository : IChannelRepository
{
    private readonly AppDbContext _context;

    public ChannelRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Channel?> GetByIdAsync(int channelId)
    {
        return await _context.Channels
            .Include(c => c.User) // подтягиваем пользователя
            .FirstOrDefaultAsync(c => c.Id == channelId);
    }

    public async Task UpdateAsync(Channel channel)
    {
        _context.Channels.Update(channel);
        await _context.SaveChangesAsync();
    }
}
