import { RiotAPI, RiotAPITypes, PlatformId } from "@fightmegg/riot-api";
import { array2sqlarray } from "./index.js";
import * as dotenv from "dotenv";
import mysql, { authPlugins } from "mysql2";
dotenv.config();
const rAPI = new RiotAPI(process.env.RIOT_TOKEN);
const leagueTiers = new Map();
leagueTiers.set("UNRANKED", 300);
leagueTiers.set("IRON", 100);
leagueTiers.set("BRONZE", 200);
leagueTiers.set("SILVER", 300);
leagueTiers.set("GOLD", 400);
leagueTiers.set("PLATINUM", 500);
leagueTiers.set("EMERALD", 600);
leagueTiers.set("DIAMOND", 700);
leagueTiers.set("MASTER", 800);
leagueTiers.set("GRANDMASTER", 900);
leagueTiers.set("CHALLENGER", 1000);

const leagueRanks = new Map();
leagueRanks.set("I", 80);
leagueRanks.set("II", 60);
leagueRanks.set("III", 40);
leagueRanks.set("IV", 20);

export async function getIconID(summonerName) {
  try {
    const summoner = await rAPI.summoner.getBySummonerName({
      region: PlatformId.NA1,
      summonerName: summonerName,
    });
    return summoner.profileIconId;
  } catch (error) {
    console.log(error);
  }
}
export async function balanceTeams(matchTable, sqlPool, teamSize) {
  const teamOneSqlArray = array2sqlarray(
    matchTable[0].map((player) => player.id)
  );
  const teamTwoSqlArray = array2sqlarray(
    matchTable[1].map((player) => player.id)
  );
  const fill1SqlArray = array2sqlarray(
    matchTable[2].map((player) => player.id)
  );
  const fill2SqlArray = array2sqlarray(
    matchTable[3].map((player) => player.id)
  );
  if (matchTable[0].length === teamSize && matchTable[1].length === teamSize) {
    // need to add a match maker
    return [matchTable[0], matchTable[1]];
  }
  let teamOneScoreTotal = 0;
  let teamTwoScoreTotal = 0;
  let teamOneInfo = [];
  let teamTwoInfo = [];
  if (matchTable[0].length !== 0) {
    [teamOneInfo] = await sqlPool.query(
      `SELECT discord_id, league_username, win, lost FROM users WHERE discord_id IN ${teamOneSqlArray}`
    );
    teamOneInfo = await Promise.all(
      teamOneInfo.map(async (player) => {
        return {
          id: player.discord_id,
          globalName: player.league_username,
          rating: await leagueUsername2pointRating(
            player.league_username,
            player.win,
            player.lost
          ),
        };
      })
    );
    teamOneScoreTotal = teamOneInfo.reduce((total, currentValue) => {
      return total + currentValue.rating;
    }, 0);
  }
  if (matchTable[1].length !== 0) {
    [teamTwoInfo] = await sqlPool.query(
      `SELECT discord_id, league_username, win, lost FROM users WHERE discord_id IN ${teamTwoSqlArray}`
    );
    teamTwoInfo = await Promise.all(
      teamTwoInfo.map(async (player) => {
        return {
          id: autofilled.discord_id,
          globalName: autofilled.league_username,
          rating: await leagueUsername2pointRating(
            player.league_username,
            player.win,
            player.lost
          ),
        };
      })
    );
    teamTwoScoreTotal = teamTwoInfo.reduce((total, currentValue) => {
      total + currentValue.rating;
    }, 0);
  }
  let [fillInfo] = await sqlPool.query(
    `SELECT discord_id, league_username, win, lost FROM users WHERE discord_id IN ${fill1SqlArray}`
  );
  if (matchTable[3].length !== 0) {
    const [fill2Info] = await sqlPool.query(
      `SELECT discord_id, league_username, win, lost FROM users WHERE discord_id IN ${fill2SqlArray}`
    );
    fillInfo = [...fillInfo, ...fill2Info];
  }
  let fillPlayers = await Promise.all(
    fillInfo.map(async (autofilled) => {
      return {
        id: autofilled.discord_id,
        globalName: autofilled.league_username,
        rating: await leagueUsername2pointRating(
          autofilled.league_username,
          autofilled.win,
          autofilled.lost
        ),
      };
    })
  );
  console.log(
    `team one: ${teamOneScoreTotal}, team two: ${teamTwoScoreTotal}, fill players count:\n ${fillPlayers.length}`
  );
  //we snake draft the players of the highest rank to the team with the fewest points until that team is full then we are going to put the rest on the tream thats not full

  if (teamOneInfo.length === 0) {
    //add the highest rank avalible in fill here
    const highestFillIndex = getHighestPlayerIndex(fillPlayers);
    teamOneScoreTotal += fillPlayers[highestFillIndex].rating;
    teamOneInfo.push(fillPlayers[highestFillIndex]);
    fillPlayers.splice(highestFillIndex, 1);
  } else if (teamTwoInfo.length === 0) {
    //add the highest rank avalible in fill here
    const highestFillIndex = getHighestPlayerIndex(fillPlayers);
    teamTwoScoreTotal += fillPlayers[highestFillIndex].rating;
    teamTwoInfo.push(fillPlayers[highestFillIndex]);
    fillPlayers.splice(highestFillIndex, 1);
  }

  while (teamOneInfo.length !== teamSize || teamTwoInfo.length !== teamSize) {
    const teamOneLength = teamOneInfo.length;
    const teamTwoLength = teamTwoInfo.length;
    if (teamOneLength !== teamSize && teamTwoLength !== teamSize) {
      //compare averages if the totals are not equal, otherwise just add the highest to one of the teams
      if (teamOneScoreTotal > teamTwoScoreTotal) {
        const highestFillIndex = getHighestPlayerIndex(fillPlayers);
        teamOneScoreTotal += fillPlayers[highestFillIndex].rating;
        teamOneInfo.push(fillPlayers[highestFillIndex]);
        fillPlayers.splice(highestFillIndex, 1);
      } else {
        const highestFillIndex = getHighestPlayerIndex(fillPlayers);
        teamTwoScoreTotal += fillPlayers[highestFillIndex].rating;
        teamTwoInfo.push(fillPlayers[highestFillIndex]);
        fillPlayers.splice(highestFillIndex, 1);
      }
    } else {
      // fill in the rest of the players
      if (teamOneLength !== teamSize) {
        const highestFillIndex = getHighestPlayerIndex(fillPlayers);
        teamOneScoreTotal += fillPlayers[highestFillIndex].rating;
        teamOneInfo.push(fillPlayers[highestFillIndex]);
        fillPlayers.splice(highestFillIndex, 1);
      } else if (teamTwoLength !== teamSize) {
        const highestFillIndex = getHighestPlayerIndex(fillPlayers);
        teamTwoScoreTotal += fillPlayers[highestFillIndex].rating;
        teamTwoInfo.push(fillPlayers[highestFillIndex]);
        fillPlayers.splice(highestFillIndex, 1);
      }
    }
  }
  // console.log("team one:");
  // console.log(teamOneInfo);
  // console.log("team two:");
  // console.log(teamTwoInfo);
  // console.log("fill:");
  // console.log(fillPlayers);
  return [teamOneInfo, teamTwoInfo];
}
function getHighestPlayerIndex(playerList) {
  let highestScoreIndex = 0;
  for (let playerIndex = 1; playerIndex < playerList.length; playerIndex++) {
    if (playerList[playerIndex].rating > playerList[highestScoreIndex].rating)
      highestScoreIndex = playerIndex;
  }
  return highestScoreIndex;
  //return index of highest player
}
async function leagueUsername2pointRating(league_username, mywins, myLoses) {
  try {
    const summoner = await rAPI.summoner.getBySummonerName({
      region: PlatformId.NA1,
      summonerName: league_username,
    });
    //gets ranks(tier and rank), win/loss, hotstreak, inactive
    const summonerInfo = await rAPI.league.getEntriesBySummonerId({
      region: PlatformId.NA1,
      summonerId: summoner.id,
    });
    const [soloque] = summonerInfo.filter(
      (rankInfos) => rankInfos.queueType === "RANKED_SOLO_5x5"
    );
    const [flex] = summonerInfo.filter(
      (rankInfos) => rankInfos.queueType === "RANKED_FLEX_SR"
    );
    let queueChosen;
    if (soloque !== undefined) {
      queueChosen = soloque;
    } else if (flex !== undefined) {
      queueChosen = flex;
    } else {
      return 400;
    }
    let winrate_modifier_riot = 0;
    let winrate_modifier_mine = 0;
    if (mywins + myLoses !== 0) {
      winrate_modifier_mine = ((mywins / (mywins + myLoses)) * 100 - 50) * 3;
    }
    if (queueChosen.wins + queueChosen.losses !== 0) {
      winrate_modifier_riot =
        ((queueChosen.wins / (queueChosen.wins + queueChosen.losses)) * 100 -
          50) *
        4;
    }
    return (
      winrate_modifier_mine +
      winrate_modifier_riot +
      leagueTiers.get(queueChosen.tier) +
      leagueRanks.get(queueChosen.rank) +
      50 * Number(queueChosen.hotStreak)
    );
  } catch (error) {
    console.log(error);
  }
}
