const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');

const VTC_ID = 80820;
const DISCORD_TOKEN = 'MTM4NzEwNDExNjMwMzcyNDcxNw.Gc1GT0.7-mjqrYIAGskQzpDbSOYLOVw3y5gd1m4btmm9A'; // ⚠️ Reemplaza con tu nuevo token si no lo cambiaste aún
const CHANNEL_ID = '1372037431615946775';
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutos

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const MEMBERS_FILE = 'vtc_members.json';

// Obtener lista de IDs actuales
async function getCurrentMembers() {
  const url = `https://api.truckersmp.com/v2/vtc/${VTC_ID}/members`;
  const res = await axios.get(url);
  return res.data.response.members.map(member => member.user_id);
}

// Guardar miembros localmente
function saveMembers(list) {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(list));
}

// Cargar lista guardada anteriormente
function loadPreviousMembers() {
  if (!fs.existsSync(MEMBERS_FILE)) return [];
  const data = fs.readFileSync(MEMBERS_FILE);
  return JSON.parse(data);
}

// Notificar que alguien se fue
async function notifyLeave(userId) {
  const res = await axios.get(`https://api.truckersmp.com/v2/user/${userId}`);
  const username = res.data.response.username;

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (channel) {
    channel.send({
      embeds: [{
        title: 'LATAM Express Update',
        description: `🔔 **${username}** ha dejado la VTC LATAM Express.`,
        color: 0xE74C3C
      }]
    });
  }
}

// Notificar que alguien se unió
async function notifyJoin(userId) {
  const res = await axios.get(`https://api.truckersmp.com/v2/user/${userId}`);
  const username = res.data.response.username;

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (channel) {
    channel.send({
      embeds: [{
        title: 'LATAM Express Update',
        description: `🟢 **${username}** se ha unido a LATAM Express. ¡Bienvenido! 🎉`,
        color: 0x2ECC71
      }]
    });
  }
}

// Comparar listas y notificar cambios
async function checkForChanges() {
  try {
    const current = await getCurrentMembers();
    const previous = loadPreviousMembers();

    const leavers = previous.filter(id => !current.includes(id));
    const joiners = current.filter(id => !previous.includes(id));

    for (const id of leavers) {
      await notifyLeave(id);
    }

    for (const id of joiners) {
      await notifyJoin(id);
    }

    saveMembers(current);
  } catch (error) {
    console.error('❌ Error revisando miembros:', error.message);
  }
}

client.once('ready', () => {
  console.log(`✅ Checker conectado como ${client.user.tag}`);
  checkForChanges();
  setInterval(checkForChanges, CHECK_INTERVAL);
});

client.login(DISCORD_TOKEN);
