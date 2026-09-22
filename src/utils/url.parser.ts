export const parseTargetUrl = (rawQuery: string, defaultEngine: string): string => {
    let target = rawQuery.trim();
    
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = (target.includes('.') && !target.includes(' ')) 
            ? `https://${target}` 
            : `${defaultEngine}${encodeURIComponent(target)}`;
    }
    
    return target;
};