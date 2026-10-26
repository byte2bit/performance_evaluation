function validEvaluation(overrides = {}) {
    return {
        colab: 'Profissional A', avaliacao: '5', nivel: 'A', desconto: '0%',
        nota_qualidade: '5', obs_qualidade: '', nota_prazo: '5', obs_prazo: '',
        nota_dispon: '5', obs_dispon: '', nota_respon: '5', obs_respon: '',
        itensQualidade: '', itensDispon: '', liderancas: null, ...overrides
    }
}

module.exports = { validEvaluation }
