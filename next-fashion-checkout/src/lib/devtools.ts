// Công cụ giả lập (/dev) bật khi chạy dev, hoặc khi bản demo trên mạng đặt ENABLE_DEV_TOOLS=true
export const devToolsEnabled = () =>
  process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_TOOLS === "true" || process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
