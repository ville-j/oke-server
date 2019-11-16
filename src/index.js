require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const elmajs = require("elma-js");
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
  try {
    const data = await API.getLevelImage(req.params.id);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=31557600");
    res.send(data);
  } catch (e) {
    res.sendStatus(404);
  }
});

app.post("/kuskis", async (req, res) => {
  const { name, password } = req.body;
  const result = await OkeApp.createKuski({
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

app.get("/kuskis", async (req, res) => {
  const users = await OkeApp.getKuskis();
  res.json(users.data);
});

app.get("/kuskis/:name", async (req, res) => {
  const user = await OkeApp.getKuski({ name: req.params.name });
  user.data ? res.json(user.data) : res.sendStatus(404);
});

app.get("/times/kuski/:id", async (req, res) => {
  const times = await OkeApp.getKuskiTimes({ id: req.params.id });
  times.data ? res.json(times.data) : res.sendStatus(500);
});

app.get("/times", async (req, res) => {
  const times = await OkeApp.getTimes();
  res.json(times.data);
});

app.get("/times/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) res.sendStatus(400);
  else {
    const times = await OkeApp.getTimesInLevel({ id });
    res.json(times.data);
  }
});

app.get("/levels", async (req, res) => {
  const page = Number(req.query.page);
  if (!Number.isInteger(page) || page < 1) res.sendStatus(400);
  const levels = await OkeApp.getLevels(page);
  res.json(levels.data);
});

app.get("/levels/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) res.sendStatus(400);
  else {
    const level = await OkeApp.getLevel({ id });
    level.data ? res.json(level.data) : res.sendStatus(404);
  }
});

app.get("/levels/:id/map", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) res.sendStatus(400);
  else {
    const level = await OkeApp.getLevelData({ id });
    if (level.data) {
      const svg = elmajs.levToSvg(level.data.data);
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=31557600");
      res.send(svg);
    } else {
      res.sendStatus(404);
    }
  }
});

app.get("/search", async (req, res) => {
  const { query } = req.query;
  if (!query || query.length < 1) res.sendStatus(400);
  else {
    const kuskis = await OkeApp.searchKuskis({
      query
    });
    const levels = await OkeApp.searchLevels({
      query
    });
    res.json({
      kuskis: kuskis.data,
      levels: levels.data
    });
  }
});

app.listen(port, () => console.log(`oke-server running on port ${port}`));
