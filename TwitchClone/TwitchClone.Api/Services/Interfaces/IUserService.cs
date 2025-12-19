using TwitchClone.Api.DTOs.Auth;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services
{
    public interface IUserService
    {
        Task<User?> GetById(int id);
        Task<User?> GetByUsername(string username);
        Task UpdateUser(User user);
        Task UpdateProfile(int userId, UserProfileUpdateDto dto); // Add this method
        Task<bool> CheckUsernameExists(string username);
        Task<bool> CheckEmailExists(string email);
    }
}