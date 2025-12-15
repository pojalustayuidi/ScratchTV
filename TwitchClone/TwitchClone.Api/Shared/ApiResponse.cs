// Shared/ApiResponse.cs
namespace TwitchClone.Api.Shared
{
    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public T? Data { get; set; }
        public Dictionary<string, string[]>? Errors { get; set; }

        public static ApiResponse<T> SuccessResponse(T data, string? message = null)
        {
            return new ApiResponse<T>
            {
                Success = true,
                Data = data,
                Message = message
            };
        }

        public static ApiResponse<T> ErrorResponse(string message, Dictionary<string, string[]>? errors = null)
        {
            return new ApiResponse<T>
            {
                Success = false,
                Message = message,
                Errors = errors
            };
        }
    }

    public static class ApiResponse
    {
        public static object Success(object data, string? message = null)
        {
            return new
            {
                success = true,
                data,
                message
            };
        }

        public static object Error(string message, object? errors = null)
        {
            return new
            {
                success = false,
                message,
                errors
            };
        }
    }
}