using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services
{
    public interface IAuthService
    {
        Task<User> Register(string username, string email, string password);
        Task<(User? user, string? token)> Login(string username, string password);
        Task<User?> GetUserById(int userId); 
        Task<User?> GetUserByUsername(string username);
    }
}