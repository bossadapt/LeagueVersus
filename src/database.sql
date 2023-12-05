CREATE DATABASE leagueVersusDB;
USE leagueVersusDB;

CREATE TABLE users(
discord_id bigint,
verificaiton int,
league_username VARCHAR(16),
win int,
lost int, 
available boolean
);

CREATE TABLE matches(
id VARCHAR(10),
participant_1 bigint,
participant_2 bigint,
participant_3 bigint,
participant_4 bigint,
participant_5 bigint,
participant_6 bigint,
participant_7 bigint,
participant_8 bigint,
participant_9 bigint,
participant_10 bigint,
winner int
);

CREATE TABLE tournements(
    id VARCHAR(10),
    team_1 VARCHAR(10),
    team_2 VARCHAR(10),
    team_3 VARCHAR(10),
    team_4 VARCHAR(10),
    team_5 VARCHAR(10),
    team_6 VARCHAR(10),
    team_7 VARCHAR(10),
    team_8 VARCHAR(10),
    team_9 VARCHAR(10),
    team_10 VARCHAR(10),
    team_11 VARCHAR(10),
    team_12 VARCHAR(10),
    team_13 VARCHAR(10),
    team_14 VARCHAR(10),
    team_15 VARCHAR(10),
    team_16 VARCHAR(10),
);

CREATE TABLE teams(
id VARCHAR(10),
participant_1 bigint,
participant_2 bigint,
participant_3 bigint,
participant_4 bigint,
participant_5 bigint,
win int,
lost int,);

INSERT INTO users(discord_id, verification, league_username, win, lost, available)
VALUES 
(105054076596670464, -1 , "ameo", 0, 0, true);