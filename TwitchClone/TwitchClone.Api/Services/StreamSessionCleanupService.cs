using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;

namespace TwitchClone.Api.Services
{
    public class StreamSessionCleanupService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<StreamSessionCleanupService> _logger;
        private const int CLEANUP_INTERVAL_SECONDS = 30; // Увеличим интервал до 30 секунд
        private const int STREAM_TIMEOUT_SECONDS = 45;

        public StreamSessionCleanupService(
            IServiceScopeFactory scopeFactory, 
            ILogger<StreamSessionCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Stream Session Cleanup Service started");
            
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CleanupExpiredSessionsAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ошибка при очистке устаревших сессий");
                }

                await Task.Delay(TimeSpan.FromSeconds(CLEANUP_INTERVAL_SECONDS), stoppingToken);
            }
            
            _logger.LogInformation("Stream Session Cleanup Service stopped");
        }

        private async Task CleanupExpiredSessionsAsync()
        {
            using var scope = _scopeFactory.CreateScope();
            var channelService = scope.ServiceProvider.GetRequiredService<IChannelService>();
            
            try
            {
                var cleanedCount = await channelService.CleanupExpiredStreams();
                
                if (cleanedCount > 0)
                {
                    _logger.LogInformation("Автоматическая очистка: завершено {Count} устаревших стримов", cleanedCount);
                }
                else
                {
                    _logger.LogDebug("Автоматическая очистка: устаревших стримов не найдено");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ошибка при автоматической очистке устаревших сессий");
            }
        }
    }
}