import * as dotenv from "dotenv";
import * as riot from "./riot.js";
import mysql from "mysql2";
import {
  Client,
  ContextMenuCommandInteraction,
  EmbedBuilder,
  Embed,
  IntentsBitField,
  Collector,
  ChannelType,
  PermissionsBitField,
} from "discord.js";
import { registerSlashCommands } from "./register-commands.js";

dotenv.config();
// required permissions see discord intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});
// set up the queue system for SQL
const pool = mysql
  .createPool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASS,
    database: process.env.SQL_DATABASE,
    supportBigNumbers: true,
  })
  .promise();
// const result = await pool.query("SELECT * FROM users");

client.on("ready", (c) => {
  console.log(`${c.user.username} is online`);
});
client.on("guildCreate", (guild) => {
  startUp(guild);
});
//commands
let mainTextChannel;
client.on("interactionCreate", async (interation) => {
  if (!interation.isChatInputCommand()) return;
  if (mainTextChannel === undefined) {
    const existingCategory = await interation.guild.channels.cache.find(
      (c) => c.name == "League Versus" && c.type == ChannelType.GuildCategory
    );
    mainTextChannel = await interation.guild.channels.cache.find(
      (c) =>
        c.name == "commands-chat" &&
        c.type == ChannelType.GuildText &&
        c.parent == existingCategory
    );
  }
  switch (interation.commandName) {
    case "startup":
      await startUp(interation.guild);
      interation.reply("setup complete");
      break;
    case "matchmaker":
      if (interation.channel !== mainTextChannel) {
        sendWrongChannelWarning(interation);
        break;
      }
      matchmaker(interation);
      break;
    case "verify":
      if (interation.channel !== mainTextChannel) {
        sendWrongChannelWarning(interation);
        break;
      }
      verify(interation);
      break;
    case "delete":
      if (interation.channel !== mainTextChannel) {
        sendWrongChannelWarning(interation);
        break;
      }
      deleteUser(interation);
      break;
    case "show":
      if (interation.channel !== mainTextChannel) {
        sendWrongChannelWarning(interation);
        break;
      }
      show(interation);
      break;
    case "forfeit":
      if (interation.channel !== mainTextChannel) {
        sendWrongChannelWarning(interation);
        break;
      }
      forfeitMatch(interation);
      break;
  }
});
async function sendWrongChannelWarning(interation) {
  await interation.reply(
    "this is the incorrect channel to use League Versus, use the commands-chat that was made from /startup"
  );
  setTimeout(() => {
    interation.deleteReply();
  }, 10000);
}
async function deleteMatchChannels(guild, matchID) {
  const existingCategory = await guild.channels.cache.find(
    (c) => c.name == `MATCH ${matchID}` && c.type == ChannelType.GuildCategory
  );
  const t1Voice = await guild.channels.cache.find(
    (c) =>
      c.name == "Team One" &&
      c.type == ChannelType.GuildVoice &&
      c.parent == existingCategory
  );
  const t2Voice = await guild.channels.cache.find(
    (c) =>
      c.name == "Team Two" &&
      c.type == ChannelType.GuildVoice &&
      c.parent == existingCategory
  );
  const discordObjects = [existingCategory, t1Voice, t2Voice];
  for (
    let objectIndex = 0;
    objectIndex < discordObjects.length;
    objectIndex++
  ) {
    if (discordObjects[objectIndex] !== undefined) {
      discordObjects[objectIndex].delete();
    }
  }
}
async function makeMatchChannels(guild, finalMatch, matchID) {
  let allParticipantsPerms = [];
  allParticipantsPerms.push({
    id: guild.id,
    deny: [PermissionsBitField.Flags.ViewChannel],
  });

  for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
    for (
      let playerIndex = 0;
      playerIndex < finalMatch[teamIndex].length;
      playerIndex++
    ) {
      allParticipantsPerms.push({
        id: finalMatch[teamIndex][playerIndex].id,
        allow: [PermissionsBitField.Flags.ViewChannel],
      });
    }
  }
  //create a hidden category only the whole match can see
  const matchCategory = await guild.channels.create({
    name: `MATCH ${matchID}`,
    type: ChannelType.GuildCategory,
    fetchReply: true,
    permissionOverwrites: allParticipantsPerms,
  });
  //create an all chat for that game

  await guild.channels.create({
    name: "all-chat",
    type: ChannelType.GuildText,
    parent: matchCategory,
    permissionOverwrites: allParticipantsPerms,
  });

  //create 2 voice channels that is hidden to only one team each
  let teamOnePermissions = [];
  teamOnePermissions.push({
    id: guild.id,
    deny: [PermissionsBitField.Flags.ViewChannel],
  });
  for (let playerIndex = 0; playerIndex < finalMatch[0].length; playerIndex++) {
    teamOnePermissions.push({
      id: finalMatch[0][playerIndex].id,
      allow: [PermissionsBitField.Flags.ViewChannel],
    });
  }
  const teamOneVoice = await guild.channels.create({
    name: "Team One",
    type: ChannelType.GuildVoice,
    parent: matchCategory,
    fetchReply: true,
    permissionOverwrites: teamOnePermissions,
  });

  let teamTwoPermissions = [];
  teamTwoPermissions.push({
    id: guild.id,
    deny: [PermissionsBitField.Flags.ViewChannel],
  });
  for (let playerIndex = 0; playerIndex < finalMatch[1].length; playerIndex++) {
    teamTwoPermissions.push({
      id: finalMatch[1][playerIndex].id,
      allow: [PermissionsBitField.Flags.ViewChannel],
    });
  }
  const teamTwoVoice = await guild.channels.create({
    name: "Team Two",
    type: ChannelType.GuildVoice,
    parent: matchCategory,
    fetchReply: true,
    permissionOverwrites: teamTwoPermissions,
  });
  //check if any of the players are in the waiting room voice channel and move them to the newly made voice channels
  const teamCalls = [teamOneVoice, teamTwoVoice];
  const existingCategory = await guild.channels.cache.find(
    (c) => c.name == "League Versus" && c.type == ChannelType.GuildCategory
  );
  if (existingCategory !== undefined) {
    for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
      for (
        let playerIndex = 0;
        playerIndex < finalMatch[teamIndex].length;
        playerIndex++
      ) {
        const member = await guild.members.cache.get(
          finalMatch[teamIndex][playerIndex].id
        );
        if (
          member !== undefined &&
          member.voice.channel !== null &&
          member.voice.channel.name === "Waiting Room"
        )
          member.voice.setChannel(teamCalls[teamIndex]);
      }
    }
  }
}
async function startUp(guild) {
  console.log(`League versus has joined ${guild.name}`);
  registerSlashCommands(guild.id);
  const existingCategory = await guild.channels.cache.find(
    (c) => c.name == "League Versus" && c.type == ChannelType.GuildCategory
  );
  if (existingCategory.name !== undefined) {
    console.log("it exist");
    const mainTextChannel = await guild.channels.cache.find(
      (c) =>
        c.name == "commands-chat" &&
        c.type == ChannelType.GuildText &&
        c.parent == existingCategory
    );
    const mainVoiceChannel = await guild.channels.cache.find(
      (c) =>
        c.name == "Waiting Room" &&
        c.type == ChannelType.GuildVoice &&
        c.parent == existingCategory
    );
    if (mainTextChannel === undefined) {
      await guild.channels.create({
        name: "commands-chat",
        type: ChannelType.GuildText,
        parent: existingCategory,
        fetchReply: true,
      });
    }
    if (mainVoiceChannel === undefined) {
      await guild.channels.create({
        name: "Waiting Room",
        type: ChannelType.GuildVoice,
        parent: existingCategory,
        fetchReply: true,
      });
    }
  } else {
    const mainCategory = await guild.channels.create({
      name: "League Versus",
      type: ChannelType.GuildCategory,
      fetchReply: true,
    });
    await guild.channels.create({
      name: "commands-chat",
      type: ChannelType.GuildText,
      parent: mainCategory,
    });
    await guild.channels.create({
      name: "Waiting Room",
      type: ChannelType.GuildVoice,
      parent: mainCategory,
    });
  }
}
function setSizeString(word, size) {
  while (word.length < size) {
    word += " ";
  }
  if (word.length > size) {
    word = word.substring(0, size);
  }
  return word;
}
export function array2sqlarray(array) {
  let arrayString = "(";
  for (let userIndex = 0; userIndex < array.length; userIndex++) {
    if (array[userIndex] === null) {
      arrayString += `${array[userIndex]}`;
    } else {
      arrayString += `\'${array[userIndex]}\'`;
    }
    if (userIndex + 1 !== array.length) {
      arrayString += ",";
    }
  }
  arrayString += ")";
  return arrayString;
}
async function checkVerify(userTable) {
  const idsOfTable = userTable.map((n) => n.id);
  if (idsOfTable.length !== 0) {
    const idsString = array2sqlarray(idsOfTable);
    const [responce] = await pool.query(
      `SELECT discord_id,verification FROM users WHERE discord_id in ${idsString}`
    );
    let playersNotVerified = [];
    const responceIdList = responce.map((n) => n.discord_id);
    //get all ids not found in the sqlResponse
    for (let userIndex = 0; userIndex < userTable.length; userIndex++) {
      if (!responceIdList.includes(userTable[userIndex].id)) {
        playersNotVerified.push(userTable[userIndex].id);
      }
    }
    for (let userIndex = 0; userIndex < responce.length; userIndex++) {
      if (responce[userIndex].verification !== -1) {
        playersNotVerified.push(responce[userIndex].discord_id);
      }
    }
    return playersNotVerified;
  } else {
    return [];
  }
}
async function sendVerificationWarning(users, originalMessage) {
  let warningMessage = "```";
  warningMessage +=
    "the following members were removed due to them not being verified:";
  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    warningMessage += "\n" + users[userIndex].globalName;
  }

  warningMessage += "```";
  const warningSent = await originalMessage.channel.send(warningMessage, {
    fetch: true,
  });
  setTimeout(() => {
    warningSent.delete();
  }, 10000);
}
async function finalizeMatch(matchTable, teamSize, skill, originalMessage) {
  if (skill) {
    //check if all the players are verified
    const teamOne = matchTable[0].filter((n) => n !== "------          ");
    const teamTwo = matchTable[1].filter((n) => n !== "------          ");
    const teamFill1 = matchTable[2].filter((n) => n !== "------          ");
    const teamFill2 = matchTable[3].filter((n) => n !== "------          ");
    const oneVerify = await checkVerify(teamOne);
    const twoVerify = await checkVerify(teamTwo);
    const fill1Verify = await checkVerify(teamFill1);
    const fill2Verify = await checkVerify(teamFill2);
    let allVerified = true;
    let unverifiedUsers = [];
    if (oneVerify.length > 0) {
      allVerified = false;
      for (let userIndex = 0; userIndex < oneVerify.length; userIndex++) {
        const currentUnverifiedIndex = matchTable[0].findIndex(
          (x) => x.id === oneVerify[userIndex]
        );
        unverifiedUsers.push(matchTable[0][currentUnverifiedIndex]);
        matchTable[0][currentUnverifiedIndex] = "------          ";
      }
    }
    if (twoVerify.length > 0) {
      allVerified = false;
      for (let userIndex = 0; userIndex < twoVerify.length; userIndex++) {
        const currentUnverifiedIndex = matchTable[1].findIndex(
          (user) => user.id === twoVerify[userIndex]
        );
        unverifiedUsers.push(matchTable[1][currentUnverifiedIndex]);
        matchTable[1][currentUnverifiedIndex] = "------          ";
      }
    }
    if (fill1Verify.length > 0) {
      allVerified = false;
      for (let userIndex = 0; userIndex < fill1Verify.length; userIndex++) {
        const currentUnverifiedIndex = matchTable[2].findIndex(
          (user) => user.id === fill1Verify[userIndex]
        );
        unverifiedUsers.push(matchTable[2][currentUnverifiedIndex]);
        matchTable[2][currentUnverifiedIndex] = "------          ";
      }
    }
    if (fill2Verify.length > 0) {
      allVerified = false;
      for (let userIndex = 0; userIndex < fill2Verify.length; userIndex++) {
        const currentUnverifiedIndex = matchTable[3].findIndex(
          (user) => user.id === fill2Verify[userIndex]
        );
        unverifiedUsers.push(matchTable[3][currentUnverifiedIndex]);
        matchTable[3][currentUnverifiedIndex] = "------          ";
      }
    }
    if (allVerified) {
      matchTable = await riot.balanceTeams(
        [teamOne, teamTwo, teamFill1, teamFill2],
        pool,
        teamSize
      );
      //snake draft based on point system
    } else {
      sendVerificationWarning(unverifiedUsers, originalMessage);
    }
    return { verified: allVerified, newMatchTable: matchTable };
  } else {
    //make a single list of both fill lists
    let fillList = [];
    console.log("started finailze match");
    //looking through fill1
    fillList = matchTable[2].filter((n) => n !== "------          ");
    console.log(`fill1 finished with while ${fillList}`);
    //looking through fill2

    fillList = [
      ...fillList,
      ...matchTable[3].filter((n) => n !== "------          "),
    ];

    //start looking for holes in team and fill it with a random autofill player
    // building team 1
    let teamOneTable = [];
    for (let teamOneIndex = 0; teamOneIndex < teamSize; teamOneIndex++) {
      if (matchTable[0][teamOneIndex] !== "------          ") {
        teamOneTable.push(matchTable[0][teamOneIndex]);
      } else {
        const randomIndex = Math.floor(Math.random() * fillList.length);
        teamOneTable.push(fillList[randomIndex]);
        fillList.splice(randomIndex, 1);
      }
    }
    // building team 2
    let teamTwoTable = [];
    for (let teamTwoIndex = 0; teamTwoIndex < teamSize; teamTwoIndex++) {
      if (matchTable[1][teamTwoIndex] !== "------          ") {
        teamTwoTable.push(matchTable[1][teamTwoIndex]);
      } else {
        const randomIndex = Math.floor(Math.random() * fillList.length);
        teamTwoTable.push(fillList[randomIndex]);
        fillList.splice(randomIndex, 1);
      }
    }
    const finalList = [teamOneTable, teamTwoTable];
    originalMessage.edit(
      "Finalized Matchmaking(no skill basis):\n" +
        array2discordTable(finalList, teamSize, true)
    );
    return { verified: true, newMatchTable: [] };
  }
}
function leaveRequest2matchTableString(
  matchTable,
  originalMessage,
  request,
  size
) {
  let personRemoved = false;
  for (let team = 0; team < 4; team++) {
    if (matchTable[team].includes(request.author)) {
      matchTable[team][matchTable[team].indexOf(request.author)] =
        "------          ";
      team = 4;
      personRemoved = true;
    }
  }
  if (personRemoved) {
    originalMessage.edit(
      array2discordTable(matchTable, size, false) +
        "TO Interact: reply to this message with |join 1| join 2 | join fill|leave"
    );
  }
  return matchTable;
}
async function joinRequest2matchTableString(
  matchTable,
  requestedTeam,
  originalMessage,
  request,
  size,
  collector,
  skill
) {
  //check what teams they are on and act accordingly
  for (let team = 0; team < 4; team++) {
    if (matchTable[team].includes(request.author)) {
      if (team === requestedTeam || (team === 3 && requestedTeam === 2)) {
        request.reply("you are already on this team");
        return matchTable;
      } else {
        matchTable[team][matchTable[team].indexOf(request.author)] =
          "------          ";
        team = 4;
      }
    }
  }
  //after removing them from the former team, add them to the new team
  let foundSpot = false;
  for (let playerIndex = 0; playerIndex < size; playerIndex++) {
    const currentPlayer = matchTable[requestedTeam][playerIndex];
    if (currentPlayer.id === undefined) {
      matchTable[requestedTeam][playerIndex] = request.author;
      foundSpot = true;
      playerIndex = size;
    }
  }
  // checking the second fill array to see if there is spots there
  if (!foundSpot && requestedTeam === 2) {
    for (let playerIndex = 0; playerIndex < size; playerIndex++) {
      const currentPlayer = matchTable[3][playerIndex];
      if (currentPlayer.id === undefined) {
        matchTable[3][playerIndex] = request.author;
        foundSpot = true;
        playerIndex = size;
      }
    }
  }
  //match has been filled
  if (countPlayers(matchTable, size) >= size * 2) {
    //game filled
    originalMessage.edit("attempting to finalize matchmaker into a match");
    const finalInfo = await finalizeMatch(
      matchTable,
      size,
      skill,
      originalMessage
    );
    if (finalInfo.verified) {
      const matchID = await matchSqlCreator(finalInfo.newMatchTable, size);
      originalMessage.edit(
        array2discordTable(finalInfo.newMatchTable, size, true) +
          `Match ID: ${matchID}`
      );
      makeMatchChannels(originalMessage.guild, matchTable, matchID);
      collector.stop();
    } else {
      originalMessage.edit(
        array2discordTable(finalInfo.newMatchTable, size, false) +
          "TO Interact: reply to this message with |join 1| join 2 | join fill|leave"
      );
      return finalInfo.newMatchTable;
    }
  } else if (!foundSpot) {
    request.reply("requested team is full");
    return matchTable;
  } else {
    originalMessage.edit(
      array2discordTable(matchTable, size, false) +
        "TO Interact: reply to this message with |join 1| join 2 | join fill|leave"
    );
    return matchTable;
  }
}

