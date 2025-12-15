// SfuProxyController.cs
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using TwitchClone.Api.Services;

namespace TwitchClone.Api.Controllers
{
    [ApiController]
    [Route("api/sfu-proxy")]
    [Authorize]
    public class SfuProxyController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<SfuProxyController> _logger;
        private readonly ChannelService _channelService;

        public SfuProxyController(
            IHttpClientFactory httpClientFactory,
            ChannelService channelService,
            ILogger<SfuProxyController> logger)
        {
            _httpClient = httpClientFactory.CreateClient("SFU");
            _channelService = channelService;
            _logger = logger;
        }

        [HttpPost("create-transport")]
        public async Task<IActionResult> CreateTransport([FromBody] CreateTransportRequest request)
        {
            try
            {
                var userId = GetUserId();
                if (!userId.HasValue)
                    return Unauthorized();
                
                // Проверяем доступ к каналу
                if (request.IsProducer)
                {
                    var channel = await _channelService.GetById(request.ChannelId);
                    if (channel?.UserId != userId)
                        return Forbid();
                }
                else
                {
                    // Для зрителей проверяем, активен ли стрим
                    var (isActive, _) = await _channelService.GetActiveSession(request.ChannelId);
                    if (!isActive)
                    {
                        return BadRequest(new
                        {
                            error = "Stream is not active",
                            code = "STREAM_NOT_ACTIVE",
                            canRetry = true
                        });
                    }
                }
                
                // Проксируем запрос в SFU
                var response = await _httpClient.PostAsJsonAsync(
                    "/createWebRtcTransport", 
                    new { 
                        channelId = request.ChannelId,
                        isProducer = request.IsProducer 
                    });
                
                var content = await response.Content.ReadAsStringAsync();
                
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError($"SFU error: {content}");
                }
                
                // Возвращаем как есть
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error proxying to SFU");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("connect-transport")]
        public async Task<IActionResult> ConnectTransport([FromBody] ConnectTransportRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync(
                    "/connectTransport", 
                    request);
                
                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error connecting transport");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("produce")]
        public async Task<IActionResult> Produce([FromBody] ProduceRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync("/produce", request);
                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error producing");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("consume")]
        public async Task<IActionResult> Consume([FromBody] ConsumeRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync("/consume", request);
                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("check-stream/{channelId}")]
        public async Task<IActionResult> CheckStream(int channelId)
        {
            try
            {
                var response = await _httpClient.GetAsync($"/api/check-stream/{channelId}");
                var content = await response.Content.ReadAsStringAsync();
                return Content(content, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking stream");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private int? GetUserId()
        {
            var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            if (claim != null && int.TryParse(claim.Value, out var userId))
                return userId;
            return null;
        }

        public class CreateTransportRequest
        {
            public int ChannelId { get; set; }
            public bool IsProducer { get; set; }
        }

        public class ConnectTransportRequest
        {
            public string TransportId { get; set; } = null!;
            public object DtlsParameters { get; set; } = null!;
        }

        public class ProduceRequest
        {
            public int ChannelId { get; set; }
            public string TransportId { get; set; } = null!;
            public string Kind { get; set; } = null!;
            public object RtpParameters { get; set; } = null!;
            public string SessionId { get; set; } = null!;
        }

        public class ConsumeRequest
        {
            public int ChannelId { get; set; }
            public string TransportId { get; set; } = null!;
            public object RtpCapabilities { get; set; } = null!;
        }
    }
}