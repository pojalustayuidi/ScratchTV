using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TwitchClone.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionFieldsToChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CurrentSessionId",
                table: "Channels",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastPingAt",
                table: "Channels",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SessionStartedAt",
                table: "Channels",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CurrentSessionId",
                table: "Channels");

            migrationBuilder.DropColumn(
                name: "LastPingAt",
                table: "Channels");

            migrationBuilder.DropColumn(
                name: "SessionStartedAt",
                table: "Channels");
        }
    }
}
