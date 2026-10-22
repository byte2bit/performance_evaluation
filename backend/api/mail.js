module.exports = app => {

    const mail = (req, res) => { //async 
        const email = { ...req.body }
        const nodemailer = require("nodemailer");

        // create transporter object with smtp server details
        const transporter = nodemailer.createTransport({
            host: 'smtp.office365.com',
            port: 587,
            // secure: true,
            service: "Outlook365",
            auth: {
                user: 'contato@nucleoengenharia.com.br',
                pass: 'NUC@con2024'
            },
            tls: {
                ciphers: 'SSLv3'
            }
        });

        const html = `
        <h1>Avaliação de Nível de Serviço</h1>
        <h3>Profissional avaliado: <br>${email.colab}<br>
        <!-- Avaliador: ${email.admnome} -->
        </h3><br>

        <b>Notas:</b><br>

        Avaliacao média: <b>${email.avaliacao}</b><br>
        Nível de Serviço: <b>${email.nivel}</b><br>
        Desconto Percentual na Medição: <b>${email.desconto}</b><br>

        <br><br>
        Como você avalia a qualidade do Serviço Prestado?: <b>${email.nota_qualidade}</b><br>
        Observações: ${email.obs_qualidade}<br><br>
        Com relação ao atendimento no prazo das solicitações efetuadas ao Posto de Serviço, qual seu nível de satisfação?: <b>${email.nota_prazo}</b><br>
        Observações: ${email.obs_prazo}<br><br>
        Como você avalia a disponibilidade do Posto de Serviço no horário de serviço?: <b>${email.nota_dispon}</b><br>
        Observações: ${email.obs_dispon}<br><br>
        Com relação a responsabilidade de profissionais atendendo ao posto de serviço, qual seu nível de satisfação?: <b>${email.nota_respon}</b><br>
        Observações: ${email.obs_respon}<br>
        </ul>
        <br><br>
        <b>Qualidade de serviço: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${email.itensQualidade}
        <br><br>
        <b>Disponibilidade: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${email.itensDispon}`

        // async..await is not allowed in global scope, must use a wrapper
        async function main() {
            // send mail with defined transport object
            const info = await transporter.sendMail({
                from: '"Avaliação"<contato@nucleoengenharia.com.br>', // sender address
                // to: "silvio.ribeiro@gmail.com, luiz.novais@nucleoengenharia.com.br",
                to: email.demandante + ",cc-fiscalizacao_nucleo@petrobras.com.br",
                bcc: "silvio.ribeiro@gmail.com, fernanda.anjos@nucleoengenharia.com.br, lucas.santos@nucleoengenharia.com.br",
                subject: "Avaliação de " + email.colab, // Subject line
                //text: email.body, // plain text body
                html: html, // html body
            })

            console.log("Message sent: %s", info.messageId);
        }
        main().catch(console.error)
    }
    return { mail }
}