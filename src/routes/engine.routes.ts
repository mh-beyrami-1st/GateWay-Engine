import { Router } from 'express';
import { parseTargetUrl } from '../utils/url.parser';
import { envConfig } from '../config/env.config';

const router = Router();

router.post('/set-target', (req, res) => {
    const { target } = req.body;
    
    if (typeof target !== 'string' || !target.trim() || target === 'MAIN') {
        return res.json({ success: true, url: '/__newtab' });
    }

    const finalUrl = parseTargetUrl(target, envConfig.defaultEngine);
    res.json({ 
        success: true, 
        url: `/__p/${finalUrl}`,
        displayUrl: finalUrl 
    });
});

export default router;
