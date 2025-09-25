require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType
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
const EVENT_FILE = './eventos.json'; // almacenamiento de eventos

// ID de tu categoría de tickets
const TICKET_CATEGORY = '1386871447980609697';

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
});

// --- Registro de slash commands ---
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
    new SlashCommandBuilder()
      .setName('evento')
      .setDescription('Crea un nuevo evento estilo convoy')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados correctamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

// --- Función para enviar embeds genéricos ---
async function sendTeamUpdate(target, text, color = 0x3498DB) {
  const embed = { title: 'Rotra Club®', description: text, color: color };
  const message = await target.send({ embeds: [embed] });
  lastEmbeds.set(target.id, message);
  return message;
}

// --- Evento principal ---
client.on('interactionCreate', async interaction => {
  const channel = interaction.channel;
  try {
    const guild = interaction.guild;
    const user = interaction.user;

    // --- BOTONES Y SELECT MENU ---
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      // --- ABRIR TICKET (BOTÓN) ---
      if (interaction.isButton() && interaction.customId === 'open_ticket') {
        await createTicket(interaction, user, guild, 'Soporte 🎫'); 
        return;
      }

      // --- ABRIR TICKET (SELECT MENU) ---
      if (interaction.isStringSelectMenu() && interaction.customId === 'open_ticket_select') {
        const selected = interaction.values[0];
        let tipoTicket = 'Soporte 🎫';
        if (selected === 'ticket_convoy') tipoTicket = 'Convoy 🚚';
        if (selected === 'ticket_reclutamiento') tipoTicket = 'Reclutamiento 📝';
        if (selected === 'ticket_soporte') tipoTicket = 'Soporte 🎫';

        await createTicket(interaction, user, guild, tipoTicket);
        return;
      }

      // --- CERRAR TICKET ---
      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const member = interaction.member;
        if (!allowedUsers.includes(member.id) && !member.roles.cache.some(r => allowedRoles.includes(r.id))) {
          return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }
        await interaction.channel.delete().catch(console.error);
        return;
      }

      // --- RSVP BOTONES DE EVENTO ---
      if (interaction.isButton() && interaction.customId.startsWith('evento_rsvp_')) {
        const eventoId = interaction.customId.split('_')[2];
        const eventos = JSON.parse(fs.readFileSync(EVENT_FILE, 'utf8') || '{}');
        const evento = eventos[eventoId];
        if (!evento) return interaction.reply({ content: '❌ Evento no encontrado.', ephemeral: true });

        if (!evento.asistentes) evento.asistentes = [];
        if (!evento.asistentes.includes(user.id)) {
          evento.asistentes.push(user.id);
          fs.writeFileSync(EVENT_FILE, JSON.stringify(eventos, null, 2));
          return interaction.reply({ content: '✅ Te has registrado como asistente.', ephemeral: true });
        } else {
          return interaction.reply({ content: '❌ Ya estás registrado.', ephemeral: true });
        }
      }
    }

    // --- COMANDOS ---
    if (!interaction.isChatInputCommand()) return;

    // Comprobar permisos
    if (!allowedUsers.includes(interaction.user.id) &&
        !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', flags: 64 });
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
          return interaction.reply({ content: '✅ Embed enviado correctamente.', flags: 64 });
        } catch {
          return interaction.reply({ content: '❌ No se pudo obtener el embed.', flags: 64 });
        }
      } else if (subcommand === 'restore') {
        const last = lastEmbeds.get(channel.id);
        if (!last || !last.embeds?.length) return interaction.reply({ content: '❌ No se encontró un embed reciente.', flags: 64 });
        await channel.send({ embeds: last.embeds });
        return interaction.reply({ content: '✅ Embed restaurado correctamente.', flags: 64 });
      }
      return;
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

      // --- COMANDO DE EVENTO NUEVO ---
      case 'evento':
        // Crear modal para rellenar información del evento
        const modal = new ModalBuilder()
          .setCustomId('evento_modal')
          .setTitle('Crear Nuevo Evento');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('titulo')
              .setLabel('Título del Evento')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('descripcion')
              .setLabel('Descripción')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('juego')
              .setLabel('Juego')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('server')
              .setLabel('Server')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dlc')
              .setLabel('DLC')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('salida')
              .setLabel('Salida')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('llegada')
              .setLabel('Llegada')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('camion')
              .setLabel('Camión')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('trailer')
              .setLabel('Tráiler')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('carga')
              .setLabel('Carga')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('evento_url')
              .setLabel('URL del Evento TruckersMP')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('hora')
              .setLabel('Hora del Evento (formato Chile)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
        break;
    }

    // --- RESPUESTA DE MODAL PARA EVENTO ---
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'evento_modal') {
      const values = {};
      interaction.fields.fields.forEach((field, key) => {
        values[key] = field.value;
      });

      // Guardar evento en JSON
      const eventos = JSON.parse(fs.existsSync(EVENT_FILE) ? fs.readFileSync(EVENT_FILE, 'utf8') : '{}');
      const eventoId = Date.now().toString();
      eventos[eventoId] = { ...values, asistentes: [] };
      fs.writeFileSync(EVENT_FILE, JSON.stringify(eventos, null, 2));

      // Crear embed
      const embed = new EmbedBuilder()
        .setTitle(values.titulo)
        .setDescription(values.descripcion)
        .addFields(
          { name: '🎮 Juego', value: values.juego, inline: true },
          { name: '🌎 Server', value: values.server, inline: true },
          { name: '💿 DLC', value: values.dlc, inline: true },
          { name: '🚛 Salida', value: values.salida, inline: true },
          { name: '🛑 Llegada', value: values.llegada, inline: true },
          { name: '🚚 Camión', value: values.camion, inline: true },
          { name: '🏗️ Tráiler', value: values.trailer, inline: true },
          { name: '📦 Carga', value: values.carga, inline: true },
          { name: '📎 Evento TruckersMP', value: values.evento_url || 'No disponible', inline: true },
          { name: '⏰ Hora', value: values.hora, inline: true },
          { name: '☑️ Asistentes', value: '0', inline: true }
        )
        .setColor(0x1F8B4C)
        .setFooter({ text: `Creado por ${interaction.user.tag}` });

      // Botón RSVP
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`evento_rsvp_${eventoId}`)
          .setLabel('Asistir ✅')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: '✅ Evento creado correctamente.', ephemeral: true });
    }

    if (command !== 'embed' && command !== 'evento' && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '✅ Enviado.', flags: 64 });
    }

  } catch (error) {
    console.error('❌ Error al ejecutar comando:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ocurrió un error al ejecutar el comando.' });
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error al ejecutar el comando.', flags: 64 });
      }
    } catch (err) {
      console.error('❌ Error al enviar respuesta de error:', err);
    }
  }
});

// --- FUNCIÓN PARA CREAR TICKET (sin cambios) ---
async function createTicket(interaction, user, guild, tipoTicket = 'Soporte 🎫') {
  let username = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  if (username.length > 20) username = username.slice(0, 20);

  const existing = guild.channels.cache.find(c => c.name === `ticket-${username}`);
  if (existing) return interaction.reply({ content: `❌ Ya tienes un ticket abierto: ${existing}`, ephemeral: true });

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

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Cerrar Ticket 🔒').setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket de ${tipoTicket} - Rotra Club®`)
    .setDescription(`Hola ${user}, un miembro del staff se pondrá en contacto contigo a la brevedad.`)
    .setColor(0x1F8B4C)
    .addFields(
      { name: 'Usuario', value: `${user.tag}`, inline: true },
      { name: 'Tipo de Ticket', value: `${tipoTicket}`, inline: true },
      { name: 'Fecha de apertura', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: 'Rotra Club® - Soporte VTC', iconURL: user.displayAvatarURL() });

  await ticketChannel.send({ embeds: [embed], components: [closeRow] });
  return interaction.reply({ content: `✅ Tu ticket de ${tipoTicket} ha sido creado: ${ticketChannel}`, ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);
