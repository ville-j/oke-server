const db = require("./db");

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
    const res = await db.query(
      "INSERT INTO kuski (name, pwd, created) VALUES($1, $2, NOW()) RETURNING id, name, created",
      [name, password]
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

const auth = async ({ name, password }) => {
  const res = await db.query(
    "SELECT id, name, created FROM kuski WHERE name = $1 AND pwd = $2",
    [name, password]
  );
  return ok(res.rows[0]);
};

module.exports = { createUser, getUsers, getUser, auth };
