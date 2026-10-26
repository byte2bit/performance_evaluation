const { ConnectSessionKnexStore } = require('connect-session-knex')

function createStore(db) {
    const store = new ConnectSessionKnexStore({
        knex: db, tableName: 'sessions', createTable: false, cleanupInterval: 0
    })
    // The library reports errors through callbacks and rejected promises.
    // Express Session consumes only callbacks; suppress the duplicate rejection
    // and also report promise-only failures (e.g. touch) through that callback.
    for (const name of ['get', 'set', 'touch', 'destroy']) {
        const method = store[name].bind(store)
        store[name] = (...args) => {
            const callback = args[args.length - 1]
            let completed = false
            const done = (...values) => {
                if (completed) return
                completed = true
                if (typeof callback === 'function') callback(...values)
            }
            if (typeof callback === 'function') args[args.length - 1] = done
            else args.push(done)
            try { Promise.resolve(method(...args)).catch(done) } catch (error) { done(error) }
        }
    }
    store.ready.catch(() => {})
    return store
}

module.exports = { createStore }
