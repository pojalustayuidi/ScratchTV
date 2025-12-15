using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/sfu")]
    public class SfuApiController : ControllerBase
    {
        private readonly IViewerTrackerService _viewerTracker;
        private readonly ChannelService _channelService;
        private readonly ILogger<SfuApiController> _logger;
        
        public SfuApiController(
            IViewerTrackerService viewerTracker,
            ChannelService channelService,
            ILogger<SfuApiController> logger)
        {
            _viewerTracker = viewerTracker;
            _channelService = channelService;
            _logger = logger;
        }
        
        // SFU запрашивает статус стрима
        [HttpGet("stream/{channelId}/status")]
        public async Task<IActionResult> GetStreamStatus(int channelId)
        {
            try
            {
                var (isActive, sessionId) = await _channelService.GetActiveSession(channelId);
                var viewers = _viewerTracker.GetViewerCount(channelId);
                
                return Ok(new
                {
                    channelId,
                    isLive = isActive,
                    sessionId,
                    viewers,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting stream status for SFU, channel {channelId}");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        // SFU уведомляет о подключении зрителя
        [HttpPost("viewer/connected")]
        public async Task<IActionResult> ViewerConnected([FromBody] SfuViewerEvent request)
        {
            try
            {
                await _viewerTracker.AddViewer(
                    request.ChannelId, 
                    $"sfu_{request.ConnectionId}", 
                    request.UserId);
                
                var count = _viewerTracker.GetViewerCount(request.ChannelId);
                
                _logger.LogDebug($"SFU viewer connected: channel={request.ChannelId}, conn={request.ConnectionId}");
                
                return Ok(new
                {
                    success = true,
                    channelId = request.ChannelId,
                    viewers = count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing SFU viewer connected event");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        // SFU уведомляет об отключении зрителя
        [HttpPost("viewer/disconnected")]
        public async Task<IActionResult> ViewerDisconnected([FromBody] SfuViewerEvent request)
        {
            try
            {
                await _viewerTracker.RemoveViewer($"sfu_{request.ConnectionId}");
                
                var count = _viewerTracker.GetViewerCount(request.ChannelId);
                
                _logger.LogDebug($"SFU viewer disconnected: channel={request.ChannelId}, conn={request.ConnectionId}");
                
                return Ok(new
                {
                    success = true,
                    channelId = request.ChannelId,
                    viewers = count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing SFU viewer disconnected event");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        // SFU запрашивает общее количество зрителей
        [HttpGet("viewers/{channelId}")]
        public IActionResult GetViewers(int channelId)
        {
            try
            {
                var count = _viewerTracker.GetViewerCount(channelId);
                var unique = _viewerTracker.GetUniqueUserCount(channelId);
                
                return Ok(new
                {
                    channelId,
                    count,
                    unique,
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting viewers for SFU, channel {channelId}");
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        public class SfuViewerEvent
        {
            public int ChannelId { get; set; }
            public string ConnectionId { get; set; } = null!;
            public int? UserId { get; set; }
        }
    }
}