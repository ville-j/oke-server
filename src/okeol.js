const db = require("./db");

const createUser = async ({ name, password }) => {
  const res = await db.query(
    "INSERT INTO kuski (name, pwd, created) VALUES($1, $2, NOW()) RETURNING id",
    [name, password]
  );
  return getUser({ id: res.rows[0].id });
};

const getUsers = async () => {
  const res = await db.query(
    "SELECT id, name, created FROM kuski ORDER BY name ASC"
  );
  return res.rows;
};

const getUser = async ({ name, id }) => {
  if (!id && !name) throw Error("Either name or id is required");
  const res = id
    ? await db.query("SELECT id, name, created FROM kuski WHERE id = $1", [id])
    : await db.query("SELECT id, name, created FROM kuski WHERE name = $1", [
        name
      ]);
  return res.rows[0];
};

module.exports = { createUser, getUsers, getUser };
