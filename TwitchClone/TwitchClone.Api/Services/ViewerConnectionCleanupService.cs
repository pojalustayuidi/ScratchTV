using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace TwitchClone.Api.Services
{
    public class ViewerConnectionCleanupService : BackgroundService
    {
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ILogger<ViewerConnectionCleanupService> _logger;
        private readonly TimeSpan _cleanupInterval = TimeSpan.FromMinutes(5);
        private readonly TimeSpan _maxConnectionAge = TimeSpan.FromHours(1);

        public ViewerConnectionCleanupService(
            IViewerTrackerService viewerTracker,
            ILogger<ViewerConnectionCleanupService> logger)
        {
            _viewerTracker = viewerTracker;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Viewer Connection Cleanup Service started");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // Проверяем тип и вызываем метод очистки
                    var trackerType = _viewerTracker.GetType();
                    var cleanupMethod = trackerType.GetMethod("CleanupOldConnections");
                    
                    if (cleanupMethod != null)
                    {
                        cleanupMethod.Invoke(_viewerTracker, new object[] { _maxConnectionAge });
                        _logger.LogDebug("Old viewer connections cleanup completed");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in viewer connection cleanup");
                }

                await Task.Delay(_cleanupInterval, stoppingToken);
            }

            _logger.LogInformation("Viewer Connection Cleanup Service stopped");
        }
    }
}