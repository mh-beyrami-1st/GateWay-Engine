export const parseTargetUrl = (rawQuery: string, defaultEngine: string): string => {
    const target = rawQuery.trim();

    if (/^https?:\/\//i.test(target)) return target;
    if (target.includes('.') && !/\s/.test(target)) return `https://${target}`;

    return `${defaultEngine}${encodeURIComponent(target)}`;
};
