// Bộ icon nét mảnh dùng chung (SVG, không dùng emoji)
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const LockIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const BagIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" {...base}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
export const CashIcon = () => (<svg aria-hidden="true" viewBox="0 0 36 36" {...base}><rect x="4" y="10" width="28" height="16" rx="1.5" /><circle cx="18" cy="18" r="3.5" /><path d="M8 14v8M28 14v8" /></svg>);
export const QrIcon = () => (<svg aria-hidden="true" viewBox="0 0 36 36" {...base}><rect x="6" y="6" width="9" height="9" /><rect x="21" y="6" width="9" height="9" /><rect x="6" y="21" width="9" height="9" /><path d="M21 21h4v4M30 21v9h-5M21 26v4" /></svg>);
export const TruckIcon = () => (<svg aria-hidden="true" viewBox="0 0 36 36" {...base}><path d="M4 9h17v15H4zM21 14h6l5 5v5H21" /><circle cx="10" cy="26" r="2.5" /><circle cx="26" cy="26" r="2.5" /></svg>);
export const AlertIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>);
export const InfoIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></svg>);
export const CheckIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base} strokeWidth={2}><path className="draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const ClockIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const TagIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>);
export const CrossIcon = () => (<svg aria-hidden="true" viewBox="0 0 24 24" {...base} strokeWidth={2}><path d="M7 7l10 10M17 7 7 17" /></svg>);
