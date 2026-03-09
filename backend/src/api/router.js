const express = require('express');
const router  = express.Router();

const usersRouter       = require('./users');
const habitsRouter      = require('./habits');
const completionsRouter = require('./completions');
const statsRouter       = require('./stats');

router.use('/users',       usersRouter);
router.use('/habits',      habitsRouter);
router.use('/completions', completionsRouter);
router.use('/stats',       statsRouter);

// Следующие роутеры будут добавлены в Этапе 4:
// const subscriptionRouter = require('./subscription');
// router.use('/subscription', subscriptionRouter);

module.exports = router;
