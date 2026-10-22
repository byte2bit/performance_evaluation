// const admin = require('./admin')

module.exports = app => {
/*     app.post('/signup', app.api.user.save)
    app.post('/signin', app.api.auth.signin)
    app.post('/validateToken', app.api.auth.validateToken) */
    
        app.route('/registros')
            .get(app.api.user.getReg)
            .post(app.api.user.saveReg)
        // .get(app.api.user.get)
    
        app.route('/registros2')
            .get(app.api.registros.getReg)
            .post(app.api.registros.saveReg)
        // .get(app.api.user.get)
    
    app.route('/registros/:id')
        // .all(app.config.passport.authenticate())
        .get(app.api.user.getRegById)
        .delete(app.api.user.removeReg)
    // .put(app.api.user.save)


    app.route('/colab')
        // .all(app.config.passport.authenticate())
        .get(app.api.user.getColab)
        // .delete(app.api.user.remove)

    app.route('/colab')
        .post(app.api.user.newColab)
    // .get(app.api.user.get)


    app.route('/colab/:id')
        // .all(app.config.passport.authenticate())
        .get(app.api.user.getColabById)
        .delete(app.api.user.removeColab)
    // .put(app.api.user.save)

    //DISPARA EMAIL
    app.route('/mail')
        .post(app.api.mail.mail)

    app.route('/mail2')
        .post(app.api.mail2.mail)


}