import * as dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
dotenv.config();

export async function registerSlashCommands(guildID) {
  const commands = [
    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("connect your league account")
      .addStringOption((option) =>
        option
          .setName("ign")
          .setDescription("league username")
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("startup")
      .setDescription("adds/readds the chats and slash commands")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("forfeit")
      .setDescription("used to forfeit the match/ admit defeat")
      .addStringOption((option2) =>
        option2
          .setName("matchid")
          .setDescription("given on when match filled")
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("show")
      .setDescription("connect your league account")
      .addStringOption((option2) =>
        option2
          .setName("option")
          .setDescription("use 'option help' for all options")
          .setRequired(true)
          .addChoices({ name: "all", value: "all" })
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("matchmaker")
      .setDescription("building custom matches and tourneys")
      .addStringOption((option3) =>
        option3
          .setName("type")
          .setDescription("type of matchmaking")
          .setRequired(true)
          .addChoices(
            { name: "single", value: "single" },
            { name: "tournament", value: "tournament" }
          )
      )
      .addIntegerOption((option3) =>
        option3
          .setName("size")
          .setDescription("team sizes , players on each team(1-5)")
          .setRequired(true)
          .addChoices(
            { name: "1", value: 1 },
            { name: "2", value: 2 },
            { name: "3", value: 3 },
            { name: "4", value: 4 },
            { name: "5", value: 5 }
          )
      )
      .addBooleanOption((option3) =>
        option3
          .setName("skill")
          .setDescription(
            "set autofilled players based on match history and rank"
          )
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("delete")
      .setDescription(
        "remove all information about you from this bot including your league account and W/L ratio"
      )
      .toJSON(),
  ];
  // /verify harstuck dream
  // /verify ign
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  (async () => {
    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildID),
        { body: commands }
      );

      console.log("slash commands were registered successfully!");
    } catch (error) {
      console.log(`there was an error: ${error}`);
    }
  })();
}
