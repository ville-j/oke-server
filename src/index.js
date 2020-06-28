require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const elmajs = require("elma-js");
const Formidable = require("formidable");
const app = express();
const port = 6543;
const fs = require("fs");
const API = require("./api");
const OkeApp = require("./okeol");
const cmd = require("node-cmd");
const countries = require("./countries");
const OkeChatServer = require("./okechatserver");

const chatServer = OkeChatServer({
  port: process.env.CHAT_SERVER_PORT,
});

chatServer.connect({
  host: process.env.OKEOL_TCP_HOST,
  port: process.env.OKEOL_TCP_PORT,
  name: process.env.CHAT_SERVER_USER,
  pass: process.env.CHAT_SERVER_PASS,
});

chatServer.on("clientAuth", (data) => {
  if (!data) return;
  const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
  return decoded.name;
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "PUT, PATCH, POST, GET, DELETE, OPTIONS"
  );
  next();
});

app.use(express.json());

app.use(async (req, res, next) => {
  try {
    const authType = req.headers.authorization.split(" ")[0];
    const token = req.headers.authorization.split(" ")[1];

    if (authType !== "Bearer") throw Error("Unsupported auth type");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await OkeApp.getKuski({ id: decoded.id });

    if (user) req.user = user.data;
    else {
      throw Error("User not found");
    }
  } catch (e) {}
  next();
});

app.get("/", (req, res) => res.send("Hello World!"));

app.get("/battles", async (req, res) => {
  let page = Number(req.query.page);
  let date = Number(req.query.t);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(date)) date = Math.floor(new Date() / 1000) - 86400;
  const battles = await OkeApp.getBattles({ page, date });
  res.json(battles.data);
});

