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

app.use(express.json({ limit: "20mb" }));

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
  res.redirect("/admin");
});

app.get("/admin", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Onur AI Çöp Kutusu</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #080808;
  color: #fff;
  font-family: Arial, sans-serif;
}

button,
input {
  font: inherit;
}

.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: #111;
  border: 1px solid #222;
  border-radius: 18px;
  padding: 28px;
}

.login-box h1 {
  margin: 0 0 22px;
  font-size: 24px;
  color: #fff;
}

.login-box input {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid #333;
  background: #080808;
  color: #fff;
  outline: none;
  margin-bottom: 12px;
}

.login-box button {
  width: 100%;
  padding: 14px;
  border: 0;
  border-radius: 10px;
  background: #1677ff;
  color: #fff;
  cursor: pointer;
  font-weight: bold;
}

.error {
  margin-top: 12px;
  color: #ff4d4d;
  display: none;
}

#panel {
  display: none;
  min-height: 100vh;
}

.top {
  padding: 18px;
  border-bottom: 1px solid #222;
  background: #0d0d0d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.top h1 {
  margin: 0;
  font-size: 20px;
  color: #fff;
}

.top-buttons {
  display: flex;
  gap: 8px;
}

.top button {
  padding: 9px 13px;
  border: 1px solid #333;
  border-radius: 9px;
  background: #151515;
  color: #fff;
  cursor: pointer;
}

.container {
  max-width: 1200px;
  margin: auto;
  padding: 18px;
}

.storage {
  background: #111;
  border: 1px solid #222;
  border-radius: 15px;
  padding: 18px;
  margin-bottom: 18px;
}

.storage-title {
  font-size: 16px;
  color: #fff;
  margin-bottom: 12px;
}

.storage-bar {
  width: 100%;
  height: 13px;
  background: #222;
  border-radius: 20px;
  overflow: hidden;
}

.storage-fill {
  height: 100%;
  width: 0%;
  background: #1677ff;
  transition: width .3s;
}

.storage-info {
  margin-top: 10px;
  font-size: 14px;
  color: #aaa;
}

.layout {
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 18px;
}

.chats {
  background: #111;
  border: 1px solid #222;
  border-radius: 15px;
  overflow: hidden;
  min-height: 500px;
}

.chats-title {
  padding: 15px;
  border-bottom: 1px solid #222;
  color: #fff;
}

.chat-list {
  max-height: 650px;
  overflow-y: auto;
}

.chat-item {
  padding: 14px;
  border-bottom: 1px solid #1d1d1d;
  cursor: pointer;
}

.chat-item:hover {
  background: #181818;
}

.chat-item.active {
  background: #1677ff;
}

.chat-id {
  font-weight: bold;
  color: #fff;
}

.chat-date {
  margin-top: 5px;
  font-size: 12px;
  color: #999;
}

.chat-item.active .chat-date {
  color: #dceaff;
}

.viewer {
  background: #111;
  border: 1px solid #222;
  border-radius: 15px;
  min-height: 500px;
  padding: 18px;
}