function countPlayers(array, teamSize) {
  let totalCount = 0;
  for (let teamIndex = 0; teamIndex < 4; teamIndex++) {
    for (let playerIndex = 0; playerIndex < teamSize; playerIndex++) {
      if (array[teamIndex][playerIndex] !== "------          ") totalCount++;
    }
  }
  return totalCount;
}
function array2discordTable(array, teamSize, finalizedVersion) {
  // [[team 1][team 2][team fill1][team fill2]]
  let outputString = "```";
  if (finalizedVersion) outputString += "Team 1          |Team 2          |\n";
  if (!finalizedVersion)
    outputString += "Team 1          |Team 2          |Autofilled\n";
  for (var columnIndex = 0; columnIndex < teamSize; columnIndex++) {
    for (var rowIndex = 0; rowIndex < array.length; rowIndex++) {
      const currentUser = array[rowIndex][columnIndex];
      if (currentUser === "------          ") {
        outputString += "------          " + "|";
      } else {
        outputString += setSizeString(currentUser.globalName, 16) + "|";
      }
    }
    outputString += "\n";
  }
  outputString += "```";
  return outputString;
}
function makeid(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}
async function forfeitMatch(interation) {
  //look for match
  const matchID = interation.options.getString("matchid");
  let match = [];
  if (matchID.length === 10) {
    [match] = await pool.query(`SELECT * FROM matches WHERE id = ?`, [matchID]);
  }
  if (match.length === 0) {
    interation.reply("Invalid matchID");
    setTimeout(() => {
      interation.deleteReply();
    }, 10000);
  } else {
    if (match[0].winner !== -1) {
      interation.reply("match already has a determined winner");
      setTimeout(() => {
        interation.deleteReply();
      }, 10000);
      return;
    }
    const participants = [
      [
        match[0].participant_1,
        match[0].participant_2,
        match[0].participant_3,
        match[0].participant_4,
        match[0].participant_5,
      ],
      [
        match[0].participant_6,
        match[0].participant_7,
        match[0].participant_8,
        match[0].participant_9,
        match[0].participant_10,
      ],
    ];
    let losingTeam = -1;
    let winningTeam = -1;
    if (participants[0].includes(interation.user.id)) {
      losingTeam = 0;
      winningTeam = 1;
    } else if (participants[1].includes(interation.user.id)) {
      losingTeam = 1;
      winningTeam = 0;
    } else {
      interation.reply("you are not apart of this game, and cannot forfeit it");
      setTimeout(() => {
        interation.deleteReply();
      }, 10000);
      return;
    }
    for (let playerIndex = 0; playerIndex < 5; playerIndex++) {
      //todo
      //get the win from the winners then update the win = formerwin+1
      if (participants[winningTeam][playerIndex] !== null) {
        const [currentPlayer] = await pool.query(
          `SELECT win FROM users WHERE discord_id = ${participants[winningTeam][playerIndex]}`
        );
        console.log(`wins found:${currentPlayer[0].win}`);
        await pool.query(
          `UPDATE users SET win = ${
            currentPlayer[0].win + 1
          } Where discord_id = ${participants[winningTeam][playerIndex]}`
        );
      }
    }
    for (let playerIndex = 0; playerIndex < 5; playerIndex++) {
      if (participants[losingTeam][playerIndex] !== null) {
        const [currentPlayer] = await pool.query(
          `SELECT lost FROM users WHERE discord_id = ${participants[losingTeam][playerIndex]}`
        );
        console.log(`losts found:${currentPlayer[0].lost}`);
        await pool.query(
          `UPDATE users SET lost = ${
            currentPlayer[0].lost + 1
          } WHERE discord_id = ${participants[losingTeam][playerIndex]}`
        );
      }
    }
    await pool.query(
      `UPDATE matches SET winner = ${winningTeam} WHERE id = \'${matchID}\'`
    );
    deleteMatchChannels(interation.guild, matchID);
    interation.reply(
      "match found, and wins/losses updated. Better luck next time."
    );
  }
}
async function matchSqlCreator(matchTable, teamSize) {
  // checking that the unique id is unique
  let randomID;
  let attempt = [];
  do {
    randomID = makeid(10);
    [attempt] = await pool.query(
      `SELECT id FROM matches WHERE id = \'${randomID}\'`
    );
  } while (attempt.length != 0);
  // placing all people
  let values = [randomID];
  for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
    for (let playerIndex = 0; playerIndex < 5; playerIndex++) {
      if (playerIndex >= teamSize) {
        values.push(null);
      } else {
        values.push(matchTable[teamIndex][playerIndex].id);
      }
    }
  }
  //showing that there is no winner decided
  values.push(-1);
  await pool.query(`INSERT INTO matches(id,
    participant_1,
    participant_2,
    participant_3,
    participant_4,
    participant_5,
    participant_6,
    participant_7,
    participant_8,
    participant_9,
    participant_10,
    winner) VALUES ${array2sqlarray(values)}`);
  return randomID;
}
async function matchmaker(interation) {
  const type = interation.options.getString("type");
  const teamSize = interation.options.getInteger("size");
  const skill = interation.options.getBoolean("skill");
  let teamTable = [];
  for (let i = 0; i < 4; i++) {
    var column = [];
    for (let j = 0; j < teamSize; j++) {
      //column[j] = "------          ";
      column.push("------          ");
    }
    teamTable.push(column);
  }
  const teamTableString =
    array2discordTable(teamTable, teamSize, false) +
    "TO Interact: reply to this message with |join 1| join 2 | join fill|leave";

  const filter = (messageInChannel) => {
    return (
      messageInChannel.content.length > 4 &&
      (messageInChannel.content.includes("leave") ||
        (messageInChannel.content.substring(0, 4) === "join" &&
          (messageInChannel.content.includes("1") ||
            messageInChannel.content.includes("2") ||
            messageInChannel.content.includes("fill"))))
    );
  };
  const msg = await interation.reply({
    content: teamTableString,
    fetchReply: true,
  });
  try {
    const collector = msg.channel.createMessageCollector({
      filter: filter,
      time: 60000,
    });

    collector.on("collect", async (m) => {
      //if the message is a reply to the original msg
      let currentCount = countPlayers(teamTable, teamSize);
      if (
        m.reference !== null &&
        m.reference.messageId === msg.id &&
        currentCount < teamSize * 2
      ) {
        if (m.content.includes("leave")) {
          leaveRequest2matchTableString(teamTable, msg, m, teamSize);
        }
        if (m.content.substring(0, 4) === "join") {
          console.log(`${m.author.globalName} has joined team 1`);
          if (m.content.includes("1")) {
            teamTable = await joinRequest2matchTableString(
              teamTable,
              0,
              msg,
              m,
              teamSize,
              collector,
              skill
            );
          } else if (m.content.includes("2")) {
            console.log(`${m.author.globalName} has joined team 2`);
            teamTable = await joinRequest2matchTableString(
              teamTable,
              1,
              msg,
              m,
              teamSize,
              collector,
              skill
            );
          } else {
            console.log(`${m.author.globalName} has joined team fill`);
            teamTable = await joinRequest2matchTableString(
              teamTable,
              2,
              msg,
              m,
              teamSize,
              collector,
              skill
            );
          }
        }
      }
    });
    collector.on("end", (collected) => {
      const finalPlayerCount = countPlayers(teamTable, teamSize);
      console.log(`collecter ended with ${finalPlayerCount} players`);
      if (finalPlayerCount < teamSize * 2) {
        msg.edit("match closed while not filling");
      } else {
      }
    });
  } catch (error) {
    console.log("we caught one");
    console.log(error);
  }
}

