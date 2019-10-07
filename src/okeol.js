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

const createPasswordHash = (password, salt) => {
  const preSaltedPass = crypto
    .createHash("sha256")
    .update(`${process.env.PWD_PRE_SALT}${password}`)
    .digest("hex")
    .toUpperCase();

  return crypto
    .createHash("sha256")
    .update(
      crypto
        .createHash("sha256")
        .update(`${salt}${preSaltedPass}`)
        .digest("hex")
    )
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

    const res = await db.query(
      "INSERT INTO kuski (name, pwdhash, pwdsalt, created) VALUES($1, $2, $3, NOW()) RETURNING id, name, created",
      [name, pwdhash, salt]
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
    ? await db.query("SELECT id, name, created FROM kuski WHERE id = $1", [id])
    : await db.query("SELECT id, name, created FROM kuski WHERE name = $1", [
        name
      ]);
  return ok(res.rows[0]);
};

const getTimes = async () => {
  const res = await db.query(
    "SELECT run.id, lev_id, time, run.created, lev.name AS lev_name, kuski.name AS kuski_name FROM run JOIN lev ON run.lev_id = lev.id JOIN kuski ON run.kuski_id = kuski.id WHERE status = 2 ORDER BY created DESC LIMIT 50"
  );
  return ok(res.rows);
};

const getTimesInLevel = async ({ id }) => {
  const res = await db.query(
    "SELECT r.id, r.lev_id, lev.name AS lev_name, kuski.name AS kuski_name, t.kuski_id, t.time, r.created FROM (SELECT kuski_id, MIN(time) AS time FROM run WHERE lev_id = $1 AND status = 2 GROUP BY kuski_id) AS t INNER JOIN run AS r ON r.kuski_id = t.kuski_id AND r.time = t.time JOIN lev ON r.lev_id = lev.id JOIN kuski ON r.kuski_id = kuski.id ORDER BY r.time ASC",
    [id]
  );
  return ok(res.rows);
};

const getLevels = async () => {
  const res = await db.query(
    "SELECT lev.id, lev.name, kuski.name AS kuski_name FROM lev LEFT JOIN kuski ON lev.kuski_id = kuski.id ORDER BY lev.created DESC LIMIT 50"
  );
  return ok(res.rows);
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

module.exports = {
  createUser,
  getUsers,
  getUser,
  auth,
  getTimes,
  getTimesInLevel,
  getLevels,
  getLevel,
  getLevelData
};
