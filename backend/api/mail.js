const { createMailHandler, escapeHtml } = require('../lib/mail')

module.exports = app => {
    const mail = createMailHandler(email => {
        const html = `
        <h1>Avaliação de Nível de Serviço</h1>
        <h3>Profissional avaliado: <br>${escapeHtml(email.colab)}<br>
        <!-- Avaliador: ${escapeHtml(email.admnome)} -->
        </h3><br>

        <b>Notas:</b><br>

        Avaliacao média: <b>${escapeHtml(email.avaliacao)}</b><br>
        Nível de Serviço: <b>${escapeHtml(email.nivel)}</b><br>
        Desconto Percentual na Medição: <b>${escapeHtml(email.desconto)}</b><br>

        <br><br>
        Como você avalia a qualidade do Serviço Prestado?: <b>${escapeHtml(email.nota_qualidade)}</b><br>
        Observações: ${escapeHtml(email.obs_qualidade)}<br><br>
        Com relação ao atendimento no prazo das solicitações efetuadas ao Posto de Serviço, qual seu nível de satisfação?: <b>${escapeHtml(email.nota_prazo)}</b><br>
        Observações: ${escapeHtml(email.obs_prazo)}<br><br>
        Como você avalia a disponibilidade do Posto de Serviço no horário de serviço?: <b>${escapeHtml(email.nota_dispon)}</b><br>
        Observações: ${escapeHtml(email.obs_dispon)}<br><br>
        Com relação a responsabilidade de profissionais atendendo ao posto de serviço, qual seu nível de satisfação?: <b>${escapeHtml(email.nota_respon)}</b><br>
        Observações: ${escapeHtml(email.obs_respon)}<br>
        </ul>
        <br><br>
        <b>Qualidade de serviço: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${escapeHtml(email.itensQualidade)}
        <br><br>
        <b>Disponibilidade: Itens que não foram atendidos (obrigatório caso a nota seja menor ou igual a 3)</b><br>
        ${escapeHtml(email.itensDispon)}`

        return {
            from: '"Avaliação"<contato@nucleoengenharia.com.br>', // sender address
            // to: "silvio.ribeiro@gmail.com, luiz.novais@nucleoengenharia.com.br",
            to: email.demandante + ",cc-fiscalizacao_nucleo@petrobras.com.br",
            bcc: "silvio.ribeiro@gmail.com, fernanda.anjos@nucleoengenharia.com.br, lucas.santos@nucleoengenharia.com.br",
            subject: "Avaliação de " + email.colab, // Subject line
            //text: email.body, // plain text body
            html: html, // html body
        }
    })
    return { mail }
}