.viewer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.viewer-id {
  color: #fff;
  font-size: 18px;
  font-weight: bold;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  padding: 13px;
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user {
  background: #17345e;
  border: 1px solid #24558f;
}

.message.assistant {
  background: #181818;
  border: 1px solid #292929;
}

.message-role {
  font-size: 12px;
  margin-bottom: 7px;
  color: #8dbbff;
  font-weight: bold;
}

.message.assistant .message-role {
  color: #7fffaf;
}

.empty {
  padding: 30px;
  text-align: center;
  color: #777;
}

@media (max-width: 800px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .chats {
    min-height: auto;
  }

  .chat-list {
    max-height: 300px;
  }

  .viewer {
    min-height: 450px;
  }

  .top {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
</head>

<body>

<div id="login" class="login">
  <div class="login-box">
    <h1>Onur AI Çöp Kutusu</h1>

    <input
      id="password"
      type="password"
      placeholder="Admin şifresi"
      autocomplete="current-password"
    >

    <button onclick="login()">
      Giriş Yap
    </button>

    <div id="loginError" class="error">
      Şifre yanlış.
    </div>
  </div>
</div>

<div id="panel">

  <div class="top">
    <h1>Onur AI Çöp Kutusu</h1>

    <div class="top-buttons">
      <button onclick="loadAll()">
        Yenile
      </button>

      <button onclick="logout()">
        Çıkış
      </button>
    </div>
  </div>

  <div class="container">

    <div class="storage">
      <div class="storage-title">
        Depolama
      </div>

      <div class="storage-bar">
        <div
          id="storageFill"
          class="storage-fill"
        ></div>
      </div>

      <div
        id="storageInfo"
        class="storage-info"
      >
        Yükleniyor...
      </div>
    </div>

    <div class="layout">

      <div class="chats">
        <div class="chats-title">
          Sohbetler
        </div>

        <div
          id="chatList"
          class="chat-list"
        ></div>
      </div>

      <div class="viewer">

        <div class="viewer-top">
          <div
            id="viewerId"
            class="viewer-id"
          >
            Bir sohbet seç
          </div>
        </div>

        <div
          id="messages"
          class="messages"
        >
          <div class="empty">
            Görüntülemek için soldan bir sohbet seç.
          </div>
        </div>

      </div>

    </div>

  </div>

</div>

<script>
let adminPassword = "";
let selectedChat = "";

function login() {
  const input =
    document.getElementById("password");

  const password = input.value;

  if (!password) {
    return;
  }

  adminPassword = password;

  fetch("/admin/api/storage", {
    headers: {
      "x-admin-password": adminPassword
    }
  })
  .then(res => {
    if (!res.ok) {
      throw new Error("wrong");
    }

    document.getElementById("login").style.display =
      "none";

    document.getElementById("panel").style.display =
      "block";

    loadAll();
  })
  .catch(() => {
    document.getElementById("loginError").style.display =
      "block";

    adminPassword = "";
  });
}

function logout() {
  adminPassword = "";
  selectedChat = "";

  document.getElementById("panel").style.display =
    "none";

  document.getElementById("login").style.display =
    "flex";

  document.getElementById("password").value = "";

  document.getElementById("loginError").style.display =
    "none";
}

async function loadAll() {
  await loadStorage();
  await loadChats();

  if (selectedChat) {
    await loadChat(selectedChat);
  }
}

async function loadStorage() {
  try {
    const res = await fetch(
      "/admin/api/storage",
      {
        headers: {
          "x-admin-password": adminPassword
        }
      }
    );

    if (!res.ok) {
      throw new Error();
    }

    const data = await res.json();

    const percent = Math.min(
      100,
      (data.megabytes / data.limitMegabytes) * 100
    );

    document.getElementById(
      "storageFill"
    ).style.width = percent + "%";

    document.getElementById(
      "storageInfo"
    ).textContent =
      data.megabytes.toFixed(2) +
      " MB / " +
      data.limitMegabytes +
      " MB";
  } catch {
    document.getElementById(
      "storageInfo"
    ).textContent =
      "Depolama bilgisi alınamadı.";
  }
}

async function loadChats() {
  const list =
    document.getElementById("chatList");

  try {
    const res = await fetch(
      "/admin/api/chats",
      {
        headers: {
          "x-admin-password": adminPassword
        }
      }
    );

    if (!res.ok) {
      throw new Error();
    }

    const data = await res.json();

    list.innerHTML = "";

    if (
      !data.chats ||
      data.chats.length === 0
    ) {
      list.innerHTML =
        '<div class="empty">Henüz sohbet yok.</div>';

      return;
    }

    for (const chat of data.chats) {
      const item =
        document.createElement("div");

      item.className = "chat-item";

      if (chat.id === selectedChat) {
        item.classList.add("active");
      }

      const date =
        chat.updatedAt
          ? new Date(
              chat.updatedAt
            ).toLocaleString("tr-TR")
          : "";

      item.innerHTML =
        '<div class="chat-id">' +
        escapeHTML(chat.id) +
        "</div>" +
        '<div class="chat-date">' +
        escapeHTML(date) +
        "</div>";

      item.onclick = () => {
        selectedChat = chat.id;
        loadChats();
        loadChat(chat.id);
      };

      list.appendChild(item);
    }
  } catch {
    list.innerHTML =
      '<div class="empty">Sohbetler alınamadı.</div>';
  }
}

async function loadChat(id) {
  const viewerId =
    document.getElementById("viewerId");

  const messages =
    document.getElementById("messages");

  viewerId.textContent = id;

  messages.innerHTML =
    '<div class="empty">Yükleniyor...</div>';

  try {
    const res = await fetch(
      "/admin/api/chat/" +
      encodeURIComponent(id),
      {
        headers: {
          "x-admin-password": adminPassword
        }
      }
    );

    if (!res.ok) {
      throw new Error();
    }

    const data = await res.json();

    messages.innerHTML = "";

    const chat = data.chat;

    if (
      !chat.messages ||
      chat.messages.length === 0
    ) {
      messages.innerHTML =
        '<div class="empty">Bu sohbette mesaj yok.</div>';

      return;
    }

    for (const message of chat.messages) {
      const box =
        document.createElement("div");

      const role =
        message.role === "user"
          ? "user"
          : "assistant";

      box.className =
        "message " + role;

      const roleName =
        role === "user"
          ? "Kullanıcı"
          : "Onur AI";

      const content =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(
              message.content
            );

      box.innerHTML =
        '<div class="message-role">' +
        roleName +
        "</div>" +
        "<div>" +
        escapeHTML(content) +
        "</div>";

      messages.appendChild(box);
    }
  } catch {
    messages.innerHTML =
      '<div class="empty">Sohbet alınamadı.</div>';
  }
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document
  .getElementById("password")
  .addEventListener("keydown", event => {
    if (event.key === "Enter") {
      login();
    }
  });
</script>

</body>
</html>`);
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
