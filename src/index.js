const express = require("express");
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
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.json());

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
  try {
    const { name, password } = req.body;
    const id = await OkeApp.createUser({
      name,
      password
    });
    res.json(id);
  } catch (e) {
    res.sendStatus(500);
  }
});

app.get("/users", async (req, res) => {
  const users = await OkeApp.getUsers();
  res.json(users);
});

app.get("/users/:name", async (req, res) => {
  const user = await OkeApp.getUser({ name: req.params.name });
  user ? res.json(user) : res.sendStatus(404);
});

app.listen(port, () => console.log(`Server running on port ${port}!`));
