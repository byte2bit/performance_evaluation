// Public/synthetic fixtures only. No operational account, hash or password.
module.exports = {
    ascii: { password: 'synthetic-password-for-tests', stored: '$2a$10$abcdefghijklmnopqrstuun.QOJnt8sBEL5qAt32zt.NR0.4ag7fK' },
    unicode: { password: 'senha-fictícia-ação-🔒', stored: '$2a$10$abcdefghijklmnopqrstuuQYfQsxgy6RFvUHaa/q1/lLoE4oE9cKC' },
    boundary: { password: 'a'.repeat(72), stored: '$2a$10$abcdefghijklmnopqrstuuiYfj.JCH/8Hff5KmeyaPABzfEqwvS.a' },
    // Independent reference vector from the bcrypt maintainers' public tests:
    // https://github.com/kelektiv/node.bcrypt.js/blob/master/test/sync.test.js
    reference: { password: 'envy1362987212538', stored: '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGhM1A8W9iqaG3vv1BD7WC' }
}
