const test = require('node:test')
const assert = require('node:assert/strict')
const { candidates } = require('../scripts/local-mysql-review')

test('private candidate review distinguishes namesakes and never auto-approves even a unique textual match', () => {
    const review = candidates({
        accounts: [{ id: 1, name: 'Responsável fictício', email: 'one@example.invalid', deletedAt: null },
            { id: 2, name: 'Responsável fictício', email: 'two@example.invalid', deletedAt: null }],
        professionals: [{ id: 10, colab: 'Homônimo fictício', gerencia: 'Grupo fictício', demandante: 'responsável fictício' },
            { id: 20, colab: 'Homônimo fictício', gerencia: 'Grupo fictício', demandante: 'one@example.invalid' }],
        records: [{ id: 100, colab: 'Homônimo fictício' }, { id: 200, colab: 'Histórico sem cadastro' }],
        links: [{ recordId: 100, professionalId: 10 }, { recordId: 100, professionalId: 20 }, { recordId: 200, professionalId: null }]
    })
    assert.equal(review.summary.recordsWithAmbiguousCandidates, 1)
    assert.equal(review.summary.recordsWithoutCandidate, 1)
    assert.equal(review.summary.departmentCandidates[0].candidateAccounts, 2)
    assert.equal(review.departments[0].approvedAccountId, null)
    assert.ok(review.records.every(record => record.approvedProfessionalId === null))
    assert.equal(review.summary.assignmentsApproved, 0)
})

test('candidate summaries contain aliases and counts only, excluding personal fields and passwords', () => {
    const fixture = { accounts: [{ id: 1, name: 'Pessoa fictícia', email: 'fixture@example.invalid', deletedAt: null, password: 'synthetic-unneeded-hash' }],
        professionals: [{ id: 10, colab: 'Profissional fictício', gerencia: 'Texto de gerência', demandante: 'Pessoa fictícia' }],
        records: [{ id: 100, colab: 'Profissional fictício' }], links: [{ recordId: 100, professionalId: 10 }] }
    const before = structuredClone(fixture), review = candidates(fixture)
    const text = JSON.stringify(review.summary)
    for (const value of ['Pessoa fictícia', 'fixture@example.invalid', 'Profissional fictício', 'Texto de gerência']) assert.equal(text.includes(value), false)
    assert.equal(JSON.stringify(review).includes('synthetic-unneeded-hash'), false)
    assert.deepEqual(fixture, before)
    assert.equal(review.summary.recordsWithSingleCandidate, 1)
    assert.equal(review.summary.assignmentsApproved, 0)
})

test('deleted accounts are excluded from responsibility candidates and unexpected link IDs fail closed', () => {
    const fixture = { accounts: [{ id: 1, name: 'Conta fictícia', email: 'fixture@example.invalid', deletedAt: 'synthetic-date' }],
        professionals: [{ id: 10, colab: 'Profissional fictício', gerencia: 'Gerência fictícia', demandante: 'fixture@example.invalid' }],
        records: [{ id: 100 }], links: [{ recordId: 100, professionalId: null }] }
    assert.equal(candidates(fixture).summary.departmentCandidates[0].candidateAccounts, 0)
    for (const links of [[{ recordId: 999, professionalId: 10 }], [{ recordId: 100, professionalId: 999 }]]) assert.throws(() => candidates({ ...fixture, links }))
})
