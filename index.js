require('dotenv').config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, SlashCommandBuilder, Routes, PermissionsBitField } = require('discord.js');
const { REST } = require('@discordjs/rest');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const points = new Map(); // Para armazenar os horários de batida de ponto
let currentSession = {}; // Armazena o estado atual da sessão de cada usuário

const authorizedRoleId = '1276732985302978665'; // Substitua pelo ID do cargo autorizado
const logsChannelId = '1276755082997927996'; // ID do canal onde a log do ponto será enviada
const categoryId = '1276735787970596935'; // ID da categoria onde os canais de ponto serão criados

const commands = [
    new SlashCommandBuilder()
        .setName('painel_ponto')
        .setDescription('Envia o painel para iniciar o processo de bater ponto no canal atual.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Registrar comandos de barra
(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log('Comandos de barra registrados com sucesso!');
    } catch (error) {
        console.error('Falha ao registrar comandos:', error);
    }
})();

client.once('ready', () => {
    console.log(`Bot está online como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isButton()) return;

    try {
        if (interaction.isCommand()) {
            if (interaction.commandName === 'painel_ponto') {
                // Verifica se o usuário tem o cargo autorizado
                if (interaction.member.roles.cache.has(authorizedRoleId)) {
                    const startButton = new ButtonBuilder()
                        .setCustomId('start')
                        .setLabel('Iniciar Ponto')
                        .setStyle(ButtonStyle.Success);

                    const row = new ActionRowBuilder().addComponents(startButton);

                    const embed = new EmbedBuilder()
                    .setColor('#A020F0')
                    .setTitle('📁 Sistema de Bate-Ponto')
                    .setDescription('Clique no botão abaixo para iniciar o ponto.')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1254432567478714378/1276749848204415106/wz1qAlz.png') // Alterado para thumbnail
                    .setFooter({ text: 'Sistema desenvolvido por @brxp7 • Versão premium' });
                
                    await interaction.reply({
                        embeds: [embed],
                        components: [row]
                    });
                } else {
                    await interaction.reply({
                        content: 'Você não tem permissão para usar esse comando.',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isButton()) {
            const userId = interaction.user.id;
            const username = interaction.user.username;

            if (interaction.customId === 'start') {
                if (currentSession[userId]) {
                    await interaction.reply({
                        content: 'Você já possui um ponto aberto.',
                        ephemeral: true
                    });
                    return;
                }

                // Cria um novo canal com o nome do usuário
                const guild = interaction.guild;
                const category = guild.channels.cache.get(categoryId);
                const channel = await guild.channels.create({
                    name: `${username}-ponto`,
                    type: 0, // Tipo de canal: texto
                    parent: category,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: userId,
                            allow: [PermissionsBitField.Flags.ViewChannel],
                        },
                    ],
                });

                const pauseButton = new ButtonBuilder()
                    .setCustomId('pause')
                    .setLabel('Pausar Ponto')
                    .setStyle(ButtonStyle.Primary);

                const resumeButton = new ButtonBuilder()
                    .setCustomId('resume')
                    .setLabel('Retomar Ponto')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const finishButton = new ButtonBuilder()
                    .setCustomId('finish')
                    .setLabel('Finalizar Ponto')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(pauseButton, resumeButton, finishButton);

                // Cria a embed com as informações do ponto
                const embed = await generateEmbed(username, {
                    start: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                    pauses: [],
                    resumes: []
                }, userId);

                // Envia a embed e os botões no novo canal
                await channel.send({
                    content: 'Ponto iniciado! Utilize os botões abaixo para pausar, retomar ou finalizar o ponto.',
                    embeds: [embed],
                    components: [row]
                });

                // Inicia a sessão
                currentSession[userId] = {
                    channelId: channel.id,
                    start: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                    pauses: [],
                    resumes: []
                };

                await interaction.reply({
                    content: `Seu ponto foi iniciado e um canal foi criado para você! [Acesse seu canal aqui](https://discord.com/channels/${guild.id}/${channel.id})`,
                    ephemeral: true
                });
            } else if (interaction.customId === 'pause' || interaction.customId === 'resume' || interaction.customId === 'finish') {
                const userId = interaction.user.id;

                if (!currentSession[userId]) {
                    await interaction.reply({
                        content: 'Você não tem um ponto aberto.',
                        ephemeral: true
                    });
                    return;
                }

                const session = currentSession[userId];
                const channel = await client.channels.fetch(session.channelId);

                switch (interaction.customId) {
                    case 'pause':
                        session.pauses.push(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
                        await interaction.update({
                            content: 'Seu ponto foi pausado!',
                            components: [getActionRow(true, false, false)],
                            embeds: [await generateEmbed(username, session, userId)]
                        });
                        break;
                    case 'resume':
                        session.resumes.push(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
                        await interaction.update({
                            content: 'Seu ponto foi retomado!',
                            components: [getActionRow(false, false, true)],
                            embeds: [await generateEmbed(username, session, userId)]
                        });
                        break;
                    case 'finish':
                        session.end = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                        // Envia a log do ponto para o canal de logs
                        const logsChannel = await client.channels.fetch(logsChannelId);
                        if (logsChannel) {
                            await logsChannel.send({
                                content: `Sistema de ponto do usuario ${username} foi finalizado.`,
                                embeds: [await generateEmbed(username, session, userId)]
                            });
                        }

                        // Tenta buscar e deletar o canal
                        try {
                            const channel = await client.channels.fetch(session.channelId);
                            if (channel) {
                                await channel.delete();
                            }
                        } catch (error) {
                            console.error(`Erro ao deletar o canal ${session.channelId}:`, error);
                        }

                        delete currentSession[userId];
                        await interaction.update({
                            content: 'Ponto finalizado e canal deletado!',
                            components: [],
                            embeds: [await generateEmbed(username, session, userId)]
                        });
                        break;
                }
            }
        }
    } catch (error) {
        console.error('Erro ao processar a interação:', error);
        try {
            // Evita responder mais de uma vez
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply({
                    content: 'Houve um erro ao processar sua solicitação.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Erro ao enviar resposta de erro:', replyError);
        }
    }
});

