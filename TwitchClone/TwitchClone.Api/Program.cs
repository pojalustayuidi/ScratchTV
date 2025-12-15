using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using TwitchClone.Api.Data;
using TwitchClone.Api.Services;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Mvc;
using TwitchClone.Api.Hubs;

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
                    (path.StartsWithSegments("/chathub") || 
                     path.StartsWithSegments("/streamhub") ||
                     path.StartsWithSegments("/sfuhub")))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

// === Services ===
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<ChannelService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddScoped<IChannelRepository, ChannelRepository>();
builder.Services.AddScoped<IStreamService, StreamService>();

// === Viewer Tracker Service ===
builder.Services.AddScoped<IViewerTrackerService, ViewerTrackerService>();

// === SFU Sync Service ===
builder.Services.AddSingleton<SfuSyncService>();

// === SignalR ===
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy = null;
    });

// === HttpContext Accessor ===
builder.Services.AddHttpContextAccessor();

// === Background Services (Упрощаем, убираем проблемные) ===
builder.Services.AddHostedService<StreamSessionCleanupService>();
// Убираем ViewerConnectionCleanupService и SfuHeartbeatService пока что

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
            "http://localhost:5173",     // Frontend
            "http://localhost:3000",     // Node.js SFU
            "http://localhost:3001"      // Node.js dev сервер
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
        Version = "v1"
    });
    
    // Добавляем поддержку JWT в Swagger
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
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
});

// === HttpClient для SFU ===
builder.Services.AddHttpClient("SfuClient", client =>
{
    client.BaseAddress = new Uri("http://localhost:3000");
    client.Timeout = TimeSpan.FromSeconds(10);
});

var app = builder.Build();

// === Middleware Pipeline ===
app.UseCors("DevPolicy");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "TwitchClone API v1");
        c.RoutePrefix = string.Empty;
    });
}

app.UseAuthentication();
app.UseAuthorization();

// Serve wwwroot
var wwwroot = Path.Combine(builder.Environment.ContentRootPath, "wwwroot");
if (!Directory.Exists(wwwroot))
{
    Directory.CreateDirectory(wwwroot);
}

app.UseStaticFiles();

// === Endpoint Mapping ===
app.MapControllers();

// SignalR Hubs
app.MapHub<ChatHub>("/chathub");
app.MapHub<StreamHub>("/streamhub");
app.MapHub<SfuHub>("/sfuhub");

app.Run();