const db = require("./db");
const countries = require("./countries");
const crypto = require("crypto");

const createRandomString = (length) => {
  let string = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    string += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return string;
};

const MAGIC_TIMESTAMP = 1262304000;
const createPasswordHash = (password, salt) => {
  const preSaltedPass = crypto
    .createHash("sha256")
    .update(`${process.env.PWD_PRE_SALT}${password}`)
    .digest("hex")
    .toUpperCase();

  return crypto
    .createHash("sha256")
    .update(`${salt}${preSaltedPass}`)
    .digest("hex")
    .toUpperCase();
};

const error = ({ code, field, text }) => {
  return {
    ok: false,
    code: Number(code),
    field,
    text,
  };
};

const ok = (data) => {
  return {
    ok: true,
    data,
  };
};

const createKuski = async ({ name, password, country }) => {
  try {
    if (!name) {
      return error({
        code: 1,
        field: "name",
        text: "Username must be defined",
      });
    }
    if (!password) {
      return error({
        code: 2,
        field: "password",
        text: "Password must be defined",
      });
    }
    if (!countries[country.toUpperCase()]) {
      return error({
        code: 3,
        field: "country",
        text: "Invalid country",
      });
    }

    const salt = createRandomString(8);
    const pwdhash = createPasswordHash(password, salt);
    const timestamp = Math.floor(Date.now() / 1000) - MAGIC_TIMESTAMP;
    const res = await db.query(
      "INSERT INTO kuski (name, pwdhash, pwdsalt, created, country) VALUES($1, $2, $3, $4, $5) RETURNING id, name, created",
      [name, pwdhash, salt, timestamp, country.toLowerCase()]
    );
    return ok(res.rows[0]);
  } catch (e) {
    return error({
      code: e.code,
      field: e.code === "23505" ? "name" : "unknown",
      text: e.code === "23505" ? "Username already taken" : e.detail,
    });
  }
};

const getKuski = async ({ name, id }) => {
  if (!id && !name) throw Error("Either name or id is required");
  const res = id
    ? await db.query(
        `SELECT kuski.id, kuski.name, kuski.created, playtime, runcount, runfinish, priv_login,
        priv_rcon, priv_chat, priv_play, priv_start, priv_stop, team.name AS team, country FROM kuski LEFT
        JOIN team ON kuski.team_id = team.id WHERE kuski.id = $1`,
        [id]
      )
    : await db.query(
        `SELECT kuski.id, kuski.name, kuski.created, playtime, runcount, runfinish, priv_login,
        priv_rcon, priv_chat, priv_play, priv_start, priv_stop, team.name AS team, country FROM kuski LEFT
        JOIN team ON kuski.team_id = team.id WHERE kuski.name = $1`,
        [name]
      );
  return ok(res.rows[0]);
};

const getKuskis = async () => {
  const res = await db.query(
    `SELECT kuski.id, kuski.name, kuski.created, playtime, runcount, runfinish, priv_login,
    priv_rcon, priv_chat, priv_play, priv_start, priv_stop, team.name AS team, country FROM kuski
    LEFT JOIN team ON kuski.team_id = team.id ORDER BY kuski.name`
  );
  return ok(res.rows);
};

const updateKuski = async ({ country, id }) => {
  const res = await db.query("UPDATE kuski SET country = $2 WHERE id = $1", [
    id,
    country,
  ]);
  return ok(res);
};

const getTimes = async () => {
  const res = await db.query(
    `SELECT run.id, lev_id, time, run.created, lev.name AS lev_name, kuski.name AS kuski_name, kuski.id AS kuski_id, kuski.country AS kuski_country
    FROM run JOIN lev ON run.lev_id = lev.id JOIN kuski ON run.kuski_id = kuski.id WHERE status = 2
    ORDER BY created DESC LIMIT 50`
  );
  return ok(res.rows);
};

const getTimesInLevel = async ({ id }) => {
  const res = await db.query(
    `SELECT kuski.name AS kuski_name, kuski_id, kuski.country AS kuski_country, bestrun.time, bestrun.id, bestrun.lev_id FROM bestrun JOIN kuski ON
    kuski.id = bestrun.kuski_id WHERE lev_id = $1 ORDER BY time, id ASC `,
    [id]
  );
  return ok(res.rows);
};

const getKuskiTimes = async ({ id }) => {
  const res = await db.query(
    `SELECT run.id, lev_id, time, run.created, lev.name AS lev_name, kuski.name AS kuski_name, kuski.id AS kuski_id, kuski.country AS kuski_country
    FROM run JOIN lev ON run.lev_id = lev.id JOIN kuski ON run.kuski_id = kuski.id WHERE status = 2 AND run.kuski_id = $1
    ORDER BY run.id DESC LIMIT 50`,
    [id]
  );
  return ok(res.rows);
};

