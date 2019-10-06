require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const app = express();
const port = 6543;
const fs = require("fs");
const API = require("./api");
const path = require("path");
const OkeApp = require("./okeol");

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next();
});

app.use(express.json());

app.use((req, res, next) => {
  try {
    const authType = req.headers.authorization.split(" ")[0];
    const token = req.headers.authorization.split(" ")[1];

    if (authType !== "Bearer") throw Error("Unsupported auth type");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (e) {}
  next();
});

app.get("/", (req, res) => res.send("Hello World!"));

app.get("/battles", async (req, res) => {
  const battles = await API.getBattles();
  res.json(battles);
});

app.get("/battles/:id", async (req, res) => {
  const fn = path.join(__dirname, `/cache/${req.params.id}.json`);

  if (fs.existsSync(fn)) {
    res.send(fs.readFileSync(fn, "utf8"));
  } else {
    try {
      const results = await API.getBattleResults(req.params.id);

      if (!results.ongoing && !results.queued) {
        fs.writeFile(fn, JSON.stringify(results), err => {
          if (err) throw err;
        });
      }
      res.json(results);
    } catch (e) {
      res.status(404).send(null);
    }
  }
});

app.get("/levelimage/:id", async (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  const fn = path.join(__dirname, `/cache/images/${req.params.id}.svg`);

  if (fs.existsSync(fn)) {
    res.send(fs.readFileSync(fn));
  } else {
    const data = await API.getLevelImage(req.params.id);
    fs.writeFile(fn, data, err => {
      if (err) throw err;
    });
    res.send(data);
  }
});

app.post("/users", async (req, res) => {
  const { name, password } = req.body;
  const result = await OkeApp.createUser({
    name,
    password
  });

  if (result.ok) {
    res.json(result.data);
  } else {
    res.status(result.code === 23505 ? 409 : 500).json(result);
  }
});

app.post("/auth", async (req, res) => {
  const { name, password } = req.body;
  const user = await OkeApp.auth({ name, password });

  if (!user.data) res.sendStatus(401);
  else {
    const token = jwt.sign({ ...user.data }, process.env.JWT_SECRET, {
      expiresIn: 86400
    });
    res.json({ token });
  }
});

app.get("/me", async (req, res) => {
  req.user ? res.json(req.user) : res.sendStatus(401);
});

app.get("/users", async (req, res) => {
  const users = await OkeApp.getUsers();
  res.json(users.data);
});

app.get("/users/:name", async (req, res) => {
  const user = await OkeApp.getUser({ name: req.params.name });
  user.data ? res.json(user.data) : res.sendStatus(404);
});

app.get("/times", async (req, res) => {
  const times = await OkeApp.getTimes();
  res.json(times.data);
});

app.get("/times/:id", async (req, res) => {
  const times = await OkeApp.getTimesInLevel({ id: req.params.id });
  res.json(times.data);
});

app.listen(port, () => console.log(`oke-server running on port ${port}`));
