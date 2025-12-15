using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using TwitchClone.Api.Hubs;

namespace TwitchClone.Api.Services
{
    public class SfuSyncService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IHubContext<StreamHub> _streamHub;
        private readonly ILogger<SfuSyncService> _logger;
        
        public SfuSyncService(
            IHttpClientFactory httpClientFactory,
            IHubContext<StreamHub> streamHub,
            ILogger<SfuSyncService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _streamHub = streamHub;
            _logger = logger;
        }
        
        // Проверить, работает ли стрим в SFU
        public async Task<bool> IsStreamActiveInSfu(int channelId)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("SfuClient");
                var response = await client.GetAsync($"/api/check-stream/{channelId}");
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var result = JsonSerializer.Deserialize<SfuStreamStatus>(content);
                    return result?.IsLive ?? false;
                }
                
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking SFU stream status for channel {ChannelId}", channelId);
                return false;
            }
        }
        
        // Уведомить SFU о начале стрима
        public async Task<bool> NotifySfuStreamStarted(int channelId, string? sessionId)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("SfuClient");
                var payload = new { channelId, sessionId };
                var response = await client.PostAsJsonAsync("/api/stream/start", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error notifying SFU about stream start for channel {ChannelId}", channelId);
                return false;
            }
        }
        
        // Уведомить SFU о завершении стрима
        public async Task<bool> NotifySfuStreamStopped(int channelId, string? sessionId)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("SfuClient");
                var payload = new { channelId, sessionId };
                var response = await client.PostAsJsonAsync("/api/stream/stop", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error notifying SFU about stream stop for channel {ChannelId}", channelId);
                return false;
            }
        }
        
        // Получить количество зрителей из SFU
        public async Task<int> GetViewersFromSfu(int channelId)
        {
            try
            {
                var client = _httpClientFactory.CreateClient("SfuClient");
                var response = await client.GetAsync($"/api/viewers/{channelId}");
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var result = JsonSerializer.Deserialize<SfuViewerCount>(content);
                    return result?.Count ?? 0;
                }
                
                return 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting viewers from SFU for channel {ChannelId}", channelId);
                return 0;
            }
        }
        
        // Синхронизировать счетчики зрителей
        public async Task SyncViewerCounts(int channelId)
        {
            try
            {
                var sfuViewers = await GetViewersFromSfu(channelId);
                await _streamHub.Clients.Group($"channel_{channelId}")
                    .SendAsync("ViewersSynced", new
                    {
                        ChannelId = channelId,
                        SfuViewers = sfuViewers,
                        Timestamp = DateTime.UtcNow
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing viewer counts for channel {ChannelId}", channelId);
            }
        }
        
        private class SfuStreamStatus
        {
            public bool IsLive { get; set; }
            public string? SessionId { get; set; }
        }
        
        private class SfuViewerCount
        {
            public int ChannelId { get; set; }
            public int Count { get; set; }
        }
    }
}