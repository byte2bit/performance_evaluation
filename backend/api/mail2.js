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
        })

        var list = ''

        for (let i = 0; i < email.colab.length; i++) {
            list += '<li style="margin-left: 0px; padding-right: 5px;">'+email.colab[i]+'</li>' 
        }

        function showObs(item){
            if(!item){
                return 'Sem observações.'
            }else{
                return item
            }
        }

        const html = `
        <div style="border:0px; background-color:#dedede; padding-left:20px; padding-top:0; padding-bottom:0;">
            <h1>Avaliação de Nível de Serviço</h1>
        </div>
        <h3>Avaliador: ${email.demandante}<br></h3>

        <div style="border:1px solid black;">
            <table width="900" border="0" cellspacing="0" cellpadding="0">
            <tr>
                <td width="500" valign="top">
                    <h2 style="padding-left:20px">Profissional(is) avaliado(s): </h2>
                    <ul style='font-size:14px;'>${list}</ul>
                </td>
                <td width="400" valign="top" style="padding-top:0px">
                    <h2 style="margin-bottom: 15px; padding: 0;">Valores:</h2>
                    
                    <div style="font-size:14px; margin-bottom:20px;">
                    Avaliacao média: 
                    <span style="font-size:18px">
                        <b>${email.avaliacao}</b></span></br>
                        Nível de Serviço: 
                        <span style="font-size:18px">
                        <b>${email.nivel}</b></span></br>
                        Desconto Percentual na Medição: 
                        <span style="font-size:18px">
                        <b>${email.desconto}</b></span>
                    </div>
                </td>
            </tr>
            </table>
        </div>

        <br><br>
        &bull; Como você avalia a <b>qualidade</b> do Serviço Prestado? <span style="border:1px solid black; padding:3px 5px; font-size:16px"><b>${email.nota_qualidade}</b></span><br>
        <b>Observações:</b> ${showObs(email.obs_qualidade)}<br><br>
        &bull; Com relação ao atendimento no <b>prazo</b> das solicitações efetuadas ao Posto de Serviço, qual seu nível de satisfação? <span style="border:1px solid black; padding:3px 5px; font-size:16px"><b>${email.nota_prazo}</b></span><br>
        <b>Observações:</b> ${showObs(email.obs_prazo)}<br><br>
        &bull; Como você avalia a <b>disponibilidade</b> do Posto de Serviço no horário de serviço? <span style="border:1px solid black; padding:3px 5px; font-size:16px"><b>${email.nota_dispon}</b></span><br>
        <b>Observações:</b> ${showObs(email.obs_dispon)}<br><br>
        &bull; Com relação a <b>responsabilidade</b> de profissionais atendendo ao posto de serviço, qual seu nível de satisfação? <span style="border:1px solid black; padding:3px 5px; font-size:16px"><b>${email.nota_respon}</b></span><br>
        <b>Observações:</b> ${showObs(email.obs_respon)}<br>
        
        <br><br>
        <b>Qualidade de serviço: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${showObs(email.itensQualidade)}
        <br><br>
        <b>Disponibilidade: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${showObs(email.itensDispon)}`

        // async..await is not allowed in global scope, must use a wrapper
        async function main() {
            // send mail with defined transport object
            const info = await transporter.sendMail({
                from: 'Núcleo Engenharia"<contato@nucleoengenharia.com.br>', // sender address
                // to: "silvio.ribeiro@gmail.com, silvio.ribeiro@nucleoengenharia.com.br",
                to: email.demandante + ",cc-fiscalizacao_nucleo@petrobras.com.br",
                bcc: "silvio.ribeiro@gmail.com, fernanda.anjos@nucleoengenharia.com.br, levy.rodrigues@nucleoengenharia.com.br",
                subject: "Avaliação de Colaboradores", // Subject line
                //text: email.body, // plain text body
                html: html, // html body
            })

            console.log("Message sent: %s", info.messageId);
        }
        main().catch(console.error)
    }
    return { mail }
}