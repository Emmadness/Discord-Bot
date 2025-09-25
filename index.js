// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// IDs de usuarios y roles permitidos
const allowedUsers = ['640315344916840478', '192746644939210763'];
const allowedRoles = ['1411835087120629952', '1386877603130114098', '1386877176124674109']; 
const lastEmbeds = new Map();

// ID de categoría de tickets
const TICKET_CATEGORY = '1386871447980609697';

// Carpeta y archivo para eventos
const EVENTS_DIR = path.join(__dirname, 'events');
const EVENTS_FILE = path.join(EVENTS_DIR, 'events.json');

// ---------------- FUNCIONES BASE PARA EVENTOS ----------------
function ensureEventsFile() {
  if (!fs.existsSync(EVENTS_DIR)) fs.mkdirSync(EVENTS_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '[]', 'utf8');
}
function loadEvents() {
  try {
    ensureEventsFile();
    const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error leyendo events.json:', err);
    return [];
  }
}
function saveEvents(events) {
  try {
    ensureEventsFile();
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando events.json:', err);
  }
}

// ---------------- READY ----------------
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
});

// ---------------- REGISTRO DE COMANDOS ----------------
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName('test').setDescription('Prueba el bot'),
    new SlashCommandBuilder().setName('training').setDescription('Nuevo training')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('join').setDescription('Nuevo conductor')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('media').setDescription('Se une al Media Team')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('hr').setDescription('Se une a Human Resources')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('Se une como Staff (Admin)')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('staff').setDescription('Se une al Staff general')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('Abandona la VTC')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Usuario baneado de la VTC')
      .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('externo').setDescription('Envía el mensaje del embed externo'),
    new SlashCommandBuilder().setName('ticket').setDescription('Envía mensaje para abrir tickets'),
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Opciones para enviar o recuperar un embed')
      .addSubcommand(sub =>
        sub.setName('create')
          .setDescription('Crea un embed desde un código generado')
          .addStringOption(opt => opt.setName('codigo').setDescription('Código del embed').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('restore')
          .setDescription('Restaura el último embed enviado por el bot')
      ),
    // ------- EVENTOS -------
    new SlashCommandBuilder()
      .setName('evento')
      .setDescription('Gestión de eventos de la VTC')
      .addSubcommand(sub =>
        sub.setName('crear')
          .setDescription('Crea un nuevo evento')
          .addStringOption(opt => opt.setName('titulo').setDescription('Título del evento').setRequired(true))
          .addStringOption(opt => opt.setName('fecha').setDescription('Fecha y hora (YYYY-MM-DD HH:mm)').setRequired(true))
          .addStringOption(opt => opt.setName('ruta').setDescription('Ruta del convoy').setRequired(true))
          .addStringOption(opt => opt.setName('servidor').setDescription('Servidor TMP').setRequired(true))
          .addStringOption(opt => opt.setName('dlc').setDescription('DLC necesario (opcional)').setRequired(false))
      )
      .addSubcommand(sub =>
        sub.setName('lista').setDescription('Muestra todos los eventos creados')
      )
      .addSubcommand(sub =>
        sub.setName('borrar')
          .setDescription('Borra un evento')
          .addIntegerOption(opt => opt.setName('id').setDescription('ID del evento a borrar').setRequired(true))
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados.');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
}

// ---------------- FUNCION GENÉRICA MENSAJES ----------------
async function sendTeamUpdate(target, text, color = 0x3498DB) {
  const embed = {
    title: 'Rotra Club®',
    description: text,
    color: color
  };
  const message = await target.send({ embeds: [embed] });
  lastEmbeds.set(target.id, message);
  return message;
}

// ---------------- INTERACCIONES ----------------
client.on('interactionCreate', async interaction => {
  const channel = interaction.channel;

  try {
    // --- BOTONES ---
    if (interaction.isButton()) {
      const user = interaction.user;

      // RSVP eventos
      if (interaction.customId?.startsWith('evento_')) {
        const [_, action, idRaw] = interaction.customId.split('_');
        const id = parseInt(idRaw, 10);

        const events = loadEvents();
        const event = events.find(e => e.id === id);
        if (!event) {
          return interaction.reply({ content: '❌ Evento no encontrado.', ephemeral: true });
        }

        if (action === 'yes') {
          if (!event.asistentes.includes(user.id)) event.asistentes.push(user.id);
          await interaction.reply({ content: '✅ Te has unido al evento.', ephemeral: true });
        } else if (action === 'no') {
          event.asistentes = event.asistentes.filter(u => u !== user.id);
          await interaction.reply({ content: '❌ Has cancelado tu asistencia.', ephemeral: true });
        }
        saveEvents(events);

        // Actualizar embed
        const asistentes = event.asistentes.map(id => `<@${id}>`).join('\n') || 'Nadie aún';
        const timestamp = Math.floor(new Date(event.fecha.replace(' ', 'T')).getTime() / 1000);
        const embed = new EmbedBuilder()
          .setTitle(`📅 ${event.titulo}`)
          .setDescription(`\n**Ruta:** ${event.ruta}\n**Servidor:** ${event.servidor}\n**DLC:** ${event.dlc}`)
          .addFields(
            { name: 'Fecha', value: `<t:${timestamp}:F>`, inline: true },
            { name: 'Asistentes', value: asistentes }
          )
          .setColor(0x2ECC71)
          .setFooter({ text: `Evento #${event.id}` });

        await interaction.message.edit({ embeds: [embed], components: interaction.message.components });
        return;
      }
    }

    // --- COMANDOS ---
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);
    const name = interaction.options.getString('nombre');

    // Permisos básicos
    if (
      !allowedUsers.includes(interaction.user.id) &&
      !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
    ) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', ephemeral: true });
    }

    // EMBEDS
    if (command === 'embed') {
      // ...
    }

    // EVENTOS
    if (command === 'evento') {
      return handleEvento(interaction);
    }

    // Resto comandos (training, join, leave, etc.)...
  } catch (error) {
    console.error('❌ Error:', error);
  }
});

