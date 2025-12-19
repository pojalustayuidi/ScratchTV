using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using TwitchClone.Api.Data;
using TwitchClone.Api.Services;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Hubs;
using TwitchClone.Api.Services.Implementations;
using TwitchClone.Api.BackgroundServices;

var builder = WebApplication.CreateBuilder(args);

// === Configuration ===
var configuration = builder.Configuration;

// === DbContext ===
var connectionString = configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Строка подключения не настроена");
builder.Services.AddDbContext<AppDbContext>(opt => opt.UseNpgsql(connectionString));

// === JWT Settings ===
builder.Services.Configure<JwtSettings>(configuration.GetSection("JwtSettings"));

var jwtSettings = configuration.GetSection("JwtSettings").Get<JwtSettings>()
    ?? throw new InvalidOperationException("JWT настройки не загружены");
var key = Encoding.UTF8.GetBytes(jwtSettings.Key);

// === Authentication ===
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.RequireHttpsMetadata = false;
        opt.SaveToken = true;
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ClockSkew = TimeSpan.Zero
        };
        
        // КОНФИГУРАЦИЯ ДЛЯ SIGNALR
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                
                // Для всех SignalR hubs
                if (!string.IsNullOrEmpty(accessToken) && 
                    (path.StartsWithSegments("/hubs/chat") || 
                     path.StartsWithSegments("/hubs/stream") ||
                     path.StartsWithSegments("/hubs/sfu")))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

// === Services Registration (ИСПРАВЛЕНО - используем интерфейсы) ===

// Core Services
builder.Services.AddScoped<JwtService>();

// Auth Services
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();

// Channel & Stream Services
builder.Services.AddScoped<IChannelService, ChannelService>();
builder.Services.AddScoped<IStreamService, StreamService>();

// Subscription Services
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();

// Viewer Tracker Services
builder.Services.AddScoped<IViewerTrackerService, ViewerTrackerService>();

// SFU Services
builder.Services.AddScoped<ISfuSyncService, SfuSyncService>();
builder.Services.AddHostedService<SfuHeartbeatService>();

// === SignalR ===
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy = null;
    });

// === HttpContext Accessor ===
builder.Services.AddHttpContextAccessor();

// === Background Services ===
builder.Services.AddHostedService<StreamSessionCleanupService>();

// === Controllers ===
builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(e => e.Value?.Errors.Count > 0)
                .ToDictionary(
                    e => e.Key,
                    e => e.Value!.Errors.Select(err => err.ErrorMessage).ToArray()
                );

            return new BadRequestObjectResult(new
            {
                success = false,
                message = "Ошибка валидации",
                errors
            });
        };
    });

// === CORS ===
builder.Services.AddCors(opt =>
{
    opt.AddPolicy("DevPolicy", policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",     // Frontend (Vite/React)
            "http://localhost:3000",     // Node.js SFU
            "http://localhost:3001",     // Node.js dev сервер
            "http://localhost:8080"      // Дополнительный порт
        )
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
    });
});

// === Swagger ===
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "TwitchClone API",
        Version = "v1",
        Description = "API для стриминговой платформы"
    });
    
    // Добавляем поддержку JWT в Swagger
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: 'Bearer {token}'",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
    
    // Включаем XML комментарии если есть
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }
});

// === HttpClient для SFU ===
builder.Services.AddHttpClient("SFU", client =>
{
    client.BaseAddress = new Uri("http://localhost:3000");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});

var app = builder.Build();

// === Middleware Pipeline ===

// CORS должен быть первым
app.UseCors("DevPolicy");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "TwitchClone API v1");
        c.RoutePrefix = "swagger";
        c.DisplayRequestDuration();
    });
}

app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

// === Endpoint Mapping ===
app.MapControllers();

// SignalR Hubs
app.MapHub<ChatHub>("/hubs/chat");
app.MapHub<StreamHub>("/hubs/stream");
app.MapHub<SfuHub>("/hubs/sfu");

// Health check endpoint
app.MapGet("/health", () => new 
{ 
    status = "healthy", 
    timestamp = DateTime.UtcNow,
    environment = app.Environment.EnvironmentName 
});

// === Database Migration ===
try
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    
    // Автоматическое применение миграций
    if (dbContext.Database.GetPendingMigrations().Any())
    {
        dbContext.Database.Migrate();
        Console.WriteLine("Миграции применены успешно");
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Ошибка при применении миграций: {ex.Message}");
}

app.Run();