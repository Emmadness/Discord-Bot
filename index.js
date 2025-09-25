require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { 
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField,
  StringSelectMenuBuilder
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

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
  await registerEventCommand();
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

// --- NUEVO COMANDO /event ---
async function registerEventCommand() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  const eventCommand = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Crea un evento tipo convoy')
    .addStringOption(opt => opt.setName('title').setDescription('Título del evento').setRequired(true))
    .addStringOption(opt => opt.setName('start').setDescription('Lugar de salida'))
    .addStringOption(opt => opt.setName('end').setDescription('Lugar de llegada'))
    .addStringOption(opt => opt.setName('time').setDescription('Fecha y hora del evento'))
    .addStringOption(opt => opt.setName('link').setDescription('Link del evento en TruckersMP'));

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [eventCommand.toJSON()] });
    console.log('✅ Comando /event registrado correctamente.');
  } catch (err) {
    console.error('❌ Error al registrar comando /event:', err);
  }
}

// --- FUNCION PARA CREAR EMBED DE EVENTO ---
function createEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setTitle(`🚨 ${event.title || 'Evento VTC'}`)
    .setDescription(
      `🚨 **Reglitas pa' que no te echen del server (ni del grupo 👀):**\n` +
      `• Obedece al Staff o al Big Boss.\n` +
      `• Apaga las balizas, pon consumo realista y lluvia OFF.\n` +
      `• Marca tu rutita y carga el tanque 🛢️.\n` +
      `• Si no encontrás la carga, crea o clona una.\n`
    )
    .addFields(
      { name: '🛣️ Datos del Convoy™', value: 'Esto es lo "serio":', inline: false },
      { name: '🎮 Juego', value: event.game || 'Euro Truck Simulator 2', inline: true },
      { name: '🌎 Server', value: event.server || 'Event Server', inline: true },
      { name: '💿 DLC', value: event.dlc || 'Sin DLC', inline: true },
      { name: '🚛 Salida', value: event.start || 'Hamburg LKW - SLOT 7', inline: true },
      { name: '🛑 Llegada', value: event.end || 'Innsbruck', inline: true },
      { name: '🚚 Camión', value: event.truck || 'El que quieras', inline: true },
      { name: '🏗️ Tráiler', value: event.trailer || 'Refrigerado', inline: true },
      { name: '📦 Carga', value: event.cargo || 'Flores Cortas', inline: true },
      { name: '☑️ Asistencia', value: 'Marca tu asistencia 👻', inline: true },
      { name: '📎 Evento en TruckersMP', value: `[Clic acá](${event.link || '#'})`, inline: true },
      { name: '⏰ Hora', value: event.time || 'sábado, 20 de septiembre de 2025, 3:00 p.m.', inline: false }
    )
    .setFooter({ text: `✅ RSVP | Created by Emmadness` })
    .setColor(0x1F8B4C);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_event_${event.id || 'default'}`)
      .setLabel('✅ RSVP')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`leave_event_${event.id || 'default'}`)
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [row] };
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

// --- INTERACTION CREATE ---
client.on('interactionCreate', async interaction => {
  const channel = interaction.channel;

  try {
    const guild = interaction.guild;
    const user = interaction.user;

    // --- BOTONES Y SELECT MENU ---
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      if (interaction.isButton() && interaction.customId === 'open_ticket') {
        await createTicket(interaction, user, guild, 'Soporte 🎫');
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'open_ticket_select') {
        const selected = interaction.values[0];
        let tipoTicket = 'Soporte 🎫';
        if (selected === 'ticket_convoy') tipoTicket = 'Convoy 🚚';
        if (selected === 'ticket_reclutamiento') tipoTicket = 'Reclutamiento 📝';
        if (selected === 'ticket_soporte') tipoTicket = 'Soporte 🎫';
        await createTicket(interaction, user, guild, tipoTicket);
        return;
      }

      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const member = interaction.member;
        if (!allowedUsers.includes(member.id) &&
            !member.roles.cache.some(r => allowedRoles.includes(r.id))) {
          return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }
        await interaction.channel.delete().catch(err => console.error('❌ Error al eliminar ticket:', err));
        return;
      }

      // --- RSVP EVENTOS ---
      if (interaction.isButton() && interaction.customId.startsWith('join_event_')) {
        await interaction.reply({ content: `✅ ${user.username} se ha apuntado al evento.`, ephemeral: true });
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith('leave_event_')) {
        await interaction.reply({ content: `❌ ${user.username} ha cancelado su asistencia.`, ephemeral: true });
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    // Comprobar permisos
    if (
      !allowedUsers.includes(interaction.user.id) &&
      !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id))
    ) {
      return interaction.reply({ content: '❌ No tienes permiso para usar este comando.', flags: 64 });
    }

    const command = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);
    const name = interaction.options.getString('nombre');

    // --- COMANDO /embed ---
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
        } catch (error) {
          console.error('❌ Error al obtener el embed:', error);
          return interaction.reply({ content: '❌ No se pudo obtener el embed.', flags: 64 });
        }
      } else if (subcommand === 'restore') {
        const last = lastEmbeds.get(channel.id);
        if (!last || !last.embeds?.length) {
          return interaction.reply({ content: '❌ No se encontró un embed reciente en este canal.', flags: 64 });
        }

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
      case 'externo':
        await interaction.deferReply({ flags: 64 });
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
        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 Rotra Club® - Soporte')
          .setDescription('Si necesitas ayuda o soporte, selecciona el tipo de ticket en el menú de abajo.\nUn miembro del staff se pondrá en contacto contigo.')
          .setColor(0x1F8B4C)
          .setFooter({ text: 'Rotra Club® - Soporte VTC' });

        const ticketRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('open_ticket_select')
            .setPlaceholder('Selecciona el tipo de ticket')
            .addOptions([
              { label: 'Invitación a Convoy', value: 'ticket_convoy', description: 'Invítanos a tu convoy', emoji: { id: '1420878930197479437' } },
              { label: 'Reclutamiento', value: 'ticket_reclutamiento', description: 'Quieres ser parte del VTC?', emoji: { id: '1420878693496000562' } },
              { label: 'Soporte', value: 'ticket_soporte', description: 'Crea un ticket de soporte', emoji: { id: '1420878756926722230' } },
            ])
        );

        await channel.send({ embeds: [ticketEmbed], components: [ticketRow] });
        await interaction.reply({ content: '✅ Mensaje de ticket enviado.', ephemeral: true });
        break;

      case 'event': // NUEVO COMANDO EVENT
        const eventData = {
          id: `${Date.now()}`,
          title: interaction.options.getString('title'),
          start: interaction.options.getString('start'),
          end: interaction.options.getString('end'),
          time: interaction.options.getString('time'),
          link: interaction.options.getString('link'),
        };
        const { embed, components } = createEventEmbed(eventData);
        await interaction.reply({ embeds: [embed], components, ephemeral: false });
        break;
    }

    if (command !== 'embed' && !interaction.deferred && !interaction.replied) {
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

// --- FUNCIÓN PARA CREAR TICKET ---
async function createTicket(interaction, user, guild, tipoTicket = 'Soporte 🎫') {
  let username = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  if (username.length > 20) username = username.slice(0, 20);

  const existing = guild.channels.cache.find(c => c.name === `ticket-${username}`);
  if (existing) {
    return interaction.reply({ content: `❌ Ya tienes un ticket abierto: ${existing}`, ephemeral: true });
  }

  const ticketChannel = await guild.channels.create({
    name: `ticket-${username}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket - ${tipoTicket}`)
    .setDescription(`Hola ${user}, un miembro del Staff se pondrá en contacto contigo pronto.\nSi deseas cerrar el ticket, presiona el botón de abajo.`)
    .setColor(0x1F8B4C)
    .setFooter({ text: 'Rotra Club® - Ticket' });

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({ content: `<@${user.id}>`, embeds: [embed], components: [closeButton] });
  await interaction.reply({ content: `✅ Ticket creado: ${ticketChannel}`, ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);