app.get("/battles/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) res.sendStatus(400);
  else {
    const battle = await OkeApp.getBattle({ id });
    const results = await OkeApp.getBattleResults({ id });

    battle.data
      ? res.json({ ...battle.data, results: results.data })
      : res.sendStatus(404);
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
  const { name, password, country } = req.body;
  const result = await OkeApp.createKuski({
    name,
    password,
    country,
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
      expiresIn: 86400,
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

app.use("/shirts", express.static(`${process.env.SHIRT_UPLOAD_PATH}`));

app.post("/kuskis/:name/shirt", async (req, res) => {
  const user = await OkeApp.getKuski({ name: req.params.name });
  if (!user.data) res.sendStatus(404);
  else if (user.data.id === req.user.id) {
    const form = new Formidable();
    form.maxFileSize = 4 * 1024 * 1024;
    form
      .parse(req)
      .on("file", function (name, file) {
        try {
          const shirt_tga = `${process.env.SHIRT_UPLOAD_PATH}${user.data.name}.tga`;
          const shirt_png = `${process.env.SHIRT_UPLOAD_PATH}${user.data.name}.png`;
          const shirt_crc = `${process.env.SHIRT_UPLOAD_PATH}${user.data.name}.crc`;
          cmd.get(
            `${process.env.SHIRTCONV_PATH} ${shirt_tga} ${shirt_png} ${shirt_crc} < ${file.path}`,
            (err, output, stderr) => {
              fs.readFile(shirt_tga, (err, shirtData) => {
                if (!err) {
                  fs.readFile(shirt_crc, (err, shirtCrc) => {
                    if (!err) {
                      const shirtCrcLE = shirtCrc.readInt32LE(0);
                      OkeApp.setKuskiShirt({
                        id: user.data.id,
                        data: shirtData,
                        crc: shirtCrcLE,
                      });
                      fs.unlink(shirt_tga, (err) => {
                        err && console.log(err);
                      });
                      fs.unlink(shirt_crc, (err) => {
                        err && console.log(err);
                      });
                      res.status(201).json({ shirt_crc: shirtCrcLE });
                    } else {
                      console.log(err);
                      res.sendStatus(500);
                    }
                  });
                } else {
                  console.log(err);
                  res.sendStatus(500);
                }
              });
            }
          );
        } catch (err) {
          console.log(err);
          res.sendStatus(500);
        }
      })
      .on("error", (err) => {
        console.log(err);
        res.sendStatus(500);
      });
  } else {
    res.sendStatus(403);
  }
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
  if (!Number.isInteger(page) || page < 1) page = 1;
  const levels = await OkeApp.getLevels({ page });
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

app.get("/levels/:id/data", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) res.sendStatus(400);
  else {
    const level = await OkeApp.getLevelData({ id });
    if (level.data) {
      res.send(Buffer.from(level.data.data));
    } else {
      res.sendStatus(404);
    }
  }
});

app.get("/levelpacks", async (req, res) => {
  let page = Number(req.query.page);
  const id = Number(req.query.id);

  if (id) {
    const levelPack = await OkeApp.getLevelPack({ id });

    if (levelPack.data) {
      const levelPackLevels = await OkeApp.getLevelPackLevels({
        packId: levelPack.data.id,
      });
      res.json({
        ...levelPack.data,
        levels: levelPackLevels.data || [],
      });
    } else {
      res.sendStatus(404);
    }
  } else {
    if (!Number.isInteger(page) || page < 1) page = 1;
    const levelPacks = await OkeApp.getLevelPacks({ page });
    res.json(levelPacks.data);
  }
});

app.post("/levelpacks", async (req, res) => {
  if (req.user) {
    const { name_short, name_long, descrip } = req.body;
    if (!name_short || !name_long || !descrip) {
      res.sendStatus(400);
    } else {
      const levpack = await OkeApp.createLevelPack({
        kuskiId: req.user.id,
        nameShort: name_short.substring(0, 15),
        nameLong: name_long.substring(0, 63),
        description: descrip.substring(0, 255),
      });
      levpack.ok ? res.json(levpack.data) : res.status(403).json(levpack);
    }
  } else {
    res.sendStatus(401);
  }
});

app.put("/levelpacks", async (req, res) => {
  const { name_short, name_long, descrip, id } = req.body;
  if (!name_short || !name_long || !descrip || !id) {
    res.sendStatus(400);
  } else {
    const pack = await OkeApp.getLevelPack({ id });

    if (pack.data) {
      if (pack.data.kuski_id === req.user.id) {
        const levpack = await OkeApp.editLevelPack({
          id,
          nameShort: name_short.substring(0, 15),
          nameLong: name_long.substring(0, 63),
          description: descrip.substring(0, 255),
        });
        levpack.ok ? res.json(levpack.data) : res.status(403).json(levpack);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(404);
    }
  }
});

app.get("/levelpacks/:name", async (req, res) => {
  const name = req.params.name;
  const levelPack = await OkeApp.getLevelPack({ name });

  if (levelPack.data) {
    const levelPackLevels = await OkeApp.getLevelPackLevels({
      packId: levelPack.data.id,
    });
    res.json({
      ...levelPack.data,
      levels: levelPackLevels.data || [],
    });
  } else {
    res.sendStatus(404);
  }
});

app.get("/levelpacks/:name/levels", async (req, res) => {
  const name = req.params.name;
  const levelPack = await OkeApp.getLevelPack({ name });
  if (levelPack.data) {
    const levelPackLevels = await OkeApp.getLevelPackLevels({
      packId: levelPack.data.id,
    });
    res.json(levelPackLevels.data);
  } else {
    res.sendStatus(404);
  }
});

app.post("/levelpacks/:id", async (req, res) => {
  if (req.user) {
    const { levId } = req.body;
    const { id } = req.params;
    const levelPack = await OkeApp.getLevelPack({ id });
    if (levelPack.data && levId) {
      if (levelPack.data.kuski_id === req.user.id) {
        const lev = await OkeApp.getLevel({ id: levId });
        if (lev.data) {
          await OkeApp.addLevelPackLevel({
            levPackId: levelPack.data.id,
            levId: lev.data.id,
          });
          res.sendStatus(201);
        } else {
          res.sendStatus(400);
        }
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  } else {
    res.sendStatus(401);
  }
});

app.delete("/levelpacks/:id", async (req, res) => {
  if (req.user) {
    const { id } = req.params;
    const levelPack = await OkeApp.getLevelPack({ id });
    if (levelPack.data) {
      if (levelPack.data.kuski_id === req.user.id) {
        await OkeApp.deleteLevelPack({ id });
        res.sendStatus(200);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(404);
    }
  } else {
    res.sendStatus(401);
  }
});

app.delete("/levelpacks", async (req, res) => {
  if (req.user) {
    const { levId, id } = req.body;
    const levelPack = await OkeApp.getLevelPack({ id });
    if (levelPack.data && levId) {
      if (levelPack.data.kuski_id === req.user.id) {
        await OkeApp.removeLevelPackLevel({ levPackId: id, levId });
        res.sendStatus(200);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  } else {
    res.sendStatus(401);
  }
});

app.get("/search", async (req, res) => {
  const { query, types } = req.query;
  const tArr = types ? types.split(",") : ["kuski", "level"];

  if (!query || query.length < 1) res.sendStatus(400);
  else {
    const kuskis =
      tArr.indexOf("kuski") > -1
        ? await OkeApp.searchKuskis({
            query,
          })
        : null;
    const levels =
      tArr.indexOf("level") > -1
        ? await OkeApp.searchLevels({
            query,
          })
        : null;

    res.json({
      kuskis: kuskis ? kuskis.data : null,
      levels: levels ? levels.data : null,
    });
  }
});

app.get("/countries", async (req, res) => {
  res.json(countries);
});

app.patch("/settings", async (req, res) => {
  if (req.user) {
    const kuski = await OkeApp.getKuski({ id: req.user.id });
    if (kuski) {
      const { data } = kuski;

      const keys = ["country"];
      const obj = {};

      keys.forEach((k) => {
        if (req.body[k]) {
          obj[k] = req.body[k];
        }
      });

      const newData = {
        ...data,
        ...obj,
      };

      OkeApp.updateKuski(newData);
      res.sendStatus(200);
    }
  } else {
    res.sendStatus(401);
  }
});

app.post("/teams", async (req, res) => {
  if (req.user) {
    const { team, password } = req.body;
    const t = await OkeApp.joinTeam({ team, password, kuskiId: req.user.id });
    t.ok ? res.json(t) : res.status(500).send(t);
  } else {
    res.sendStatus(401);
  }
});

app.listen(port, () => console.log(`oke-server running on port ${port}`));
