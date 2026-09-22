import { Router } from 'express';
import { encodeTargetUrl } from '../utils/url.parser';
import { envConfig } from '../config/env.config';

const router = Router();

router.post('/set-target', (req, res) => {
    const { target } = req.body;
    
    if (!target || target === 'MAIN') {
        return res.json({ success: true, url: '/__newtab' });
    }

    const encodedTarget = encodeTargetUrl(target, envConfig.DEFAULT_ENGINE);
    res.json({ success: true, url: `/__p/${encodedTarget}` });
});

export default router;