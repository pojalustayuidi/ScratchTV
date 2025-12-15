using Microsoft.EntityFrameworkCore;
using TwitchClone.Api.Data;
using TwitchClone.Api.Models;

namespace TwitchClone.Api.Services
{
    public class UserService
    {
        private readonly AppDbContext _db;
        public UserService(AppDbContext db) => _db = db;

        public async Task<User?> GetById(int id) => await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        public async Task UpdateUser(User user)
{
    _db.Users.Update(user);
    await _db.SaveChangesAsync();
}
        


        public async Task<User?> GetByUsername(string username) => await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
    }
}
