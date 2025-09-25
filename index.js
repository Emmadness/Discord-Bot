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

// ID de tu categoría de tickets
const TICKET_CATEGORY = '1386871447980609697';

// Rutas para almacenamiento de eventos
const EVENTS_DIR = path.join(__dirname, 'events');
const EVENTS_FILE = path.join(EVENTS_DIR, 'events.json');

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
    console.error('Error leyendo events.json, devolviendo []:', err);
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

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
});

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName('test').setDescription('Prueba el bot'),
    new SlashCommandBuilder().setName('training').setDescription('Nuevo training').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('join').setDescription('Nuevo conductor').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('media').setDescription('Se une al Media Team').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('hr').setDescription('Se une a Human Resources').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('Se une como Staff (Admin)').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('staff').setDescription('Se une al Staff general').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('Abandona la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Usuario baneado de la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('externo').setDescription('Envía el mensaje del embed externo'),
    new SlashCommandBuilder().setName('ticket').setDescription('Envía mensaje para abrir tickets'),
    // Comando embed con subcommands (create / restore)
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
    // ----------------- NUEVO: Comandos de evento -----------------
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
        sub.setName('lista')
          .setDescription('Muestra todos los eventos creados')
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
    console.log('✅ Slash commands registrados correctamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

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

client.on('interactionCreate', async interaction => {
  const channel = interaction.channel;

  try {
    // --- BOTONES ---
    if (interaction.isButton()) {
      const guild = interaction.guild;
      const user = interaction.user;

      // --- RSVP de eventos (nuevo) ---
      if (interaction.customId && (interaction.customId.startsWith('evento_yes_') || interaction.customId.startsWith('evento_no_'))) {
        // customId -> evento_yes_<id> OR evento_no_<id>
        const parts = interaction.customId.split('_');
        const action = parts[1]; // yes | no
        const id = parseInt(parts[2], 10);

        const events = loadEvents();
        const event = events.find(e => e.id === id);
        if (!event) {
          // respuesta ephemerla
          return interaction.reply({ content: '❌ Evento no encontrado (ya fue borrado).', ephemeral: true });
        }

        // Dejar/Unir al evento
        if (action === 'yes') {
          if (!event.asistentes.includes(user.id)) {
            event.asistentes.push(user.id);
          }
          await interaction.reply({ content: '✅ Te has unido al evento.', ephemeral: true });
        } else {
          event.asistentes = event.asistentes.filter(u => u !== user.id);
          await interaction.reply({ content: '❌ Has cancelado tu asistencia.', ephemeral: true });
        }

        saveEvents(events);

        // Actualizar embed en el mensaje donde se pulsó el botón
        try {
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
        } catch (err) {
          console.error('Error al actualizar embed del evento:', err);
        }

        return;
      }

      // --- ABRIR TICKET ---
      if (interaction.customId === 'open_ticket') {

        // Limpiar nombre de usuario para el canal
        let username = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
        if (username.length > 20) username = username.slice(0, 20);

        // Evitar tickets duplicados
        const existing = guild.channels.cache.find(c => c.name === `ticket-${username}`);
        if (existing) {
          return interaction.reply({ content: `❌ Ya tienes un ticket abierto: ${existing}`, ephemeral: true });
        }

        // Crear canal
        const ticketChannel = await guild.channels.create({
          name: `ticket-${username}`,
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ...allowedRoles.map(roleId => ({
              id: roleId,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            })),
          ],
        });

        // Botón de cerrar ticket
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Cerrar Ticket 🔒')
            .setStyle(ButtonStyle.Danger)
        );

        // Embed de bienvenida mejorado
        const embed = new EmbedBuilder()
          .setTitle(`🎫 Ticket de Soporte - Rotra Club®`)
          .setDescription(`Hola ${user}, un miembro del staff se pondrá en contacto contigo a la brevedad.`)
          .setColor(0x1F8B4C)
          .addFields(
            { name: 'Usuario', value: `${user.tag}`, inline: true },
            { name: 'Fecha de apertura', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          )
          .setFooter({ text: 'Rotra Club® - Soporte VTC', iconURL: user.displayAvatarURL() });

        await ticketChannel.send({ embeds: [embed], components: [closeRow] });
        return interaction.reply({ content: `✅ Tu ticket ha sido creado: ${ticketChannel}`, ephemeral: true });
      }

      // --- CERRAR TICKET ---
      if (interaction.customId === 'close_ticket') {
        const member = interaction.member;

        if (!allowedUsers.includes(member.id) &&
            !member.roles.cache.some(r => allowedRoles.includes(r.id))) {
          return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }

        await interaction.channel.delete().catch(err => console.error('❌ Error al eliminar ticket:', err));
      }
      return;
    }

    // --- COMANDOS ---
    if (!interaction.isChatInputCommand()) return;

    // Comprobar permisos
    if (
      !allowedUsers.includes(interaction.user.id) &&
      !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
    ) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', ephemeral: true });
    }

    const command = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);
    const name = interaction.options.getString('nombre');

    // --- EMBEDS ---
    if (command === 'embed') {
      if (subcommand === 'create') {
        const code = interaction.options.getString('codigo');
        try {
          const url = `https://latamexpress-embed.onrender.com/api/embed/${code}`;
          const response = await axios.get(url);
          const embedData = response.data;

          if (typeof embedData.color === 'string' && embedData.color.startsWith('#')) {
            embedData.color = parseInt(embedData.color.replace('#', ''), 16);
          }

          const embed = new EmbedBuilder(embedData);
          const msg = await channel.send({ embeds: [embed] });
          lastEmbeds.set(channel.id, msg);

          return interaction.reply({ content: '✅ Embed enviado correctamente.', ephemeral: true });
        } catch (error) {
          console.error('❌ Error al obtener el embed:', error);
          return interaction.reply({ content: '❌ No se pudo obtener el embed.', ephemeral: true });
        }
      } else if (subcommand === 'restore') {
        const last = lastEmbeds.get(channel.id);
        if (!last || !last.embeds?.length) {
          return interaction.reply({ content: '❌ No se encontró un embed reciente en este canal.', ephemeral: true });
        }

        await channel.send({ embeds: last.embeds });
        return interaction.reply({ content: '✅ Embed restaurado correctamente.', ephemeral: true });
      }
      return;
    }

    // --- COMANDO EVENTO (nuevo) ---
    if (command === 'evento') {
      return handleEvento(interaction);
    }

    // --- COMANDOS DE VTC ---
    switch (command) {
      case 'test':
        await sendTeamUpdate(channel, 'Ejemplo: Un nuevo miembro se unió al equipo 🎉');
        break;
      case 'training':
        await sendTeamUpdate(channel, `• **${name}** se unió como **Trial Driver** de Rotra Club ®. 🚚`, 0x2ECC71);
        break;	    
      case 'join':
        await sendTeamUpdate(channel, `• **${name}** se unió como **Driver** de Rotra Club ®. 🚚`, 0x2ECC71);
        break;
      case 'media':
        await sendTeamUpdate(channel, `• **${name}** se unió al **Media Team** de Rotra Club ®. 📸`, 0x9B59B6);
        break;
      case 'hr':
        await sendTeamUpdate(channel, `• **${name}** se unió a **Human Resources** de Rotra Club ®. 👩‍💻`, 0x9B59B6);
        break;
      case 'admin':
        await sendTeamUpdate(channel, `• **${name}** se unió como parte del **Staff de Rotra Club ®**. 🛠️`, 0xF1C40F);
        break;
      case 'staff':
        await sendTeamUpdate(channel, `• **${name}** se ha unido al **Staff de Rotra Club ®**. 🧩`, 0x1F618D);
        break;
      case 'leave':
        await sendTeamUpdate(channel, `• **${name}** dejó la VTC. ¡Le deseamos éxito en su camino! 👋`, 0xE74C3C);
        break;
      case 'ban':
        await sendTeamUpdate(channel, `• **${name}** ha sido **baneado** de Rotra Club ®. 🚫`, 0xC0392B);
        break;
      case 'externo':
        await interaction.deferReply({ ephemeral: true });
        try {
          const data = fs.readFileSync('./embeds/externo.json', 'utf8');
          const json = JSON.parse(data);
          const options = {};
          if (json.content) options.content = json.content;
          if (Array.isArray(json.embeds)) options.embeds = json.embeds;
          if (Array.isArray(json.components)) options.components = json.components;
          if (typeof json.tts === 'boolean') options.tts = json.tts;
          const msg = await channel.send(options);
          lastEmbeds.set(channel.id, msg);
          await interaction.editReply({ content: '✅ Enviado.' });
        } catch (error) {
          console.error('❌ Error al leer externo.json:', error);
          await interaction.editReply({ content: '❌ Error al enviar el embed externo.' });
        }
        break;
      case 'ticket':
        // Embed mejorado para mensaje inicial de tickets
        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 Rotra Club® - Soporte')
          .setDescription('Si necesitas ayuda o soporte, presiona el botón de abajo para abrir un ticket privado.\nUn miembro del staff se pondrá en contacto contigo.')
          .setColor(0x1F8B4C)
          .setFooter({ text: 'Rotra Club® - Soporte VTC' });

        const ticketRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_ticket')
            .setLabel('Abrir Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );

        await channel.send({ embeds: [ticketEmbed], components: [ticketRow] });
        await interaction.reply({ content: '✅ Mensaje de ticket enviado.', ephemeral: true });
        break;
    }

    if (command !== 'embed' && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '✅ Enviado.', ephemeral: true });
    }

  } catch (error) {
    console.error('❌ Error al ejecutar comando:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ocurrió un error al ejecutar el comando.' });
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error al ejecutar el comando.', ephemeral: true });
      }
    } catch (err) {
      console.error('❌ Error al enviar respuesta de error:', err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// ----------------- Función que maneja /evento (crear/lista/borrar) -----------------
async function handleEvento(interaction) {
  const sub = interaction.options.getSubcommand();

  // --- CREAR EVENTO ---
  if (sub === 'crear') {
    const titulo = interaction.options.getString('titulo');
    const fechaRaw = interaction.options.getString('fecha'); // formato: YYYY-MM-DD HH:mm
    const ruta = interaction.options.getString('ruta');
    const servidor = interaction.options.getString('servidor');
    const dlc = interaction.options.getString('dlc') || 'Ninguno';

    // Parseo robusto de la fecha: convertimos espacio por 'T' para que Date la lea como local
    const date = new Date(fechaRaw.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
      return interaction.reply({ content: '❌ Formato de fecha inválido. Usa `YYYY-MM-DD HH:mm` (ej: 2025-09-20 15:00).', ephemeral: true });
    }
    const timestamp = Math.floor(date.getTime() / 1000);

    const events = loadEvents();
    const id = events.length ? (events[events.length - 1].id + 1) : 1;

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

    // Mensaje público con embed y botones
    await interaction.reply({ content: '✅ Evento creado y publicado.', ephemeral: true });
    const msg = await interaction.channel.send({ embeds: [embed], components: [row] });

    // Opcional: guardar messageId si quieres rastrear el mensaje posteriormente
    // newEvent.messageId = msg.id;
    // saveEvents(events);

    return;
  }

  // --- LISTA DE EVENTOS ---
  if (sub === 'lista') {
    const events = loadEvents().filter(e => {
      // opcional: filtrar por fecha futura si lo deseas
      return true;
    });
    if (!events.length) {
      return interaction.reply({ content: '❌ No hay eventos creados.', ephemeral: true });
    }

    const list = events.map(e => `**#${e.id}** - ${e.titulo} - <t:${Math.floor(new Date(e.fecha.replace(' ', 'T')).getTime()/1000)}:F>\n` +
      `Ruta: ${e.ruta} • Servidor: ${e.servidor} • Asistentes: ${e.asistentes.length}`).join('\n\n');

    // Enviar como embed si lo prefieres
    const embed = new EmbedBuilder()
      .setTitle('📅 Eventos creados')
      .setDescription(list)
      .setColor(0x00af8f);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // --- BORRAR EVENTO ---
  if (sub === 'borrar') {
    const id = interaction.options.getInteger('id');
    let events = loadEvents();
    const before = events.length;
    events = events.filter(e => e.id !== id);
    if (events.length === before) {
      return interaction.reply({ content: `❌ No se encontró el evento #${id}.`, ephemeral: true });
    }
    saveEvents(events);
    return interaction.reply({ content: `✅ Evento #${id} borrado.`, ephemeral: true });
  }
}

