// Only the format observed in the approved legacy copy. Never reinterpret a
// revision/cost or silently truncate/normalize the supplied password.
const isLegacyHash = value => typeof value === 'string' && /^\$2a\$10\$[./A-Za-z0-9]{53}$/.test(value)
const validLegacyPassword = value => typeof value === 'string' && value.length > 0 && value.length <= 72 &&
    !value.includes('\0') && Buffer.byteLength(value, 'utf8') <= 72 && Buffer.from(value, 'utf8').toString('utf8') === value

module.exports = { isLegacyHash, validLegacyPassword }
