using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;
using TwitchClone.Domain.Models;

namespace TwitchClone.Api.Services.Implementations
{
    public class AuthService : IAuthService
    {
        private readonly AppDbContext _db;
        private readonly JwtService _jwtService;

        public AuthService(AppDbContext db, JwtService jwtService)
        {
            _db = db;
            _jwtService = jwtService;
        }

        public async Task<User> Register(string username, string email, string password)
        {
            if (await _db.Users.AnyAsync(u => u.Username == username))
                throw new ArgumentException("Username уже используется");
            if (await _db.Users.AnyAsync(u => u.Email == email))
                throw new ArgumentException("Email уже используется");

            var user = new User
            {
                Username = username,
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                AvatarUrl = "/default-avatar.png",
                ChatColor = GenerateRandomColor(),
                CreatedAt = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            // Create channel for user
            var channel = new Channel
            {
                UserId = user.Id,
                Name = username,
                Description = "Описание канала пока пустое",
                CreatedAt = DateTime.UtcNow
            };
            _db.Channels.Add(channel);
            await _db.SaveChangesAsync();

            return user;
        }

        public async Task<(User? user, string? token)> Login(string username, string password)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
                return (null, null);

            var token = _jwtService.GenerateToken(user);
            return (user, token);
        }

        public async Task<User?> GetUserById(int userId)
        {
            return await _db.Users.FindAsync(userId);
        }

        public async Task<User?> GetUserByUsername(string username)
        {
            return await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        }

        private string GenerateRandomColor()
        {
            var random = new Random();
            return $"#{random.Next(0x1000000):X6}";
        }
    }
}
