export const devToolsEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_TOOLS === "true";