function getActionRow(pauseDisabled, resumeDisabled, finishDisabled) {
    const pauseButton = new ButtonBuilder()
        .setCustomId('pause')
        .setLabel('Pausar Ponto')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pauseDisabled);

    const resumeButton = new ButtonBuilder()
        .setCustomId('resume')
        .setLabel('Retomar Ponto')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(resumeDisabled);

    const finishButton = new ButtonBuilder()
        .setCustomId('finish')
        .setLabel('Finalizar Ponto')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(finishDisabled);

    return new ActionRowBuilder().addComponents(pauseButton, resumeButton, finishButton);
}

async function generateEmbed(username, session, userId) {
    try {
        const user = await client.users.fetch(userId);
        const avatarURL = user.displayAvatarURL({ format: 'png', size: 128 });

        const embed = new EmbedBuilder()
            .setColor('#A020F0')
            .setTitle(`📊 Sistema de ponto do usuário ${username}.`)
            .setThumbnail(avatarURL)
            .addFields(
                { name: 'Início', value: session.start, inline: false },
                { name: 'Pausas', value: session.pauses.length ? session.pauses.join('\n') : 'Nenhuma pausa registrada', inline: false },
                { name: 'Retomadas', value: session.resumes.length ? session.resumes.join('\n') : 'Nenhuma retomada registrada', inline: false },
                { name: 'Fim', value: session.end || 'Ainda não finalizado', inline: false }
            )
            .setFooter({ text: 'Sistema de ponto' })
            .setTimestamp(new Date());

        return embed;
    } catch (error) {
        console.error('Erro ao gerar embed:', error);

        const embed = new EmbedBuilder()
            .setColor('#A020F0')
            .setTitle(`📊 Sistema de ponto do usuário ${username}.`)
            .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png') // Imagem padrão se o avatar não puder ser obtido
            .addFields(
                { name: 'Início', value: session.start, inline: false },
                { name: 'Pausas', value: session.pauses.length ? session.pauses.join('\n') : 'Nenhuma pausa registrada', inline: false },
                { name: 'Retomadas', value: session.resumes.length ? session.resumes.join('\n') : 'Nenhuma retomada registrada', inline: false },
                { name: 'Fim', value: session.end || 'Ainda não finalizado', inline: false }
            )
            .setFooter({ text: 'Sistema de ponto' })
            .setTimestamp(new Date());

        return embed;
    }
}

client.login(process.env.DISCORD_TOKEN);
