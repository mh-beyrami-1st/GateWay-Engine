import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
    res.render('shell');
});

router.get('/__newtab', (req, res) => {
    res.render('index');
});

export default router;