export const encodeTargetUrl = (rawQuery: string, defaultEngine: string): string => {
    let target = rawQuery.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = (target.includes('.') && !target.includes(' ')) 
            ? `https://${target}` 
            : `${defaultEngine}${encodeURIComponent(target)}`;
    }
    return Buffer.from(target).toString('base64');
};

export const decodeTargetUrl = (b64Url: string): string | null => {
    try {
        return Buffer.from(b64Url, 'base64').toString('utf-8');
    } catch {
        return null;
    }
};