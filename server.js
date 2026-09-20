const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const STORAGE_SECRET = process.env.STORAGE_SECRET || "";

const MAX_STORAGE = 60 * 1024 * 1024;
const CLEAN_SIZE = 20 * 1024 * 1024;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "chats.json");
const COUNTER_FILE = path.join(DATA_DIR, "counter.json");

app.use(express.json({ limit: "20mb" }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "{}");
}

if (!fs.existsSync(COUNTER_FILE)) {
  fs.writeFileSync(
    COUNTER_FILE,
    JSON.stringify({ nextNumber: 1 }, null, 2)
  );
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

function authorized(req) {
  if (!STORAGE_SECRET) return true;

  return req.headers["x-storage-key"] === STORAGE_SECRET;
}

function getStorageSize() {
  try {
    return fs.statSync(DATA_FILE).size;
  } catch {
    return 0;
  }
}

function getStorageMB() {
  return getStorageSize() / 1024 / 1024;
}

function getNextChatNumber() {
  const counter = readJSON(COUNTER_FILE);

  const number = Number(counter.nextNumber) || 1;

  counter.nextNumber = number + 1;

  writeJSON(COUNTER_FILE, counter);

  return number;
}

function cleanStorageIfNeeded() {
  const currentSize = getStorageSize();

  if (currentSize < MAX_STORAGE) {
    return;
  }

  const chats = readJSON(DATA_FILE);

  const list = Object.values(chats).sort((a, b) => {
    return (
      new Date(a.updatedAt || a.createdAt || 0) -
      new Date(b.updatedAt || b.createdAt || 0)
    );
  });

  let deletedBytes = 0;

  for (const chat of list) {
    if (deletedBytes >= CLEAN_SIZE) {
      break;
    }

    const size = Buffer.byteLength(
      JSON.stringify(chat),
      "utf8"
    );

    delete chats[chat.id];

    deletedBytes += size;
  }

  writeJSON(DATA_FILE, chats);

  console.log(
    `Temizlendi: ${(deletedBytes / 1024 / 1024).toFixed(2)} MB`
  );
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Cop Kutusu",
    status: "online",
    storageMB: Number(getStorageMB().toFixed(2)),
    limitMB: 60,
    cleanMB: 20
  });
});

app.post("/new-chat", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    cleanStorageIfNeeded();

    const chats = readJSON(DATA_FILE);
    const number = getNextChatNumber();
    const id = `chat-${number}`;

    chats[id] = {
      id,
      title: "",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    writeJSON(DATA_FILE, chats);

    res.json({
      success: true,
      id,
      title: ""
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/save", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    cleanStorageIfNeeded();

    const chats = readJSON(DATA_FILE);

    let {
      id,
      title,
      messages
    } = req.body;

    if (!id) {
      const number = getNextChatNumber();
      id = `chat-${number}`;
    }

    if (chats[id]) {
      title = chats[id].title;
    }

    chats[id] = {
      id,
      title: typeof title === "string" ? title : "",
      messages: Array.isArray(messages) ? messages : [],
      createdAt:
        chats[id]?.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    writeJSON(DATA_FILE, chats);

    cleanStorageIfNeeded();

    res.json({
      success: true,
      id,
      title: chats[id].title
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/chats", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);

    const list = Object.values(chats).sort((a, b) => {
      const aNumber =
        Number(String(a.id).replace("chat-", "")) || 0;

      const bNumber =
        Number(String(b.id).replace("chat-", "")) || 0;

      return aNumber - bNumber;
    });

    res.json({
      success: true,
      chats: list
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/chat/:id", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);
    const chat = chats[req.params.id];

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: "Sohbet bulunamadi"
      });
    }

    res.json({
      success: true,
      chat
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/chat/:id", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);

    if (!chats[req.params.id]) {
      return res.status(404).json({
        success: false,
        error: "Sohbet bulunamadi"
      });
    }

    delete chats[req.params.id];

    writeJSON(DATA_FILE, chats);

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Cop Kutusu ${PORT} portunda calisiyor.`);
});
