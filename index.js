
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const readline = require("readline");
const pino = require("pino");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(text) {
  return new Promise((resolve) => rl.question(text, resolve));
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    version,
    browser: Browsers.macOS("Safari"),
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
  });

  // Request pair code if not registered
  if (!sock.authState.creds.registered) {
    const phoneNumber = await question(
      "Enter your WhatsApp number (with country code, e.g. 2348012345678): "
    );
    rl.close();

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
    const code = await sock.requestPairingCode(cleanNumber);
    console.log("\n==============================");
    console.log(`  Your Pair Code: ${code}`);
    console.log("==============================");
    console.log("Enter this code in WhatsApp > Linked Devices > Link a Device\n");
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Bot connected successfully!\n");
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startBot();
    }
  });

  // Message handler with kickall (no delays)
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = typeof remoteJid === "string" && remoteJid.endsWith("@g.us");
    const senderJid = msg.key.participant || msg.key.remoteJid;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log(`📩 Message from ${senderJid} in ${remoteJid}: ${text}`);

    const lower = text.toLowerCase().trim();

    if (lower === "hi" || lower === "hello") {
      await sock.sendMessage(remoteJid, { text: "👋 Hello! I am a WhatsApp bot. Type *help* to see commands." });
      return;
    } else if (lower === "help") {
      await sock.sendMessage(remoteJid, {
        text: `*Available Commands:*\n\n• *hi / hello* - Greeting\n• *ping* - Check if bot is alive\n• *time* - Get current time\n• *kickall* - Kick all non-admins from the group (group admins only)\n• *help* - Show this menu`,
      });
      return;
    } else if (lower === "ping") {
      await sock.sendMessage(remoteJid, { text: "🏓 Pong! Bot is alive!" });
      return;
    } else if (lower === "time") {
      const now = new Date().toLocaleString();
      await sock.sendMessage(remoteJid, { text: `🕐 Current time: ${now}` });
      return;
    }

  

if (lower === "kickall") {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { 
      text: "❌ This command can only be used in group chats." 
    });
    return;
  }

  try {
    const metadata = await sock.groupMetadata(remoteJid);
    const participants = metadata.participants || [];

    // normalize bot jid
    const botJid = jidNormalizedUser(sock.user.lid);

    const toRemove = participants
      .map(p => jidNormalizedUser(p.id))
      .filter(jid => jid !== botJid);

    await sock.groupParticipantsUpdate(
      remoteJid,
      toRemove,
      "remove"
    );

  } catch (err) {
    console.error("kickall error:", err);
  }
}
  });
}

startBot().catch(console.error);
