
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
const allowedUsers = ['640315344916840478', '640315344916840478'];
const allowedRoles = ['1429906604580667683', '1386877367028547624', '1429995569345990811']; 
const lastEmbeds = new Map();

// ID de tu categoría de tickets
const TICKET_CATEGORY = '1429997006193037464';

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  //client.user.setActivity('Gestionando la VTC', { type: 3 });
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

async function sendTeamUpdate(target, text, color = 0x3498DB) {
  const embed = {
    title: 'Update',
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
    const guild = interaction.guild;
    const user = interaction.user;

    // --- BOTONES Y SELECT MENU ---
    if (interaction.isButton() || interaction.isStringSelectMenu()) {

      // --- ABRIR TICKET (BOTÓN ANTIGUO) ---
      if (interaction.isButton() && interaction.customId === 'open_ticket') {
        await createTicket(interaction, user, guild, 'Soporte 🎫'); // tipo por defecto
        return;
      }

      // --- ABRIR TICKET (SELECT MENU) ---
      if (interaction.isStringSelectMenu() && interaction.customId === 'open_ticket_select') {
        const selected = interaction.values[0]; // opción elegida
        let tipoTicket = 'Soporte 🎫';
        if (selected === 'ticket_se') tipoTicket = 'Save Edit';
        if (selected === 'ticket_lm') tipoTicket = 'Local Mods';
        if (selected === 'ticket_soporte') tipoTicket = 'Soporte';

        await createTicket(interaction, user, guild, tipoTicket);
        return;
      }

      // --- CERRAR TICKET ---
      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const member = interaction.member;

        if (!allowedUsers.includes(member.id) &&
            !member.roles.cache.some(r => allowedRoles.includes(r.id))) {
          return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }

        await interaction.channel.delete().catch(err => console.error('❌ Error al eliminar ticket:', err));
        return;
      }
    }

    // --- COMANDOS ---
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
        await sendTeamUpdate(channel, `• **${name}** se unió como parte del **Staff SE de Players On Duty**. 🛠️`, 0xF1C40F);
        break;
      case 'staff':
        await sendTeamUpdate(channel, `• **${name}** se ha unido al **Staff de LM de Players On Duty**. 🧩`, 0x1F618D);
        break;
      case 'leave':
        await sendTeamUpdate(channel, `• **${name}** dejó la VTC. ¡Le deseamos éxito en su camino! 👋`, 0xE74C3C);
        break;
      case 'ban':
        await sendTeamUpdate(channel, `• **${name}** ha sido **baneado** de de Players On Duty. 🚫`, 0xC0392B);
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
        // Embed con menú select
        const ticketEmbed = new EmbedBuilder()
          .setTitle('Players On Duty - Tickets')
          .setDescription('Si quieres unirte al Staff o necesitas soporte, selecciona la opción correspondiente en el menú de abajo.\nUn miembro del equipo se pondrá en contacto contigo a la brevedad para ayudarte.')
          .setColor(0x1F8B4C)
          .setImage('https://media.discordapp.net/attachments/1372037431615946775/1430345980498153553/658145f2-c867-4ad5-b83b-a6a86e6c8f94.jpg?ex=68f97100&is=68f81f80&hm=9ea59ee2d70fe82363158f8f0c03042c9d161d9849eb6d02c2431f79597fcc2c&=&format=webp&width=754&height=535')
          .setFooter({ 
           text: 'Players On Duty - Gestión de Tickets', 
           iconURL: 'https://media.discordapp.net/attachments/1372037431615946775/1430347643153813535/ae93aa15-f4cd-4bad-8fbf-d79919eb3c38.png?ex=68f9728c&is=68f8210c&hm=a2ba1743cb7e303a99442e2890ac37c0ee400512343c9e6f7c582dc85ae4bb0d&=&format=webp&quality=lossless&width=535&height=535' // <- aquí va la URL de tu logo
           });


        const ticketRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('open_ticket_select')
            .setPlaceholder('Selecciona el tipo de ticket')
            .addOptions([
              { 
                label: 'Save Edit Team', 
                value: 'ticket_se', 
                description: 'Aplica al Team SE',
                emoji: { id: '1430015412585758810' } // Aquí va el ID del emoji
              },
              { 
                label: 'Local Mods', 
                value: 'ticket_lm', 
                description: 'Aplica al Team LM',
                emoji: { id: '1430016029920202864' } 
              },
              { 
                label: 'Soporte', 
                value: 'ticket_soporte', 
                description: 'Crea un ticket de soporte',
                emoji: { id: '1430016495101935789' } 
              },
            ])
        );

        await channel.send({ embeds: [ticketEmbed], components: [ticketRow] });
        await interaction.reply({ content: '✅ Mensaje de ticket enviado.', ephemeral: true });
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

// --- FUNCIÓN PARA CREAR TICKET (ahora recibe tipoTicket) ---
async function createTicket(interaction, user, guild, tipoTicket = 'Soporte 🎫') {
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

  // Embed de bienvenida
  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket de ${tipoTicket} - POD`)
    .setDescription(`Hola ${user}, un miembro del staff se pondrá en contacto contigo a la brevedad.`)
    .setColor(0x1F8B4C)
    .addFields(
      { name: 'Usuario', value: `${user.tag}`, inline: true },
      { name: 'Tipo de Ticket', value: `${tipoTicket}`, inline: true },
      { name: 'Fecha de apertura', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: 'Players On Duty - Gestión de Tickets', iconURL: user.displayAvatarURL() });

  await ticketChannel.send({ embeds: [embed], components: [closeRow] });
  return interaction.reply({ content: `✅ Tu ticket de ${tipoTicket} ha sido creado: ${ticketChannel}`, ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);