const getLevels = async (page) => {
  const pageSize = 50;
  const total = await db.query("SELECT COUNT(id) FROM lev");
  const res = await db.query(
    "SELECT lev.id, lev.name, kuski.name AS kuski_name FROM lev LEFT JOIN kuski ON lev.kuski_id = kuski.id ORDER BY lev.name ASC OFFSET $1 LIMIT $2",
    [pageSize * (page - 1), pageSize]
  );
  return ok({
    items: res.rows,
    meta: {
      total: parseInt(total.rows[0].count, 10),
      page,
      pageSize,
    },
  });
};

const getLevel = async ({ id }) => {
  const res = await db.query(
    "SELECT lev.id, lev.name, kuski.name AS kuski_name FROM lev LEFT JOIN kuski ON lev.kuski_id = kuski.id WHERE lev.id = $1",
    [id]
  );
  return ok(res.rows[0]);
};

const getLevelData = async ({ id }) => {
  const res = await db.query("SELECT data FROM lev WHERE lev.id = $1", [id]);
  return ok(res.rows[0]);
};

const getBattles = async ({ page }) => {
  const pageSize = 100;
  const total = await db.query("SELECT COUNT(id) FROM battle");
  const res = await db.query(
    `SELECT battle.id, battle.lev_id, battle.kuski_id AS starter_id, battle.run_id, type, duration, flags, battle.status,
    battle.created, run.kuski_id AS winner_id, winner.name AS winner_name, starter.name AS starter_name FROM battle
    JOIN kuski starter ON battle.kuski_id = starter.id LEFT JOIN run ON battle.run_id = run.id LEFT JOIN kuski winner ON run.kuski_id = winner.id
    ORDER BY battle.created DESC OFFSET $1 LIMIT $2`,
    [pageSize * (page - 1), pageSize]
  );
  return ok({
    items: res.rows,
    meta: {
      total: parseInt(total.rows[0].count, 10),
      page,
      pageSize,
    },
  });
};

const getBattle = async ({ id }) => {
  const res = await db.query(
    `SELECT battle.id, lev_id, type, duration, flags, status, battle.created, battle.kuski_id AS starter_id, kuski.name AS starter_name,
    lev.name as lev_name FROM battle JOIN kuski ON battle.kuski_id = kuski.id JOIN lev ON battle.lev_id = lev.id WHERE battle.id = $1`,
    [id]
  );
  return ok(res.rows[0]);
};

const getBattleResults = async ({ id }) => {
  const res = await db.query(
    `SELECT batrun.time, run.created, kuski.name as kuski, kuski.country AS kuski_country, team.name AS team FROM batrun JOIN run ON run.id = batrun.run_id
    JOIN kuski ON run.kuski_id = kuski.id LEFT JOIN team ON kuski.team_id = team.id WHERE batrun.battle_id = $1 ORDER BY batrun.time ASC`,
    [id]
  );
  return ok(res.rows);
};

const auth = async ({ name, password }) => {
  const pwdData = await db.query(
    "SELECT pwdhash, pwdsalt FROM kuski WHERE name = $1",
    [name]
  );

  if (pwdData.rows.length < 1)
    return error({ code: 1, field: "name", text: "User does not exist" });

  if (
    createPasswordHash(password, pwdData.rows[0].pwdsalt) !==
    pwdData.rows[0].pwdhash
  )
    return error({ code: 2, field: "password", text: "Wrong password" });

  return getKuski({ name });
};

const searchLevels = async ({ query }) => {
  const q = query.replace(/[^0-9a-zA-Z_-]/g, "");
  const res = await db.query(`SELECT name, id FROM lev WHERE name ILIKE $1`, [
    `${q}%`,
  ]);
  return ok(res.rows);
};

const searchKuskis = async ({ query }) => {
  const q = query.replace(/[^0-9a-zA-Z_-]/g, "");
  const res = await db.query(`SELECT name, id FROM kuski WHERE name ILIKE $1`, [
    `${q}%`,
  ]);
  return ok(res.rows);
};

const setKuskiShirt = async ({ id, data, crc }) => {
  const res = await db.query(
    "UPDATE kuski SET shirt = $1, shirtcrc= $2 WHERE id = $3",
    [data, crc, id]
  );
  return ok(res.rows);
};

module.exports = {
  createKuski,
  getKuskis,
  getKuski,
  auth,
  getTimes,
  getTimesInLevel,
  getLevels,
  getLevel,
  getLevelData,
  searchLevels,
  searchKuskis,
  getKuskiTimes,
  setKuskiShirt,
  getBattle,
  getBattles,
  getBattleResults,
  updateKuski,
};
