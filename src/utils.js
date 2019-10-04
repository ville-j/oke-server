const trimString = string => {
  return string;
};

const EOD_MARKER = 0x0067103a; // level data marker
const EOF_MARKER = 0x00845d52; // level file marker

const parseLevel = buffer => {
  let offset = 0;

  const version = buffer.toString("ascii", 0, 5);
  switch (version) {
    case "POT06":
      return parseAcrossLevel(buffer);
    case "POT14":
      return parseElmaLevel(buffer);
    default:
      throw Error("Not a valid elma/across level file");
  }
};

const parseAcrossLevel = buffer => {
  let offset = 41;
  const name = buffer.slice(offset, offset + 14).toString();
  offset = 100;
  const polygonCount = buffer.readDoubleLE(100) - 0.4643643;
  offset = 108;

  const polygons = [];

  for (let i = 0; i < polygonCount; i++) {
    const vertexCount = buffer.readInt32LE(offset);
    offset += 4;
    const vertices = [];
    for (let j = 0; j < vertexCount; j++) {
      const x = buffer.readDoubleLE(offset);
      offset += 8;
      const y = buffer.readDoubleLE(offset);
      offset += 8;

      vertices.push({ x, y });
    }
    polygons.push({ vertices, grass: false });
  }
  const objectCount = buffer.readDoubleLE(offset) - 0.4643643;
  const objects = [];

  offset += 8;

  for (let i = 0; i < objectCount; i++) {
    const x = buffer.readDoubleLE(offset);
    offset += 8;
    const y = buffer.readDoubleLE(offset);
    offset += 8;
    const t = buffer.readInt32LE(offset);
    offset += 4;
    objects.push({
      x,
      y,
      type: t === 1 ? "exit" : t === 2 ? "apple" : t === 3 ? "killer" : "start"
    });
  }

  return {
    name,
    polygons,
    objects,
    pictures: []
  };
};

const parseElmaLevel = buffer => {
  let offset = 7;

  const link = buffer.readUInt32LE(offset);
  offset += 4;

  const integrity = [];
  for (let i = 0; i < 4; i++) {
    integrity[i] = buffer.readDoubleLE(offset);
    offset += 8;
  }

  const name = trimString(buffer.slice(offset, offset + 51));
  offset += 51;
  const lgr = trimString(buffer.slice(offset, offset + 16));
  offset += 16;
  const foreground = trimString(buffer.slice(offset, offset + 10));
  offset += 10;
  const background = trimString(buffer.slice(offset, offset + 10));
  offset += 10;

  const polyCount = buffer.readDoubleLE(offset) - 0.4643643;
  const polygons = [];
  offset += 8;
  for (let i = 0; i < polyCount; i++) {
    let polygon = {};
    polygon.grass = Boolean(buffer.readInt32LE(offset));
    polygon.vertices = [];
    offset += 4;
    let vertexCount = buffer.readInt32LE(offset);
    offset += 4;
    for (let j = 0; j < vertexCount; j++) {
      let vertex = {};
      vertex.x = buffer.readDoubleLE(offset);
      offset += 8;
      vertex.y = buffer.readDoubleLE(offset);
      offset += 8;
      polygon.vertices.push(vertex);
    }
    polygons.push(polygon);
  }

  const objectCount = buffer.readDoubleLE(offset) - 0.4643643;
  const objects = [];

  offset += 8;

  for (let i = 0; i < objectCount; i++) {
    let object = {};
    object.x = buffer.readDoubleLE(offset);
    offset += 8;
    object.y = buffer.readDoubleLE(offset);
    offset += 8;
    let objType = buffer.readInt32LE(offset);
    offset += 4;
    let gravity = buffer.readInt32LE(offset);
    offset += 4;
    let animation = buffer.readInt32LE(offset) + 1;
    offset += 4;
    switch (objType) {
      case 1:
        object.type = "exit";
        break;
      case 2:
        object.type = "apple";
        switch (gravity) {
          case 0:
            object.gravity = "normal";
            break;
          case 1:
            object.gravity = "up";
            break;
          case 2:
            object.gravity = "down";
            break;
          case 3:
            object.gravity = "left";
            break;
          case 4:
            object.gravity = "right";
            break;
          default:
            reject("Invalid gravity value");
            return;
        }
        object.animation = animation;
        break;
      case 3:
        object.type = "killer";
        break;
      case 4:
        object.type = "start";
        break;
      default:
        reject("Invalid object value");
        return;
    }
    objects.push(object);
  }

  const picCount = buffer.readDoubleLE(offset) - 0.2345672;
  const pictures = [];
  offset += 8;
  for (let i = 0; i < picCount; i++) {
    let picture = {};
    picture.name = trimString(buffer.slice(offset, offset + 10));
    offset += 10;
    picture.texture = trimString(buffer.slice(offset, offset + 10));
    offset += 10;
    picture.mask = trimString(buffer.slice(offset, offset + 10));
    offset += 10;
    picture.x = buffer.readDoubleLE(offset);
    offset += 8;
    picture.y = buffer.readDoubleLE(offset);
    offset += 8;
    picture.distance = buffer.readInt32LE(offset);
    offset += 4;
    let clip = buffer.readInt32LE(offset);
    offset += 4;
    switch (clip) {
      case 0:
        picture.clip = "unclipped";
        break;
      case 1:
        picture.clip = "ground";
        break;
      case 2:
        picture.clip = "sky";
        break;
      default:
        reject("Invalid clip value");
        return;
    }
    pictures.push(picture);
  }

  // end of data marker
  if (buffer.readInt32LE(offset) !== EOD_MARKER) {
    throw Error("End of data marker error");
  }
  offset += 4;

  // top10 lists
  /*
  let top10Data = Level.cryptTop10(buffer.slice(offset, offset + 688));
  this.top10.single = this._parseTop10(top10Data.slice(0, 344));
  this.top10.multi = this._parseTop10(top10Data.slice(344));
  */
  offset += 688;

  // EOF marker
  if (buffer.readInt32LE(offset) !== EOF_MARKER) {
    throw Error("End of file marker error");
  }
  return {
    polygons,
    objects,
    pictures
  };
};

module.exports = { parseLevel };
