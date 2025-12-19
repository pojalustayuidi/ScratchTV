using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.DTOs.Auth;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services.Implementations
{
    public class UserService : IUserService
    {
        private readonly AppDbContext _db;

        public UserService(AppDbContext db)
        {
            _db = db;
        }

        public async Task<User?> GetById(int id)
        {
            return await _db.Users.FindAsync(id);
        }

        public async Task<User?> GetByUsername(string username)
        {
            return await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        }

        public async Task UpdateUser(User user)
        {
            _db.Users.Update(user);
            await _db.SaveChangesAsync();
        }

        public async Task UpdateProfile(int userId, UserProfileUpdateDto dto)
        {
            var user = await GetById(userId);
            if (user == null) return;

            if (!string.IsNullOrWhiteSpace(dto.Email) && dto.Email != user.Email)
            {
                if (await CheckEmailExists(dto.Email))
                    throw new ArgumentException("Email уже используется");
                user.Email = dto.Email;
            }

            if (!string.IsNullOrWhiteSpace(dto.AvatarUrl))
                user.AvatarUrl = dto.AvatarUrl;

            if (!string.IsNullOrWhiteSpace(dto.ChatColor))
                user.ChatColor = dto.ChatColor;

            await UpdateUser(user);
        }

        public async Task<bool> CheckUsernameExists(string username)
        {
            return await _db.Users.AnyAsync(u => u.Username == username);
        }

        public async Task<bool> CheckEmailExists(string email)
        {
            return await _db.Users.AnyAsync(u => u.Email == email);
        }
    }
}