const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const STORAGE_SECRET = process.env.STORAGE_SECRET || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const MAX_STORAGE = 60 * 1024 * 1024;
const CLEAN_SIZE = 20 * 1024 * 1024;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "chats.json");
const COUNTER_FILE = path.join(DATA_DIR, "counter.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_FILE = path.join(PUBLIC_DIR, "admin.html");

app.use(express.json({ limit: "20mb" }));
app.use(express.static(PUBLIC_DIR));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "{}", "utf8");
}

if (!fs.existsSync(COUNTER_FILE)) {
  fs.writeFileSync(
    COUNTER_FILE,
    JSON.stringify({ nextNumber: 1 }, null, 2),
    "utf8"
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
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function authorized(req) {
  if (!STORAGE_SECRET) {
    return true;
  }

  return req.headers["x-storage-key"] === STORAGE_SECRET;
}

function adminAuthorized(req) {
  if (!ADMIN_PASSWORD) {
    return false;
  }

  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
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
    const dateA = new Date(
      a.updatedAt ||
      a.createdAt ||
      0
    ).getTime();

    const dateB = new Date(
      b.updatedAt ||
      b.createdAt ||
      0
    ).getTime();

    return dateA - dateB;
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
    `Otomatik temizlik: ${(deletedBytes / 1024 / 1024).toFixed(2)} MB silindi.`
  );
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Onur AI Çöp Kutusu",
    status: "online",
    storageMB: Number(
      getStorageMB().toFixed(2)
    ),
    limitMB: 60,
    cleanMB: 20
  });
});

app.get("/admin", (req, res) => {
  if (!fs.existsSync(ADMIN_FILE)) {
    return res.status(404).send(
      "admin.html bulunamadı."
    );
  }

  res.sendFile(ADMIN_FILE);
});

app.get("/admin/api/storage", (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erişim"
    });
  }

  const bytes = getStorageSize();

  res.json({
    success: true,
    bytes,
    megabytes: bytes / 1024 / 1024,
    limitMegabytes: 60,
    cleanupMegabytes: 20
  });
});

app.get("/admin/api/chats", (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erişim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);

    const list = Object.values(chats)
      .sort((a, b) => {
        const aNumber =
          Number(
            String(a.id).replace("chat-", "")
          ) || 0;

        const bNumber =
          Number(
            String(b.id).replace("chat-", "")
          ) || 0;

        return bNumber - aNumber;
      })
      .map(chat => ({
        id: chat.id,
        title: "",
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }));

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

app.get("/admin/api/chat/:id", (req, res) => {
  if (!adminAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erişim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);
    const chat = chats[req.params.id];

    if (!chat) {
      return res.status(404).json({
        success: false,
        error: "Sohbet bulunamadı"
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
    const now = new Date().toISOString();

    chats[id] = {
      id,
      title: "",
      messages: [],
      createdAt: now,
      updatedAt: now
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
    const chats = readJSON(DATA_FILE);

    let { id, messages } = req.body;

    if (!id) {
      const number = getNextChatNumber();
      id = `chat-${number}`;
    }

    const now = new Date().toISOString();

    chats[id] = {
      id,
      title: "",
      messages: Array.isArray(messages)
        ? messages
        : [],
      createdAt:
        chats[id]?.createdAt || now,
      updatedAt: now
    };

    writeJSON(DATA_FILE, chats);

    cleanStorageIfNeeded();

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

app.get("/chats", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  try {
    const chats = readJSON(DATA_FILE);

    const list = Object.values(chats).sort(
      (a, b) => {
        const aNumber =
          Number(
            String(a.id).replace("chat-", "")
          ) || 0;

        const bNumber =
          Number(
            String(b.id).replace("chat-", "")
          ) || 0;

        return aNumber - bNumber;
      }
    );

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
      success: true,
      deleted: req.params.id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/storage", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({
      success: false,
      error: "Yetkisiz erisim"
    });
  }

  const bytes = getStorageSize();

  res.json({
    success: true,
    bytes,
    megabytes: bytes / 1024 / 1024,
    limitMegabytes: 60,
    cleanupMegabytes: 20
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "Onur AI Çöp Kutusu",
    storageMB: Number(
      getStorageMB().toFixed(2)
    )
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Onur AI Çöp Kutusu ${PORT} portunda çalışıyor.`
  );
});