async function show(interation) {
  switch (interation.options.getString("option")) {
    case "all":
      const [everything] = await pool.query(
        `SELECT league_username, win, lost, available FROM users WHERE verification = -1`
      );
      var everythingString = "";
      for (var i = 0; i < everything.length; i++) {
        everythingString += `USER: ${setSizeString(
          everything[i].league_username,
          16
        )} | WIN: ${setSizeString(everything[i].win, 5)} LOST: ${setSizeString(
          everything[i].lost,
          5
        )} \n`;
      }
      interation.reply(`\`\`\`${everythingString}\`\`\``);
      break;
    default:
      interation.reply('invalid option for show, use "show help" for options');
      break;
  }
}

async function deleteUser(interation) {
  const deleted = await pool.query(
    `DELETE FROM users Where discord_id=${interation.user.id}`
  );
  if (deleted[0].affectedRows > 0) {
    interation.reply("user deleted");
  } else {
    interation.reply("no user to delete");
  }
}

async function verify(interation) {
  const ign = interation.options.getString("ign");
  const [user] = await pool.query(
    `SELECT * FROM users WHERE discord_id = ${interation.user.id}`
  );
  // hes not in the list and given a blank template with a needed icon
  if (user.length === 0) {
    // user is not in database yet and needs to be added and verified
    const currentID = await riot.getIconID(ign);
    if (currentID === undefined) {
      // the username given does not exist
      interation.reply("The username given does not exist");
      return;
    }
    //for more fancy things 0 - 28 icons exists on account creation
    var requestedID = 0;
    if (currentID === 0) {
      requestedID = 1;
    }
    const requestedIconEmbed = new EmbedBuilder()
      .setColor(0x34383d)
      .setTitle("Hello Stranger")
      .setDescription(
        "Please set your league icon as the following and reuse the verify command along with the same ign"
      )
      .setImage(
        `https://ddragon.leagueoflegends.com/cdn/13.9.1/img/profileicon/${requestedID}.png`
      );
    interation.reply({ embeds: [requestedIconEmbed] });
    await pool.query(
      `INSERT INTO users (discord_id,
      verification,
      league_username,
      win,
      lost, 
      available) VALUES (${interation.user.id}, ${requestedID},?, 0, 0, true)`,
      [ign]
    );
  } else {
    // user has already been verified with an account and tied that to their winrates
    if (user[0].verification === -1) {
      interation.reply(`I already know you, ${user[0].league_username}`);
    } else {
      // the user is still in the verification process
      const currentIconID = await riot.getIconID(ign);
      if (user[0].league_username !== ign) {
        //user is in verification process but used a new ign(trying to change which account hes verifying)
        var newVerification = user[0].verification;
        if (user[0].verification === currentIconID) {
          // if by chance they already had the icon on the new account switch it to the other
          if (newVerification === 0) {
            newVerification = 1;
          } else {
            newVerification = 0;
          }
        }
        await pool.query(
          `UPDATE users SET verification = ${newVerification}, league_username = ? WHERE discord_id = ${interation.user.id}`,
          [ign]
        );
        const rerequestedIconEmbed = new EmbedBuilder()
          .setColor(0x34383d)
          .setTitle("Hello again Stranger")
          .setDescription(
            `You're using a new league username, please set the icon to the following on ${ign}`
          )
          .setImage(
            `https://ddragon.leagueoflegends.com/cdn/13.9.1/img/profileicon/${newVerification}.png`
          );
        interation.reply({ embeds: [rerequestedIconEmbed] });
      } else {
        //user is in verification process and testing trying to verify with a previously set name

        if (currentIconID === user[0].verification) {
          await pool.query(
            `UPDATE users SET verification = -1 WHERE discord_id = ${user[0].discord_id}`
          );
          interation.reply(
            `Successfuly verified as ${user[0].league_username}`
          );
        } else {
          interation.reply(`failed to verify as ${user[0].league_username}`);
        }
      }
    }
  }
}

client.login(process.env.DISCORD_TOKEN);