// ---------------- FUNCION PRINCIPAL EVENTOS ----------------
async function handleEvento(interaction) {
  const sub = interaction.options.getSubcommand();

  // CREAR
  if (sub === 'crear') {
    const titulo = interaction.options.getString('titulo');
    const fechaRaw = interaction.options.getString('fecha');
    const ruta = interaction.options.getString('ruta');
    const servidor = interaction.options.getString('servidor');
    const dlc = interaction.options.getString('dlc') || 'Ninguno';

    const date = new Date(fechaRaw.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
      return interaction.reply({ content: '❌ Fecha inválida. Usa `YYYY-MM-DD HH:mm`.', ephemeral: true });
    }
    const timestamp = Math.floor(date.getTime() / 1000);

    const events = loadEvents();
    const id = events.length ? events[events.length - 1].id + 1 : 1;
    const newEvent = { id, titulo, fecha: fechaRaw, ruta, servidor, dlc, asistentes: [] };
    events.push(newEvent);
    saveEvents(events);

    const embed = new EmbedBuilder()
      .setTitle(`📅 ${titulo}`)
      .setDescription(`\n**Ruta:** ${ruta}\n**Servidor:** ${servidor}\n**DLC:** ${dlc}`)
      .addFields({ name: 'Fecha', value: `<t:${timestamp}:F>` })
      .setColor(0x2ECC71)
      .setFooter({ text: `Evento #${id}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`evento_yes_${id}`).setLabel('✅ Asistir').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`evento_no_${id}`).setLabel('❌ No asistir').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: '✅ Evento creado y publicado.', ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // LISTA
  if (sub === 'lista') {
    const events = loadEvents();
    if (!events.length) {
      return interaction.reply({ content: '❌ No hay eventos creados.', ephemeral: false });
    }

    const list = events.map(e => {
      const ts = Math.floor(new Date(e.fecha.replace(' ', 'T')).getTime()/1000);
      return `**#${e.id}** - ${e.titulo} - <t:${ts}:F>\nRuta: ${e.ruta} • Servidor: ${e.servidor} • Asistentes: ${e.asistentes.length}`;
    }).join('\n\n');

    const embed = new EmbedBuilder().setTitle('📅 Eventos creados').setDescription(list).setColor(0x00af8f);
    return interaction.reply({ embeds: [embed], ephemeral: false });
  }

  // BORRAR
  if (sub === 'borrar') {
    const id = interaction.options.getInteger('id');
    let events = loadEvents();
    const before = events.length;
    events = events.filter(e => e.id !== id);
    if (events.length === before) {
      return interaction.reply({ content: `❌ No se encontró el evento #${id}.`, ephemeral: true });
    }
    saveEvents(events);
    await interaction.reply({ content: `✅ Evento #${id} borrado.`, ephemeral: true });
    await interaction.channel.send(`🗑️ El evento #${id} fue eliminado.`);
    return;
  }
}

client.login(process.env.DISCORD_TOKEN);
