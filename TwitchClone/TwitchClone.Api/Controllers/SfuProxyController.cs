// Controllers/SfuProxyController.cs
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
    public class SfuProxyController : BaseController
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<SfuProxyController> _logger;
        private readonly IChannelService _channelService;

        public SfuProxyController(
            IHttpClientFactory httpClientFactory,
            IChannelService channelService,
            ILogger<SfuProxyController> logger)
        {
            _httpClient = httpClientFactory.CreateClient("SFU");
            _channelService = channelService;
            _logger = logger;
        }

        [HttpPost("create-transport")]
public async Task<ActionResult<object?>> CreateTransport([FromBody] CreateTransportRequest request)
        {
            try
            {
                var userId = GetUserId();
                if (!userId.HasValue)
                    return Error("Unauthorized", 401);
                
                if (request.IsProducer)
                {
                    var channel = await _channelService.GetById(request.ChannelId);
                    if (channel?.UserId != userId)
                        return Error("Access denied", 403);
                }
                else
                {
                    var (isActive, _) = await _channelService.GetActiveSession(request.ChannelId);
                    if (!isActive)
                    {
                        return Error("Stream is not active", 400);
                    }
                }
                
                var response = await _httpClient.PostAsJsonAsync(
                    "/createWebRtcTransport", 
                    new { 
                        channelId = request.ChannelId,
                        isProducer = request.IsProducer 
                    });
                
                var content = await response.Content.ReadAsStringAsync();
                
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("SFU error: {Content}", content);
                }
                
                var result = JsonSerializer.Deserialize<object>(content);
                return Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error proxying to SFU");
                return Error("Internal server error", 500);
            }
        }

        [HttpPost("connect-transport")]
        public async Task<ActionResult<object?>> ConnectTransport([FromBody] ConnectTransportRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync("/connectTransport", request);
                var content = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<object>(content);
                return Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error connecting transport");
                return Error("Internal server error", 500);
            }
        }

        [HttpPost("produce")]
        public async Task<ActionResult<object?>> Produce([FromBody] ProduceRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync("/produce", request);
                var content = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<object>(content);
                return Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error producing");
                return Error("Internal server error", 500);
            }
        }

        [HttpPost("consume")]
        public async Task<ActionResult<object?>> Consume([FromBody] ConsumeRequest request)
        {
            try
            {
                var response = await _httpClient.PostAsJsonAsync("/consume", request);
                var content = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<object>(content);
                return Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error consuming");
                return Error("Internal server error", 500);
            }
        }

        [HttpGet("check-stream/{channelId}")]
        public async Task<ActionResult<object?>> CheckStream(int channelId)
        {
            try
            {
                var response = await _httpClient.GetAsync($"/api/check-stream/{channelId}");
                var content = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<object>(content);
                return Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking stream");
                return Error("Internal server error", 500);
            }
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