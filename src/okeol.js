const db = require("./db");
const crypto = require("crypto");

const createRandomString = length => {
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
    text
  };
};

const ok = data => {
  return {
    ok: true,
    data
  };
};

const createUser = async ({ name, password }) => {
  try {
    if (!name) {
      return error({
        code: 1,
        field: "name",
        text: "Username must be defined"
      });
    }
    if (!password) {
      return error({
        code: 2,
        field: "password",
        text: "Password must be defined"
      });
    }

    const salt = createRandomString(8);
    const pwdhash = createPasswordHash(password, salt);
    const timestamp = Math.floor(Date.now() / 1000) - MAGIC_TIMESTAMP;
    const res = await db.query(
      "INSERT INTO kuski (name, pwdhash, pwdsalt, created) VALUES($1, $2, $3, $4) RETURNING id, name, created",
      [name, pwdhash, salt, timestamp]
    );
    return ok(res.rows[0]);
  } catch (e) {
    return error({
      code: e.code,
      field: e.code === "23505" ? "name" : "unknown",
      text: e.code === "23505" ? "Username already taken" : e.detail
    });
  }
};

const getUsers = async () => {
  const res = await db.query(
    "SELECT id, name, created FROM kuski ORDER BY name ASC"
  );
  return ok(res.rows);
};

const getUser = async ({ name, id }) => {
  if (!id && !name) throw Error("Either name or id is required");
  const res = id
    ? await db.query(
        "SELECT kuski.id, kuski.name, kuski.created, playtime, runcount, runfinish, priv_login, priv_rcon, priv_chat, priv_play, priv_start, priv_stop, team.name AS team FROM kuski LEFT JOIN team ON kuski.team_id = team.id WHERE kuski.id = $1",
        [id]
      )
    : await db.query(
        "SELECT kuski.id, kuski.name, kuski.created, playtime, runcount, runfinish, priv_login, priv_rcon, priv_chat, priv_play, priv_start, priv_stop, team.name AS team FROM kuski LEFT JOIN team ON kuski.team_id = team.id WHERE kuski.name = $1",
        [name]
      );
  return ok(res.rows[0]);
};

const getTimes = async () => {
  const res = await db.query(
    `SELECT run.id, lev_id, time, run.created, lev.name AS lev_name, kuski.name AS kuski_name
    FROM run JOIN lev ON run.lev_id = lev.id JOIN kuski ON run.kuski_id = kuski.id WHERE status = 2
    ORDER BY created DESC LIMIT 50`
  );
  return ok(res.rows);
};

const getTimesInLevel = async ({ id }) => {
  const res = await db.query(
    `SELECT kuski.name, bestrun.time, bestrun.id, bestrun.lev_id FROM bestrun JOIN kuski ON kuski.id = bestrun.kuski_id WHERE lev_id = $1 ORDER BY time, id ASC `,
    [id]
  );
  return ok(res.rows);
};

const getKuskiTimes = async ({ id }) => {
  const res = await db.query(
    `SELECT run.id, lev_id, time, run.created, lev.name AS lev_name, kuski.name AS kuski_name
    FROM run JOIN lev ON run.lev_id = lev.id JOIN kuski ON run.kuski_id = kuski.id WHERE status = 2 AND run.kuski_id = $1
    ORDER BY run.id DESC LIMIT 50`,
    [id]
  );
  return ok(res.rows);
};

const getLevels = async page => {
  const pageSize = 20;
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
      pageSize
    }
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

  return getUser({ name });
};

const searchLevels = async ({ query }) => {
  const q = query.replace(/[^0-9a-zA-Z_-]/g, "");
  const res = await db.query(`SELECT name, id FROM lev WHERE name ILIKE $1`, [
    `${q}%`
  ]);
  return ok(res.rows);
};

const searchUsers = async ({ query }) => {
  const q = query.replace(/[^0-9a-zA-Z_-]/g, "");
  const res = await db.query(`SELECT name, id FROM kuski WHERE name ILIKE $1`, [
    `${q}%`
  ]);
  return ok(res.rows);
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  auth,
  getTimes,
  getTimesInLevel,
  getLevels,
  getLevel,
  getLevelData,
  searchLevels,
  searchUsers,
  getKuskiTimes
};
