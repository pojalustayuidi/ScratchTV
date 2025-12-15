using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Services;

public class StreamSessionCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StreamSessionCleanupService> _logger;

    public StreamSessionCleanupService(IServiceScopeFactory scopeFactory, ILogger<StreamSessionCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var channelService = scope.ServiceProvider.GetRequiredService<ChannelService>();

                // Находим устаревшие сессии (больше 30 секунд без пинга)
                var expiredSessions = await dbContext.Channels
                    .Where(c => c.IsLive && 
                                c.LastPingAt.HasValue && 
                                DateTime.UtcNow - c.LastPingAt.Value > TimeSpan.FromSeconds(30))
                    .ToListAsync(stoppingToken);

                foreach (var channel in expiredSessions)
                {
                    _logger.LogInformation($"Автоматическое завершение устаревшей сессии канала {channel.Id}");
                    await channelService.StopStreamSession(channel.Id, channel.CurrentSessionId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка при очистке устаревших сессий");
            }

            // Проверяем каждые 10 секунд
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}