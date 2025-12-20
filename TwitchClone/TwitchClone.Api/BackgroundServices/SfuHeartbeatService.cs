using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TwitchClone.Api.Services;
using TwitchClone.Api.Services.Implementations; 

namespace TwitchClone.Api.BackgroundServices
{
    public class SfuHeartbeatService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<SfuHeartbeatService> _logger;
        private readonly TimeSpan _interval = TimeSpan.FromSeconds(30);
        
        public SfuHeartbeatService(
            IServiceScopeFactory scopeFactory,
            ILogger<SfuHeartbeatService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }
        
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("SFU Heartbeat Service started");
            
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var sfuSync = scope.ServiceProvider.GetRequiredService<ISfuSyncService>();
                    
        
                    var isHealthy = await sfuSync.CheckSfuHealth();
                    
                    if (isHealthy)
                    {
                        _logger.LogDebug("SFU heartbeat successful - SFU is healthy");
                    }
                    else
                    {
                        _logger.LogWarning("SFU heartbeat failed - SFU may be down");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in SFU heartbeat service");
                }
                
                await Task.Delay(_interval, stoppingToken);
            }
            
            _logger.LogInformation("SFU Heartbeat Service stopped");
        }
    }
}